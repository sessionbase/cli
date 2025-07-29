import { Command } from 'commander';
import { readdir, stat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import chalk from 'chalk';
import sqlite3 from 'sqlite3';

const CLAUDE_CODE_PATH = join(homedir(), '.claude', 'projects');
const GEMINI_CLI_PATH = join(homedir(), '.gemini', 'tmp');
const Q_DATABASE_PATH = join(homedir(), 'Library/Application Support/amazon-q/data.sqlite3');

export const listCommand = new Command('list')
  .description('List local chat sessions')
  .option('--claude', 'Filter for Claude Code sessions')
  .option('--gemini', 'Filter for Gemini CLI sessions')
  .option('--qchat', 'Filter for Amazon Q Chat sessions')
  .option('--path <path>', 'Filter sessions by specific directory path')
  .option('--global', 'Include sessions from all projects')
  .action(async (options) => {
    // Validate mutually exclusive options
    if (options.path && options.global) {
      console.error(chalk.red('Error: Cannot specify both --path and --global options'));
      process.exit(1);
    }
    
    const platformsRequested = [options.claude, options.gemini, options.qchat].filter(Boolean);
    
    if (platformsRequested.length === 0) {
      // Show all platforms by default
      await listAllPlatforms(options.path, options.global);
    } else {
      // Show specific platforms
      if (options.claude) {
        await listClaudeSessions(options.path, options.global);
      }
      if (options.gemini) {
        await listGeminiSessions(options.path, options.global);
      }
      if (options.qchat) {
        await listQChatSessions(options.path, options.global);
      }
    }
  });

async function listAllPlatforms(filterPath?: string, showGlobal?: boolean) {
  const scope = showGlobal ? 'all projects' : (filterPath || process.cwd());
  console.log(chalk.bold.blue(`\n📋 Sessions for ${scope}:\n`));
  
  let foundAny = false;
  
  // Try Claude sessions
  if (existsSync(CLAUDE_CODE_PATH)) {
    try {
      console.log(chalk.bold.cyan('Claude Code:'));
      await listClaudeSessions(filterPath, showGlobal, false);
      foundAny = true;
    } catch (error) {
      // Silent fail for individual platforms
    }
  }
  
  // Try Gemini sessions
  if (existsSync(GEMINI_CLI_PATH)) {
    try {
      if (foundAny) console.log(''); // Add spacing between platforms
      console.log(chalk.bold.cyan('Gemini CLI:'));
      await listGeminiSessions(filterPath, showGlobal, false);
      foundAny = true;
    } catch (error) {
      // Silent fail for individual platforms
    }
  }
  
  // Try Q Chat sessions
  if (existsSync(Q_DATABASE_PATH)) {
    try {
      if (foundAny) console.log(''); // Add spacing between platforms
      console.log(chalk.bold.cyan('Amazon Q Chat:'));
      await listQChatSessions(filterPath, showGlobal, false);
      foundAny = true;
    } catch (error) {
      // Silent fail for individual platforms
    }
  }
  
  if (!foundAny) {
    console.log(chalk.yellow('No chat sessions found on any platform.'));
    console.log(chalk.gray('Supported platforms: Claude Code, Gemini CLI, Amazon Q Chat'));
  }
}

async function listClaudeSessions(filterPath?: string, showGlobal?: boolean, showHeader: boolean = true) {
  try {
    if (!existsSync(CLAUDE_CODE_PATH)) {
      console.log(chalk.yellow('No Claude Code sessions found (directory does not exist)'));
      return;
    }

    let allSessions = [];

    if (showGlobal) {
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
                  firstMessagePreview: sessionData.firstMessagePreview
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
        console.log(chalk.yellow(`No Claude Code sessions found for project: ${targetPath}`));
        return;
      }

      const files = await readdir(projectDir);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

      if (jsonlFiles.length === 0) {
        console.log(chalk.yellow(`No Claude Code sessions found for project: ${targetPath}`));
        return;
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
            firstMessagePreview: sessionData.firstMessagePreview
          });
        } catch (error) {
          // Skip sessions we can't parse
          continue;
        }
      }
    }

    if (allSessions.length === 0) {
      const scope = showGlobal ? 'all projects' : (filterPath || process.cwd());
      console.log(chalk.yellow(`No valid Claude Code sessions found for ${scope}`));
      return;
    }

    // Sort by last modified (oldest first, newest at bottom)
    allSessions.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());

    const scope = showGlobal ? 'all projects' : (filterPath || process.cwd());
    if (showHeader) {
      console.log(chalk.bold.blue(`\n📋 Found ${allSessions.length} Claude Code session${allSessions.length === 1 ? '' : 's'} for ${scope}:\n`));
    }
    
    if (showGlobal) {
      // Group by project for better readability
      const sessionsByProject = allSessions.reduce((acc, session) => {
        if (!acc[session.projectPath]) {
          acc[session.projectPath] = [];
        }
        acc[session.projectPath].push(session);
        return acc;
      }, {});

      let totalIndex = 0;
      Object.entries(sessionsByProject).forEach(([projectPath, sessions]) => {
        console.log(chalk.bold.yellow(`\n${projectPath}:`));
        sessions.forEach((session) => {
          totalIndex++;
          const date = session.lastModified.toLocaleDateString();
          const time = session.lastModified.toLocaleTimeString();
          
          console.log(chalk.bold.white(`${allSessions.length - totalIndex + 1}. ${session.sessionName}`));
          console.log(chalk.gray(`   💬 ${session.messageCount} messages | 📅 ${date} ${time}`));
          
          if (session.firstMessagePreview) {
            console.log(chalk.cyan(`   💭 "${session.firstMessagePreview}"`));
          }
          
          if (session.toolCalls > 0) {
            console.log(chalk.magenta(`   🔧 ${session.toolCalls} tool calls`));
          }
          
          console.log(chalk.dim(`   📁 ${session.filePath}`));
          console.log(''); // Empty line for spacing
        });
      });
    } else {
      allSessions.forEach((session, index) => {
        const date = session.lastModified.toLocaleDateString();
        const time = session.lastModified.toLocaleTimeString();
        
        console.log(chalk.bold.white(`${allSessions.length - index}. ${session.sessionName}`));
        console.log(chalk.gray(`   💬 ${session.messageCount} messages | 📅 ${date} ${time}`));
        
        if (session.firstMessagePreview) {
          console.log(chalk.cyan(`   💭 "${session.firstMessagePreview}"`));
        }
        
        if (session.toolCalls > 0) {
          console.log(chalk.magenta(`   🔧 ${session.toolCalls} tool calls`));
        }
        
        console.log(chalk.dim(`   📁 ${session.filePath}`));
        console.log(''); // Empty line for spacing
      });
    }

  } catch (error) {
    console.error(chalk.red('Error listing Claude sessions:'), error.message);
  }
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

