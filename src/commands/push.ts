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
      
      validateInputArguments(filePath, platformFlags);
      
      const result = filePath 
        ? await processFileSession(filePath, platformFlags, options, spinner)
        : await processPlatformSession(options, spinner);
      
      const { sessionData } = result;
      
      await uploadSession(sessionData, options, spinner);

    } catch (error: any) {
      spinner.fail(`Push failed: ${error.message}`);
      process.exit(1);
    }
  });

function validateInputArguments(filePath: string | undefined, platformFlags: number): void {
  // Validate that we have either a file path or platform flag
  if (!filePath && platformFlags === 0) {
    throw new Error('Must specify either a file path or a platform flag (--claude, --gemini, --qchat)');
  }
  
  // Validate platform options - this will check for multiple flags
  if (platformFlags > 1) {
    throw new Error('Can only specify one platform flag at a time');
  }
}

async function uploadSession(sessionData: SessionData, options: any, spinner: any): Promise<void> {
  // Validate session data
  if (!sessionData.messages && !sessionData.history) {
    throw new Error('Session file must contain a "messages" array or "history" array');
  }
  
  spinner.text = 'Pushing session...';
  
  // Build the payload
  const payload = buildSessionPayload(sessionData, options);
  
  // Make the API call
  const uploadResult = await sessionBaseClient.uploadSession(payload);
  
  spinner.succeed('Session pushed successfully!');
  
  const sessionUrl = `https://sessionbase.ai/sessions/${uploadResult.id}`;
  console.log(chalk.green(`Session ID: ${uploadResult.id}`));
  console.log(chalk.blue(`\u001b]8;;${sessionUrl}\u001b\\${sessionUrl}\u001b]8;;\u001b\\`));
}

async function processFileSession(filePath: string, platformFlags: number, options: any, spinner: any) {
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
  const sessionData = await detectedProvider.parseSession(filePath);
  
  return { sessionData, filePath };
}

async function processPlatformSession(options: any, spinner: any) {
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
  
  // Find most recent session with proper spinner handling for user interaction
  const detectedFile = await findSessionWithSpinnerManagement(provider, process.cwd(), options, spinner);
  
  if (!detectedFile) {
    handleNoSessionFound(provider, spinner);
  }
  
  spinner.text = 'Parsing session...';
  
  // Parse session using provider
  const sessionData = await provider.parseSession(detectedFile);
  
  return { sessionData, filePath: detectedFile };
}

async function findSessionWithSpinnerManagement(provider: any, cwd: string, options: any, spinner: any): Promise<string | null> {
  if (provider.requiresUserInteraction()) {
    spinner.stop();
  }
  
  const detectedFile = await provider.findMostRecentSession(cwd, options);
  
  if (provider.requiresUserInteraction() && detectedFile) {
    spinner.start();
    spinner.text = 'Parsing session...';
  }
  
  return detectedFile;
}

function handleNoSessionFound(provider: any, spinner: any): never {
  // For providers that require user interaction, this could be user cancellation
  if (provider.requiresUserInteraction()) {
    spinner.stop();
    process.exit(0);
  } else {
    spinner.fail(`No ${provider.displayName} session found for current directory`);
    process.exit(1);
  }
}

function buildSessionPayload(sessionData: SessionData, options: any) {
  const basePayload = {
    isPrivate: options.private || false,
    title: options.title || sessionData.title || 'Untitled Session',
    summary: options.summary || sessionData.summary || '',
    tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : (sessionData.tags || []),
    modelName: sessionData.modelName || sessionData.model || 'unknown',
    platform: sessionData.platform
  };

  // Use history-based format (Q-Chat) vs messages-based format
  if (sessionData.history) {
    return {
      ...sessionData, // Include all raw conversation data
      ...basePayload,
      messageCount: sessionData.history.length
    };
  } else {
    return {
      ...basePayload,
      messages: sessionData.messages,
      tokenCount: sessionData.tokenCount || 0,
      messageCount: sessionData.messages?.length || 0,
      ...(sessionData.sessionId && { sessionId: sessionData.sessionId }),
      ...(sessionData.cwd && { cwd: sessionData.cwd })
    };
  }
}