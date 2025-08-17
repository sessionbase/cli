import { join } from 'node:path';
import { homedir, platform } from 'node:os';

/**
 * Get platform-specific application data directory
 */
export function getAppDataDir(): string {
  const home = homedir();
  
  switch (platform()) {
    case 'win32':
      return process.env.APPDATA || join(home, 'AppData', 'Roaming');
    case 'darwin':
      return join(home, 'Library', 'Application Support');
    default: // Linux and other Unix-like systems
      return process.env.XDG_DATA_HOME || join(home, '.local', 'share');
  }
}

/**
 * Get platform-specific configuration directory
 */
export function getConfigDir(): string {
  const home = homedir();
  
  switch (platform()) {
    case 'win32':
      return process.env.APPDATA || join(home, 'AppData', 'Roaming');
    case 'darwin':
      return join(home, 'Library', 'Application Support');
    default: // Linux and other Unix-like systems
      return process.env.XDG_CONFIG_HOME || join(home, '.config');
  }
}

/**
 * Get Amazon Q database path for current platform
 */
export function getAmazonQPath(): string {
  switch (platform()) {
    case 'win32':
      return join(getAppDataDir(), 'amazon-q', 'data.sqlite3');
    case 'darwin':
      return join(getAppDataDir(), 'amazon-q', 'data.sqlite3');
    default: // Linux
      return join(getAppDataDir(), 'amazon-q', 'data.sqlite3');
  }
}

/**
 * Get Claude Code projects path
 */
export function getClaudeCodePath(): string {
  return join(homedir(), '.claude', 'projects');
}

/**
 * Get Gemini CLI path
 */
export function getGeminiCliPath(): string {
  return join(homedir(), '.gemini', 'tmp');
}