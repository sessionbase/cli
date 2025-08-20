import { Command } from 'commander';
import chalk from 'chalk';
import { isAuthenticated } from '../auth.js';
import { apiRequest, SessionBaseAPIError } from '../api/client.js';

export const whoamiCommand = new Command('whoami');

whoamiCommand
  .description('Show current authentication status')
  .action(async () => {
    try {
      const authenticated = await isAuthenticated();
      
      if (!authenticated) {
        console.log(chalk.red('✗ Not authenticated'));
        console.log(chalk.dim('  Run: sessionbase login'));
        return;
      }

      console.log(chalk.green('✔ Authenticated'));
      
      try {
        // Fetch user data from the API
        const response = await apiRequest('/auth/me');
        const responseData = await response.json();
        
        console.log();
        console.log(chalk.bold('User Information:'));
        
        // Extract user data from the response (API returns {user: {...}, message: "..."})
        const userData = responseData.user || responseData;
        
        // Check if we got any data at all
        if (!userData || Object.keys(userData).length === 0) {
          console.log(chalk.dim('  No user data available'));
          return;
        }
        
        if (userData.email) {
          console.log(chalk.dim(`  Email: ${userData.email}`));
        }
        if (userData.name) {
          console.log(chalk.dim(`  Name: ${userData.name}`));
        }
        if (userData.username) {
          console.log(chalk.dim(`  Username: ${userData.username}`));
        }
        if (userData.provider) {
          console.log(chalk.dim(`  Provider: ${userData.provider}`));
        }
        if (userData.createdAt) {
          console.log(chalk.dim(`  Created: ${new Date(userData.createdAt).toLocaleString()}`));
        }
        if (userData.userId) {
          console.log(chalk.dim(`  User ID: ${userData.userId}`));
        }
      } catch (error) {
        if (error instanceof SessionBaseAPIError) {
          console.log(chalk.yellow('⚠ Could not fetch user details'));
          console.log(chalk.dim(`  ${error.message}`));
        } else {
          console.error(chalk.red('Error fetching user data:'), error);
        }
      }
    } catch (error) {
      console.error(chalk.red('Error checking authentication:'), error);
      process.exit(1);
    }
  });