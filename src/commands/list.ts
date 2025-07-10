import { Command } from 'commander';
import { readdir, stat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import chalk from 'chalk';

const CLAUDE_CODE_PATH = join(homedir(), '.claude', 'projects');

export const listCommand = new Command('list')
  .description('List local chat sessions')
  .option('--claude', 'List Claude Code sessions')
  .option('--path <path>', 'Filter sessions by specific directory path')
  .action(async (options) => {
    if (options.claude) {
      await listClaudeSessions(options.path);
    } else {
      console.log('Please specify a tool: --claude');
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
