import React from 'react';
import { Box } from 'ink';
import { View } from '../types.js';
import { DashboardView } from '../views/DashboardView.js';
import { SessionsView } from '../views/SessionsView.js';
import { SessionInfo } from '../../platforms/types.js';
import { SessionStats } from '../types.js';

interface MainContentProps {
  currentView: View;
  sessions: SessionInfo[];
  sortedSessions: SessionInfo[];
  stats: SessionStats | null;
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

export const MainContent: React.FC<MainContentProps> = ({
  currentView,
  sessions,
  sortedSessions,
  stats,
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
  return (
    <Box flexDirection="column" flexGrow={1}>
      {currentView === 'dashboard' ? (
        <DashboardView
          stats={stats}
          isLoading={isLoading}
          recentSessions={sessions.slice(0, 3)}
        />
      ) : (
        <SessionsView
          sessions={sortedSessions}
          isLoading={isLoading}
          searchQuery={searchQuery}
          searchDraft={searchDraft}
          onSearchChange={onSearchChange}
          onSearchDraftChange={onSearchDraftChange}
          selectedPlatform={selectedPlatform}
          onPlatformChange={onPlatformChange}
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
      )}
    </Box>
  );
};