async function listGeminiSessions(filterPath?: string, showGlobal?: boolean, showHeader: boolean = true) {
  try {
    if (!existsSync(GEMINI_CLI_PATH)) {
      console.log(chalk.yellow('No Gemini CLI sessions found (directory does not exist)'));
      return;
    }

    let allSessions = [];

    if (showGlobal) {
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
                  tag,
                  filePath,
                  projectPath: sessionData.projectPath || `Unknown (${hashDir.substring(0, 8)}...)`,
                  lastModified: sessionStats.mtime,
                  messageCount: sessionData.messageCount,
                  toolCalls: sessionData.toolCalls,
                  firstMessagePreview: sessionData.firstMessagePreview
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
        console.log(chalk.yellow(`No Gemini CLI sessions found for project: ${projectPath}`));
        return;
      }

      const files = await readdir(geminiDir);
      const checkpoints = files.filter(f => 
        (f.startsWith('checkpoint-') && f.endsWith('.json')) || 
        f === 'checkpoint.json'
      );

      if (checkpoints.length === 0) {
        console.log(chalk.yellow(`No Gemini CLI checkpoints found for project: ${projectPath}`));
        return;
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
            tag,
            filePath,
            projectPath,
            lastModified: stats.mtime,
            messageCount: sessionData.messageCount,
            toolCalls: sessionData.toolCalls,
            firstMessagePreview: sessionData.firstMessagePreview
          });
        } catch (error) {
          // Skip sessions we can't parse
          continue;
        }
      }
    }

    if (allSessions.length === 0) {
      const scope = showGlobal ? 'all projects' : (filterPath || process.cwd());
      console.log(chalk.yellow(`No valid Gemini CLI sessions found for ${scope}`));
      return;
    }

    // Sort by last modified (oldest first, newest at bottom)
    allSessions.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());

    const scope = showGlobal ? 'all projects' : (filterPath || process.cwd());
    if (showHeader) {
      console.log(chalk.bold.blue(`\n🔷 Found ${allSessions.length} Gemini CLI session${allSessions.length === 1 ? '' : 's'} for ${scope}:\n`));
    }
    
    if (showGlobal) {
      // Group by project for better readability
      const sessionsByProject = allSessions.reduce((acc, session) => {
        if (!acc[session.projectPath]) {
          acc[session.projectPath] = [];
        }
        acc[session.projectPath].push(session);
        return acc;
      }, {});

      let totalIndex = 0;
      Object.entries(sessionsByProject).forEach(([projectPath, sessions]) => {
        console.log(chalk.bold.yellow(`\n${projectPath}:`));
        sessions.forEach((session) => {
          totalIndex++;
          const date = session.lastModified.toLocaleDateString();
          const time = session.lastModified.toLocaleTimeString();
          
          console.log(chalk.bold.white(`${allSessions.length - totalIndex + 1}. ${session.tag}`));
          console.log(chalk.gray(`   💬 ${session.messageCount} messages | 📅 ${date} ${time}`));
          
          if (session.firstMessagePreview) {
            console.log(chalk.cyan(`   💭 "${session.firstMessagePreview}"`));
          }
          
          if (session.toolCalls > 0) {
            console.log(chalk.magenta(`   🔧 ${session.toolCalls} tool calls`));
          }
          
          console.log(chalk.dim(`   📁 ${session.filePath}`));
          console.log(''); // Empty line for spacing
        });
      });
    } else {
      allSessions.forEach((session, index) => {
        const date = session.lastModified.toLocaleDateString();
        const time = session.lastModified.toLocaleTimeString();
        
        console.log(chalk.bold.white(`${allSessions.length - index}. ${session.tag}`));
        console.log(chalk.gray(`   💬 ${session.messageCount} messages | 📅 ${date} ${time}`));
        
        if (session.firstMessagePreview) {
          console.log(chalk.cyan(`   💭 "${session.firstMessagePreview}"`));
        }
        
        if (session.toolCalls > 0) {
          console.log(chalk.magenta(`   🔧 ${session.toolCalls} tool calls`));
        }
        
        console.log(chalk.dim(`   📁 ${session.filePath}`));
        console.log(''); // Empty line for spacing
      });
    }

  } catch (error) {
    console.error(chalk.red('Error listing Gemini CLI sessions:'), error.message);
  }
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

