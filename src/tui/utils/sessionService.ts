import { readdir, stat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sqlite3 from 'sqlite3';

const CLAUDE_CODE_PATH = join(homedir(), '.claude', 'projects');
const GEMINI_CLI_PATH = join(homedir(), '.gemini', 'tmp');
const Q_DATABASE_PATH = join(homedir(), 'Library/Application Support/amazon-q/data.sqlite3');

export interface SessionData {
  sessionName: string;
  filePath: string;
  projectPath: string;
  lastModified: Date;
  messageCount: number;
  toolCalls: number;
  firstMessagePreview: string;
  platform: 'claude' | 'gemini' | 'qchat';
  model?: string;
  conversationId?: string;
}

export interface SessionsByPlatform {
  claude: SessionData[];
  gemini: SessionData[];
  qchat: SessionData[];
}

export async function getAllSessions(filterPath?: string, showAll?: boolean): Promise<SessionsByPlatform> {
  const results: SessionsByPlatform = {
    claude: [],
    gemini: [],
    qchat: []
  };

  // Collect sessions from all platforms in parallel
  const [claudeSessions, geminiSessions, qchatSessions] = await Promise.allSettled([
    getClaudeSessions(filterPath, showAll),
    getGeminiSessions(filterPath, showAll),
    getQChatSessions(filterPath, showAll)
  ]);

  if (claudeSessions.status === 'fulfilled') {
    results.claude = claudeSessions.value;
  }
  if (geminiSessions.status === 'fulfilled') {
    results.gemini = geminiSessions.value;
  }
  if (qchatSessions.status === 'fulfilled') {
    results.qchat = qchatSessions.value;
  }

  return results;
}

export async function getClaudeSessions(filterPath?: string, showAll?: boolean): Promise<SessionData[]> {
  if (!existsSync(CLAUDE_CODE_PATH)) {
    return [];
  }

  let allSessions: SessionData[] = [];

  if (showAll) {
    // List all projects
    const projectDirs = await readdir(CLAUDE_CODE_PATH);
    
    for (const encodedPath of projectDirs) {
      const projectDir = join(CLAUDE_CODE_PATH, encodedPath);
      const stats = await stat(projectDir);
      
      if (stats.isDirectory()) {
        // Decode the directory name to get the actual path
        const decodedPath = encodedPath.replace(/-/g, '/');
        
        try {
          const files = await readdir(projectDir);
          const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
          
          for (const jsonlFile of jsonlFiles) {
            const sessionFile = join(projectDir, jsonlFile);
            
            try {
              const sessionStats = await stat(sessionFile);
              const sessionData = await parseClaudeSession(sessionFile);
              
              allSessions.push({
                sessionName: jsonlFile.replace('.jsonl', ''),
                filePath: sessionFile,
                projectPath: decodedPath,
                lastModified: sessionStats.mtime,
                messageCount: sessionData.messageCount,
                toolCalls: sessionData.toolCalls,
                firstMessagePreview: sessionData.firstMessagePreview,
                platform: 'claude'
              });
            } catch (error) {
              // Skip sessions we can't parse
              continue;
            }
          }
        } catch (error) {
          // Skip directories we can't read
          continue;
        }
      }
    }
  } else {
    // Single project (current behavior)
    const targetPath = filterPath ? resolve(filterPath) : process.cwd();
    const encodedPath = targetPath.replace(/\//g, '-');
    const projectDir = join(CLAUDE_CODE_PATH, encodedPath);

    if (!existsSync(projectDir)) {
      return [];
    }

    const files = await readdir(projectDir);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

    if (jsonlFiles.length === 0) {
      return [];
    }
    
    for (const jsonlFile of jsonlFiles) {
      const sessionFile = join(projectDir, jsonlFile);
      
      try {
        const stats = await stat(sessionFile);
        const sessionData = await parseClaudeSession(sessionFile);
        
        allSessions.push({
          sessionName: jsonlFile.replace('.jsonl', ''),
          filePath: sessionFile,
          projectPath: targetPath,
          lastModified: stats.mtime,
          messageCount: sessionData.messageCount,
          toolCalls: sessionData.toolCalls,
          firstMessagePreview: sessionData.firstMessagePreview,
          platform: 'claude'
        });
      } catch (error) {
        // Skip sessions we can't parse
        continue;
      }
    }
  }

  // Sort by last modified (oldest first, newest at bottom)
  allSessions.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());
  
  return allSessions;
}

async function parseClaudeSession(filePath: string) {
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
        const toolUse = message.message.content.find(c => c.type === 'tool_use');
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
          const textContent = content.find(c => c.type === 'text');
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

export async function getGeminiSessions(filterPath?: string, showAll?: boolean): Promise<SessionData[]> {
  if (!existsSync(GEMINI_CLI_PATH)) {
    return [];
  }

  let allSessions: SessionData[] = [];

  if (showAll) {
    // Scan all hash directories and parse context messages to extract project paths
    const hashDirs = await readdir(GEMINI_CLI_PATH);
    
    for (const hashDir of hashDirs) {
      const geminiDir = join(GEMINI_CLI_PATH, hashDir);
      const stats = await stat(geminiDir);
      
      if (stats.isDirectory()) {
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
              const sessionStats = await stat(filePath);
              const sessionData = await parseGeminiSessionWithContext(filePath);
              
              allSessions.push({
                sessionName: tag,
                filePath,
                projectPath: sessionData.projectPath || `Unknown (${hashDir.substring(0, 8)}...)`,
                lastModified: sessionStats.mtime,
                messageCount: sessionData.messageCount,
                toolCalls: sessionData.toolCalls,
                firstMessagePreview: sessionData.firstMessagePreview,
                platform: 'gemini'
              });
            } catch (error) {
              // Skip sessions we can't parse
              continue;
            }
          }
        } catch (error) {
          // Skip directories we can't read
          continue;
        }
      }
    }
  } else {
    // Single project (current behavior)
    const projectPath = filterPath ? resolve(filterPath) : process.cwd();
    const hash = createHash('sha256').update(projectPath).digest('hex');
    const geminiDir = join(GEMINI_CLI_PATH, hash);

    if (!existsSync(geminiDir)) {
      return [];
    }

    const files = await readdir(geminiDir);
    const checkpoints = files.filter(f => 
      (f.startsWith('checkpoint-') && f.endsWith('.json')) || 
      f === 'checkpoint.json'
    );

    if (checkpoints.length === 0) {
      return [];
    }
    
    for (const checkpoint of checkpoints) {
      const filePath = join(geminiDir, checkpoint);
      const tag = checkpoint === 'checkpoint.json' 
        ? 'default' 
        : checkpoint.slice(11, -5); // Remove 'checkpoint-' and '.json'
      
      try {
        const stats = await stat(filePath);
        const sessionData = await parseGeminiSession(filePath);
        
        allSessions.push({
          sessionName: tag,
          filePath,
          projectPath,
          lastModified: stats.mtime,
          messageCount: sessionData.messageCount,
          toolCalls: sessionData.toolCalls,
          firstMessagePreview: sessionData.firstMessagePreview,
          platform: 'gemini'
        });
      } catch (error) {
        // Skip sessions we can't parse
        continue;
      }
    }
  }

  // Sort by last modified (oldest first, newest at bottom)
  allSessions.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());
  
  return allSessions;
}

