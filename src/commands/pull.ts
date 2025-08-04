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
  .option('--qchat', 'Pull for Amazon Q Chat')
  .option('--no-validate-cwd', 'Skip validation warnings about context mismatches')
  .action(async (sessionId, options) => {
    // Validate platform options
    const platformFlags = [options.claude, options.gemini, options.qchat].filter(Boolean);
    if (platformFlags.length === 0) {
      console.error(chalk.red('Error: Must specify a platform flag (--claude, --gemini, or --qchat)'));
      process.exit(1);
    }
    if (platformFlags.length > 1) {
      console.error(chalk.red('Error: Can only specify one platform flag at a time'));
      process.exit(1);
    }
    
    // Determine platform
    const platform = options.gemini ? 'gemini' : options.qchat ? 'qchat' : 'claude';
    
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
      
      // Parse session content - different formats for different platforms
      let messages: ClaudeMessage[] = [];
      
      // Check if this is Q Chat raw data
      if (platform === 'qchat' && sessionResponse.data?.conversation_id) {
        // For Q Chat, we don't need to parse messages - we'll use raw data directly
        messages = []; // Dummy array to pass validation
      } else {
        // Parse for Claude Code and Gemini CLI (existing logic)
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
      }

      spinner.text = 'Processing session...';
      
      if (platform === 'claude') {
        await pullForClaudeCode(cleanSessionId, messages, sessionResponse, options, spinner);
      } else if (platform === 'gemini') {
        await pullForGeminiCLI(cleanSessionId, messages, sessionResponse, options, spinner);
      } else if (platform === 'qchat') {
        await pullForQChat(cleanSessionId, messages, sessionResponse, options, spinner);
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

/**
 * Pull session for Amazon Q Chat
 */
async function pullForQChat(sessionId: string, messages: any[], sessionResponse: any, options: any, spinner: any) {
  const targetDir = process.cwd();
  
  // For Q Chat, no directory validation needed since /load doesn't require specific working directory
  
  // For Q Chat sessions, use the raw data directly (no modifications needed)
  let qchatConversation;
  
  // Parse the session data if it's a JSON string
  let parsedData = sessionResponse.data;
  if (typeof sessionResponse.data === 'string') {
    try {
      parsedData = JSON.parse(sessionResponse.data);
    } catch (error) {
      spinner.fail('Failed to parse Q Chat session data');
      process.exit(1);
    }
  }
  
  if (parsedData && parsedData.conversation_id) {
    // This is raw Q Chat data - use as-is
    qchatConversation = parsedData;
  } else {
    // Fallback: convert from unified format (for older sessions)
    qchatConversation = convertMessagesToQChat(messages, sessionId, targetDir);
  }
  
  // Generate filename based on session title or ID
  const title = sessionResponse.metadata?.title || "pulled-session";
  const safeTitle = slugify(title);
  const fileName = `qchat-${safeTitle}-${sessionId.substring(0, 8)}.json`;
  const filePath = join(targetDir, fileName);
  
  // Check if file already exists
  if (existsSync(filePath)) {
    spinner.warn(`File already exists: ${filePath}`);
    console.log(chalk.yellow("Overwriting existing file..."));
  }
  
  // Write Q Chat conversation file
  await writeFile(filePath, JSON.stringify(qchatConversation, null, 2), "utf-8");
  
  spinner.succeed("Session pulled successfully!");
  
  console.log(chalk.green("\n✅ Session ready for use:"));
  console.log(chalk.dim(`   📁 ${filePath}`));
  
  console.log(chalk.blue("\n🚀 Next steps:"));
  console.log(chalk.dim(`   1. q chat`));
  console.log(chalk.dim(`   2. /load ${filePath}`));
  console.log(chalk.dim(`   3. Continue the conversation`));
  
  console.log(chalk.yellow("\n⚠️  Q Chat Limitation:"));
  console.log(chalk.dim("   Q Chat only persists the most recent session per directory."));
  console.log(chalk.dim("   Loading this session will replace any existing session in this directory."));
  
  // Show session metadata
  if (sessionResponse.metadata?.title) {
    console.log(chalk.dim(`\n💡 Session: "${sessionResponse.metadata.title}"`));
  }
  if (sessionResponse.metadata?.tags) {
    console.log(chalk.dim(`   🏷️  Tags: ${sessionResponse.metadata.tags}`));
  }
}

/**
 * Validate Q Chat session context and show warnings
 */
async function validateQChatSessionContext(sessionData: any, targetDir: string, spinner: any): Promise<boolean> {
  const messages = sessionData.messages as any[];
  
  if (messages.length === 0) {
    return true;
  }
  
  // Extract original directory from Q Chat session messages
  let originalCwd = null;
  
  // Look for CWD in the message structure (Q Chat format includes env context)
  for (const message of messages) {
    if (message.cwd) {
      originalCwd = message.cwd;
      break;
    }
  }
  
  if (originalCwd && originalCwd !== targetDir) {
    spinner.warn("Context mismatch detected");
    
    console.log(chalk.yellow("\n⚠️  Context Validation:"));
    console.log(chalk.dim(`   Original directory: ${originalCwd}`));
    console.log(chalk.dim(`   Target directory:   ${targetDir}`));
    
    // Check if directories have similar names (might be same project)
    const originalName = originalCwd.split("/").pop();
    const targetName = targetDir.split("/").pop();
    
    if (originalName === targetName) {
      console.log(chalk.green("   ✅ Directory names match - same project"));
      console.log(); // Empty line for spacing
      return true; // No confirmation needed for same project
    } else {
      console.log(chalk.yellow("   ⚠️  Different project contexts - files and dependencies may be missing"));
      
      // Prompt for confirmation
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      
      const answer = await new Promise<string>((resolve) => {
        rl.question(chalk.cyan("\nContinue anyway? [y/N]: "), resolve);
      });
      
      rl.close();
      console.log(); // Empty line for spacing
      
      return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
    }
  }
  
  return true;
}

/**
 * Convert unified session messages back to Q Chat conversation format
 */
function convertMessagesToQChat(messages: any[], sessionId: string, targetDir: string): any {
  const history: any[] = [];
  const conversationId = sessionId || `qchat-${Date.now()}`;
  
  // Group messages into conversation turns (user/assistant pairs)
  let currentTurn: any = { user: null, assistant: null };
  
  for (const message of messages) {
    if (message.type === "user" || message.message?.role === "user") {
      // If we have a complete turn, add it to history
      if (currentTurn.user && currentTurn.assistant) {
        history.push([currentTurn.user, currentTurn.assistant]);
        currentTurn = { user: null, assistant: null };
      }
      
      // Create Q Chat user message structure
      currentTurn.user = {
        additional_context: "",
        env_context: {
          env_state: {
            operating_system: "macos",
            current_working_directory: targetDir,
            environment_variables: []
          }
        },
        content: {
          Prompt: {
            prompt: message.message?.content || message.content || ""
          }
        },
        images: null
      };
    } else if (message.type === "assistant" || message.message?.role === "assistant") {
      const content = message.message?.content || message.content || "";
      const toolCalls = message.message?.toolCalls || [];
      
      if (toolCalls.length > 0) {
        // Assistant message with tool use
        currentTurn.assistant = {
          ToolUse: {
            message_id: message.uuid || `msg-${Date.now()}`,
            content: content,
            tool_uses: toolCalls.map(tool => ({
              id: tool.id || `tool-${Date.now()}`,
              name: tool.name || "unknown_tool",
              orig_name: tool.metadata?.orig_name || tool.name || "unknown_tool",
              args: tool.input || {},
              orig_args: tool.metadata?.orig_args || tool.input || {}
            }))
          }
        };
      } else {
        // Regular assistant response
        currentTurn.assistant = {
          Response: {
            message_id: message.uuid || `msg-${Date.now()}`,
            content: content
          }
        };
      }
    } else if (message.type === "tool" || message.message?.role === "tool") {
      // Tool results - add as separate user message with ToolUseResults
      if (currentTurn.user && currentTurn.assistant) {
        history.push([currentTurn.user, currentTurn.assistant]);
        currentTurn = { user: null, assistant: null };
      }
      
      const toolResults = message.message?.toolResults || [];
      currentTurn.user = {
        additional_context: "",
        env_context: {
          env_state: {
            operating_system: "macos",
            current_working_directory: targetDir,
            environment_variables: []
          }
        },
        content: {
          ToolUseResults: {
            tool_use_results: toolResults.map(result => ({
              tool_use_id: result.tool_use_id,
              content: result.content,
              status: result.status || "success"
            }))
          }
        },
        images: null
      };
    }
  }
  
  // Add any remaining turn
  if (currentTurn.user && currentTurn.assistant) {
    history.push([currentTurn.user, currentTurn.assistant]);
  }
  
  return {
    conversation_id: conversationId,
    next_message: null,
    history: history
  };
}
