import { Command } from 'commander';
import chalk from 'chalk';
import { isAuthenticated, getToken } from '../auth.js';

/**
 * Decode JWT payload without verification (for display purposes only)
 */
function decodeJWT(token: string): any | null {
  try {
    if (!token.includes('.')) return null;
    
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    // Decode the payload (middle part)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return payload;
  } catch (error) {
    return null;
  }
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

export const whoamiCommand = new Command('whoami');

whoamiCommand
  .description('Show current authentication status')
  .action(async () => {
    try {
      const authenticated = await isAuthenticated();
      
      if (authenticated) {
        const token = await getToken();
        
        console.log(chalk.green('✔ Authenticated'));
        
        // Try to decode JWT and show user info
        if (token) {
          const payload = decodeJWT(token);
          if (payload) {
            console.log();
            console.log(chalk.bold('User Information:'));
            
            // Show common JWT fields if they exist
            if (payload.sub) {
              console.log(chalk.dim(`  User ID: ${payload.sub}`));
            }
            if (payload.email) {
              console.log(chalk.dim(`  Email: ${payload.email}`));
            }
            if (payload.name || payload.username) {
              console.log(chalk.dim(`  Name: ${payload.name || payload.username}`));
            }
            if (payload.userId) {
              console.log(chalk.dim(`  User ID: ${payload.userId}`));
            }
            if (payload.provider) {
              console.log(chalk.dim(`  Provider: ${payload.provider}`));
            }
            if (payload.iat) {
              console.log(chalk.dim(`  Issued: ${formatTimestamp(payload.iat)}`));
            }
            
            // Show any custom fields that might contain user info (excluding known fields)
            const customFields = Object.keys(payload).filter(key => 
              !['sub', 'email', 'name', 'username', 'exp', 'iat', 'iss', 'aud', 'nbf', 'jti', 'userId', 'provider', 'avatarUrl'].includes(key)
            );
            
            if (customFields.length > 0) {
              console.log(chalk.dim(`  Other: ${customFields.map(key => `${key}=${payload[key]}`).join(', ')}`));
            }
          }
        }
      } else {
        console.log(chalk.red('✗ Not authenticated'));
        console.log(chalk.dim('  Run: sessionbase login'));
      }
    } catch (error) {
      console.error(chalk.red('Error checking authentication:'), error);
      process.exit(1);
    }
  });