async function parseGeminiSession(filePath: string) {
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

async function parseGeminiSessionWithContext(filePath: string) {
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

export async function getQChatSessions(filterPath?: string, showAll?: boolean): Promise<SessionData[]> {
  if (!existsSync(Q_DATABASE_PATH)) {
    return [];
  }

  let allSessions: SessionData[] = [];

  if (showAll) {
    // List all conversations from the database
    const conversations = await readQDatabase();
    
    for (const conversation of conversations) {
      try {
        const sessionData = parseQConversation(conversation.conversationData);
        
        allSessions.push({
          sessionName: 'Q Chat Session',
          filePath: `Q Database (${conversation.conversationId.substring(0, 8)}...)`,
          projectPath: conversation.directoryPath,
          lastModified: new Date(sessionData.lastActivity),
          messageCount: sessionData.messageCount,
          toolCalls: sessionData.toolCalls,
          firstMessagePreview: sessionData.firstMessagePreview,
          platform: 'qchat',
          model: sessionData.model,
          conversationId: conversation.conversationId
        });
      } catch (error) {
        // Skip conversations we can't parse
        continue;
      }
    }
  } else {
    // Single project (current behavior)
    const targetPath = filterPath ? resolve(filterPath) : process.cwd();
    const conversation = await readQDatabase(targetPath);
    
    if (!conversation) {
      return [];
    }

    try {
      const sessionData = parseQConversation(conversation.conversationData);
      
      allSessions.push({
        sessionName: 'Q Chat Session',
        filePath: `Q Database (${conversation.conversationId.substring(0, 8)}...)`,
        projectPath: targetPath,
        lastModified: new Date(sessionData.lastActivity),
        messageCount: sessionData.messageCount,
        toolCalls: sessionData.toolCalls,
        firstMessagePreview: sessionData.firstMessagePreview,
        platform: 'qchat',
        model: sessionData.model,
        conversationId: conversation.conversationId
      });
    } catch (error) {
      return [];
    }
  }

  // Sort by last modified (oldest first, newest at bottom)
  allSessions.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());
  
  return allSessions;
}

function readQDatabase(filterPath?: string): Promise<any[] | any> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(Q_DATABASE_PATH, sqlite3.OPEN_READONLY);
    
    if (filterPath) {
      // Query for specific path
      db.get('SELECT key, value FROM conversations WHERE key = ?', [filterPath], (err, row) => {
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
        } catch (error) {
          db.close();
          reject(new Error(`Failed to parse conversation data: ${error.message}`));
        }
      });
    } else {
      // Query for all conversations
      db.all('SELECT key, value FROM conversations', [], (err, rows) => {
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

function parseQConversation(conversationData: any) {
  const history = conversationData.history || [];
  let messageCount = 0;
  let toolCalls = 0;
  let firstMessagePreview = '';
  let lastActivity = Date.now();

  // Parse the conversation history
  for (const turn of history) {
    if (Array.isArray(turn) && turn.length >= 2) {
      const [userMessage, assistantMessage] = turn;
      
      messageCount += 2; // User + Assistant
      
      // Extract first user message preview
      if (!firstMessagePreview && userMessage?.content?.Prompt?.prompt) {
        const text = userMessage.content.Prompt.prompt;
        firstMessagePreview = text
          .replace(/\n/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 100);
        
        if (text.length > 100) {
          firstMessagePreview += '...';
        }
      }
      
      // Count tool calls (check for Response with message_id, indicates tool usage)
      if (assistantMessage?.Response?.message_id) {
        // This is a rough heuristic - could be improved by checking the actual content
        const content = assistantMessage.Response.content || '';
        if (content.includes('🛠️') || content.includes('tool')) {
          toolCalls++;
        }
      }
    }
  }

  // Extract model information
  const model = conversationData.model || 'Unknown Model';

  return {
    messageCount,
    toolCalls,
    firstMessagePreview,
    lastActivity,
    model
  };
}

export function getMostRecentSession(sessions: SessionData[]): SessionData | null {
  if (sessions.length === 0) return null;
  
  // Sessions are already sorted by last modified (oldest first)
  // So return the last item
  return sessions[sessions.length - 1];
}

export function sortPlatformsBySessionCount(sessionsByPlatform: SessionsByPlatform): Array<{platform: keyof SessionsByPlatform, sessions: SessionData[]}> {
  const platforms = Object.entries(sessionsByPlatform) as Array<[keyof SessionsByPlatform, SessionData[]]>;
  
  return platforms
    .sort(([, a], [, b]) => b.length - a.length) // Sort by count descending
    .map(([platform, sessions]) => ({ platform, sessions }));
}