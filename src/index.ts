#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get package.json for version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);

const program = new Command();

program
  .name('sessionbase')
  .description('CLI tool for SessionBase - manage and share chat sessions')
  .version(packageJson.version);

// Import and register command modules
import { lsCommand } from './commands/ls.js';
import { createLoginCommand } from './commands/login.js';
import { pushCommand } from './commands/push.js';
import { pullCommand } from './commands/pull.js';
import { whoamiCommand } from './commands/whoami.js';
import { logoutCommand } from './commands/logout.js';

program.addCommand(lsCommand);
program.addCommand(createLoginCommand());
program.addCommand(pushCommand);
program.addCommand(pullCommand);
program.addCommand(whoamiCommand);
program.addCommand(logoutCommand);

// Process CLI commands
program.parseAsync(process.argv).catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
