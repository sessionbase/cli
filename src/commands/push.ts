import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';
import { platformRegistry } from '../platforms/index.js';
import { SessionData } from '../platforms/types.js';
import { sessionBaseClient } from '../api/client.js';

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
  .option('--force', 'Skip age check and proceed with old checkpoint')
  .action(async (filePath, options) => {
    const spinner = ora('Finding session...').start();
    
    try {
      // Validate mutually exclusive options
      const platformFlags = [options.claude, options.gemini, options.qchat].filter(Boolean).length;
      
      if (filePath && platformFlags > 0) {
        spinner.fail('Cannot specify both a file path and platform flags (--claude, --gemini, --qchat)');
        process.exit(1);
      }
      
      if (!filePath && platformFlags === 0) {
        spinner.fail('Must specify either a file path or a platform flag (--claude, --gemini, --qchat)');
        process.exit(1);
      }
      
      // Validate platform options
      platformRegistry.validatePlatformOptions(options);
      
      let sessionData: SessionData;
      
      if (platformFlags > 0) {
        // Auto-detect session using platform provider
        const provider = platformRegistry.getProviderFromOptions(options);
        
        if (!provider) {
          spinner.fail('Platform provider not found');
          process.exit(1);
        }
        
        // Check if provider is available
        const isAvailable = await provider.isAvailable();
        if (!isAvailable) {
          spinner.fail(`${provider.displayName} is not available on this system`);
          process.exit(1);
        }
        
        spinner.text = `Finding most recent ${provider.displayName} session...`;
        
        // For Gemini, stop spinner before potential user interaction
        if (provider.platform === 'gemini-cli') {
          spinner.stop();
        }
        
        // Find most recent session
        const detectedFile = await provider.findMostRecentSession(process.cwd(), options);
        
        // Restart spinner if it was stopped
        if (provider.platform === 'gemini-cli' && detectedFile) {
          spinner.start();
          spinner.text = 'Parsing session...';
        }
        
        if (!detectedFile) {
          // For Gemini, this could be user cancellation, so exit gracefully
          if (provider.platform === 'gemini-cli') {
            spinner.stop();
            process.exit(0);
          } else {
            spinner.fail(`No ${provider.displayName} session found for current directory`);
            process.exit(1);
          }
        }
        
        spinner.text = 'Parsing session...';
        
        // Parse session using provider
        sessionData = await provider.parseSession(detectedFile);
        
        filePath = detectedFile;
        
      } else {
        // Direct file upload - detect format and parse
        spinner.text = 'Parsing session file...';
        
        const content = readFileSync(filePath, 'utf-8');
        sessionData = await parseFileContent(content, filePath);
      }
      
      spinner.text = 'Pushing session...';
      
      // Validate session data
      if (!sessionData.messages && !sessionData.history) {
        spinner.fail('Session file must contain a "messages" array or "history" array');
        process.exit(1);
      }
      
      // Build the payload
      const payload = buildSessionPayload(sessionData, options);
      
      // Make the API call
      const result = await sessionBaseClient.uploadSession(payload);
      
      spinner.succeed('Session pushed successfully!');
      
      const sessionUrl = `https://sessionbase.ai/sessions/${result.id}`;
      console.log(chalk.green(`Session ID: ${result.id}`));
      console.log(chalk.blue(`\u001b]8;;${sessionUrl}\u001b\\${sessionUrl}\u001b]8;;\u001b\\`));

    } catch (error: any) {
      spinner.fail(`Push failed: ${error.message}`);
      process.exit(1);
    }
  });

async function parseFileContent(content: string, filePath: string): Promise<SessionData> {
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
      return {
        messages: entries,
        title: `JSONL Import ${new Date().toISOString().split('T')[0]}`,
        platform: 'claude-code',
        sessionId: claudeSessionId,
        cwd: claudeCwd
      };
    } else {
      // Parse regular JSON
      const parsed = JSON.parse(content);
      
      // Auto-detect format based on structure
      if (Array.isArray(parsed) && parsed.length > 0 && 
          parsed.some(msg => 
            msg.role && ['user', 'model'].includes(msg.role) && 
            msg.parts && Array.isArray(msg.parts) &&
            msg.parts.some((part: any) => part.text || part.functionCall || part.functionResponse)
          )) {
        // Gemini CLI format
        return {
          messages: parsed,
          title: `Gemini CLI Session ${new Date().toISOString().split('T')[0]}`,
          platform: 'gemini-cli'
        };
      } else if (parsed.conversation_id && parsed.history && Array.isArray(parsed.history)) {
        // Q Chat format - store raw data directly
        const sessionData = parsed;
        sessionData.platform = 'qchat';
        if (!sessionData.title) {
          sessionData.title = `Q Chat Session ${new Date().toISOString().split('T')[0]}`;
        }
        return sessionData;
      } else {
        // Generic JSON format
        return parsed;
      }
    }
  } catch (error: any) {
    throw new Error(`Invalid ${isJsonl ? 'JSONL' : 'JSON'} in ${filePath}: ${error.message}`);
  }
}

function buildSessionPayload(sessionData: SessionData, options: any) {
  // For Q Chat, store the complete raw conversation data
  if (sessionData.platform === 'qchat') {
    return {
      ...sessionData, // Include all raw Q Chat data
      isPrivate: options.private || false,
      title: options.title || sessionData.title || 'Untitled Session',
      summary: options.summary || sessionData.summary || '',
      tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : (sessionData.tags || []),
      messageCount: sessionData.history ? sessionData.history.length : 0,
      modelName: sessionData.model || 'unknown'
    };
  } else {
    // For other platforms, use the existing messages-based format
    return {
      messages: sessionData.messages,
      isPrivate: options.private || false,
      title: options.title || sessionData.title || 'Untitled Session',
      summary: options.summary || sessionData.summary || '',
      tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : (sessionData.tags || []),
      tokenCount: sessionData.tokenCount || 0,
      messageCount: sessionData.messages?.length || 0,
      modelName: sessionData.modelName || 'unknown',
      platform: sessionData.platform || 'cli',
      ...(sessionData.sessionId && { sessionId: sessionData.sessionId }),
      ...(sessionData.cwd && { cwd: sessionData.cwd })
    };
  }
}