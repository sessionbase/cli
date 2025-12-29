import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { formatDistanceToNow } from 'date-fns';
import { SessionStats } from '../types.js';
import { ActivityHeatmap } from '../components/ActivityHeatmap.js';
import { SessionInfo } from '../../platforms/types.js';
import { getPlatformEmoji, getPlatformName } from '../constants.js';

interface DashboardViewProps {
  stats: SessionStats | null;
  isLoading: boolean;
  recentSessions?: SessionInfo[];
}

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

  // Calculate streak (consecutive days with activity)
  const calculateStreak = (): number => {
    let streak = 0;
    const sortedActivity = [...stats.recentActivity].reverse(); // Most recent first
    for (const day of sortedActivity) {
      if (day.count > 0) {
        streak++;
      } else if (streak > 0) {
        break; // Stop counting once we hit a gap
      }
    }
    return streak;
  };

  // Calculate average sessions per active day
  const avgSessionsPerDay = recentCount > 0
    ? (stats.recentActivity.reduce((sum, day) => sum + day.count, 0) / recentCount).toFixed(1)
    : '0';

  const currentStreak = calculateStreak();

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header with inline stats */}
      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={0}
        justifyContent="space-between"
        marginBottom={1}
      >
        <Box>
          <Text bold color="cyan">📊 Dashboard</Text>
        </Box>
        <Box gap={2}>
          <Text>
            <Text dimColor>Sessions: </Text>
            <Text bold color="cyan">{stats.totalSessions}</Text>
          </Text>
          <Text dimColor>|</Text>
          <Text>
            <Text dimColor>Latest: </Text>
            <Text bold color="green">{latestSession}</Text>
          </Text>
          <Text dimColor>|</Text>
          <Text>
            <Text dimColor>Platforms: </Text>
            <Text bold color="yellow">{platformCount}</Text>
          </Text>
          <Text dimColor>|</Text>
          <Text>
            <Text dimColor>Active days: </Text>
            <Text bold color="magenta">{recentCount}</Text>
          </Text>
        </Box>
      </Box>

      {/* Two-column layout: Left content stack | Right activity */}
      <Box
        borderStyle="round"
        borderColor="cyan"
        padding={2}
        gap={2}
      >
        {/* Left Column: Platform Breakdown & Recent Sessions */}
        <Box flexDirection="column" flexGrow={1} minWidth={40}>
          {/* Platform Breakdown */}
          <Box flexDirection="column" marginBottom={2}>
            <Text bold marginBottom={1}>Platform Breakdown</Text>
            {Object.keys(stats.sessionsByPlatform).length > 0 ? (
              <Box flexDirection="column">
                {Object.entries(stats.sessionsByPlatform)
                  .sort(([, a], [, b]) => b - a)
                  .map(([platform, count]) => {
                    const name = `${getPlatformEmoji(platform)} ${getPlatformName(platform)}`;
                    const dots = '.'.repeat(Math.max(2, 35 - name.length - count.toString().length));
                    return (
                      <Text key={platform}>
                        {name} <Text dimColor>{dots}</Text> <Text bold color="cyan">{count}</Text>
                      </Text>
                    );
                  })}
              </Box>
            ) : (
              <Text dimColor>No sessions found</Text>
            )}
          </Box>

          {/* Recent Sessions */}
          {recentSessions && recentSessions.length > 0 && (
            <Box flexDirection="column">
              <Text bold marginBottom={1}>Recent Sessions</Text>
              <Box flexDirection="column" gap={1}>
                {recentSessions.slice(0, 4).map((session) => (
                  <Box key={session.filePath} flexDirection="column">
                    <Text>
                      {getPlatformEmoji(session.platform || '')}{' '}
                      {(session.firstMessagePreview || session.title || 'Untitled').slice(0, 35)}
                      {(session.firstMessagePreview || session.title || '').length > 35 ? '…' : ''}
                    </Text>
                    <Text dimColor>
                      {session.messageCount} msgs • {formatDistanceToNow(session.lastModified, { addSuffix: true })}
                    </Text>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>

        {/* Right Column: Activity Heatmap */}
        <Box flexDirection="column" minWidth={35}>
          <Text bold marginBottom={1}>Activity (Last 28 days)</Text>
          <Text dimColor marginBottom={1}>
            Most active: {mostActivePlatform}
          </Text>
          <Text dimColor marginBottom={1}>
            Busiest day: {mostActiveDay}
          </Text>

          <ActivityHeatmap activity={stats.recentActivity} />

          {/* Additional stats - compact 2-line layout */}
          <Box flexDirection="column" marginTop={1} gap={0}>
            <Text>
              <Text color="yellow">🔥 </Text>
              <Text bold color="cyan">{recentCount}</Text>
              <Text> active days</Text>
              {currentStreak > 0 && (
                <>
                  <Text>  </Text>
                  <Text color="cyan">⚡ </Text>
                  <Text>Streak: </Text>
                  <Text bold color="cyan">{currentStreak}</Text>
                  <Text> days</Text>
                </>
              )}
            </Text>
            <Text>
              <Text color="green">📈 </Text>
              <Text>Best: </Text>
              <Text bold color="cyan">{mostActiveDayEntry?.count || 0}</Text>
              <Text> on {mostActiveDayEntry?.date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) || '—'}</Text>
              <Text>  </Text>
              <Text color="magenta">📊 </Text>
              <Text>Avg: </Text>
              <Text bold color="cyan">{avgSessionsPerDay}</Text>
              <Text>/day</Text>
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={1} justifyContent="center">
        <Text dimColor>
          <Text color="cyan">Tab</Text> Switch View • <Text color="cyan">q</Text> Quit
        </Text>
      </Box>
    </Box>
  );
};

