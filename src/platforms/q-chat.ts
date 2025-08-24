import { writeFile, stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getAmazonQPath } from '../utils/paths.js';
import { getConversation, getAllConversations } from '../utils/qchat-db.js';
import { BaseSessionProvider } from './base-session-provider.js';
import { SessionInfo, SessionData, SupportedPlatform } from './types.js';

export class QChatProvider extends BaseSessionProvider {
  readonly platform: SupportedPlatform = 'qchat';
  readonly displayName = 'Amazon Q Chat';
  readonly emoji = '🤖';

  async isAvailable(): Promise<boolean> {
    return existsSync(getAmazonQPath());
  }

  async listSessions(filterPath?: string, showGlobal?: boolean): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = [];

    if (showGlobal) {
      sessions.push(...await this.scanAllConversations());
    } else {
      sessions.push(...await this.scanSingleProject(filterPath));
    }

    return this.sortSessionsByModified(sessions);
  }

  private async scanAllConversations(): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = [];
    const conversations = await getAllConversations();
    
    for (const conversation of conversations) {
      try {
        const sessionInfo = this.buildSessionInfo(conversation, conversation.directoryPath);
        sessions.push(sessionInfo);
      } catch (error) {
        // Skip conversations we can't parse
        continue;
      }
    }
    
    return sessions;
  }

  private async scanSingleProject(filterPath?: string): Promise<SessionInfo[]> {
    const targetPath = filterPath ? resolve(filterPath) : process.cwd();
    const conversation = await getConversation(targetPath);
    
    if (conversation) {
      try {
        const sessionInfo = this.buildSessionInfo(conversation, targetPath);
        return [sessionInfo];
      } catch (error) {
        // Skip conversations we can't parse
      }
    }
    
    return [];
  }

  private buildSessionInfo(conversation: any, projectPath: string): SessionInfo {
    const sessionData = this.parseQConversationMetadata(conversation.conversationData);
    
    return {
      id: conversation.conversationId,
      filePath: `Q Database (${conversation.conversationId})`,
      projectPath: projectPath,
      lastModified: new Date(sessionData.lastActivity),
      messageCount: sessionData.messageCount,
      firstMessagePreview: sessionData.firstMessagePreview,
      platform: 'q-chat',
      messages: [], // We don't load full messages for listing
      title: 'Q Chat Session'
    };
  }

  async findMostRecentSession(targetPath: string): Promise<string | null> {
    const conversation = await getConversation(targetPath);
    
    if (!conversation) {
      return null;
    }
    
    try {
      // Validate the conversation data
      this.parseQConversationMetadata(conversation.conversationData);
      
      return await this.createTempSessionFile(conversation.conversationData);
    } catch (error) {
      return null;
    }
  }

  private async createTempSessionFile(conversationData: any): Promise<string> {
    const tempFileName = `/tmp/qchat-session-${Date.now()}.json`;
    await writeFile(tempFileName, JSON.stringify(conversationData, null, 2));
    return tempFileName;
  }

  async parseSession(filePath: string): Promise<SessionData> {
    const data = await this.parseJsonFile(filePath);
    
    return {
      ...data,
      platform: 'q-chat',
      title: this.generateSessionTitle(data),
      messageCount: this.calculateMessageCount(data),
      modelName: data.model || 'unknown'
    };
  }

  private generateSessionTitle(data: any): string {
    return data.title || this.generateDefaultTitle();
  }

  private calculateMessageCount(data: any): number {
    return data.history ? data.history.length * 2 : 0; // user + assistant pairs
  }

  formatSessionDisplay(session: SessionInfo): string {
    const model = session.modelName?.replace('CLAUDE_SONNET_4_20250514_V1_0', 'Claude Sonnet 4') || '';
    return `${this.emoji} Q Chat Session ${model ? `(${model})` : ''}`;
  }

  private parseQConversationMetadata(conversationData: any) {
    const history = conversationData.history || [];
    let messageCount = 0;
    let firstMessagePreview = '';

    for (const turn of history) {
      const userMessage = this.extractUserMessage(turn);
      
      if (!userMessage) {
        continue;
      }
      
      messageCount += 2; // User + Assistant
      
      // Extract first user message preview
      if (!firstMessagePreview) {
        const text = this.extractQChatPromptText(userMessage);
        if (text) {
          firstMessagePreview = this.generatePreview(text);
        }
      }
    }

    return {
      messageCount,
      firstMessagePreview,
      lastActivity: Date.now()
    };
  }

  private extractUserMessage(turn: any): any | null {
    // Handle both old array format and new object format
    if (Array.isArray(turn) && turn.length >= 2) {
      // Old format: [userMessage, assistantMessage]
      return turn[0];
    } else if (turn && typeof turn === 'object' && turn.user) {
      // New format: {user: userMessage, assistant: assistantMessage}
      return turn.user;
    }
    
    return null;
  }

  private extractQChatPromptText(userMessage: any): string | null {
    return userMessage?.content?.Prompt?.prompt || null;
  }
}