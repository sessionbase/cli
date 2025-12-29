import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { SessionInfo } from '../../platforms/types.js';
import { SearchBar } from '../components/SearchBar.js';
import { SessionList } from '../components/SessionList.js';
import { formatDistanceToNow } from 'date-fns';
import { PLATFORMS } from '../constants.js';

const PAGE_LINES = 20;
const TRUNC_LINE = 120;

interface SessionsViewProps {
  sessions: SessionInfo[];
  isLoading: boolean;
  searchQuery: string;
  searchDraft: string;
  onSearchChange: (query: string) => void;
  onSearchDraftChange: (query: string) => void;
  selectedPlatform: string;
  onPlatformChange: (platform: string) => void;
  selectedSessionIndex: number;
  isSearchFocused: boolean;
  sortOrder: 'recent' | 'oldest' | 'title';
  detailOpen: boolean;
  detailExpanded: boolean;
  detailPage: number;
  detail?: any;
  detailLoading: boolean;
  detailError: string | null;
}

export const SessionsView: React.FC<SessionsViewProps> = ({
  sessions,
  isLoading,
  searchQuery,
  searchDraft,
  onSearchChange,
  onSearchDraftChange,
  selectedPlatform,
  onPlatformChange,
  selectedSessionIndex,
  isSearchFocused,
  sortOrder,
  detailOpen,
  detailExpanded,
  detailPage,
  detail,
  detailLoading,
  detailError,
}) => {

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
    <Box flexDirection="column" padding={1} gap={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color="cyan">Sessions Browser</Text>
        <Text dimColor>
          Filters: Platform={PLATFORMS.find(p => p.key === selectedPlatform)?.label || 'All'}
          {searchQuery ? <Text> · Query="{searchQuery}"</Text> : null} · Sort:{' '}
          {sortOrder === 'recent'
            ? 'Recent ▸'
            : sortOrder === 'oldest'
            ? 'Oldest ▸'
            : 'Title ▸'}
        </Text>
      </Box>

      <Box flexDirection="row" alignItems="center" gap={2}>
        <SearchBar
          value={searchDraft}
          onChange={onSearchDraftChange}
          isFocused={isSearchFocused}
          placeholder="Search (Enter to apply, Esc to clear)"
        />
        <Text dimColor>/ to focus • Tab to toggle focus</Text>
      </Box>

      <Box flexDirection="row" gap={1} flexWrap="wrap">
        {PLATFORMS.map((platform) => {
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
        <Text dimColor>
          a/c/g/q/x to switch • s to cycle sort
        </Text>
      </Box>

      <Box borderStyle="single" borderColor="gray" paddingX={1} paddingY={0}>
        <Text>
          {sessions.length} session{sessions.length !== 1 ? 's' : ''} found
          {detailOpen && selectedSessionIndex >= 0
            ? ` • Viewing ${selectedSessionIndex + 1}/${sessions.length}`
            : ''}
        </Text>
      </Box>

      {sessions.length > 0 ? (
        <Box flexDirection="row" gap={1}>
          <Box width={detailOpen ? '55%' : '100%'} flexDirection="column">
            <SessionList
              sessions={sessions}
              selectedIndex={selectedSessionIndex}
              maxHeight={7}
            />
          </Box>
          {detailOpen && (
            <Box
              width="45%"
              borderStyle="round"
              borderColor="cyan"
              padding={1}
              flexDirection="column"
              gap={1}
            >
              <Text bold color="cyan">Session Details</Text>
              <Text dimColor>
                m: more/less • [ / ] or PageUp/PageDown: page transcript • Esc: close detail
              </Text>
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
                  {!detailExpanded && (
                    <>
                      <Text bold marginTop={1}>Preview:</Text>
                      {detail.previewLines && detail.previewLines.length > 0 ? (
                        detail.previewLines.map((line: string, idx: number) => (
                          <Text key={idx} dimColor>{line}</Text>
                        ))
                      ) : (
                        <Text dimColor>No preview available</Text>
                      )}
                    </>
                  )}
                  {detailExpanded && (
                    <>
                      <Text bold marginTop={1}>Transcript:</Text>
                      {renderTranscript(detail, detailPage)}
                    </>
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

      <Box>
        <Text dimColor>
          ↑/↓ navigate • Enter open detail • Esc close • / search • Tab toggle focus • q to quit (on Dashboard)
        </Text>
      </Box>
    </Box>
  );
};

function renderTranscript(detail: any, page: number) {
  const lines: string[] = detail?.fullLines || [];
  if (!lines.length) {
    return <Text dimColor>No transcript available</Text>;
  }

  const start = page * PAGE_LINES;
  const end = start + PAGE_LINES;
  const slice = lines.slice(start, end);
  const totalPages = Math.max(1, Math.ceil(lines.length / PAGE_LINES));

  return (
    <Box flexDirection="column" gap={0}>
      {slice.map((line, idx) => (
        <Text key={`${start}-${idx}`} dimColor>{maybeTrunc(line)}</Text>
      ))}
      <Text dimColor marginTop={1}>
        Page {page + 1} / {totalPages} ({lines.length} lines) • use [ / ] or PageUp/PageDown
      </Text>
    </Box>
  );
}

function maybeTrunc(text: string) {
  if (text.length <= TRUNC_LINE) return text;
  return text.slice(0, TRUNC_LINE - 1) + '…';
}

