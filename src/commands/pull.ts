import { Command } from 'commander';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { apiRequest } from '../api/client.js';
import chalk from 'chalk';
import ora from 'ora';
import { createInterface } from 'node:readline';

const CLAUDE_CODE_PATH = join(homedir(), '.claude', 'projects');
const GEMINI_CLI_PATH = join(homedir(), '.gemini', 'tmp');

interface ClaudeMessage {
  cwd: string;
  sessionId: string;
  [key: string]: any;
}

export const pullCommand = new Command('pull')
  .description('Pull a shared session from SessionBase into your current directory')
  .argument('<session-id>', 'Session ID to pull (from SessionBase URL or share link)')
  .option('--claude', 'Pull for Claude Code')
  .option('--gemini', 'Pull for Gemini CLI')
  .option('--no-validate-cwd', 'Skip validation warnings about context mismatches')
  .action(async (sessionId, options) => {
    // Validate platform options
    const platformFlags = [options.claude, options.gemini].filter(Boolean);
    if (platformFlags.length === 0) {
      console.error(chalk.red('Error: Must specify a platform flag (--claude or --gemini)'));
      process.exit(1);
    }
    if (platformFlags.length > 1) {
      console.error(chalk.red('Error: Can only specify one platform flag at a time'));
      process.exit(1);
    }
    
    // Determine platform
    const platform = options.gemini ? 'gemini' : 'claude';
    
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
      
      if (platform === 'claude') {
        await pullForClaudeCode(cleanSessionId, messages, sessionResponse, options, spinner);
      } else if (platform === 'gemini') {
        await pullForGeminiCLI(cleanSessionId, messages, sessionResponse, options, spinner);
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
 * Pull session for Claude Code
 */
async function pullForClaudeCode(sessionId: string, messages: any[], sessionResponse: any, options: any, spinner: any) {
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
  const sessionFileName = `${sessionId}.jsonl`;
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
}

/**
 * Pull session for Gemini CLI
 */
async function pullForGeminiCLI(sessionId: string, messages: any[], sessionResponse: any, options: any, spinner: any) {
  const targetDir = process.cwd();
  
  // Validate and show warnings unless skipped
  if (!options.noValidateCwd) {
    const shouldContinue = await validateGeminiSessionContext({ messages, metadata: sessionResponse.metadata }, targetDir, spinner);
    if (!shouldContinue) {
      spinner.fail('Pull cancelled');
      process.exit(0);
    }
  }
  
  // Parse session as Gemini format (should be JSON array)
  let geminiMessages: any[];
  try {
    if (Array.isArray(messages)) {
      geminiMessages = messages;
    } else {
      // Convert from other format if needed
      throw new Error('Session is not in Gemini CLI format');
    }
  } catch (error) {
    spinner.fail('Session is not compatible with Gemini CLI format');
    process.exit(1);
  }
  
  // Translate directory context in the first message
  const translatedMessages = translateGeminiSessionPaths(geminiMessages, targetDir);
  
  // Create directory hash for Gemini CLI storage
  const hash = createHash('sha256').update(targetDir).digest('hex');
  const geminiDir = join(GEMINI_CLI_PATH, hash);
  await mkdir(geminiDir, { recursive: true });
  
  // Generate checkpoint filename with session title as tag
  const title = sessionResponse.metadata?.title || 'pulled-session';
  const tag = slugify(title);
  const checkpointFileName = `checkpoint-${tag}.json`;
  const checkpointFilePath = join(geminiDir, checkpointFileName);
  
  // Check if checkpoint already exists
  if (existsSync(checkpointFilePath)) {
    spinner.warn(`Checkpoint already exists: ${checkpointFilePath}`);
    console.log(chalk.yellow('Overwriting existing checkpoint...'));
  }
  
  // Write checkpoint file in Gemini CLI JSON format
  await writeFile(checkpointFilePath, JSON.stringify(translatedMessages, null, 2), 'utf-8');
  
  spinner.succeed('Session pulled successfully!');
  
  console.log(chalk.green('\n✅ Session ready for use:'));
  console.log(chalk.dim(`   📁 ${checkpointFilePath}`));
  
  console.log(chalk.blue('\n🚀 Next steps:'));
  console.log(chalk.dim(`   1. gemini`));
  console.log(chalk.dim(`   2. /chat resume ${tag}`));
  console.log(chalk.dim(`   3. Continue the conversation`));
  
  // Show session metadata
  if (sessionResponse.metadata?.title) {
    console.log(chalk.dim(`\n💡 Session: "${sessionResponse.metadata.title}"`));
  }
  if (sessionResponse.metadata?.tags) {
    console.log(chalk.dim(`   🏷️  Tags: ${sessionResponse.metadata.tags}`));
  }
}

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
 * Create a URL-safe slug from a title
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50); // Limit length
}

/**
 * Translate CWD paths in all session messages (Claude Code)
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
 * Translate directory context in Gemini CLI session
 */
function translateGeminiSessionPaths(messages: any[], targetDir: string): any[] {
  return messages.map((message, index) => {
    // First message usually contains the context setup
    if (index === 0 && message.role === 'user' && message.parts?.[0]?.text) {
      const text = message.parts[0].text;
      
      // Look for the working directory line and replace it
      const updatedText = text.replace(
        /I'm currently working in the directory: [^\n]+/,
        `I'm currently working in the directory: ${targetDir}`
      );
      
      return {
        ...message,
        parts: [{
          ...message.parts[0],
          text: updatedText
        }]
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
      console.log(chalk.green('   ✅ Directory names match - same project'));
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

/**
 * Validate Gemini CLI session context and show warnings
 */
async function validateGeminiSessionContext(sessionData: any, targetDir: string, spinner: any): Promise<boolean> {
  const messages = sessionData.messages as any[];
  
  if (messages.length === 0) {
    return true;
  }
  
  // Extract original directory from first message context
  let originalCwd = null;
  const firstMessage = messages[0];
  if (firstMessage?.role === 'user' && firstMessage.parts?.[0]?.text) {
    const text = firstMessage.parts[0].text;
    const match = text.match(/I'm currently working in the directory: ([^\n]+)/);
    if (match) {
      originalCwd = match[1];
    }
  }
  
  if (originalCwd && originalCwd !== targetDir) {
    spinner.warn('Context mismatch detected');
    
    console.log(chalk.yellow('\n⚠️  Context Validation:'));
    console.log(chalk.dim(`   Original directory: ${originalCwd}`));
    console.log(chalk.dim(`   Target directory:   ${targetDir}`));
    
    // Check if directories have similar names (might be same project)
    const originalName = originalCwd.split('/').pop();
    const targetName = targetDir.split('/').pop();
    
    if (originalName === targetName) {
      console.log(chalk.green('   ✅ Directory names match - same project'));
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