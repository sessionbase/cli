import React, { useState } from 'react';
import { Box, useInput, useApp } from 'ink';
import { View } from './types.js';
import { Sidebar } from './components/Sidebar.js';
import { MainContent } from './components/MainContent.js';
import { useSessionData } from './hooks/useSessionData.js';
import { useSessionDetail } from './hooks/useSessionDetail.js';

export const App: React.FC = () => {
  const { exit } = useApp();
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSessionIndex, setSelectedSessionIndex] = useState<number>(0);
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const [sortOrder, setSortOrder] = useState<'recent' | 'oldest' | 'title'>('recent');
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [detailOpen, setDetailOpen] = useState<boolean>(false);
  const [detailExpanded, setDetailExpanded] = useState<boolean>(false);
  const [detailPage, setDetailPage] = useState<number>(0);

  // Fetch data
  const { sessions, stats, isLoading, error, isAuth, userName } = useSessionData({
    platform: selectedPlatform,
    searchQuery: searchQuery,
  });

  // Reset session index when sessions change
  React.useEffect(() => {
    if (selectedSessionIndex >= sessions.length && sessions.length > 0) {
      setSelectedSessionIndex(Math.max(0, sessions.length - 1));
    }
  }, [sessions.length, selectedSessionIndex]);

  // Apply sorting to sessions before rendering
  const sortedSessions = React.useMemo(() => {
    const copy = [...sessions];
    switch (sortOrder) {
      case 'oldest':
        return copy.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());
      case 'title':
        return copy.sort((a, b) => {
          const aTitle = (a.firstMessagePreview || a.title || '').toLowerCase();
          const bTitle = (b.firstMessagePreview || b.title || '').toLowerCase();
          return aTitle.localeCompare(bTitle);
        });
      case 'recent':
      default:
        return copy.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    }
  }, [sessions, sortOrder]);

  const selectedSession = sortedSessions[selectedSessionIndex] || null;

  // Detail loading
  const { detail, isLoading: detailLoading, error: detailError } = useSessionDetail(
    detailOpen ? selectedSession : null
  );

  // Keyboard shortcuts
  useInput((input, key) => {
    // Help overlay toggle
    if (input === '?') {
      setShowHelp((prev) => !prev);
      return;
    }

    // When help overlay is open, only allow closing or quitting
    if (showHelp) {
      if (key.escape) {
        setShowHelp(false);
      }
      if (input === 'q' && !isSearchFocused && currentView !== 'sessions') {
        exit();
      }
      return;
    }

    // Global quit (disabled in sessions to avoid conflict with Q Chat filter)
    if (input === 'q' && !isSearchFocused && currentView !== 'sessions') {
      exit();
      return;
    }

    // Toggle detail
    if (key.return && currentView === 'sessions') {
      if (sortedSessions.length > 0 && selectedSession) {
        setDetailOpen(true);
      }
      return;
    }

    if (key.escape) {
      if (detailOpen) {
        setDetailOpen(false);
        setDetailExpanded(false);
        setDetailPage(0);
        return;
      }
    }

    // View switching
    if (input === '1' && !isSearchFocused) {
      setCurrentView('dashboard');
      return;
    }

    if (input === '2' && !isSearchFocused) {
      setCurrentView('sessions');
      return;
    }

    // Search focus
    if (input === '/' && currentView === 'sessions') {
      setIsSearchFocused(true);
      return;
    }

    if (key.escape) {
      if (isSearchFocused) {
        setIsSearchFocused(false);
        setSearchQuery('');
      }
      return;
    }

    if (key.tab) {
      setIsSearchFocused(!isSearchFocused);
      return;
    }

    // Sessions view specific shortcuts
    if (currentView === 'sessions' && !isSearchFocused) {
      // Platform filters
      if (input === 'a') {
        setSelectedPlatform('all');
        return;
      }
      if (input === 'c') {
        setSelectedPlatform('claude-code');
        return;
      }
      if (input === 'g') {
        setSelectedPlatform('gemini-cli');
        return;
      }
      if (input === 'x') {
        setSelectedPlatform('codex');
        return;
      }
      if (input === 'q') {
        setSelectedPlatform('qchat');
        return;
      }

      if (input === 's') {
        setSortOrder(prev => (prev === 'recent' ? 'oldest' : prev === 'oldest' ? 'title' : 'recent'));
        return;
      }

      // Detail expansion toggle
      if (input === 'm' && detailOpen) {
        setDetailExpanded((prev) => !prev);
        setDetailPage(0);
        return;
      }

      // Detail paging when expanded
      if (detailOpen && detailExpanded) {
        if (key.pageDown || input === ']') {
          setDetailPage((prev) => prev + 1);
          return;
        }
        if (key.pageUp || input === '[') {
          setDetailPage((prev) => Math.max(0, prev - 1));
          return;
        }
      }

      // Session navigation
      if (key.upArrow) {
        setSelectedSessionIndex((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow) {
        setSelectedSessionIndex((prev) => Math.min(sessions.length - 1, prev + 1));
        return;
      }

      // Page navigation
      if (key.pageUp) {
        setSelectedSessionIndex((prev) => Math.max(0, prev - 10));
        return;
      }

      if (key.pageDown) {
        setSelectedSessionIndex((prev) => Math.min(sessions.length - 1, prev + 10));
        return;
      }
    }
  });

  // Show error if present
  if (error) {
    return (
      <Box padding={1}>
        <Box borderStyle="round" borderColor="red" padding={1}>
          <Box flexDirection="column">
            <Box>
              <Box marginRight={1}>❌</Box>
              <Box>Error loading sessions:</Box>
            </Box>
            <Box marginTop={1}>
              <Box>{error}</Box>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {showHelp && (
        <Box
          borderStyle="round"
          borderColor="cyan"
          padding={1}
          flexDirection="column"
          marginBottom={1}
        >
          <Text bold color="cyan">Help & Shortcuts</Text>
          <Text dimColor>q: quit | 1/2: switch views | ?: toggle help</Text>
          <Text dimColor>/ : focus search | Esc: clear search/unfocus</Text>
          <Text dimColor>a/c/g/q/x: filter by platform</Text>
          <Text dimColor>s: cycle sort (Recent ▸ Oldest ▸ Title)</Text>
          <Text dimColor>↑ ↓ : navigate sessions | PageUp/PageDown: fast scroll</Text>
          <Text dimColor>Tab: toggle focus</Text>
        </Box>
      )}
      <Box flexDirection="row">
        <Sidebar currentView={currentView} isAuthenticated={isAuth} userName={userName} />
        <MainContent
          currentView={currentView}
          sessions={sessions}
          sortedSessions={sortedSessions}
          stats={stats}
          isLoading={isLoading}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedPlatform={selectedPlatform}
          onPlatformChange={setSelectedPlatform}
          selectedSessionIndex={selectedSessionIndex}
          isSearchFocused={isSearchFocused}
          sortOrder={sortOrder}
          detailOpen={detailOpen}
          detailExpanded={detailExpanded}
          detailPage={detailPage}
          detail={detail}
          detailLoading={detailLoading}
          detailError={detailError}
        />
      </Box>
    </Box>
  );
};

