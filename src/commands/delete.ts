import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { isAuthenticated } from '../utils/auth.js';
import { sessionBaseClient } from '../api/client.js';
import { SessionBaseAPIError } from '../api/types.js';

export const deleteCommand = new Command('rm')
  .description('Delete a session from SessionBase')
  .argument('<sessionId>', 'Session ID or URL of the session to delete')
  .action(async (sessionIdOrUrl: string) => {
    try {
      // Extract session ID from URL if needed
      const sessionId = sessionIdOrUrl.includes('sessionbase.ai') 
        ? sessionIdOrUrl.split('/').pop() || sessionIdOrUrl
        : sessionIdOrUrl;

      // Check authentication
      const authenticated = await isAuthenticated();
      if (!authenticated) {
        console.log(chalk.red('✗ Not authenticated'));
        console.log(chalk.dim('  Run: sessionbase login'));
        process.exit(1);
      }

      const spinner = ora('Deleting session...').start();

      try {
        const result = await sessionBaseClient.deleteSession(sessionId);
        
        spinner.succeed('Session deleted successfully!');
        console.log(chalk.green(`${result.message}`));
        console.log(chalk.dim(`Session ID: ${result.sessionId}`));
      } catch (error) {
        if (error instanceof SessionBaseAPIError) {
          if (error.status === 404 || error.status === 403) {
            spinner.fail('Session not found or you do not have permission to delete it');
          } else if (error.status === 401) {
            spinner.fail('Authentication required');
            console.log(chalk.dim('  Try running: sessionbase login'));
          } else {
            spinner.fail(`Failed to delete session: ${error.message}`);
          }
        } else {
          spinner.fail(`Failed to delete session: ${error}`);
        }
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });