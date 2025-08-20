import { readdir, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { getClaudeCodePath } from '../utils/paths.js';
import { SessionProvider, SessionInfo, SessionData, SupportedPlatform } from './types.js';

export class ClaudeCodeProvider implements SessionProvider {
  readonly platform: SupportedPlatform = 'claude-code';
  readonly displayName = 'Claude Code';
  readonly emoji = '📋';

  async isAvailable(): Promise<boolean> {
    return existsSync(getClaudeCodePath());
  }

  async listSessions(filterPath?: string, showGlobal?: boolean): Promise<SessionInfo[]> {
    const claudePath = getClaudeCodePath();
    const sessions: SessionInfo[] = [];

    if (showGlobal) {
      // Scan all project directories
      const projectDirs = await readdir(claudePath);
      for (const encodedPath of projectDirs) {
        const projectDir = join(claudePath, encodedPath);
        const projectStats = await stat(projectDir);
        
        if (projectStats.isDirectory()) {
          // Decode the directory name to get the actual path
          const decodedPath = encodedPath.replace(/-/g, '/');
          const projectSessions = await this.scanProjectDir(projectDir, decodedPath);
          sessions.push(...projectSessions);
        }
      }
    } else {
      // Single project
      const targetPath = filterPath || process.cwd();
      const encodedPath = targetPath.replace(/\//g, '-');
      const projectDir = join(claudePath, encodedPath);
      
      if (existsSync(projectDir)) {
        const projectSessions = await this.scanProjectDir(projectDir, targetPath);
        sessions.push(...projectSessions);
      }
    }

    // Sort by last modified (oldest first, newest at bottom)
    return sessions.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());
  }

  async findMostRecentSession(targetPath: string): Promise<string | null> {
    const encodedPath = targetPath.replace(/\//g, '-');
    const projectDir = join(getClaudeCodePath(), encodedPath);
    
    if (!existsSync(projectDir)) {
      return null;
    }

    const files = await readdir(projectDir);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

    if (jsonlFiles.length === 0) {
      return null;
    }
    
    // Find most recent file
    let mostRecentFile = null;
    let mostRecentTime = 0;
    
    for (const jsonlFile of jsonlFiles) {
      const sessionFile = join(projectDir, jsonlFile);
      
      try {
        const stats = await stat(sessionFile);
        if (stats.mtime.getTime() > mostRecentTime) {
          mostRecentTime = stats.mtime.getTime();
          mostRecentFile = sessionFile;
        }
      } catch (error) {
        // Skip files we can't read
        continue;
      }
    }

    return mostRecentFile;
  }

  async parseSession(filePath: string): Promise<SessionData> {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new Error('Empty session file');
    }

    const entries = lines.map(line => JSON.parse(line));
    
    // Extract Claude session metadata from first entry
    const firstEntry = entries[0];
    const claudeSessionId = firstEntry?.sessionId;
    const claudeCwd = firstEntry?.cwd;
    
    return {
      messages: entries,
      title: `Claude Session ${new Date().toISOString().split('T')[0]}`,
      platform: 'claude-code',
      messageCount: entries.length,
      sessionId: claudeSessionId,
      cwd: claudeCwd
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
            toolCalls: sessionData.toolCalls,
            firstMessagePreview: sessionData.firstMessagePreview,
            platform: 'claude-code',
            messages: [], // We don't load full messages for listing
            title: `Claude Session ${stats.mtime.toISOString().split('T')[0]}`
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
    const content = await readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new Error('Empty session file');
    }
    
    let toolCalls = 0;
    let firstMessagePreview = '';
    
    // Count tool calls and get first message preview
    for (let i = 0; i < lines.length; i++) {
      try {
        const message = JSON.parse(lines[i]);
        
        // Count tool calls - look for tool_use content
        if (message.message?.content && Array.isArray(message.message.content)) {
          const toolUse = message.message.content.find((c: any) => c.type === 'tool_use');
          if (toolUse) {
            toolCalls++;
          }
        }
        
        // Get first user message preview
        if (!firstMessagePreview && message.message?.role === 'user' && message.message?.content) {
          let text = '';
          const content = message.message.content;
          
          if (typeof content === 'string') {
            text = content;
          } else if (Array.isArray(content)) {
            const textContent = content.find((c: any) => c.type === 'text');
            text = textContent?.text || '';
          }
          
          // Clean up and truncate the preview
          if (text) {
            firstMessagePreview = text
              .replace(/\n/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .substring(0, 100);
            
            if (text.length > 100) {
              firstMessagePreview += '...';
            }
          }
        }
      } catch (error) {
        // Skip lines we can't parse
        continue;
      }
    }
    
    return {
      messageCount: lines.length,
      toolCalls,
      firstMessagePreview
    };
  }
}