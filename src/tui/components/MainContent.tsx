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

export const MainContent: React.FC<MainContentProps> = ({
  currentView,
  sessions,
  sortedSessions,
  stats,
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
          onSearchChange={onSearchChange}
          selectedPlatform={selectedPlatform}
          onPlatformChange={onPlatformChange}
          selectedSessionIndex={selectedSessionIndex}
          isSearchFocused={isSearchFocused}
          sortOrder={sortOrder}
          detailOpen={detailOpen}
          detail={detail}
          detailLoading={detailLoading}
          detailError={detailError}
        />
      )}
    </Box>
  );
};

