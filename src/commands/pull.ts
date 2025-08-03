import { Command } from 'commander';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { apiRequest } from '../api/client.js';
import chalk from 'chalk';
import ora from 'ora';
import { createInterface } from 'node:readline';

const CLAUDE_CODE_PATH = join(homedir(), '.claude', 'projects');

interface ClaudeMessage {
  cwd: string;
  sessionId: string;
  [key: string]: any;
}

export const pullCommand = new Command('pull')
  .description('Pull a shared session from SessionBase for Claude Code')
  .argument('<session-id>', 'Session ID to pull (from SessionBase URL or share link)')
  .option('--no-validate-cwd', 'Skip validation warnings about context mismatches')
  .action(async (sessionId, options) => {
    const spinner = ora('Fetching session...').start();
    
    try {
      // Clean session ID (remove URL parts if provided)
      const cleanSessionId = extractSessionId(sessionId);
      
      // Fetch session from API
      const response = await apiRequest(`/sessions/${cleanSessionId}`);
      const sessionResponse = await response.json();
      
      if (!sessionResponse.data) {
        spinner.fail('Invalid session data received');
        process.exit(1);
      }
      
      // Parse session content (could be JSONL string)
      let messages: ClaudeMessage[];
      try {
        // Try parsing as JSONL first (most common for Claude sessions)
        if (typeof sessionResponse.data === 'string') {
          messages = sessionResponse.data
            .trim()
            .split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line));
        } else {
          // Handle JSON format or already parsed messages
          messages = Array.isArray(sessionResponse.data) ? sessionResponse.data : [sessionResponse.data];
        }
      } catch (parseError) {
        spinner.fail('Failed to parse session data');
        console.error(chalk.red(`Parse error: ${parseError.message}`));
        process.exit(1);
      }
      
      if (!Array.isArray(messages) || messages.length === 0) {
        spinner.fail('Session contains no messages');
        process.exit(1);
      }

      spinner.text = 'Processing session...';
      
      // Use current working directory as target
      const targetDir = process.cwd();
      
      // Validate and show warnings unless skipped
      if (!options.noValidateCwd) {
        const shouldContinue = await validateSessionContext({ messages, metadata: sessionResponse.metadata }, targetDir, spinner);
        if (!shouldContinue) {
          spinner.fail('Pull cancelled');
          process.exit(0);
        }
      }
      
      // Translate paths in session
      const translatedMessages = translateSessionPaths(messages, targetDir);
      
      // Ensure Claude Code projects directory exists
      await mkdir(CLAUDE_CODE_PATH, { recursive: true });
      
      // Create project-specific directory in Claude Code format
      const encodedPath = targetDir.replace(/\//g, '-');
      const projectDir = join(CLAUDE_CODE_PATH, encodedPath);
      await mkdir(projectDir, { recursive: true });
      
      // Generate session filename (use original session ID)
      const sessionFileName = `${cleanSessionId}.jsonl`;
      const sessionFilePath = join(projectDir, sessionFileName);
      
      // Check if session already exists
      if (existsSync(sessionFilePath)) {
        spinner.warn(`Session already exists: ${sessionFilePath}`);
        console.log(chalk.yellow('Overwriting existing session...'));
      }
      
      // Write session file in JSONL format
      const jsonlContent = translatedMessages.map(msg => JSON.stringify(msg)).join('\n') + '\n';
      await writeFile(sessionFilePath, jsonlContent, 'utf-8');
      
      spinner.succeed('Session pulled successfully!');
      
      console.log(chalk.green('\n✅ Session ready for use:'));
      console.log(chalk.dim(`   📁 ${sessionFilePath}`));
      
      console.log(chalk.blue('\n🚀 Next steps:'));
      console.log(chalk.dim(`   1. claude -r`));
      console.log(chalk.dim(`   2. Select the pulled session to continue the conversation`));
      
      // Show session metadata
      if (sessionResponse.metadata?.title) {
        console.log(chalk.dim(`\n💡 Session: "${sessionResponse.metadata.title}"`));
      }
      if (sessionResponse.metadata?.tags) {
        console.log(chalk.dim(`   🏷️  Tags: ${sessionResponse.metadata.tags}`));
      }
      
    } catch (error: any) {
      spinner.fail('Failed to pull session');
      
      if (error.status === 404) {
        console.error(chalk.red('Session not found. Please check the session ID.'));
      } else if (error.status === 403) {
        console.error(chalk.red('Access denied. You may not have permission to view this session.'));
      } else if (error.name === 'SessionBaseAPIError') {
        console.error(chalk.red(`API Error: ${error.message}`));
      } else {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      
      process.exit(1);
    }
  });

/**
 * Extract session ID from various input formats
 */
function extractSessionId(input: string): string {
  // Handle full URLs like https://sessionbase.ai/s/abc123
  if (input.includes('/')) {
    const parts = input.split('/');
    return parts[parts.length - 1];
  }
  
  // Already clean session ID
  return input;
}

/**
 * Translate CWD paths in all session messages
 */
function translateSessionPaths(messages: ClaudeMessage[], targetDir: string): ClaudeMessage[] {
  return messages.map(message => {
    if (message.cwd) {
      return {
        ...message,
        cwd: targetDir
      };
    }
    return message;
  });
}

/**
 * Validate session context and show warnings, return false if user cancels
 */
async function validateSessionContext(sessionData: any, targetDir: string, spinner: any): Promise<boolean> {
  const messages = sessionData.messages as ClaudeMessage[];
  
  if (messages.length === 0) {
    return true;
  }
  
  // Get original CWD from first message
  const originalCwd = messages[0]?.cwd;
  
  if (originalCwd && originalCwd !== targetDir) {
    spinner.warn('Context mismatch detected');
    
    console.log(chalk.yellow('\n⚠️  Context Validation:'));
    console.log(chalk.dim(`   Original directory: ${originalCwd}`));
    console.log(chalk.dim(`   Target directory:   ${targetDir}`));
    
    // Check if directories have similar names (might be same project)
    const originalName = originalCwd.split('/').pop();
    const targetName = targetDir.split('/').pop();
    
    if (originalName === targetName) {
      console.log(chalk.green('   ✅ Directory names match - likely same project'));
      console.log(); // Empty line for spacing
      return true; // No confirmation needed for same project
    } else {
      console.log(chalk.yellow('   ⚠️  Different project contexts - files and dependencies may be missing'));
      
      // Prompt for confirmation
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      
      const answer = await new Promise<string>((resolve) => {
        rl.question(chalk.cyan('\nContinue anyway? [y/N]: '), resolve);
      });
      
      rl.close();
      console.log(); // Empty line for spacing
      
      return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
    }
  }
  
  return true;
}