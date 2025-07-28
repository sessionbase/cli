import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, Spacer, useStdout } from 'ink';
import chalk from 'chalk';
import { getAllSessions, SessionData, SessionsByPlatform, sortPlatformsBySessionCount } from '../utils/sessionService.js';

interface SessionListProps {
  onUpload: (session: SessionData) => void;
  onExit: () => void;
}

export const SessionList: React.FC<SessionListProps> = ({ onUpload, onExit }) => {
  const [allSessions, setAllSessions] = useState<SessionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'cwd' | 'all'>('cwd');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'claude' | 'gemini' | 'qchat'>('all');
  
  // Terminal dimensions
  const { stdout } = useStdout();
  const [terminalHeight, setTerminalHeight] = useState(stdout?.rows || 24);
  const [terminalWidth, setTerminalWidth] = useState(stdout?.columns || 80);
  
  // Responsive viewport management
  const [viewportStart, setViewportStart] = useState(0);
  
  // Calculate viewport size based on terminal height - balanced approach
  // Reserve space for: header (6) + scroll indicators (2) + footer (4) + buffer (2) = 14 lines
  const RESERVED_LINES = 17;
  const SESSION_ITEM_HEIGHT = 3; // Exact height of each session item (now standardized)
  const VIEWPORT_SIZE = Math.max(1, Math.floor((terminalHeight - RESERVED_LINES) / SESSION_ITEM_HEIGHT)) - 1;

  // Update terminal dimensions when they change
  useEffect(() => {
    if (stdout) {
      const updateDimensions = () => {
        setTerminalHeight(stdout.rows || 24);
        setTerminalWidth(stdout.columns || 80);
      };
      
      // Update on resize
      stdout.on('resize', updateDimensions);
      
      // Initial update
      updateDimensions();
      
      return () => {
        stdout.off('resize', updateDimensions);
      };
    }
  }, [stdout]);

  // Load sessions
  useEffect(() => {
    loadSessions();
  }, [scope]);

  // Filter sessions by platform
  const filteredSessions = useMemo(() => {
    if (platformFilter === 'all') {
      return allSessions;
    }
    return allSessions.filter(session => session.platform === platformFilter);
  }, [allSessions, platformFilter]);

  const loadSessions = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // First try current directory
      const sessionsByPlatform = await getAllSessions(undefined, scope === 'all');
      
      // If no sessions in current directory, fallback to --all
      const totalSessions = sessionsByPlatform.claude.length + sessionsByPlatform.gemini.length + sessionsByPlatform.qchat.length;
      
      if (totalSessions === 0 && scope === 'cwd') {
        // Fallback to all sessions
        setScope('all');
        return; // useEffect will trigger again
      }
      
      // Sort platforms by session count and flatten
      const sortedPlatforms = sortPlatformsBySessionCount(sessionsByPlatform);
      const flatSessions: SessionData[] = [];
      
      for (const { platform, sessions } of sortedPlatforms) {
        if (sessions.length > 0) {
          flatSessions.push(...sessions);
        }
      }
      
      setAllSessions(flatSessions);
      // Start with the most recent session selected (last in the sorted array)
      const initialIndex = Math.max(0, flatSessions.length - 1);
      setSelectedIndex(initialIndex);
      // Initialize viewport to show the selected session at the bottom
      const initialViewportStart = Math.max(0, initialIndex - VIEWPORT_SIZE + 1);
      setViewportStart(initialViewportStart);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset selection when platform filter changes
  useEffect(() => {
    if (filteredSessions.length > 0) {
      const newIndex = Math.max(0, filteredSessions.length - 1);
      setSelectedIndex(newIndex);
      const initialViewportStart = Math.max(0, newIndex - VIEWPORT_SIZE + 1);
      setViewportStart(initialViewportStart);
    } else {
      setSelectedIndex(0);
      setViewportStart(0);
    }
  }, [filteredSessions, VIEWPORT_SIZE]);

  // Update viewport to ensure selected index is visible
  const updateViewport = (newSelectedIndex: number, totalSessions: number) => {
    setViewportStart(currentViewportStart => {
      const viewportEnd = currentViewportStart + VIEWPORT_SIZE - 1;
      
      // If selected index is outside current viewport, adjust viewport
      if (newSelectedIndex < currentViewportStart) {
        // Selected item is above viewport - move viewport up
        // Position the selected item at the top of the viewport
        const newViewportStart = Math.max(0, newSelectedIndex);
        return newViewportStart;
      } else if (newSelectedIndex > viewportEnd) {
        // Selected item is below viewport - move viewport down
        // Position the selected item at the bottom of the viewport
        const newViewportStart = Math.min(
          totalSessions - VIEWPORT_SIZE,
          newSelectedIndex - VIEWPORT_SIZE + 1
        );
        return Math.max(0, newViewportStart);
      }
      
      // No change needed
      return currentViewportStart;
    });
  };

  // Calculate visible sessions
  const visibleSessions = useMemo(() => {
    const end = Math.min(viewportStart + VIEWPORT_SIZE, filteredSessions.length);
    return filteredSessions.slice(viewportStart, end);
  }, [filteredSessions, viewportStart]);

  // Simple keyboard input handling
  useInput((input, key) => {
    if (key.upArrow && selectedIndex > 0) {
      const newIndex = selectedIndex - 1;
      setSelectedIndex(newIndex);
      updateViewport(newIndex, filteredSessions.length);
    }
    
    if (key.downArrow && selectedIndex < filteredSessions.length - 1) {
      const newIndex = selectedIndex + 1;
      setSelectedIndex(newIndex);
      updateViewport(newIndex, filteredSessions.length);
    }
    
    if (key.return && filteredSessions[selectedIndex]) {
      onUpload(filteredSessions[selectedIndex]);
    }
    
    if (input === 'q') {
      onExit();
    }
    
    if (input === 'r') {
      loadSessions();
    }
    
    if (input === 'g' && scope === 'cwd') {
      setScope('all');
    }
    
    if (input === 'c' && scope === 'all') {
      setScope('cwd');
    }

    // Platform filtering shortcuts
    if (input === '1') {
      setPlatformFilter('all');
    }
    
    if (input === '2') {
      setPlatformFilter('claude');
    }
    
    if (input === '3') {
      setPlatformFilter('gemini');
    }
    
    if (input === '4') {
      setPlatformFilter('qchat');
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="blue">🔍 Loading sessions...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">❌ Error: {error}</Text>
        <Text color="gray">Press 'r' to retry, 'q' to quit</Text>
      </Box>
    );
  }

  if (allSessions.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">
          📭 No sessions found {scope === 'cwd' ? 'in current directory' : 'anywhere'}
        </Text>
        <Text color="gray">
          {scope === 'cwd' ? "Press 'g' to search all directories, " : ""}Press 'r' to refresh, 'q' to quit
        </Text>
      </Box>
    );
  }

  if (filteredSessions.length === 0) {
    const platformNames = {
      claude: 'Claude',
      gemini: 'Gemini',  
      qchat: 'Q Chat'
    };
    
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">
          📭 No {platformNames[platformFilter]} sessions found {scope === 'cwd' ? 'in current directory' : 'anywhere'}
        </Text>
        <Text color="gray">
          Press '1' for all platforms, '2' for Claude, '3' for Gemini, '4' for Q
        </Text>
        <Text color="gray">
          {scope === 'cwd' ? "'g' for global search, " : ""}'r' to refresh, 'q' to quit
        </Text>
      </Box>
    );
  }

  const scopeText = scope === 'all' ? 'all projects' : process.cwd();
  const totalFilteredSessions = filteredSessions.length;
  const totalPages = Math.ceil(totalFilteredSessions / VIEWPORT_SIZE);
  
  // Calculate current page based on the viewport start position
  // Since we start at the bottom (most recent), we need to calculate from the end
  const currentPage = Math.max(1, totalPages - Math.floor((totalFilteredSessions - viewportStart - 1) / VIEWPORT_SIZE));

  // Platform filter display
  const platformFilterText = platformFilter === 'all' ? 'All Platforms' : 
    platformFilter === 'claude' ? 'Claude' :
    platformFilter === 'gemini' ? 'Gemini' : 'Q Chat';
  const platformCounts = {
    claude: allSessions.filter(s => s.platform === 'claude').length,
    gemini: allSessions.filter(s => s.platform === 'gemini').length,
    qchat: allSessions.filter(s => s.platform === 'qchat').length
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text color="blue" bold>
          📋 SessionBase - {allSessions.length} session{allSessions.length === 1 ? '' : 's'} ({scopeText})
        </Text>
        <Spacer />
        <Text color="gray">
          Page {currentPage}/{totalPages} • Showing {viewportStart + 1}-{Math.min(viewportStart + VIEWPORT_SIZE, totalFilteredSessions)} of {totalFilteredSessions}
        </Text>
      </Box>
      
      {/* Platform Filter Header */}
      <Box marginBottom={1} borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>🔍 {platformFilterText}</Text>
        <Spacer />
        <Text color="gray">🔷{platformCounts.claude} • 🔶{platformCounts.gemini} • 🤖{platformCounts.qchat}</Text>
      </Box>
      
      {/* Scroll indicators */}
      {viewportStart > 0 && (
        <Box justifyContent="center">
          <Text color="gray">↑ More above</Text>
        </Box>
      )}
      
      {/* Session list - show only visible sessions */}
      <Box flexDirection="column">
        {visibleSessions.map((session, visibleIndex) => {
          const actualIndex = viewportStart + visibleIndex;
          return (
            <SessionItem
              key={`${session.platform}-${session.filePath}`}
              session={session}
              isSelected={actualIndex === selectedIndex}
              index={totalFilteredSessions - actualIndex}
            />
          );
        })}
      </Box>
      
      {/* Scroll indicators */}
      {viewportStart + VIEWPORT_SIZE < totalFilteredSessions && (
        <Box justifyContent="center">
          <Text color="gray">↓ More below</Text>
        </Box>
      )}
      
      {/* Footer */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
        <Box flexDirection="column">
          <Text color="green">
            ↑/↓ Navigate • Enter Upload • q Quit • r Refresh
          </Text>
          <Text color="green">
            1 All • 2 Claude • 3 Gemini • 4 Q Chat
          </Text>
          {scope === 'cwd' && (
            <Text color="green">
              g Global search • c Current directory only
            </Text>
          )}
          {scope === 'all' && (
            <Text color="green">
              c Current directory only
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};

interface SessionItemProps {
  session: SessionData;
  isSelected: boolean;
  index: number;
}

const SessionItem: React.FC<SessionItemProps> = ({ session, isSelected, index }) => {
  const platformInfo = {
    claude: { emoji: '🔷', name: 'Claude Code', color: 'blue' as const },
    gemini: { emoji: '🔶', name: 'Gemini CLI', color: 'magenta' as const },
    qchat: { emoji: '🤖', name: 'Q Chat', color: 'cyan' as const }
  }[session.platform];

  const date = session.lastModified.toLocaleDateString();
  const time = session.lastModified.toLocaleTimeString();

  // Truncate session name if too long
  const maxNameLength = 50;
  const displayName = session.sessionName.length > maxNameLength 
    ? session.sessionName.substring(0, maxNameLength) + '...'
    : session.sessionName;

  // Truncate project path for better display
  const maxPathLength = 60;
  const displayPath = session.projectPath.length > maxPathLength
    ? '...' + session.projectPath.substring(session.projectPath.length - maxPathLength)
    : session.projectPath;

  return (
    <Box
      flexDirection="column"
      borderStyle={isSelected ? 'single' : undefined}
      borderColor={isSelected ? 'green' : undefined}
      padding={isSelected ? 1 : 0}
      marginY={0}
    >
      {/* Line 1: Index, Platform, and Session Name */}
      <Box>
        <Text color={isSelected ? 'green' : 'white'} bold>
          {isSelected ? '→ ' : '  '}{index}. {platformInfo.emoji} 
        </Text>
        <Text color={platformInfo.color} bold>
          [{platformInfo.name}]  
        </Text>
        <Text color={isSelected ? 'green' : 'white'} bold>
          {displayName}
        </Text>
      </Box>
      
      {/* Line 2: Metadata and Project Path */}
      <Box marginLeft={isSelected ? 0 : 2}>
        <Text color="gray">
          💬 {session.messageCount} msgs • 🔧 {session.toolCalls} tools • 📅 {date}
        </Text>
        <Text color={platformInfo.color}> • 📁 {displayPath}</Text>
      </Box>
      
      {/* Line 3: Preview or Model info */}
      <Box marginLeft={isSelected ? 0 : 2}>
        {session.firstMessagePreview ? (
          <Text color="cyan">💭 "{session.firstMessagePreview}"</Text>
        ) : session.model && session.platform === 'qchat' ? (
          <Text color="blue">
            🤖 {session.model.replace('CLAUDE_SONNET_4_20250514_V1_0', 'Claude Sonnet 4')}
          </Text>
        ) : (
          <Text color="dim">💭 No preview available</Text>
        )}
      </Box>
    </Box>
  );
};