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

// TODO: Import and register command modules
// import { loginCommand } from './commands/login.js';
// import { uploadCommand } from './commands/upload.js';
// import { pullCommand } from './commands/pull.js';
// import { forkCommand } from './commands/fork.js';
// import { listCommand } from './commands/list.js';

// program.addCommand(loginCommand);
// program.addCommand(uploadCommand);
// program.addCommand(pullCommand);
// program.addCommand(forkCommand);
// program.addCommand(listCommand);

program.parseAsync(process.argv).catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
