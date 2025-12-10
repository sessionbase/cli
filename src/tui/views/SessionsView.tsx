import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { SessionInfo } from '../../platforms/types.js';
import { SearchBar } from '../components/SearchBar.js';
import { SessionList } from '../components/SessionList.js';

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

      {/* Session List */}
      {sessions.length > 0 ? (
        <Box flexDirection="column" flexGrow={1}>
          <SessionList
            sessions={sessions}
            selectedIndex={selectedSessionIndex}
            maxHeight={15}
          />
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
          Use ↑↓ to navigate • / to search • Tab to toggle focus • Enter to view details
        </Text>
      </Box>
    </Box>
  );
};