async function listQChatSessions(filterPath?: string, showGlobal?: boolean, showHeader: boolean = true) {
  try {
    if (!existsSync(Q_DATABASE_PATH)) {
      console.log(chalk.yellow('No Amazon Q Chat sessions found (Q CLI not installed or no conversations yet)'));
      return;
    }

    let allSessions = [];

    if (showGlobal) {
      // List all conversations from the database
      const conversations = await readQDatabase();
      
      for (const conversation of conversations) {
        try {
          const sessionData = parseQConversation(conversation.conversationData);
          
          allSessions.push({
            conversationName: 'Q Chat Session',
            filePath: `Q Database (${conversation.conversationId.substring(0, 8)}...)`,
            projectPath: conversation.directoryPath,
            lastModified: new Date(sessionData.lastActivity),
            messageCount: sessionData.messageCount,
            toolCalls: sessionData.toolCalls,
            firstMessagePreview: sessionData.firstMessagePreview,
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
        console.log(chalk.yellow(`No Amazon Q Chat session found for project: ${targetPath}`));
        return;
      }

      try {
        const sessionData = parseQConversation(conversation.conversationData);
        
        allSessions.push({
          conversationName: 'Q Chat Session',
          filePath: `Q Database (${conversation.conversationId.substring(0, 8)}...)`,
          projectPath: targetPath,
          lastModified: new Date(sessionData.lastActivity),
          messageCount: sessionData.messageCount,
          toolCalls: sessionData.toolCalls,
          firstMessagePreview: sessionData.firstMessagePreview,
          model: sessionData.model,
          conversationId: conversation.conversationId
        });
      } catch (error) {
        console.log(chalk.yellow(`Failed to parse Q Chat session for project: ${targetPath}`));
        return;
      }
    }

    if (allSessions.length === 0) {
      const scope = showGlobal ? 'all projects' : (filterPath || process.cwd());
      console.log(chalk.yellow(`No valid Amazon Q Chat sessions found for ${scope}`));
      return;
    }

    // Sort by last modified (oldest first, newest at bottom)
    allSessions.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());

    const scope = showGlobal ? 'all projects' : (filterPath || process.cwd());
    if (showHeader) {
      console.log(chalk.bold.blue(`\n🤖 Found ${allSessions.length} Amazon Q Chat session${allSessions.length === 1 ? '' : 's'} for ${scope}:\n`));
    }
    
    if (showGlobal) {
      // Group by project for better readability
      const sessionsByProject = allSessions.reduce((acc, session) => {
        if (!acc[session.projectPath]) {
          acc[session.projectPath] = [];
        }
        acc[session.projectPath].push(session);
        return acc;
      }, {});

      let totalIndex = 0;
      Object.entries(sessionsByProject).forEach(([projectPath, sessions]) => {
        console.log(chalk.bold.yellow(`\n${projectPath}:`));
        sessions.forEach((session) => {
          totalIndex++;
          const date = session.lastModified.toLocaleDateString();
          const time = session.lastModified.toLocaleTimeString();
          
          console.log(chalk.bold.white(`${allSessions.length - totalIndex + 1}. Q Chat Session`));
          console.log(chalk.gray(`   💬 ${session.messageCount} messages | 📅 ${date} ${time}`));
          
          if (session.firstMessagePreview) {
            console.log(chalk.cyan(`   💭 "${session.firstMessagePreview}"`));
          }
          
          if (session.toolCalls > 0) {
            console.log(chalk.magenta(`   🔧 ${session.toolCalls} tool calls`));
          }
          
          if (session.model) {
            console.log(chalk.blue(`   🤖 ${session.model.replace('CLAUDE_SONNET_4_20250514_V1_0', 'Claude Sonnet 4')}`));
          }
          
          console.log(chalk.dim(`   📁 ${session.filePath}`));
          console.log(chalk.dim(`   🆔 ${session.conversationId}`));
          console.log(''); // Empty line for spacing
        });
      });
    } else {
      allSessions.forEach((session, index) => {
        const date = session.lastModified.toLocaleDateString();
        const time = session.lastModified.toLocaleTimeString();
        
        console.log(chalk.bold.white(`${allSessions.length - index}. Q Chat Session`));
        console.log(chalk.gray(`   💬 ${session.messageCount} messages | 📅 ${date} ${time}`));
        
        if (session.firstMessagePreview) {
          console.log(chalk.cyan(`   💭 "${session.firstMessagePreview}"`));
        }
        
        if (session.toolCalls > 0) {
          console.log(chalk.magenta(`   🔧 ${session.toolCalls} tool calls`));
        }
        
        if (session.model) {
          console.log(chalk.blue(`   🤖 ${session.model.replace('CLAUDE_SONNET_4_20250514_V1_0', 'Claude Sonnet 4')}`));
        }
        
        console.log(chalk.dim(`   📁 ${session.filePath}`));
        console.log(chalk.dim(`   🆔 ${session.conversationId}`));
        console.log(''); // Empty line for spacing
      });
    }

  } catch (error) {
    console.error(chalk.red('Error listing Amazon Q Chat sessions:'), error.message);
  }
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
