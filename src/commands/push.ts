import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import chalk from 'chalk';
import ora from 'ora';
import { platformRegistry } from '../platforms/index.js';
import { SessionData } from '../platforms/types.js';
import { sessionBaseClient } from '../api/client.js';

export const pushCommand = new Command('push')
  .description('Push most recent session by platform in your current directory, or push a session file')
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
      const platformFlags = [options.claude, options.gemini, options.qchat].filter(Boolean).length;
      
      // Validate that we have either a file path or platform flag
      if (!filePath && platformFlags === 0) {
        spinner.fail('Must specify either a file path or a platform flag (--claude, --gemini, --qchat)');
        process.exit(1);
      }
      
      // Validate platform options
      platformRegistry.validatePlatformOptions(options);
      
      let sessionData: SessionData;
      
      if (filePath) {
        // File path provided - detect and validate platform
        spinner.text = 'Detecting session format...';
        
        const detectedProvider = await platformRegistry.detectProvider(filePath);
        if (!detectedProvider) {
          spinner.fail('Unsupported session file format. Supported formats: Claude Code (.jsonl), Gemini CLI (.json), Q Chat (.json)');
          process.exit(1);
        }
        
        // If platform flag was provided, validate it matches detected platform
        if (platformFlags > 0) {
          const expectedProvider = platformRegistry.getProviderFromOptions(options);
          if (expectedProvider && detectedProvider.platform !== expectedProvider.platform) {
            spinner.fail(`Platform mismatch: File appears to be from ${detectedProvider.displayName} but --${expectedProvider.platform.replace('-', '')} flag was specified`);
            process.exit(1);
          }
        }
        
        spinner.text = 'Parsing session...';
        sessionData = await detectedProvider.parseSession(filePath);
        
      } else {
        // Must have platform flag (validated above)
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

function buildSessionPayload(sessionData: SessionData, options: any) {
  // For Q Chat, store the complete raw conversation data
  if (sessionData.platform === 'q-chat') {
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
      platform: sessionData.platform,
      ...(sessionData.sessionId && { sessionId: sessionData.sessionId }),
      ...(sessionData.cwd && { cwd: sessionData.cwd })
    };
  }
}