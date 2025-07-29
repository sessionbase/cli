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
import { listCommand } from './commands/list.js';
import { createLoginCommand } from './commands/login.js';
import { uploadCommand } from './commands/upload.js';
import { whoamiCommand } from './commands/whoami.js';
import { logoutCommand } from './commands/logout.js';

program.addCommand(listCommand);
program.addCommand(createLoginCommand());
program.addCommand(uploadCommand);
program.addCommand(whoamiCommand);
program.addCommand(logoutCommand);

// Process CLI commands
program.parseAsync(process.argv).catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
