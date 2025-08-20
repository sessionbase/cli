import { Command } from 'commander';
import open from 'open';
import chalk from 'chalk';
import { renderFilled } from 'oh-my-logo';
import { WEB_BASE_URL, BASE_URL } from '../config.js';
import { storeToken } from '../utils/auth.js';

/**
 * Validate SessionBase API key format: sb_live_{64 hex chars}
 */
function validateToken(token: string): boolean {
  // Must start with sb_live_ and be exactly 72 characters
  if (!token.startsWith('sb_live_') || token.length !== 72) {
    return false;
  }
  
  // Verify the suffix is valid hex (64 chars after sb_live_)
  const hexPart = token.slice(8); // Remove 'sb_live_' prefix
  return /^[a-f0-9]{64}$/i.test(hexPart);
}

/**
 * Start device authorization flow
 */
async function startDeviceFlow(): Promise<{
  device_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}> {
  const response = await fetch(`${BASE_URL}/auth/device/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Device flow start failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Poll for device authorization completion
 */
async function pollDeviceComplete(deviceCode: string, interval: number): Promise<string> {
  const pollInterval = interval * 1000; // Convert to milliseconds
  const maxAttempts = 120; // 10 minutes max (120 * 5 seconds)
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    try {
      const response = await fetch(`${BASE_URL}/auth/device/poll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ device_code: deviceCode }),
      });

      if (!response.ok) {
        if (response.status === 400) {
          // Device code expired or invalid
          throw new Error('Device code expired or invalid');
        }
        continue; // Retry on other errors
      }

      const result = await response.json();
      
      if (result.status === 'complete') {
        return result.apiKey;
      }
      
      // Status is 'pending', continue polling
    } catch (error) {
      console.error('Polling error:', error);
      throw error;
    }
  }
  
  throw new Error('Device authorization timed out');
}


export const loginCommand = new Command('login')
  .description('Authenticate with SessionBase')
  .action(async () => {
      try {
        // Device flow (only option)
        console.log(chalk.blue('⭢ Opening browser to complete login…'));
        
        // Start device flow
        const deviceFlow = await startDeviceFlow();
        
        // Open browser to verification URL
        try {
          await open(deviceFlow.verification_url);
        } catch (error) {
          console.log(chalk.yellow('Could not open browser automatically.'));
          console.log(chalk.dim(`Please visit: ${deviceFlow.verification_url}`));
        }
        
        console.log();
        console.log('────────────────────────────────');
        console.log(' Waiting for you to finish authentication…');
        console.log('────────────────────────────────');
        
        // Poll for completion
        const token = await pollDeviceComplete(deviceFlow.device_code, deviceFlow.interval);
        
        // Validate API key format
        if (!validateToken(token)) {
          console.error(chalk.red('✗ Invalid API key format (expected: sb_live_{64 hex chars})'));
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
        console.log(chalk.green('✔ Logged in!'), chalk.dim('(API key stored securely)'));
        console.log();
        
        // Show help to get started
        console.log(chalk.bold('Get started:'));
        console.log(chalk.dim('  sessionbase --help       Show all commands'));
        console.log(chalk.dim('  sessionbase ls           List your local sessions'));
        console.log(chalk.dim('  sessionbase push         Push a new session'));
        console.log(chalk.dim('  sessionbase whoami       Show auth status'));
        console.log();
        console.log(chalk.blue('Documentation: \u001b]8;;https://docs.sessionbase.ai\u001b\\https://docs.sessionbase.ai\u001b]8;;\u001b\\'));
        
      } catch (error) {
        console.error(chalk.red('Login failed:'), error);
        process.exit(1);
      }
  });
