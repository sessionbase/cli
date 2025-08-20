import { readdir, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import chalk from 'chalk';
import { getGeminiCliPath } from '../utils/paths.js';
import { SessionProvider, SessionInfo, SessionData, SupportedPlatform } from './types.js';

export class GeminiCliProvider implements SessionProvider {
  readonly platform: SupportedPlatform = 'gemini-cli';
  readonly displayName = 'Gemini CLI';
  readonly emoji = '🔷';

  async isAvailable(): Promise<boolean> {
    return existsSync(getGeminiCliPath());
  }

  async listSessions(filterPath?: string, showGlobal?: boolean): Promise<SessionInfo[]> {
    const geminiPath = getGeminiCliPath();
    const sessions: SessionInfo[] = [];

    if (showGlobal) {
      // Scan all hash directories and parse context messages to extract project paths
      const hashDirs = await readdir(geminiPath);
      
      for (const hashDir of hashDirs) {
        const geminiDir = join(geminiPath, hashDir);
        const stats = await stat(geminiDir);
        
        if (stats.isDirectory()) {
          const hashSessions = await this.scanHashDir(geminiDir, hashDir);
          sessions.push(...hashSessions);
        }
      }
    } else {
      // Single project
      const projectPath = filterPath || process.cwd();
      const hash = createHash('sha256').update(projectPath).digest('hex');
      const geminiDir = join(geminiPath, hash);

      if (existsSync(geminiDir)) {
        const projectSessions = await this.scanHashDir(geminiDir, hash, projectPath);
        sessions.push(...projectSessions);
      }
    }

    // Sort by last modified (oldest first, newest at bottom)
    return sessions.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());
  }

  async findMostRecentSession(targetPath: string, options?: any): Promise<string | null> {
    const hash = createHash('sha256').update(targetPath).digest('hex');
    const geminiDir = join(getGeminiCliPath(), hash);

    if (!existsSync(geminiDir)) {
      return null;
    }

    const files = await readdir(geminiDir);
    const checkpoints = files.filter(f => 
      (f.startsWith('checkpoint-') && f.endsWith('.json')) || 
      f === 'checkpoint.json'
    );

    if (checkpoints.length === 0) {
      return null;
    }
    
    // Find most recent file
    let mostRecentFile = null;
    let mostRecentTime = 0;
    
    for (const checkpoint of checkpoints) {
      const filePath = join(geminiDir, checkpoint);
      
      try {
        const stats = await stat(filePath);
        if (stats.mtime.getTime() > mostRecentTime) {
          mostRecentTime = stats.mtime.getTime();
          mostRecentFile = filePath;
        }
      } catch (error) {
        continue;
      }
    }

    if (!mostRecentFile) {
      return null;
    }
    
    // Check if the most recent file is older than 10 minutes
    const tenMinutesInMs = 10 * 60 * 1000;
    const now = Date.now();
    const fileAge = now - mostRecentTime;
    
    if (fileAge > tenMinutesInMs && !options?.force) {
      const minutesOld = Math.floor(fileAge / (60 * 1000));
      const hoursOld = Math.floor(fileAge / (60 * 60 * 1000));
      const daysOld = Math.floor(fileAge / (24 * 60 * 60 * 1000));
      
      let ageDescription;
      if (daysOld > 0) {
        ageDescription = `${daysOld} day${daysOld !== 1 ? 's' : ''}`;
      } else if (hoursOld > 0) {
        ageDescription = `${hoursOld} hour${hoursOld !== 1 ? 's' : ''}`;
      } else {
        ageDescription = `${minutesOld} minute${minutesOld !== 1 ? 's' : ''}`;
      }
      
      console.warn(`Warning: Most recent Gemini CLI checkpoint is ${ageDescription} old.`);
      console.log(chalk.yellow('Consider running "/chat save <tag>" in Gemini CLI to create a fresh checkpoint before uploading.'));
      console.log(chalk.gray(`Found checkpoint: ${mostRecentFile}`));
      
      // Check if we're in an interactive terminal (TTY)
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        // Non-interactive mode (like MCP) - fail with clear message
        throw new Error(`Checkpoint is ${ageDescription} old. Use --force to proceed or create fresh checkpoint with "/chat save".`);
      }
      
      console.log('');
      console.log(chalk.cyan('Do you want to continue with this older checkpoint? (y/N)'));
      
      // Wait for user input (only in interactive mode)
      const { createInterface } = await import('readline');
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
    }
    
    return mostRecentFile;
  }

  async parseSession(filePath: string): Promise<SessionData> {
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    if (!Array.isArray(data)) {
      throw new Error('Invalid Gemini CLI session format');
    }
    
    // Count messages (exclude function responses from user messages)
    const actualMessages = data.filter(msg => 
      !(msg.role === 'user' && msg.parts?.[0]?.functionResponse)
    );
    
    return {
      messages: actualMessages,
      title: `Gemini CLI Session ${new Date().toISOString().split('T')[0]}`,
      platform: 'gemini-cli',
      messageCount: actualMessages.length
    };
  }

  formatSessionDisplay(session: SessionInfo): string {
    return `${this.emoji} ${session.title || 'Gemini Session'}`;
  }

  private async scanHashDir(geminiDir: string, hashDir: string, knownProjectPath?: string): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = [];
    
    try {
      const files = await readdir(geminiDir);
      const checkpoints = files.filter(f => 
        (f.startsWith('checkpoint-') && f.endsWith('.json')) || 
        f === 'checkpoint.json'
      );
      
      for (const checkpoint of checkpoints) {
        const filePath = join(geminiDir, checkpoint);
        const tag = checkpoint === 'checkpoint.json' 
          ? 'default' 
          : checkpoint.slice(11, -5); // Remove 'checkpoint-' and '.json'
        
        try {
          const stats = await stat(filePath);
          const sessionData = knownProjectPath 
            ? await this.parseGeminiSessionMetadata(filePath)
            : await this.parseGeminiSessionWithContext(filePath);
          
          sessions.push({
            id: tag,
            filePath,
            projectPath: knownProjectPath || (sessionData as any).projectPath || `Unknown (${hashDir.substring(0, 8)}...)`,
            lastModified: stats.mtime,
            messageCount: sessionData.messageCount,
            toolCalls: sessionData.toolCalls,
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
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    if (!Array.isArray(data)) {
      throw new Error('Invalid Gemini CLI session format');
    }
    
    // Count messages (exclude function responses from user messages)
    const actualMessages = data.filter(msg => 
      !(msg.role === 'user' && msg.parts?.[0]?.functionResponse)
    );
    
    // Count tool calls
    const toolCalls = data.filter(msg => 
      msg.role === 'model' && msg.parts?.[0]?.functionCall
    ).length;
    
    // Get first user message preview
    let firstMessagePreview = '';
    const firstUserMessage = data.find(msg => 
      msg.role === 'user' && 
      msg.parts?.[0]?.text && 
      !msg.parts[0].text.includes('context for our chat')
    );
    
    if (firstUserMessage?.parts?.[0]?.text) {
      const text = firstUserMessage.parts[0].text;
      firstMessagePreview = text
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 100);
      
      if (text.length > 100) {
        firstMessagePreview += '...';
      }
    }
    
    return {
      messageCount: actualMessages.length,
      toolCalls,
      firstMessagePreview
    };
  }

  private async parseGeminiSessionWithContext(filePath: string) {
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    if (!Array.isArray(data)) {
      throw new Error('Invalid Gemini CLI session format');
    }
    
    // Count messages (exclude function responses from user messages)
    const actualMessages = data.filter(msg => 
      !(msg.role === 'user' && msg.parts?.[0]?.functionResponse)
    );
    
    // Count tool calls
    const toolCalls = data.filter(msg => 
      msg.role === 'model' && msg.parts?.[0]?.functionCall
    ).length;
    
    // Extract project path from context message
    let projectPath = null;
    const contextMessage = data.find(msg => 
      msg.role === 'user' && 
      msg.parts?.[0]?.text?.includes('I\'m currently working in the directory:')
    );
    
    if (contextMessage?.parts?.[0]?.text) {
      const contextText = contextMessage.parts[0].text;
      const match = contextText.match(/I'm currently working in the directory: (.+)/);
      if (match) {
        projectPath = match[1].trim();
      }
    }
    
    // Get first user message preview (excluding context message)
    let firstMessagePreview = '';
    const firstUserMessage = data.find(msg => 
      msg.role === 'user' && 
      msg.parts?.[0]?.text && 
      !msg.parts[0].text.includes('context for our chat') &&
      !msg.parts[0].text.includes('I\'m currently working in the directory:')
    );
    
    if (firstUserMessage?.parts?.[0]?.text) {
      const text = firstUserMessage.parts[0].text;
      firstMessagePreview = text
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 100);
      
      if (text.length > 100) {
        firstMessagePreview += '...';
      }
    }
    
    return {
      messageCount: actualMessages.length,
      toolCalls,
      firstMessagePreview,
      projectPath
    };
  }
}