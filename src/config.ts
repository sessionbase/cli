import { join } from 'node:path';
import { homedir } from 'node:os';

export const BASE_URL = process.env.SESSIONBASE_API_URL || 'https://api.sessionbase.com';

// Claude Code session path
export const CLAUDE_CODE_PATH = join(homedir(), '.claude', 'projects');
