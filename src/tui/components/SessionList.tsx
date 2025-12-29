import React from 'react';
import { Box, Text } from 'ink';
import { SessionInfo } from '../../platforms/types.js';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { getPlatformEmoji, getPlatformName } from '../constants.js';

interface SessionListProps {
  sessions: SessionInfo[];
  selectedIndex: number;
  maxHeight?: number;
}

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

  const formatGroupLabel = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMM d, yyyy');
  };

  return (
    <Box flexDirection="column">
      {visibleSessions.map((session, idx) => {
        const actualIdx = startIdx + idx;
        const isSelected = actualIdx === selectedIndex;
        const emoji = getPlatformEmoji(session.platform || '');
        const platformName = getPlatformName(session.platform || '');
        const preview = session.firstMessagePreview || session.title || session.id || 'Untitled';
        const timeAgo = formatDistanceToNow(session.lastModified, { addSuffix: true });
        const groupLabel = formatGroupLabel(session.lastModified);
        const showGroupHeader = idx === 0 || formatGroupLabel(visibleSessions[idx - 1].lastModified) !== groupLabel;
        const tags = session.tags && session.tags.length ? session.tags.slice(0, 3) : [];

        return (
          <Box key={actualIdx} flexDirection="column" marginY={0}>
            {showGroupHeader && (
              <Box marginTop={idx === 0 ? 0 : 1} marginBottom={0}>
                <Text dimColor>─ {groupLabel} ─</Text>
              </Box>
            )}
            <Box>
              <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                {isSelected ? '➤ ' : '  '}
                {emoji} {preview.slice(0, 60)}{preview.length > 60 ? '...' : ''}
              </Text>
            </Box>
            <Box paddingLeft={4}>
              <Text dimColor>
                💬 {session.messageCount ?? '?'} • {timeAgo} • {platformName}
              </Text>
            </Box>
            {tags.length > 0 && (
              <Box paddingLeft={4} gap={1}>
                {tags.map((tag, tagIdx) => (
                  <Text key={tagIdx} dimColor>[{tag}]</Text>
                ))}
                {session.tags && session.tags.length > tags.length && <Text dimColor>…</Text>}
              </Box>
            )}
            {isSelected && (
              <Box paddingLeft={4} flexDirection="column" gap={0}>
                <Text dimColor>📁 {session.filePath}</Text>
                <Text dimColor>📂 {session.projectPath}</Text>
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

