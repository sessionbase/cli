/**
 * Platform configuration for SessionBase TUI
 * Defines emojis, labels, and helper functions for supported AI platforms
 */

export interface PlatformConfig {
  key: string;
  label: string;
  emoji: string;
}

export const PLATFORMS: PlatformConfig[] = [
  { key: 'all', label: 'All', emoji: '📋' },
  { key: 'claude-code', label: 'Claude', emoji: '🟠' },
  { key: 'gemini-cli', label: 'Gemini', emoji: '🔷' },
  { key: 'qchat', label: 'Q Chat', emoji: '🤖' },
  { key: 'codex', label: 'Codex', emoji: '💜' },
];

/**
 * Get platform emoji by platform key
 */
export function getPlatformEmoji(platform: string): string {
  switch (platform) {
    case 'claude-code':
      return '🟠';
    case 'gemini-cli':
      return '🔷';
    case 'qchat':
      return '🤖';
    case 'codex':
      return '💜';
    default:
      return '💬';
  }
}

/**
 * Get full platform name by platform key
 */
export function getPlatformName(platform: string): string {
  switch (platform) {
    case 'claude-code':
      return 'Claude Code';
    case 'gemini-cli':
      return 'Gemini CLI';
    case 'qchat':
      return 'Q Chat';
    case 'codex':
      return 'Codex';
    default:
      return platform || 'Unknown';
  }
}
