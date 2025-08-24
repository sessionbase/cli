import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import chalk from 'chalk';
import { getGeminiCliPath } from '../utils/paths.js';
import { BaseSessionProvider } from './base-session-provider.js';
import { SessionInfo, SessionData, SupportedPlatform } from './types.js';

export class GeminiCliProvider extends BaseSessionProvider {
  readonly platform: SupportedPlatform = 'gemini-cli';
  readonly displayName = 'Gemini CLI';
  readonly emoji = '🔷';

  private generateProjectHash(projectPath: string): string {
    return createHash('sha256').update(projectPath).digest('hex');
  }

  async isAvailable(): Promise<boolean> {
    return existsSync(getGeminiCliPath());
  }

  async listSessions(filterPath?: string, showGlobal?: boolean): Promise<SessionInfo[]> {
    const geminiPath = getGeminiCliPath();
    const sessions: SessionInfo[] = [];

    if (showGlobal) {
      sessions.push(...await this.scanAllHashDirs(geminiPath));
    } else {
      sessions.push(...await this.scanSingleProject(geminiPath, filterPath));
    }

    return this.sortSessionsByModified(sessions);
  }

  private async scanAllHashDirs(geminiPath: string): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = [];
    const hashDirs = await readdir(geminiPath);
    
    for (const hashDir of hashDirs) {
      const geminiDir = join(geminiPath, hashDir);
      const stats = await stat(geminiDir);
      
      if (stats.isDirectory()) {
        const hashSessions = await this.scanHashDir(geminiDir, hashDir);
        sessions.push(...hashSessions);
      }
    }
    
