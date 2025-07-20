import { Command } from 'commander';
import { createInterface } from 'node:readline';
import open from 'open';
import chalk from 'chalk';
import { renderFilled } from 'oh-my-logo';
import { WEB_BASE_URL } from '../config.js';
import { storeToken } from '../auth.js';

/**
 * Validate token format - basic sanity check
 */
function validateToken(token: string): boolean {
  // Basic validation: should be longer than 20 chars and contain dots if JWT
  if (token.length < 20) return false;
  
  // If it looks like a JWT (has dots), do basic structure check
  if (token.includes('.')) {
    const parts = token.split('.');
    return parts.length === 3;
  }
  
  // For opaque tokens, just check it's not empty and reasonable length
  return token.trim().length > 0;
}

/**
 * Prompt user for token input
 */
async function promptForToken(): Promise<string> {
  const rl = createInterface({ 
    input: process.stdin, 
    output: process.stdout 
  });
  
  return new Promise<string>((resolve) => {
    rl.question('Paste token here: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function createLoginCommand(): Command {
  const command = new Command('login');
  
  command
    .description('Authenticate with SessionBase')
    .option('--token <string>', 'Provide token directly (bypasses interactive prompt)')
    .action(async (options) => {
      try {
        let token: string;
        
        // If token is provided via flag, use it directly
        if (options.token) {
          token = options.token.trim();
        } else {
          // Interactive flow: try to open browser, then prompt for token
          const loginUrl = `${WEB_BASE_URL}/login?cli=true`;
          
          console.log(chalk.blue(`⭢ Opening ${loginUrl} …`));
          
          try {
            await open(loginUrl);
          } catch (error) {
            console.log(chalk.yellow('Could not open browser automatically.'));
            console.log(chalk.dim(`Please visit: ${loginUrl}`));
          }
          
          console.log();
          console.log('────────────────────────────────');
          console.log(' Login in your browser window…');
          console.log('────────────────────────────────');
          
          token = await promptForToken();
        }
        
        // Basic token validation
        if (!validateToken(token)) {
          console.error(chalk.red('✗ Invalid token format'));
          process.exit(1);
        }
        
        // Store token securely
        await storeToken(token);
        
        // Clear terminal and show logo using oh-my-logo
        console.clear();
        console.log();
        await renderFilled('SESSIONBASE', {
          palette: 'grad-blue'
        });
        console.log();
        
        // Success feedback
        console.log(chalk.green('✔ Logged in!'), chalk.dim('(token stored securely)'));
        console.log();
        
        // Show help to get started
        console.log(chalk.bold('Get started:'));
        console.log(chalk.dim('  sessionbase --help      Show all commands'));
        console.log(chalk.dim('  sessionbase list         List your sessions'));
        console.log(chalk.dim('  sessionbase upload       Upload a new session'));
        
      } catch (error) {
        console.error(chalk.red('Login failed:'), error);
        process.exit(1);
      }
    });

  return command;
}
