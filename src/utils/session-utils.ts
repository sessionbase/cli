import { readFile } from 'node:fs/promises';
import { SessionInfo } from '../platforms/types.js';

export class SessionUtils {
  /**
   * Sort sessions by modification time (oldest to newest)
   */
  static sortSessionsByModified(sessions: SessionInfo[]): SessionInfo[] {
    return sessions.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());
  }

  /**
   * Generate a preview from message text (max 100 characters)
   */
  static generatePreview(text: string): string {
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
  static async parseJsonFile(filePath: string): Promise<any> {
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
  static async parseJsonlFile(filePath: string): Promise<any[]> {
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
}