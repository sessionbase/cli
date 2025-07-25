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
  .action(async (options) => {
    if (options.claude) {
      await listClaudeSessions(options.path);
    } else if (options.gemini) {
      await listGeminiSessions(options.path);
    } else {
      console.log('Please specify a tool: --claude or --gemini');
    }
  });

async function listClaudeSessions(filterPath?: string) {
  try {
    if (!existsSync(CLAUDE_CODE_PATH)) {
      console.log(chalk.yellow('No Claude Code sessions found (directory does not exist)'));
      return;
    }

    const targetPath = filterPath ? resolve(filterPath) : process.cwd();
    
    // Encode the target path in the same way Claude Code does
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

    const sessions = [];
    
    for (const jsonlFile of jsonlFiles) {
      const sessionFile = join(projectDir, jsonlFile);
      
      try {
        const stats = await stat(sessionFile);
        const sessionData = await parseClaudeSession(sessionFile);
        
        sessions.push({
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

    if (sessions.length === 0) {
      console.log(chalk.yellow(`No valid Claude Code sessions found for project: ${targetPath}`));
      return;
    }

    // Sort by last modified (newest first)
    sessions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

    console.log(chalk.bold.blue(`\n📋 Found ${sessions.length} Claude Code session${sessions.length === 1 ? '' : 's'} for ${targetPath}:\n`));
    
    sessions.forEach((session, index) => {
      const date = session.lastModified.toLocaleDateString();
      const time = session.lastModified.toLocaleTimeString();
      
      console.log(chalk.bold.white(`${index + 1}. ${session.sessionName}`));
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

async function listGeminiSessions(filterPath?: string) {
  try {
    if (!existsSync(GEMINI_CLI_PATH)) {
      console.log(chalk.yellow('No Gemini CLI sessions found (directory does not exist)'));
      return;
    }

    const projectPath = filterPath ? resolve(filterPath) : process.cwd();
    const hash = createHash('sha256').update(projectPath).digest('hex');
    const geminiDir = join(GEMINI_CLI_PATH, hash);

    if (!existsSync(geminiDir)) {
      console.log(chalk.yellow(`No Gemini CLI sessions found for project: ${projectPath}`));
      return;
    }

    const files = await readdir(geminiDir);
    const checkpoints = files.filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'));

    if (checkpoints.length === 0) {
      console.log(chalk.yellow(`No Gemini CLI checkpoints found for project: ${projectPath}`));
      return;
    }

    const sessions = [];
    
    for (const checkpoint of checkpoints) {
      const filePath = join(geminiDir, checkpoint);
      const tag = checkpoint.slice(11, -5); // Remove 'checkpoint-' and '.json'
      
      try {
        const stats = await stat(filePath);
        const sessionData = await parseGeminiSession(filePath);
        
        sessions.push({
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

    if (sessions.length === 0) {
      console.log(chalk.yellow(`No valid Gemini CLI sessions found for project: ${projectPath}`));
      return;
    }

    // Sort by last modified (newest first)
    sessions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

    console.log(chalk.bold.blue(`\n🔷 Found ${sessions.length} Gemini CLI session${sessions.length === 1 ? '' : 's'} for ${projectPath}:\n`));
    
    sessions.forEach((session, index) => {
      const date = session.lastModified.toLocaleDateString();
      const time = session.lastModified.toLocaleTimeString();
      
      console.log(chalk.bold.white(`${index + 1}. ${session.tag}`));
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
