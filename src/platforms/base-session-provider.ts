import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { SessionProvider, SessionInfo, SessionData, SupportedPlatform } from './types.js';

export abstract class BaseSessionProvider implements SessionProvider {
  abstract readonly platform: SupportedPlatform;
  abstract readonly displayName: string;
  abstract readonly emoji: string;
  
  abstract isAvailable(): Promise<boolean>;
  abstract listSessions(filterPath?: string, showGlobal?: boolean): Promise<SessionInfo[]>;
  abstract findMostRecentSession(targetPath: string, options?: any): Promise<string | null>;
  abstract parseSession(filePath: string): Promise<SessionData>;
  abstract formatSessionDisplay(session: SessionInfo): string;
  abstract validateFile(filePath: string): Promise<boolean>;

  /**
   * Sort sessions by modification time (oldest to newest)
   */
  protected sortSessionsByModified(sessions: SessionInfo[]): SessionInfo[] {
    return sessions.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());
  }

  /**
   * Generate a preview from message text (max 100 characters)
   */
  protected generatePreview(text: string): string {
    const cleanedText = text
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanedText.length <= 100) {
      return cleanedText;
    }

    return cleanedText.substring(0, 100) + '...';
  }

  /**
   * Parse a JSON file with consistent error handling
   */
  protected async parseJsonFile(filePath: string): Promise<any> {
    const content = await readFile(filePath, 'utf-8');
    
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Invalid JSON in file ${filePath}: ${error}`);
    }
  }

  /**
   * Parse a JSONL (JSON Lines) file where each line contains a separate JSON object
   */
  protected async parseJsonlFile(filePath: string): Promise<any[]> {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new Error(`Empty session file: ${filePath}`);
    }

    return lines.map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSON on line ${index + 1} in file ${filePath}: ${error}`);
      }
    });
  }

  /**
   * Find the most recent file in a directory matching a filter
   */
  protected async findMostRecentFile(
    directory: string, 
    fileFilter: (filename: string) => boolean
  ): Promise<string | null> {
    try {
      const files = await readdir(directory);
      const matchingFiles = files.filter(fileFilter);

      if (matchingFiles.length === 0) {
        return null;
      }
      
      let mostRecentFile = null;
      let mostRecentTime = 0;
      
      for (const file of matchingFiles) {
        const filePath = join(directory, file);
        
        try {
          const stats = await stat(filePath);
          if (stats.mtime.getTime() > mostRecentTime) {
            mostRecentTime = stats.mtime.getTime();
            mostRecentFile = filePath;
          }
        } catch (error) {
          // Skip files we can't read
          continue;
        }
      }
      
      return mostRecentFile;
    } catch (error) {
      // Directory doesn't exist or can't be read
      return null;
    }
  }

  /**
   * Generate a default session title
   */
  protected generateDefaultTitle(date?: Date): string {
    const dateStr = (date || new Date()).toISOString().split('T')[0];
    return `${this.displayName} Session ${dateStr}`;
  }
}