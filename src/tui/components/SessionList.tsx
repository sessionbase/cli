import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, Spacer } from 'ink';
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

  // Load sessions
  useEffect(() => {
    loadSessions();
  }, [scope]);

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
      setSelectedIndex(Math.max(0, flatSessions.length - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  };

  // Simple keyboard input handling
  useInput((input, key) => {
    if (key.upArrow && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
    
    if (key.downArrow && selectedIndex < allSessions.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
    
    if (key.return && allSessions[selectedIndex]) {
      onUpload(allSessions[selectedIndex]);
    }
    
    if (input === 'q') {
      onExit();
    }
    
    if (input === 'r') {
      loadSessions();
    }
    
    if (input === 'a' && scope === 'cwd') {
      setScope('all');
    }
    
    if (input === 'c' && scope === 'all') {
      setScope('cwd');
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
          {scope === 'cwd' ? "Press 'a' to search all directories, " : ""}Press 'r' to refresh, 'q' to quit
        </Text>
      </Box>
    );
  }

  const scopeText = scope === 'all' ? 'all projects' : process.cwd();

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text color="blue" bold>
          📋 SessionBase - {allSessions.length} session{allSessions.length === 1 ? '' : 's'} ({scopeText})
        </Text>
      </Box>
      
      {/* Session list - show all sessions */}
      <Box flexDirection="column">
        {allSessions.map((session, index) => (
          <SessionItem
            key={`${session.platform}-${session.filePath}`}
            session={session}
            isSelected={index === selectedIndex}
            index={allSessions.length - index}
          />
        ))}
      </Box>
      
      {/* Footer */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
        <Box flexDirection="column">
          <Text color="green">
            ↑/↓ Navigate • Enter Upload • q Quit • r Refresh
          </Text>
          {scope === 'cwd' && (
            <Text color="green">
              a Show all directories • c Show current directory only
            </Text>
          )}
          {scope === 'all' && (
            <Text color="green">
              c Show current directory only
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
  const platformEmoji = {
    claude: '🔷',
    gemini: '🔶', 
    qchat: '🤖'
  }[session.platform];
  
  const platformColor = {
    claude: 'blue',
    gemini: 'magenta',
    qchat: 'cyan'
  }[session.platform] as any;

  const date = session.lastModified.toLocaleDateString();
  const time = session.lastModified.toLocaleTimeString();

  return (
    <Box
      flexDirection="column"
      borderStyle={isSelected ? 'single' : undefined}
      borderColor={isSelected ? 'green' : undefined}
      padding={isSelected ? 1 : 0}
      marginY={0}
    >
      {/* Main session info */}
      <Box>
        <Text color={isSelected ? 'green' : 'white'} bold>
          {isSelected ? '→ ' : '  '}{index}. {platformEmoji} {session.sessionName}
        </Text>
      </Box>
      
      {/* Metadata row */}
      <Box marginLeft={isSelected ? 0 : 2}>
        <Text color="gray">
          💬 {session.messageCount} messages • 📅 {date} {time}
        </Text>
        {session.toolCalls > 0 && (
          <Text color="magenta"> • 🔧 {session.toolCalls} tools</Text>
        )}
      </Box>
      
      {/* Preview */}
      {session.firstMessagePreview && (
        <Box marginLeft={isSelected ? 0 : 2}>
          <Text color="cyan">💭 "{session.firstMessagePreview}"</Text>
        </Box>
      )}
      
      {/* Project path */}
      <Box marginLeft={isSelected ? 0 : 2}>
        <Text color={platformColor}>📁 {session.projectPath}</Text>
      </Box>
      
      {/* File path */}
      <Box marginLeft={isSelected ? 0 : 2}>
        <Text color="dim">🗂️  {session.filePath}</Text>
      </Box>
      
      {/* Extra model info for Q */}
      {session.model && session.platform === 'qchat' && (
        <Box marginLeft={isSelected ? 0 : 2}>
          <Text color="blue">
            🤖 {session.model.replace('CLAUDE_SONNET_4_20250514_V1_0', 'Claude Sonnet 4')}
          </Text>
        </Box>
      )}
      
      {/* Spacing */}
      {!isSelected && <Text> </Text>}
    </Box>
  );
};