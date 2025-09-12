import { readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { getCodexPath } from '../utils/paths.js';
import { BaseSessionProvider } from './base-session-provider.js';
import { SessionInfo, SessionData, SupportedPlatform } from './types.js';

export class CodexProvider extends BaseSessionProvider {
  readonly platform: SupportedPlatform = 'codex';
  readonly displayName = 'Codex';
  readonly emoji = '💻';

  async isAvailable(): Promise<boolean> {
    return existsSync(getCodexPath());
  }

  async listSessions(filterPath?: string, showGlobal?: boolean): Promise<SessionInfo[]> {
    const codexPath = getCodexPath();
    const sessions: SessionInfo[] = [];

    if (showGlobal) {
      sessions.push(...await this.scanAllSessions(codexPath));
    } else {
      sessions.push(...await this.scanFilteredSessions(codexPath, filterPath));
    }

    return this.sortSessionsByModified(sessions);
  }

  private async scanAllSessions(codexPath: string): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = [];
    
    try {
      const yearDirs = await readdir(codexPath);
      
      for (const year of yearDirs) {
        const yearPath = join(codexPath, year);
        const yearStat = await stat(yearPath);
        
        if (yearStat.isDirectory()) {
          const monthDirs = await readdir(yearPath);
          
          for (const month of monthDirs) {
            const monthPath = join(yearPath, month);
            const monthStat = await stat(monthPath);
            
            if (monthStat.isDirectory()) {
              const dayDirs = await readdir(monthPath);
              
              for (const day of dayDirs) {
                const dayPath = join(monthPath, day);
                const dayStat = await stat(dayPath);
                
                if (dayStat.isDirectory()) {
                  sessions.push(...await this.scanDayDirectory(dayPath));
                }
              }
            }
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
    }
    
    return sessions;
  }

  private async scanFilteredSessions(codexPath: string, filterPath?: string): Promise<SessionInfo[]> {
    const targetPath = filterPath || process.cwd();
    const allSessions = await this.scanAllSessions(codexPath);
    
    // Filter sessions by working directory
    return allSessions.filter(session => 
      session.projectPath === targetPath || 
      (session.cwd && session.cwd === targetPath)
    );
  }

  private async scanDayDirectory(dayPath: string): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = [];
    
    try {
      const files = await readdir(dayPath);
      
      for (const file of files) {
        if (file.endsWith('.jsonl') && file.startsWith('rollout-')) {
          const filePath = join(dayPath, file);
          
          try {
            const sessionData = await this.parseSession(filePath);
            const stats = await stat(filePath);
            
            // Find the first real user message (not environment context)
            const firstUserMessage = sessionData.messages.find((record: any) => {
              // New format: response_item with message payload
              if (record.type === 'response_item' && record.payload?.type === 'message' && record.payload?.role === 'user' && record.payload?.content) {
                for (const contentItem of record.payload.content) {
                  if (contentItem.type === 'input_text' && contentItem.text) {
                    const text = contentItem.text;
                    if (!text.includes('<environment_context>') && text.trim().length > 0) {
                      return true;
                    }
                  }
                }
              }
              // Old format: direct message
              else if (record.type === 'message' && record.role === 'user' && record.content && Array.isArray(record.content)) {
                for (const contentItem of record.content) {
                  if (contentItem.type === 'input_text' && contentItem.text) {
                    const text = contentItem.text;
                    if (!text.includes('<environment_context>') && text.trim().length > 0) {
                      return true;
                    }
                  }
                }
              }
              return false;
            });
            
            sessions.push({
              ...sessionData,
              id: sessionData.sessionId || basename(filePath),
              filePath,
              projectPath: sessionData.cwd || 'Unknown Directory',
              lastModified: stats.mtime,
              firstMessagePreview: firstUserMessage ? 
                this.generatePreview(this.extractTextFromRecord(firstUserMessage)) : undefined
            });
          } catch (error) {
            // Skip invalid session files
            continue;
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
    
    return sessions;
  }

  async findMostRecentSession(targetPath: string): Promise<string | null> {
    const sessions = await this.scanFilteredSessions(getCodexPath(), targetPath);
    
    if (sessions.length === 0) {
      return null;
    }
    
    // Find the most recent session
    const mostRecent = sessions.reduce((latest, current) => 
      current.lastModified > latest.lastModified ? current : latest
    );
    
    return mostRecent.filePath;
  }

  async parseSession(filePath: string): Promise<SessionData> {
    const lines = await this.parseJsonlFile(filePath);
    
    if (lines.length === 0) {
      throw new Error(`Empty session file: ${filePath}`);
    }
    
    // Determine format and extract metadata
    let sessionId: string;
    let cwd: string | undefined;
    
    const firstRecord = lines[0];
    
    // New format: first record is session_meta
    if (firstRecord.type === 'session_meta' && firstRecord.payload) {
      sessionId = firstRecord.payload.id;
      cwd = firstRecord.payload.cwd;
    }
    // Old format: first record has id directly
    else if (firstRecord.id) {
      sessionId = firstRecord.id;
      
      // Extract CWD from environment context in old format
      for (const record of lines) {
        if (record.type === 'message' && record.content && Array.isArray(record.content)) {
          for (const contentItem of record.content) {
            if (contentItem.type === 'input_text' && contentItem.text && !cwd) {
              if (contentItem.text.includes('<cwd>')) {
                const cwdMatch = contentItem.text.match(/<cwd>(.+?)<\/cwd>/);
                if (cwdMatch) {
                  cwd = cwdMatch[1];
                  break;
                }
              }
            }
          }
          if (cwd) break;
        }
      }
    } else {
      // Fallback to filename
      sessionId = basename(filePath);
    }
    
    return {
      messages: lines,
      platform: 'codex',
      sessionId,
      cwd,
      messageCount: lines.length
    };
  }
  
  private extractTextFromRecord(record: any): string {
    // New format: response_item with message payload
    if (record.type === 'response_item' && record.payload?.type === 'message' && record.payload?.content) {
      let text = '';
      for (const contentItem of record.payload.content) {
        if (contentItem.type === 'input_text' && contentItem.text) {
          text += contentItem.text;
        }
      }
      return text;
    }
    // Old format: direct message
    else if (record.type === 'message' && record.content && Array.isArray(record.content)) {
      let text = '';
      for (const contentItem of record.content) {
        if (contentItem.type === 'input_text' && contentItem.text) {
          text += contentItem.text;
        }
      }
      return text;
    }
    return '';
  }

  formatSessionDisplay(session: SessionInfo): string {
    return `${this.emoji} ${session.title || this.generateDefaultTitle()}`;
  }

  async validateFile(filePath: string): Promise<boolean> {
    const fileName = basename(filePath);
    
    // Check if file matches Codex naming pattern: rollout-YYYY-MM-DDTHH-MM-SS-UUID.jsonl
    if (!fileName.startsWith('rollout-') || !fileName.endsWith('.jsonl')) {
      return false;
    }
    
    try {
      // Try to parse as JSONL and check for Codex-specific structure
      const lines = await this.parseJsonlFile(filePath);
      if (lines.length === 0) return false;
      
      // Check if it looks like a Codex session by looking for the first record
      const firstRecord = lines[0];
      return firstRecord && 
             typeof firstRecord === 'object' && 
             (
               // New format: session_meta type
               (firstRecord.type === 'session_meta' && firstRecord.payload?.id) ||
               // Old format: direct id, timestamp, instructions
               ('id' in firstRecord && 'timestamp' in firstRecord && 'instructions' in firstRecord)
             );
    } catch (error) {
      return false;
    }
  }
}
