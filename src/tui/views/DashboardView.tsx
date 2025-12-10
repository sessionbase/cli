import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { formatDistanceToNow } from 'date-fns';
import { SessionStats } from '../types.js';
import { ActivityHeatmap } from '../components/ActivityHeatmap.js';
import { StatsCard } from '../components/StatsCard.js';
import { SessionInfo } from '../../platforms/types.js';

interface DashboardViewProps {
  stats: SessionStats | null;
  isLoading: boolean;
  recentSessions?: SessionInfo[];
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
      return platform;
  }
};

export const DashboardView: React.FC<DashboardViewProps> = ({ stats, isLoading, recentSessions }) => {
  if (isLoading || !stats) {
    return (
      <Box padding={2}>
        <Text>
          <Text color="cyan"><Spinner type="dots" /></Text> Loading dashboard...
        </Text>
      </Box>
    );
  }

  const platformCount = Object.keys(stats.sessionsByPlatform).length;
  const recentCount = stats.recentActivity.filter(a => a.count > 0).length;
  const latestSession = stats.lastPushDate
    ? formatDistanceToNow(stats.lastPushDate, { addSuffix: true })
    : '—';
  const mostActivePlatformEntry = Object.entries(stats.sessionsByPlatform)
    .sort(([, a], [, b]) => b - a)[0];
  const mostActivePlatform =
    mostActivePlatformEntry && mostActivePlatformEntry[1] > 0
      ? `${getPlatformName(mostActivePlatformEntry[0])} (${mostActivePlatformEntry[1]})`
      : '—';
  const mostActiveDayEntry = stats.recentActivity
    .filter(a => a.count > 0)
    .sort((a, b) => b.count - a.count)[0];
  const mostActiveDay = mostActiveDayEntry
    ? `${mostActiveDayEntry.count} on ${mostActiveDayEntry.date.toLocaleDateString()}`
    : '—';

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan" fontSize={16}>
          Dashboard
        </Text>
      </Box>

      {/* Summary Bar - compact single row */}
      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
        paddingY={0}
        marginBottom={1}
        gap={1}
      >
        <StatsCard label="Total" value={stats.totalSessions} color="cyan" />
        <StatsCard label="Latest" value={latestSession} color="green" />
        <StatsCard label="Platforms" value={platformCount} color="yellow" />
        <StatsCard label="Active" value={recentCount} color="magenta" />
      </Box>

      {/* Balanced Row: Platform (left) + Activity (right) */}
      <Box
        borderStyle="round"
        borderColor="cyan"
        padding={1}
        marginBottom={1}
        flexDirection="row"
        gap={2}
      >
        {/* Platform Breakdown */}
        <Box flexDirection="column" width="50%" minWidth={28}>
          <Text bold marginBottom={1}>
            Platform Breakdown
          </Text>
          {Object.keys(stats.sessionsByPlatform).length > 0 ? (
            Object.entries(stats.sessionsByPlatform)
              .sort(([, a], [, b]) => b - a)
              .map(([platform, count]) => (
                <Box key={platform} justifyContent="space-between">
                  <Text>
                    {getPlatformEmoji(platform)} {getPlatformName(platform)}
                  </Text>
                  <Text bold color="cyan">
                    {count}
                  </Text>
                </Box>
              ))
          ) : (
            <Text dimColor>No sessions found</Text>
          )}
        </Box>

        {/* Activity */}
        <Box flexDirection="column" flexGrow={1}>
          <Text bold marginBottom={1}>
            Activity (Last 28 days)
          </Text>
          <Text dimColor marginBottom={1}>
            Most active: {mostActivePlatform} | Busiest day: {mostActiveDay}
          </Text>
          <ActivityHeatmap activity={stats.recentActivity} />
          <Box marginTop={1} flexDirection="row" gap={1}>
            <Text dimColor>Legend:</Text>
            <Text color="cyan">█</Text>
            <Text dimColor>high</Text>
            <Text color="cyan">▓</Text>
            <Text dimColor>med</Text>
            <Text color="cyan">▒</Text>
            <Text dimColor>low</Text>
            <Text color="cyan">░</Text>
            <Text dimColor>none</Text>
          </Box>
        </Box>
      </Box>

      {/* Recent Sessions (compact, optional) */}
      {recentSessions && recentSessions.length > 0 && (
        <Box
          borderStyle="round"
          borderColor="cyan"
          padding={1}
          marginBottom={1}
          flexDirection="column"
          gap={0}
        >
          <Text bold marginBottom={1}>Recent Sessions</Text>
          {recentSessions.slice(0, 3).map((session) => (
            <Box key={session.filePath} flexDirection="column" marginBottom={0}>
              <Text>
                {getPlatformEmoji(session.platform || '')}{' '}
                {(session.firstMessagePreview || session.title || 'Untitled').slice(0, 50)}
                {(session.firstMessagePreview || session.title || '').length > 50 ? '…' : ''}
              </Text>
              <Text dimColor>
                💬 {session.messageCount} | {formatDistanceToNow(session.lastModified, { addSuffix: true })} | {session.filePath}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Footer Note */}
      {stats.lastPushDate && (
        <Box marginTop={2}>
          <Text dimColor>
            Last session: {stats.lastPushDate.toLocaleDateString()}
          </Text>
        </Box>
      )}
    </Box>
  );
};

