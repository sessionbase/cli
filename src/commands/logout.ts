import { Command } from 'commander';
import chalk from 'chalk';
import { clearToken, isAuthenticated } from '../utils/auth.js';

export const logoutCommand = new Command('logout');

logoutCommand
  .description('Log out and remove stored authentication token')
  .action(async () => {
    try {
      const wasAuthenticated = await isAuthenticated();
      
      if (!wasAuthenticated) {
        console.log(chalk.yellow('Already logged out'));
        return;
      }
      
      // Clear the stored token
      await clearToken();
      
      // Verify logout was successful
      const stillAuthenticated = await isAuthenticated();
      
      if (!stillAuthenticated) {
        console.log(chalk.green('✔ Logged out successfully'));
      } else {
        console.log(chalk.red('✗ Logout failed - token may still be stored'));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('Error during logout:'), error);
      process.exit(1);
    }
  });