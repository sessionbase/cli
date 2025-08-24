import sqlite3 from 'sqlite3';
import { getAmazonQPath } from './paths.js';

export interface QChatConversation {
  directoryPath: string;
  conversationId: string;
  conversationData: any;
}

/**
 * Get a specific conversation from Q Chat database by directory path
 */
export function getConversation(filterPath: string): Promise<QChatConversation | null> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(getAmazonQPath(), sqlite3.OPEN_READONLY);
    
    db.get('SELECT key, value FROM conversations WHERE key = ?', [filterPath], (err, row: any) => {
      if (err) {
        db.close();
        reject(err);
        return;
      }
      
      if (!row) {
        db.close();
        resolve(null);
        return;
      }
      
      try {
        const conversationData = JSON.parse(row.value);
        db.close();
        resolve({
          directoryPath: row.key,
          conversationId: conversationData.conversation_id,
          conversationData
        });
      } catch (error: any) {
        db.close();
        reject(new Error(`Failed to parse conversation data: ${error.message}`));
      }
    });
  });
}

/**
 * Get all conversations from Q Chat database
 */
export function getAllConversations(): Promise<QChatConversation[]> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(getAmazonQPath(), sqlite3.OPEN_READONLY);
    
    db.all('SELECT key, value FROM conversations', [], (err, rows: any[]) => {
      if (err) {
        db.close();
        reject(err);
        return;
      }
      
      const conversations = [];
      
      for (const row of rows) {
        try {
          const conversationData = JSON.parse(row.value);
          conversations.push({
            directoryPath: row.key,
            conversationId: conversationData.conversation_id,
            conversationData
          });
        } catch (error) {
          // Skip conversations we can't parse
          continue;
        }
      }
      
      db.close();
      resolve(conversations);
    });
  });
}