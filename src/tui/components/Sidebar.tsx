import React from 'react';
import { Box, Text } from 'ink';
import { View } from '../types.js';

interface SidebarProps {
  currentView: View;
  isAuthenticated: boolean;
  userName?: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, isAuthenticated, userName }) => {
  const menuItems: Array<{ key: View; label: string; shortcut: string }> = [
    { key: 'dashboard', label: 'Dashboard', shortcut: '1' },
    { key: 'sessions', label: 'Sessions', shortcut: '2' },
  ];

  return (
    <Box
      flexDirection="column"
      minWidth={20}
      borderStyle="round"
      borderColor="cyan"
      padding={1}
    >
      {/* App Title */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          SessionBase
        </Text>
      </Box>

      {/* Separator */}
      <Box marginBottom={1}>
        <Text dimColor>{'─'.repeat(18)}</Text>
      </Box>

      {/* Navigation Menu with shortcuts */}
      <Box flexDirection="column" marginBottom={1}>
        {menuItems.map((item) => {
          const isActive = currentView === item.key;
          return (
            <Box key={item.key} justifyContent="space-between">
              <Text color={isActive ? 'cyan' : undefined} bold={isActive}>
                {isActive ? '▸ ' : '  '}
                {item.label}
              </Text>
              <Text dimColor>[{item.shortcut}]</Text>
            </Box>
          );
        })}
      </Box>

      {/* Separator */}
      <Box marginBottom={1}>
        <Text dimColor>{'─'.repeat(18)}</Text>
      </Box>

      {/* Compact Auth Status */}
      <Box marginBottom={1}>
        <Text color={isAuthenticated ? 'green' : 'red'}>
          {isAuthenticated ? '✓ ' : '✗ '}
          <Text dimColor>@</Text>
          {isAuthenticated ? (userName || 'User') : 'Not logged in'}
        </Text>
      </Box>

      {/* Separator */}
      <Box marginBottom={1}>
        <Text dimColor>{'─'.repeat(18)}</Text>
      </Box>

      {/* Additional Shortcuts */}
      <Box flexDirection="column">
        <Text dimColor bold marginBottom={0}>
          Shortcuts
        </Text>
        <Box justifyContent="space-between">
          <Text dimColor>[/]</Text>
          <Text dimColor>Search</Text>
        </Box>
        <Box justifyContent="space-between">
          <Text dimColor>[q]</Text>
          <Text dimColor>Quit</Text>
        </Box>
      </Box>
    </Box>
  );
};

