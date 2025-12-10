import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { SessionInfo } from '../../platforms/types.js';
import { SearchBar } from '../components/SearchBar.js';
import { SessionList } from '../components/SessionList.js';
import { formatDistanceToNow } from 'date-fns';

interface SessionsViewProps {
  sessions: SessionInfo[];
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedPlatform: string;
  onPlatformChange: (platform: string) => void;
  selectedSessionIndex: number;
  isSearchFocused: boolean;
  sortOrder: 'recent' | 'oldest' | 'title';
  detailOpen: boolean;
  detail?: any;
  detailLoading: boolean;
  detailError: string | null;
}

export const SessionsView: React.FC<SessionsViewProps> = ({
  sessions,
  isLoading,
  searchQuery,
  onSearchChange,
  selectedPlatform,
  onPlatformChange,
  selectedSessionIndex,
  isSearchFocused,
  sortOrder,
  detailOpen,
  detail,
  detailLoading,
  detailError,
}) => {
  const platforms = [
    { key: 'all', label: 'All', emoji: '📋' },
    { key: 'claude-code', label: 'Claude', emoji: '🟠' },
    { key: 'gemini-cli', label: 'Gemini', emoji: '🔷' },
    { key: 'qchat', label: 'Q Chat', emoji: '🤖' },
    { key: 'codex', label: 'Codex', emoji: '💜' },
  ];

  if (isLoading) {
    return (
      <Box padding={2}>
        <Text>
          <Text color="cyan"><Spinner type="dots" /></Text> Loading sessions...
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Sessions Browser
        </Text>
      </Box>

      {/* Filters line */}
      <Box marginBottom={1} flexDirection="column">
        <Text>
          Filters:{' '}
          <Text color="cyan">
            Platform={platforms.find(p => p.key === selectedPlatform)?.label || 'All'}
          </Text>
          {searchQuery ? (
            <Text>
              {' '}· <Text color="cyan">Query="{searchQuery}"</Text>
            </Text>
          ) : null}{' '}
          <Text dimColor>[Esc clears]</Text>
        </Text>
        <Text>
          Sort: <Text color="cyan">
            {sortOrder === 'recent'
              ? 'Recent ▸'
              : sortOrder === 'oldest'
              ? 'Oldest ▸'
              : 'Title ▸'}
          </Text>{' '}
          <Text dimColor>(press s to cycle)</Text>
        </Text>
      </Box>

      {/* Search Bar */}
      <Box marginBottom={1}>
        <SearchBar
          value={searchQuery}
          onChange={onSearchChange}
          isFocused={isSearchFocused}
        />
      </Box>

      {/* Platform Filter Buttons */}
      <Box marginBottom={1} gap={1}>
        {platforms.map((platform) => {
          const isSelected = selectedPlatform === platform.key;
          return (
            <Box key={platform.key}>
              <Text
                color={isSelected ? 'cyan' : 'gray'}
                bold={isSelected}
                dimColor={!isSelected}
              >
                [{platform.emoji} {platform.label}]
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>
          Press 'a' for All, 'c' for Claude, 'g' for Gemini, 'q' for Q Chat, 'x' for Codex
        </Text>
      </Box>

      {/* Session Count */}
      <Box
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
      >
        <Text>
          {sessions.length} session{sessions.length !== 1 ? 's' : ''} found
        </Text>
      </Box>

      {/* List + Detail split */}
      {sessions.length > 0 ? (
        <Box flexDirection="row" flexGrow={1} gap={1}>
          <Box width={detailOpen ? '50%' : '100%'} flexDirection="column">
            <SessionList
              sessions={sessions}
              selectedIndex={selectedSessionIndex}
              maxHeight={15}
            />
          </Box>
          {detailOpen && (
            <Box
              width="50%"
              borderStyle="round"
              borderColor="cyan"
              padding={1}
              flexDirection="column"
              gap={1}
            >
              <Text bold color="cyan">Session Details</Text>
              {detailLoading && (
                <Text><Text color="cyan"><Spinner type="dots" /></Text> Loading detail...</Text>
              )}
              {detailError && <Text color="red">Error: {detailError}</Text>}
              {!detailLoading && !detailError && detail && detail.session && (
                <Box flexDirection="column" gap={0}>
                  <Text>
                    {detail.session.platform ? detail.session.platform : 'Platform'}{' '}
                    | 💬 {detail.messageCount ?? detail.session.messageCount ?? '?'}{' '}
                    | {formatDistanceToNow(detail.session.lastModified, { addSuffix: true })}
                  </Text>
                  <Text dimColor>Path: {detail.session.filePath}</Text>
                  <Text dimColor>Project: {detail.session.projectPath}</Text>
                  {detail.title && <Text>Title: {detail.title}</Text>}
                  {detail.tags && detail.tags.length > 0 && (
                    <Text dimColor>Tags: {detail.tags.join(', ')}</Text>
                  )}
                  <Text bold marginTop={1}>Preview:</Text>
                  {detail.previewLines && detail.previewLines.length > 0 ? (
                    detail.previewLines.map((line: string, idx: number) => (
                      <Text key={idx} dimColor>{line}</Text>
                    ))
                  ) : (
                    <Text dimColor>No preview available</Text>
                  )}
                </Box>
              )}
            </Box>
          )}
        </Box>
      ) : (
        <Box padding={2}>
          <Text dimColor>
            {searchQuery
              ? `No sessions match "${searchQuery}"`
              : 'No sessions found. Try running a command to create some sessions!'}
          </Text>
        </Box>
      )}

      {/* Navigation Hint */}
      <Box marginTop={1}>
        <Text dimColor>
          Use ↑↓ to navigate • / to search • Tab to toggle focus • Enter to view details • Esc to close detail
        </Text>
      </Box>
    </Box>
  );
};