    return sessions;
  }

  private async scanSingleProject(geminiPath: string, filterPath?: string): Promise<SessionInfo[]> {
    const projectPath = filterPath || process.cwd();
    const hash = this.generateProjectHash(projectPath);
    const geminiDir = join(geminiPath, hash);

    if (existsSync(geminiDir)) {
      return await this.scanHashDir(geminiDir, hash, projectPath);
    }
    
    return [];
  }

  async findMostRecentSession(targetPath: string, options?: any): Promise<string | null> {
    const hash = this.generateProjectHash(targetPath);
    const geminiDir = join(getGeminiCliPath(), hash);

    try {
      const mostRecentFile = await this.findMostRecentCheckpoint(geminiDir);
      
      if (!mostRecentFile) {
        return null;
      }

      return await this.validateCheckpointAge(mostRecentFile, options);
    } catch (error) {
      return null;
    }
  }

  private async findMostRecentCheckpoint(geminiDir: string): Promise<string | null> {
    return this.findMostRecentFile(geminiDir, (filename) => 
      (filename.startsWith('checkpoint-') && filename.endsWith('.json')) || 
      filename === 'checkpoint.json'
    );
  }

  /*
  * The Gemini CLI does not persist session data by default, only when the user runs `/chat save <tag>`.
  * Because of this, it's easy to forget to save a new checkpoint before uploading the session. This 
  * validation checks that the checkpoint is less than ten minutes old, with the assumption that most
  * users would upload a session shortly after saving a checkpoint.
  */
  private async validateCheckpointAge(filePath: string, options?: any): Promise<string | null> {
    const stats = await stat(filePath);
    const tenMinutesInMs = 10 * 60 * 1000;
    const now = Date.now();
    const fileAge = now - stats.mtime.getTime();
    
    if (fileAge > tenMinutesInMs && !options?.force) {
      const ageDescription = this.formatFileAge(fileAge);
      
      return await this.handleStaleCheckpoint(filePath, ageDescription);
    }
    
    return filePath;
  }

  private formatFileAge(fileAge: number): string {
    const minutesOld = Math.floor(fileAge / (60 * 1000));
    const hoursOld = Math.floor(fileAge / (60 * 60 * 1000));
    const daysOld = Math.floor(fileAge / (24 * 60 * 60 * 1000));
    
    if (daysOld > 0) {
      return `${daysOld} day${daysOld !== 1 ? 's' : ''}`;
    } else if (hoursOld > 0) {
      return `${hoursOld} hour${hoursOld !== 1 ? 's' : ''}`;
    } else {
      return `${minutesOld} minute${minutesOld !== 1 ? 's' : ''}`;
    }
  }

  private async handleStaleCheckpoint(filePath: string, ageDescription: string): Promise<string | null> {
    console.warn(`Warning: Most recent Gemini CLI checkpoint is ${ageDescription} old.`);
    console.log(chalk.yellow('Consider running "/chat save <tag>" in Gemini CLI to create a fresh checkpoint before uploading.'));
    console.log(chalk.gray(`Found checkpoint: ${filePath}`));
    
    // Check if we're in an interactive terminal (TTY)
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      // Non-interactive mode (like MCP) - fail with clear message
      throw new Error(`Checkpoint is ${ageDescription} old. Use --force to proceed or create fresh checkpoint with "/chat save".`);
    }
    
    console.log('');
    console.log(chalk.cyan('Do you want to continue with this older checkpoint? (y/N)'));
    
    // Wait for user input (only in interactive mode)
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise<string>((resolve) => {
      rl.question('', (input) => {
        rl.close();
        resolve(input.trim().toLowerCase());
      });
    });
    
    if (answer !== 'y' && answer !== 'yes') {
      console.log(chalk.gray('Upload cancelled. Run "/chat save <tag>" in Gemini CLI to create a fresh checkpoint.'));
      return null;
    }
    
    return filePath;
  }

  async parseSession(filePath: string): Promise<SessionData> {
    const data = await this.parseJsonFile(filePath);
    
    if (!Array.isArray(data)) {
      throw new Error(`Invalid Gemini CLI session format in file ${filePath}`);
    }
    
    const actualMessages = this.filterActualMessages(data);
    
    return {
      messages: actualMessages,
      title: this.generateDefaultTitle(),
      platform: 'gemini-cli',
      messageCount: actualMessages.length
    };
  }

  private filterActualMessages(messages: any[]): any[] {
    return messages.filter(msg => 
      !(msg.role === 'user' && msg.parts?.[0]?.functionResponse)
    );
  }

  private async findCheckpointFiles(directory: string): Promise<string[]> {
    const files = await readdir(directory);
    return files.filter(f => 
      (f.startsWith('checkpoint-') && f.endsWith('.json')) || 
      f === 'checkpoint.json'
    );
  }

  private extractCheckpointTag(filename: string): string {
    return filename === 'checkpoint.json' 
      ? 'default' 
      : filename.slice(11, -5); // Remove 'checkpoint-' and '.json'
  }

  private generateSessionId(hashDir: string, tag: string, mtime: Date): string {
    const input = tag === 'default' 
      ? `${hashDir}-default-${mtime.getTime()}`
      : `${hashDir}-${tag}`;
    
    return createHash('sha256').update(input).digest('hex').substring(0, 16);
  }

  /*
  * Gemini starts each session with a context message including the date, OS, 
  * working directory, and a tree of your current directory. We are assuming that 
  * the first message will always be this context message, but double checking in case this changes. See:
  * https://github.com/google-gemini/gemini-cli/blame/5bba15b0384f184686e511e75da8275adb056d8c/packages/core/src/utils/environmentContext.ts#L64
  * This has been here since the initial commit:
  * https://github.com/google-gemini/gemini-cli/blame/add233c5043264d47ecc6d3339a383f41a241ae8/packages/cli/src/core/GeminiClient.ts#L53
  */
  private findFirstGeminiUserMessage(messages: any[]): string {
    // Trust but verify: assume first user message is context, but check content to be sure
    let startIndex = 0;
    
    if (messages.length > 0 && this.isGeminiContextMessage(messages[0])) {
      startIndex = 1; // Skip assumed context message
    }
    
    // Find first real user message starting from startIndex
    for (let i = startIndex; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'user' && msg.parts?.[0]?.text) {
        const text = msg.parts[0].text;
        // Double-check this isn't a context message we missed
        if (!this.isGeminiContextMessage(msg)) {
          return this.generatePreview(text);
        }
      }
    }
    
    return '';
  }

  private isGeminiContextMessage(message: any): boolean {
    if (message.role !== 'user' || !message.parts?.[0]?.text) {
      return false;
    }
    
    const text = message.parts[0].text;
    return text.includes('This is the Gemini CLI. We are setting up the context for our chat.') ||
           text.includes('I\'m currently working in the directory:');
  }

  formatSessionDisplay(session: SessionInfo): string {
    return `${this.emoji} ${session.title || 'Gemini Session'}`;
  }

  private async scanHashDir(geminiDir: string, hashDir: string, knownProjectPath?: string): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = [];
    
    try {
      const checkpoints = await this.findCheckpointFiles(geminiDir);
      
      for (const checkpoint of checkpoints) {
        const filePath = join(geminiDir, checkpoint);
        
        try {
          const stats = await stat(filePath);
          const tag = this.extractCheckpointTag(checkpoint);
          const sessionData = await this.parseGeminiSessionMetadata(filePath);
          const projectPath = knownProjectPath || await this.extractProjectPathFromFile(filePath);
          
          const consistentId = this.generateSessionId(hashDir, tag, stats.mtime);
          
          sessions.push({
            id: consistentId,
            filePath,
            projectPath: projectPath || `Unknown (${hashDir.substring(0, 8)}...)`,
            lastModified: stats.mtime,
            messageCount: sessionData.messageCount,
            firstMessagePreview: sessionData.firstMessagePreview,
            platform: 'gemini-cli',
            messages: [], // We don't load full messages for listing
            title: `Gemini Session ${tag}`
          });
        } catch (error) {
          // Skip sessions we can't parse
          continue;
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }

    return sessions;
  }

  private async parseGeminiSessionMetadata(filePath: string) {
    const data = await this.parseJsonFile(filePath);
    const actualMessages = this.filterActualMessages(data);
    const firstMessagePreview = this.findFirstGeminiUserMessage(data);
    
    return {
      messageCount: actualMessages.length,
      firstMessagePreview
    };
  }

  private async extractProjectPathFromFile(filePath: string): Promise<string | null> {
    const data = await this.parseJsonFile(filePath);
    return this.extractProjectPath(data);
  }

  private extractProjectPath(messages: any[]): string | null {
    const contextMessage = messages.find(msg => 
      msg.role === 'user' && 
      msg.parts?.[0]?.text?.includes('I\'m currently working in the directory:')
    );
    
    if (contextMessage?.parts?.[0]?.text) {
      const contextText = contextMessage.parts[0].text;
      const match = contextText.match(/I'm currently working in the directory: (.+)/);
      return match ? match[1].trim() : null;
    }
    
    return null;
  }
}