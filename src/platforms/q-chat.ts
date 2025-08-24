import { writeFile, stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sqlite3 from 'sqlite3';
import { getAmazonQPath } from '../utils/paths.js';
import { SessionUtils } from '../utils/session-utils.js';
import { SessionProvider, SessionInfo, SessionData, SupportedPlatform } from './types.js';

export class QChatProvider implements SessionProvider {
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

    return SessionUtils.sortSessionsByModified(sessions);
  }

  private async scanAllConversations(): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = [];
    const conversations = await this.readQDatabase();
    
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
    const conversation = await this.readQDatabase(targetPath);
    
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
      platform: 'qchat',
      messages: [], // We don't load full messages for listing
      title: 'Q Chat Session'
    };
  }

  async findMostRecentSession(targetPath: string): Promise<string | null> {
    const conversation = await this.readQDatabase(targetPath);
    
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
    const data = await SessionUtils.parseJsonFile(filePath);
    
    return {
      ...data, // Include all raw Q Chat data
      platform: 'qchat',
      title: this.generateSessionTitle(data),
      messageCount: this.calculateMessageCount(data),
      modelName: data.model || 'unknown',
      messages: this.convertQChatToMessages(data)
    };
  }

  private generateSessionTitle(data: any): string {
    return data.title || `Q Chat Session ${new Date().toISOString().split('T')[0]}`;
  }

  private calculateMessageCount(data: any): number {
    return data.history ? data.history.length * 2 : 0; // user + assistant pairs
  }

  formatSessionDisplay(session: SessionInfo): string {
    const model = session.modelName?.replace('CLAUDE_SONNET_4_20250514_V1_0', 'Claude Sonnet 4') || '';
    return `${this.emoji} Q Chat Session ${model ? `(${model})` : ''}`;
  }

  private readQDatabase(filterPath?: string): Promise<any[] | any> {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(getAmazonQPath(), sqlite3.OPEN_READONLY);
      
      if (filterPath) {
        // Query for specific path
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
      } else {
        // Query for all conversations
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
      }
    });
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
          firstMessagePreview = SessionUtils.generatePreview(text);
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

  private extractSessionId(conversationData: any): string {
    return conversationData.conversation_id || `qchat-${Date.now()}`;
  }

  private extractTurnMessages(turn: any): { userMessage: any | null; assistantMessage: any | null } {
    // Handle both old array format and new object format
    if (Array.isArray(turn) && turn.length >= 2) {
      // Old format: [userMessage, assistantMessage]
      return { userMessage: turn[0], assistantMessage: turn[1] };
    } else if (turn && typeof turn === 'object' && turn.user && turn.assistant) {
      // New format: {user: userMessage, assistant: assistantMessage}
      return { userMessage: turn.user, assistantMessage: turn.assistant };
    }
    
    return { userMessage: null, assistantMessage: null };
  }

  private convertQChatToMessages(conversationData: any): any[] {
    const messages = [];
    const history = conversationData.history || [];
    const sessionId = this.extractSessionId(conversationData);
    
    for (let i = 0; i < history.length; i++) {
      const turn = history[i];
      const { userMessage, assistantMessage } = this.extractTurnMessages(turn);
      
      if (!userMessage || !assistantMessage) {
        continue;
      }
      
      // Add user message for prompts
      if (userMessage?.content?.Prompt?.prompt) {
        messages.push({
          parentUuid: null,
          isSidechain: false,
          userType: "external",
          cwd: userMessage.env_context?.env_state?.current_working_directory || process.cwd(),
          sessionId: sessionId,
          version: "1.0.60",
          gitBranch: "",
          type: "user",
          message: {
            role: "user",
            content: userMessage.content.Prompt.prompt
          },
          uuid: `user-${sessionId}-${i}`,
          timestamp: userMessage.timestamp || Date.now()
        });
      }
      
      // Add tool results as separate tool messages
      if (userMessage?.content?.ToolUseResults?.tool_use_results) {
        const toolResults = userMessage.content.ToolUseResults.tool_use_results;
        
        messages.push({
          parentUuid: null,
          isSidechain: false,
          userType: "external",
          cwd: userMessage.env_context?.env_state?.current_working_directory || process.cwd(),
          sessionId: sessionId,
          version: "1.0.60",
          gitBranch: "",
          type: "tool",
          message: {
            role: "tool",
            content: "Tool execution results",
            toolResults: toolResults.map((result: any) => ({
              tool_use_id: result.tool_use_id,
              content: result.content,
              status: result.status
            }))
          },
          uuid: `tool-${sessionId}-${i}`,
          timestamp: userMessage.timestamp || Date.now()
        });
      }
      
      // Add assistant messages
      let assistantContent = null;
      let toolCalls = null;
      
      if (assistantMessage?.Response?.content) {
        assistantContent = assistantMessage.Response.content;
      } else if (assistantMessage?.ToolUse?.content) {
        assistantContent = assistantMessage.ToolUse.content;
        
        // Add tool calls if they exist
        if (assistantMessage.ToolUse.tool_uses && assistantMessage.ToolUse.tool_uses.length > 0) {
          toolCalls = assistantMessage.ToolUse.tool_uses.map((tool: any) => ({
            id: tool.id,
            name: tool.name,
            input: tool.args,
            timestamp: tool.timestamp || Date.now(),
            metadata: {
              orig_name: tool.orig_name || tool.name,
              orig_args: tool.orig_args || tool.args
            }
          }));
        }
      }
      
      if (assistantContent) {
        const assistantMsg: any = {
          parentUuid: null,
          isSidechain: false,
          userType: "external",
          cwd: userMessage?.env_context?.env_state?.current_working_directory || process.cwd(),
          sessionId: sessionId,
          version: "1.0.60",
          gitBranch: "",
          type: "assistant",
          message: {
            role: "assistant",
            content: assistantContent
          },
          uuid: `assistant-${sessionId}-${i}`,
          timestamp: assistantMessage.timestamp || Date.now()
        };
        
        // Add toolCalls if they exist
        if (toolCalls) {
          assistantMsg.message.toolCalls = toolCalls;
        }
        
        messages.push(assistantMsg);
      }
    }
    
    return messages;
  }
}