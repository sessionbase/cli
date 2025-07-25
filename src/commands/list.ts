import { Command } from 'commander';
import { readdir, stat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import chalk from 'chalk';

const CLAUDE_CODE_PATH = join(homedir(), '.claude', 'projects');
const GEMINI_CLI_PATH = join(homedir(), '.gemini', 'tmp');

export const listCommand = new Command('list')
  .description('List local chat sessions')
  .option('--claude', 'List Claude Code sessions')
  .option('--gemini', 'List Gemini CLI sessions')
  .option('--path <path>', 'Filter sessions by specific directory path')
  .option('--all', 'List sessions from all projects')
  .action(async (options) => {
    if (options.claude) {
      await listClaudeSessions(options.path, options.all);
    } else if (options.gemini) {
      await listGeminiSessions(options.path, options.all);
    } else {
      console.log('Please specify a tool: --claude or --gemini');
    }
  });

async function listClaudeSessions(filterPath?: string, showAll?: boolean) {
  try {
    if (!existsSync(CLAUDE_CODE_PATH)) {
      console.log(chalk.yellow('No Claude Code sessions found (directory does not exist)'));
      return;
    }

    let allSessions = [];

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
      const scope = showAll ? 'all projects' : (filterPath || process.cwd());
      console.log(chalk.yellow(`No valid Claude Code sessions found for ${scope}`));
      return;
    }

    // Sort by last modified (oldest first, newest at bottom)
    allSessions.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());

    const scope = showAll ? 'all projects' : (filterPath || process.cwd());
    console.log(chalk.bold.blue(`\n📋 Found ${allSessions.length} Claude Code session${allSessions.length === 1 ? '' : 's'} for ${scope}:\n`));
    
    if (showAll) {
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

async function listGeminiSessions(filterPath?: string, showAll?: boolean) {
  try {
    if (!existsSync(GEMINI_CLI_PATH)) {
      console.log(chalk.yellow('No Gemini CLI sessions found (directory does not exist)'));
      return;
    }

    let allSessions = [];

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
      const scope = showAll ? 'all projects' : (filterPath || process.cwd());
      console.log(chalk.yellow(`No valid Gemini CLI sessions found for ${scope}`));
      return;
    }

    // Sort by last modified (oldest first, newest at bottom)
    allSessions.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());

    const scope = showAll ? 'all projects' : (filterPath || process.cwd());
    console.log(chalk.bold.blue(`\n🔷 Found ${allSessions.length} Gemini CLI session${allSessions.length === 1 ? '' : 's'} for ${scope}:\n`));
    
    if (showAll) {
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
