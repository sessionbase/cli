import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { getClaudeCodePath } from '../utils/paths.js';
import { BaseSessionProvider } from './base-session-provider.js';
import { SessionInfo, SessionData, SupportedPlatform } from './types.js';

export class ClaudeCodeProvider extends BaseSessionProvider {
  readonly platform: SupportedPlatform = 'claude-code';
  readonly displayName = 'Claude Code';
  readonly emoji = '🟠';

  private encodeProjectPath(path: string): string {
    return path.replace(/\//g, '-');
  }

  private decodeProjectPath(encodedPath: string): string {
    return encodedPath.replace(/-/g, '/');
  }

  async isAvailable(): Promise<boolean> {
    return existsSync(getClaudeCodePath());
  }

  async listSessions(filterPath?: string, showGlobal?: boolean): Promise<SessionInfo[]> {
    const claudePath = getClaudeCodePath();
    const sessions: SessionInfo[] = [];

    if (showGlobal) {
      sessions.push(...await this.scanAllProjects(claudePath));
    } else {
      sessions.push(...await this.scanSingleProject(claudePath, filterPath));
    }

    return this.sortSessionsByModified(sessions);
  }

  private async scanAllProjects(claudePath: string): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = [];
    const projectDirs = await readdir(claudePath);
    
    for (const encodedPath of projectDirs) {
      const projectDir = join(claudePath, encodedPath);
      const projectStats = await stat(projectDir);
      
      if (projectStats.isDirectory()) {
        const decodedPath = this.decodeProjectPath(encodedPath);
        const projectSessions = await this.scanProjectDir(projectDir, decodedPath);
        sessions.push(...projectSessions);
      }
    }
    
    return sessions;
  }

  private async scanSingleProject(claudePath: string, filterPath?: string): Promise<SessionInfo[]> {
    const targetPath = filterPath || process.cwd();
    const encodedPath = this.encodeProjectPath(targetPath);
    const projectDir = join(claudePath, encodedPath);
    
    if (existsSync(projectDir)) {
      return await this.scanProjectDir(projectDir, targetPath);
    }
    
    return [];
  }

  async findMostRecentSession(targetPath: string): Promise<string | null> {
    const encodedPath = this.encodeProjectPath(targetPath);
    const projectDir = join(getClaudeCodePath(), encodedPath);
    
    return this.findMostRecentFile(projectDir, (filename) => filename.endsWith('.jsonl'));
  }

  async parseSession(filePath: string): Promise<SessionData> {
    const entries = await this.parseJsonlFile(filePath);
    const metadata = this.extractClaudeMetadata(entries);

    return {
      messages: entries,
      title: this.generateDefaultTitle(),
      platform: 'claude-code',
      messageCount: entries.length,
      ...metadata
    };
  }

  private extractClaudeMetadata(entries: any[]): { sessionId?: string; cwd?: string } {
    const firstEntry = entries[0];
    return {
      sessionId: firstEntry?.sessionId,
      cwd: firstEntry?.cwd
    };
  }

  formatSessionDisplay(session: SessionInfo): string {
    return `${this.emoji} ${session.title || 'Untitled Session'}`;
  }

  private async scanProjectDir(projectDir: string, projectPath: string): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = [];
    
    try {
      const files = await readdir(projectDir);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

      for (const jsonlFile of jsonlFiles) {
        const sessionFile = join(projectDir, jsonlFile);
        
        try {
          const stats = await stat(sessionFile);
          const sessionData = await this.parseClaudeSessionMetadata(sessionFile);
          
          sessions.push({
            id: jsonlFile.replace('.jsonl', ''),
            filePath: sessionFile,
            projectPath: projectPath,
            lastModified: stats.mtime,
            messageCount: sessionData.messageCount,
            firstMessagePreview: sessionData.firstMessagePreview,
            platform: 'claude-code',
            messages: [], // We don't load full messages for listing
            title: this.generateDefaultTitle(stats.mtime)
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

  private async parseClaudeSessionMetadata(filePath: string) {
    const entries = await this.parseJsonlFile(filePath);
    const firstMessagePreview = this.extractFirstMessagePreview(entries);
    
    return {
      messageCount: entries.length,
      firstMessagePreview
    };
  }

  private extractFirstMessagePreview(entries: any[]): string {
    for (const message of entries) {
      if (message.message?.role === 'user' && message.message?.content) {
        const text = this.extractClaudeMessageText(message);
        if (text) {
          return this.generatePreview(text);
        }
      }
    }
    return '';
  }

  private extractClaudeMessageText(message: any): string {
    const content = message.message?.content;
    
    if (typeof content === 'string') {
      return content;
    }
    
    if (Array.isArray(content)) {
      const textContent = content.find((c: any) => c.type === 'text');
      return textContent?.text || '';
    }
    
    return '';
  }
}