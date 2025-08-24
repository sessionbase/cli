import { Command } from 'commander';
import chalk from 'chalk';
import { stat } from 'node:fs/promises';
import { platformRegistry } from '../platforms/index.js';
import { SessionInfo } from '../platforms/types.js';

export const lsCommand = new Command('ls')
  .description('List local chat sessions')
  .option('--claude', 'Filter for Claude Code sessions')
  .option('--gemini', 'Filter for Gemini CLI sessions')
  .option('--qchat', 'Filter for Amazon Q Chat sessions')
  .option('--path <path>', 'Filter sessions by specific directory path')
  .option('--global', 'Include sessions from all projects')
  .action(async (options) => {
    try {
      // Validate mutually exclusive options
      if (options.path && options.global) {
        console.error(chalk.red('Error: Cannot specify both --path and --global options'));
        process.exit(1);
      }

      // Validate platform options
      platformRegistry.validatePlatformOptions(options);

      // Validate filter path if provided
      if (options.path) {
        await validateFilterPath(options.path);
      }

      // Get specific provider if platform flag is used
      const specificProvider = platformRegistry.getProviderFromOptions(options);

      if (specificProvider) {
        // Show specific platform
        await listSinglePlatform(specificProvider, options.path, options.global);
      } else {
        // Show all available platforms
        await listAllPlatforms(options.path, options.global);
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

async function listAllPlatforms(filterPath?: string, showGlobal?: boolean) {
  const scope = showGlobal ? 'all projects' : (filterPath || process.cwd());
  console.log(chalk.bold.blue(`\n📋 Sessions for ${scope}:\n`));

  const availableProviders = await platformRegistry.getAvailableProviders();

  if (availableProviders.length === 0) {
    console.log(chalk.yellow('No chat platforms found on this system.'));
    console.log(chalk.gray('Supported platforms: Claude Code, Gemini CLI, Amazon Q Chat'));
    return;
  }

  let foundAnySessions = false;

  for (let i = 0; i < availableProviders.length; i++) {
    const provider = availableProviders[i];

    try {
      if (foundAnySessions) {
        console.log(''); // Add spacing between platforms
      }

      console.log(chalk.bold.cyan(`${provider.displayName}:`));
      const sessions = await provider.listSessions(filterPath, showGlobal);

      if (sessions.length === 0) {
        console.log(chalk.yellow(`  No sessions found`));
      } else {
        displaySessions(sessions, showGlobal, provider);
        foundAnySessions = true;
      }
    } catch (error: any) {
      console.log(chalk.yellow(`  Error loading sessions: ${error.message}`));
    }
  }

  if (!foundAnySessions) {
    console.log(chalk.yellow('No chat sessions found on any platform.'));
  }
}

async function listSinglePlatform(provider: any, filterPath?: string, showGlobal?: boolean) {
  const scope = showGlobal ? 'all projects' : (filterPath || process.cwd());

  try {
    // Check if provider is available
    const isAvailable = await provider.isAvailable();
    if (!isAvailable) {
      console.log(chalk.yellow(`${provider.displayName} is not available on this system`));
      return;
    }

    const sessions = await provider.listSessions(filterPath, showGlobal);

    if (sessions.length === 0) {
      console.log(chalk.yellow(`No ${provider.displayName} sessions found for ${scope}`));
      return;
    }

    console.log(chalk.bold.blue(`\n${provider.emoji} Found ${sessions.length} ${provider.displayName} session${sessions.length === 1 ? '' : 's'} for ${scope}:\n`));
    displaySessions(sessions, showGlobal, provider);

  } catch (error: any) {
    console.error(chalk.red(`Error listing ${provider.displayName} sessions:`), error.message);
  }
}

function displaySessions(sessions: SessionInfo[], showGlobal?: boolean, provider?: any) {
  if (showGlobal) {
    // Group by project for better readability
    const sessionsByProject = sessions.reduce((acc: any, session) => {
      if (!acc[session.projectPath]) {
        acc[session.projectPath] = [];
      }
      acc[session.projectPath].push(session);
      return acc;
    }, {});

    let totalIndex = 0;
    Object.entries(sessionsByProject).forEach(([projectPath, projectSessions]: [string, any]) => {
      console.log(chalk.bold.yellow(`\n${projectPath}:`));
      projectSessions.forEach((session: SessionInfo) => {
        totalIndex++;
        displaySingleSession(session, sessions.length - totalIndex + 1, provider);
      });
    });
  } else {
    sessions.forEach((session, index) => {
      displaySingleSession(session, sessions.length - index, provider);
    });
  }
}

function displaySingleSession(session: SessionInfo, displayIndex: number, provider?: any) {
  // Use first message preview as title if available, otherwise fall back to generic title
  const title = session.firstMessagePreview || session.title || session.id;
  
  console.log(chalk.bold.white(`${displayIndex}. ${title}`));
  
  // Display message count and relative time
  const relativeTime = getRelativeTime(session.lastModified);
  console.log(chalk.gray(`   💬 ${session.messageCount} messages | ${relativeTime}`));
  
  // Display platform and session ID
  const platformDisplay = provider 
    ? `${provider.displayName} ${provider.emoji} ${session.id}` 
    : `💬 Chat ${session.id}`;
  console.log(chalk.dim(`   ${platformDisplay}`));

  console.log(''); // Empty line for spacing
}

async function validateFilterPath(filterPath: string): Promise<void> {
  try {
    const stats = await stat(filterPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path '${filterPath}' is not a directory`);
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`Directory '${filterPath}' does not exist`);
    }
    throw error;
  }
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (days > 0) {
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  } else {
    return 'Just now';
  }
}

