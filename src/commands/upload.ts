import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { getToken } from '../auth.js';
import { BASE_URL } from '../config.js';
import chalk from 'chalk';
import ora from 'ora';

export const uploadCommand = new Command('upload')
  .description('Upload a chat session file')
  .argument('<file>', 'Path to the session file (.json or .jsonl)')
  .option('--private', 'Make the session private')
  .option('--title <title>', 'Session title')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--summary <summary>', 'Session summary')
  .action(async (filePath, options) => {
    const spinner = ora('Uploading session...').start();
    
    try {
      // Get auth token
      const token = await getToken();
      if (!token) {
        spinner.fail('Not authenticated. Please run `sessionbase login` first.');
        process.exit(1);
      }

      // Read and parse the file
      const content = readFileSync(filePath, 'utf-8');
      let sessionData;
      
      // Determine file type and parse accordingly
      const isJsonl = filePath.endsWith('.jsonl');
      
      try {
        if (isJsonl) {
          // Convert JSONL to JSON by parsing each line
          const lines = content.trim().split('\n').filter(line => line.trim());
          const entries = lines.map(line => JSON.parse(line));
          
          // Extract Claude session metadata from first entry
          const firstEntry = entries[0];
          const claudeSessionId = firstEntry?.sessionId;
          const claudeCwd = firstEntry?.cwd;
          
          // Create a simple JSON structure with the entries
          sessionData = {
            messages: entries,
            title: `JSONL Import ${new Date().toISOString().split('T')[0]}`,
            platform: 'claude-code',
            sessionId: claudeSessionId,
            cwd: claudeCwd
          };
        } else {
          // Parse regular JSON
          sessionData = JSON.parse(content);
        }
      } catch (error) {
        spinner.fail(`Invalid ${isJsonl ? 'JSONL' : 'JSON'} in ${filePath}: ${error.message}`);
        process.exit(1);
      }

      // Validate messages exist
      if (!sessionData.messages || !Array.isArray(sessionData.messages)) {
        spinner.fail('Session file must contain a "messages" array');
        process.exit(1);
      }

      // Build the payload
      const payload = {
        messages: sessionData.messages,
        isPrivate: options.private || false,
        title: options.title || sessionData.title || 'Untitled Session',
        summary: options.summary || sessionData.summary || '',
        tags: options.tags ? options.tags.split(',').map(t => t.trim()) : (sessionData.tags || []),
        tokenCount: sessionData.tokenCount || 0,
        messageCount: sessionData.messages.length,
        modelName: sessionData.modelName || 'unknown',
        platform: sessionData.platform || 'qcli',
        ...(sessionData.sessionId && { sessionId: sessionData.sessionId }),
        ...(sessionData.cwd && { cwd: sessionData.cwd })
      };

      // Make the API call
      const response = await fetch(`${BASE_URL}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        spinner.fail(`Upload failed: ${response.status} ${response.statusText} - ${errorText}`);
        process.exit(1);
      }

      const result = await response.json();
      
      spinner.succeed('Session uploaded successfully!');
      console.log(chalk.green(`Session ID: ${result.id}`));
      if (result.url) {
        console.log(chalk.blue(`URL: ${result.url}`));
      }

    } catch (error) {
      spinner.fail(`Upload failed: ${error.message}`);
      process.exit(1);
    }
  });
