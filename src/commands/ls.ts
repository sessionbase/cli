import { Command } from 'commander';
import chalk from 'chalk';
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
        displaySessions(sessions, showGlobal);
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
    displaySessions(sessions, showGlobal);

  } catch (error: any) {
    console.error(chalk.red(`Error listing ${provider.displayName} sessions:`), error.message);
  }
}

function displaySessions(sessions: SessionInfo[], showGlobal?: boolean) {
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
        displaySingleSession(session, sessions.length - totalIndex + 1);
      });
    });
  } else {
    sessions.forEach((session, index) => {
      displaySingleSession(session, sessions.length - index);
    });
  }
}

function displaySingleSession(session: SessionInfo, displayIndex: number) {
  const date = session.lastModified.toLocaleDateString();
  const time = session.lastModified.toLocaleTimeString();

  console.log(chalk.bold.white(`${displayIndex}. ${session.title || session.id}`));
  console.log(chalk.gray(`   💬 ${session.messageCount} messages | 📅 ${date} ${time}`));

  if (session.firstMessagePreview) {
    console.log(chalk.cyan(`   💭 "${session.firstMessagePreview}"`));
  }

  if (session.toolCalls && session.toolCalls > 0) {
    console.log(chalk.magenta(`   🔧 ${session.toolCalls} tool calls`));
  }

  if (session.modelName) {
    const displayModel = session.modelName.replace('CLAUDE_SONNET_4_20250514_V1_0', 'Claude Sonnet 4');
    console.log(chalk.blue(`   🤖 ${displayModel}`));
  }

  console.log(chalk.dim(`   📁 ${session.filePath}`));

  if (session.conversationId) {
    console.log(chalk.dim(`   🆔 ${session.conversationId}`));
  }

  console.log(''); // Empty line for spacing
}