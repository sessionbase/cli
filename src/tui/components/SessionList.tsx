import React from 'react';
import { Box, Text } from 'ink';
import { SessionInfo } from '../../platforms/types.js';
import { formatDistanceToNow } from 'date-fns';

interface SessionListProps {
  sessions: SessionInfo[];
  selectedIndex: number;
  maxHeight?: number;
}

const getPlatformEmoji = (platform: string): string => {
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
};

const getPlatformName = (platform: string): string => {
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
      return 'Unknown';
  }
};

export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  selectedIndex,
  maxHeight = 10,
}) => {
  if (sessions.length === 0) {
    return (
      <Box padding={2}>
        <Text dimColor>No sessions found</Text>
      </Box>
    );
  }

  // Calculate visible window
  const startIdx = Math.max(0, Math.min(selectedIndex - Math.floor(maxHeight / 2), sessions.length - maxHeight));
  const endIdx = Math.min(sessions.length, startIdx + maxHeight);
  const visibleSessions = sessions.slice(startIdx, endIdx);
  const selected = sessions[selectedIndex];

  return (
    <Box flexDirection="column">
      {visibleSessions.map((session, idx) => {
        const actualIdx = startIdx + idx;
        const isSelected = actualIdx === selectedIndex;
        const emoji = getPlatformEmoji(session.platform || '');
        const platformName = getPlatformName(session.platform || '');
        const preview = session.firstMessagePreview || session.title || session.id || 'Untitled';
        const timeAgo = formatDistanceToNow(session.lastModified, { addSuffix: true });

        return (
          <Box key={actualIdx} flexDirection="column" marginY={0}>
            <Box>
              <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                {isSelected ? '→ ' : '  '}
                {emoji} {preview.slice(0, 60)}{preview.length > 60 ? '...' : ''}
              </Text>
            </Box>
            <Box paddingLeft={4}>
              <Text dimColor>
                💬 {session.messageCount} messages | {timeAgo} | {platformName}
              </Text>
            </Box>
            {isSelected && (
              <Box paddingLeft={4}>
                <Text dimColor>📁 {session.filePath}</Text>
              </Box>
            )}
          </Box>
        );
      })}
      <Box marginTop={1} flexDirection="column">
        {sessions.length > maxHeight && (
          <Text dimColor>
            Showing {startIdx + 1}-{endIdx} of {sessions.length} sessions · PageUp/PageDown to scroll
          </Text>
        )}
        {selected && (
          <Text dimColor>
            Selected {selectedIndex + 1}/{sessions.length} · {getPlatformName(selected.platform || '')}{' '}
            · 💬 {selected.messageCount} · {formatDistanceToNow(selected.lastModified, { addSuffix: true })}
          </Text>
        )}
      </Box>
    </Box>
  );
};

