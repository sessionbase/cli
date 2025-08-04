import { Command } from 'commander';
import { readFileSync, existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import sqlite3 from 'sqlite3';
import { getToken } from '../auth.js';
import { BASE_URL } from '../config.js';
import chalk from 'chalk';
import ora from 'ora';

export const pushCommand = new Command('push')
  .description('Push a chat session file or auto-detect most recent session')
  .argument('[file]', 'Path to the session file (.json or .jsonl) - optional if using platform flags')
  .option('--claude', 'Push most recent Claude Code session from current directory')
  .option('--gemini', 'Push most recent Gemini CLI session from current directory')
  .option('--qchat', 'Push most recent Amazon Q Chat session from current directory')
  .option('--private', 'Make the session private')
  .option('--title <title>', 'Session title')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--summary <summary>', 'Session summary')
  .action(async (filePath, options) => {
    // Validate mutually exclusive options
    const platformFlags = [options.claude, options.gemini, options.qchat].filter(Boolean).length;
    
    if (filePath && platformFlags > 0) {
      console.error(chalk.red('Error: Cannot specify both a file path and platform flags (--claude, --gemini, --qchat)'));
      process.exit(1);
    }
    
    if (!filePath && platformFlags === 0) {
      console.error(chalk.red('Error: Must specify either a file path or a platform flag (--claude, --gemini, --qchat)'));
      process.exit(1);
    }
    
    if (platformFlags > 1) {
      console.error(chalk.red('Error: Can only specify one platform flag at a time'));
      process.exit(1);
    }
    
    const spinner = ora('Finding session...').start();
    
    try {
      // Get auth token
      const token = await getToken();
      if (!token) {
        spinner.fail('Not authenticated. Please run `sessionbase login` first.');
        process.exit(1);
      }
      
      // Auto-detect session file if using platform flags
      if (platformFlags > 0) {
        const detectedFile = await detectMostRecentSession(options, spinner);
        if (!detectedFile) {
          process.exit(1);
        }
        filePath = detectedFile;
      }
      
      spinner.text = 'Pushing session...';

      // Read and parse the file
      const content = readFileSync(filePath, 'utf-8');
      let sessionData;
      
      // Determine file type and parse accordingly
      const isJsonl = filePath.endsWith('.jsonl');
      
      try {
        if (isJsonl) {
          // Convert JSONL to JSON by parsing each line
          const lines = content.trim().split('\n').filter(line => line.trim());
          const entries = lines.map(line => JSON.parse(line));
          
          // Extract Claude session metadata from first entry
          const firstEntry = entries[0];
          const claudeSessionId = firstEntry?.sessionId;
          const claudeCwd = firstEntry?.cwd;
          
          // Create a simple JSON structure with the entries
          sessionData = {
            messages: entries,
            title: `JSONL Import ${new Date().toISOString().split('T')[0]}`,
            platform: 'claude-code',
            sessionId: claudeSessionId,
            cwd: claudeCwd
          };
        } else {
          // Parse regular JSON
          const parsed = JSON.parse(content);
          
          // Check if it's Gemini CLI format (JSON array with role/parts structure)
          if (Array.isArray(parsed) && parsed.length > 0 && 
              parsed.some(msg => 
                msg.role && ['user', 'model'].includes(msg.role) && 
                msg.parts && Array.isArray(msg.parts) &&
                msg.parts.some(part => part.text || part.functionCall || part.functionResponse)
              )) {
            // Wrap Gemini CLI array in standard format
            sessionData = {
              messages: parsed,
              title: `Gemini CLI Session ${new Date().toISOString().split('T')[0]}`,
              platform: 'gemini-cli'
            };
          } else if (parsed.conversation_id && parsed.history && Array.isArray(parsed.history)) {
            // Q Chat format - store raw data directly
            sessionData = parsed;
            sessionData.platform = 'q-chat';
            // Set a default title if not present
            if (!sessionData.title) {
              sessionData.title = `Q Chat Session ${new Date().toISOString().split('T')[0]}`;
            }
          } else {
            sessionData = parsed;
          }
        }
      } catch (error) {
        spinner.fail(`Invalid ${isJsonl ? 'JSONL' : 'JSON'} in ${filePath}: ${error.message}`);
        process.exit(1);
      }

      // Validate messages exist (different field names for different platforms)
      const hasMessages = sessionData.messages && Array.isArray(sessionData.messages);
      const hasHistory = sessionData.history && Array.isArray(sessionData.history); // Q Chat format
      
      if (!hasMessages && !hasHistory) {
        spinner.fail('Session file must contain a "messages" array or "history" array');
        process.exit(1);
      }

      // Build the payload - for Q Chat, send the entire raw session data
      let payload;
      
      if (sessionData.platform === 'q-chat') {
        // For Q Chat, store the complete raw conversation data
        payload = {
          ...sessionData, // Include all raw Q Chat data
          isPrivate: options.private || false,
          title: options.title || sessionData.title || 'Untitled Session',
          summary: options.summary || sessionData.summary || '',
          tags: options.tags ? options.tags.split(',').map(t => t.trim()) : (sessionData.tags || []),
          messageCount: sessionData.history ? sessionData.history.length : 0,
          modelName: sessionData.model || 'unknown'
        };
      } else {
        // For other platforms, use the existing messages-based format
        payload = {
          messages: sessionData.messages,
          isPrivate: options.private || false,
          title: options.title || sessionData.title || 'Untitled Session',
          summary: options.summary || sessionData.summary || '',
          tags: options.tags ? options.tags.split(',').map(t => t.trim()) : (sessionData.tags || []),
          tokenCount: sessionData.tokenCount || 0,
          messageCount: sessionData.messages.length,
          modelName: sessionData.modelName || 'unknown',
          platform: sessionData.platform || 'qcli',
          ...(sessionData.sessionId && { sessionId: sessionData.sessionId }),
          ...(sessionData.cwd && { cwd: sessionData.cwd })
        };
      }

      // Make the API call
      const response = await fetch(`${BASE_URL}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        spinner.fail(`Push failed: ${response.status} ${response.statusText} - ${errorText}`);
        process.exit(1);
      }

      const result = await response.json();
      
      spinner.succeed('Session pushed successfully!');
      console.log(chalk.green(`Session ID: ${result.id}`));
      if (result.url) {
        console.log(chalk.blue(`URL: ${result.url}`));
      }

    } catch (error) {
      spinner.fail(`Push failed: ${error.message}`);
      process.exit(1);
    }
  });

const CLAUDE_CODE_PATH = join(homedir(), '.claude', 'projects');
const GEMINI_CLI_PATH = join(homedir(), '.gemini', 'tmp');
const Q_DATABASE_PATH = join(homedir(), 'Library/Application Support/amazon-q/data.sqlite3');

async function detectMostRecentSession(options: any, spinner: any): Promise<string | null> {
  const currentDir = process.cwd();
  
  if (options.claude) {
    return await findMostRecentClaudeSession(currentDir, spinner);
  } else if (options.gemini) {
    return await findMostRecentGeminiSession(currentDir, spinner);
  } else if (options.qchat) {
    return await findMostRecentQChatSession(currentDir, spinner);
  }
  
  return null;
}

async function findMostRecentClaudeSession(targetPath: string, spinner: any): Promise<string | null> {
  try {
    if (!existsSync(CLAUDE_CODE_PATH)) {
      spinner.fail('No Claude Code sessions found (directory does not exist)');
      return null;
    }

    const encodedPath = targetPath.replace(/\//g, '-');
    const projectDir = join(CLAUDE_CODE_PATH, encodedPath);

    if (!existsSync(projectDir)) {
      spinner.fail(`No Claude Code sessions found for project: ${targetPath}`);
      return null;
    }

    const files = await readdir(projectDir);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

    if (jsonlFiles.length === 0) {
      spinner.fail(`No Claude Code sessions found for project: ${targetPath}`);
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
        continue;
      }
    }

    if (!mostRecentFile) {
      spinner.fail(`No valid Claude Code sessions found for project: ${targetPath}`);
      return null;
    }
    
    spinner.succeed(`Found most recent Claude Code session: ${mostRecentFile}`);
    return mostRecentFile;
    
  } catch (error) {
    spinner.fail(`Error finding Claude Code session: ${error.message}`);
    return null;
  }
}

async function findMostRecentGeminiSession(targetPath: string, spinner: any): Promise<string | null> {
  try {
    if (!existsSync(GEMINI_CLI_PATH)) {
      spinner.fail('No Gemini CLI sessions found (directory does not exist)');
      return null;
    }

    const hash = createHash('sha256').update(targetPath).digest('hex');
    const geminiDir = join(GEMINI_CLI_PATH, hash);

    if (!existsSync(geminiDir)) {
      spinner.fail(`No Gemini CLI sessions found for project: ${targetPath}`);
      return null;
    }

    const files = await readdir(geminiDir);
    const checkpoints = files.filter(f => 
      (f.startsWith('checkpoint-') && f.endsWith('.json')) || 
      f === 'checkpoint.json'
    );

    if (checkpoints.length === 0) {
      spinner.fail(`No Gemini CLI checkpoints found for project: ${targetPath}`);
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
      spinner.fail(`No valid Gemini CLI sessions found for project: ${targetPath}`);
      return null;
    }
    
    spinner.succeed(`Found most recent Gemini CLI session: ${mostRecentFile}`);
    return mostRecentFile;
    
  } catch (error) {
    spinner.fail(`Error finding Gemini CLI session: ${error.message}`);
    return null;
  }
}

async function findMostRecentQChatSession(targetPath: string, spinner: any): Promise<string | null> {
  try {
    if (!existsSync(Q_DATABASE_PATH)) {
      spinner.fail('No Amazon Q Chat sessions found (Q CLI not installed or no conversations yet)');
      return null;
    }

    const conversation = await readQDatabase(targetPath);
    
    if (!conversation) {
      spinner.fail(`No Amazon Q Chat session found for project: ${targetPath}`);
      return null;
    }
    
    try {
      const sessionData = parseQConversation(conversation.conversationData);
      
      // Create a temporary JSON file with the raw Q Chat data (same as direct file upload)
      const tempFileName = `/tmp/qchat-session-${Date.now()}.json`;
      
      await require('fs').promises.writeFile(tempFileName, JSON.stringify(conversation.conversationData, null, 2));
      
      spinner.succeed(`Found Amazon Q Chat session: ${conversation.directoryPath}`);
      return tempFileName;
      
    } catch (error) {
      spinner.fail(`Error parsing Q Chat session: ${error.message}`);
      return null;
    }
    
  } catch (error) {
    spinner.fail(`Error finding Q Chat session: ${error.message}`);
    return null;
  }
}

function readQDatabase(filterPath?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(Q_DATABASE_PATH, sqlite3.OPEN_READONLY);
    
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
    let userMessage, assistantMessage;
    
    // Handle both old array format and new object format
    if (Array.isArray(turn) && turn.length >= 2) {
      // Old format: [userMessage, assistantMessage]
      [userMessage, assistantMessage] = turn;
    } else if (turn && typeof turn === 'object' && turn.user && turn.assistant) {
      // New format: {user: userMessage, assistant: assistantMessage}
      userMessage = turn.user;
      assistantMessage = turn.assistant;
    } else {
      // Skip invalid entries
      continue;
    }
    
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
    
    // Count tool calls (check for Response or ToolUse with message_id, indicates tool usage)
    if (assistantMessage?.Response?.message_id || assistantMessage?.ToolUse?.message_id) {
      // This is a rough heuristic - could be improved by checking the actual content
      const content = assistantMessage?.Response?.content || assistantMessage?.ToolUse?.content || '';
      if (content.includes('🛠️') || content.includes('tool')) {
        toolCalls++;
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

function convertQChatToMessages(conversationData: any): any[] {
  const messages = [];
  const history = conversationData.history || [];
  const sessionId = conversationData.conversation_id || `qchat-${Date.now()}`;
  
  for (let i = 0; i < history.length; i++) {
    const turn = history[i];
    let userMessage, assistantMessage;
    
    // Handle both old array format and new object format
    if (Array.isArray(turn) && turn.length >= 2) {
      // Old format: [userMessage, assistantMessage]
      [userMessage, assistantMessage] = turn;
    } else if (turn && typeof turn === 'object' && turn.user && turn.assistant) {
      // New format: {user: userMessage, assistant: assistantMessage}
      userMessage = turn.user;
      assistantMessage = turn.assistant;
    } else {
      // Skip invalid entries
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
          toolResults: toolResults.map(result => ({
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
        toolCalls = assistantMessage.ToolUse.tool_uses.map(tool => ({
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
      const assistantMsg = {
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
