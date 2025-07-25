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

    // Resolve relative paths to absolute paths for comparison
    let resolvedFilterPath: string | undefined;
    if (filterPath) {
      resolvedFilterPath = resolve(filterPath);
    }

    const projectDirs = await readdir(CLAUDE_CODE_PATH);
    const sessions = [];

    for (const dir of projectDirs) {
      const projectPath = join(CLAUDE_CODE_PATH, dir);
      const stats = await stat(projectPath);
      
      if (stats.isDirectory()) {
        // Decode the directory name to get the actual path
        const decodedPath = decodeURIComponent(dir.replace(/-/g, '/'));
        
        // If filterPath is provided, check if this session matches
        if (resolvedFilterPath) {
          // Check both the original filterPath (for partial matches) and resolved path (for relative paths)
          const matchesOriginal = decodedPath.includes(filterPath!);
          const matchesResolved = decodedPath.includes(resolvedFilterPath);
          
          if (!matchesOriginal && !matchesResolved) {
            continue;
          }
        }
        
        // Look for all .jsonl files in the project directory
        try {
          const files = await readdir(projectPath);
          const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
          
          for (const jsonlFile of jsonlFiles) {
            const sessionFile = join(projectPath, jsonlFile);
            const sessionStats = await stat(sessionFile);
            
            // Read and parse the jsonl file
            const content = await readFile(sessionFile, 'utf-8');
            const lines = content.trim().split('\n').filter(line => line.trim());
            const messageCount = lines.length;
            
            // Get first message preview
            let firstMessagePreview = '';
            if (lines.length > 0) {
              try {
                const firstMessage = JSON.parse(lines[0]);
                if (firstMessage.message && firstMessage.message.content) {
                  // Extract text content, handling both string and array formats
                  let text = '';
                  const content = firstMessage.message.content;
                  
                  if (typeof content === 'string') {
                    text = content;
                  } else if (Array.isArray(content)) {
                    const textContent = content.find(c => c.type === 'text');
                    text = textContent?.text || '';
                  }
                  
                  // Truncate and clean up the preview
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
                // Skip if we can't parse the first message
                firstMessagePreview = '';
              }
            }
            
            sessions.push({
              title: `${decodedPath} - ${jsonlFile}`,
              path: sessionFile,
              lastModified: sessionStats.mtime,
              messageCount,
              firstMessagePreview
            });
          }
        } catch (error) {
          // Skip directories we can't read
          continue;
        }
      }
    }

    if (sessions.length === 0) {
      if (filterPath) {
        console.log(chalk.yellow(`No Claude Code sessions found for path: ${filterPath}`));
      } else {
        console.log(chalk.yellow('No Claude Code sessions found'));
      }
      return;
    }

    // Sort by last modified (newest first)
    sessions.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

    const headerText = filterPath 
      ? `📋 Found ${sessions.length} Claude Code session${sessions.length === 1 ? '' : 's'} for path "${filterPath}":`
      : `📋 Found ${sessions.length} Claude Code session${sessions.length === 1 ? '' : 's'}:`;
    
    console.log(chalk.bold.blue(`\n${headerText}\n`));
    
    sessions.forEach((session, index) => {
      const date = session.lastModified.toLocaleDateString();
      const time = session.lastModified.toLocaleTimeString();
      
      console.log(chalk.bold.white(`${index + 1}. ${session.title}`));
      console.log(chalk.gray(`   💬 ${session.messageCount} messages | 📅 ${date} ${time}`));
      
      if (session.firstMessagePreview) {
        console.log(chalk.cyan(`   💭 "${session.firstMessagePreview}"`));
      }
      
      console.log(chalk.dim(`   📁 ${session.path}`));
      console.log(''); // Empty line for spacing
    });

  } catch (error) {
    console.error(chalk.red('Error listing Claude sessions:'), error.message);
  }
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
