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
      width={20}
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

      {/* Menu Items */}
      <Box flexDirection="column" marginBottom={1}>
        {menuItems.map((item) => {
          const isActive = currentView === item.key;
          return (
            <Box key={item.key} marginY={0}>
              <Text color={isActive ? 'cyan' : undefined} bold={isActive}>
                {isActive ? '→ ' : '  '}
                {item.label}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Spacer */}
      <Box flexGrow={1} />

      {/* Auth Status */}
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Text dimColor>Auth Status</Text>
        <Box>
          <Text color={isAuthenticated ? 'green' : 'red'}>
            {isAuthenticated ? '✓ ' : '✗ '}
            {isAuthenticated ? (userName || 'Authenticated') : 'Not logged in'}
          </Text>
        </Box>
      </Box>

      {/* Keyboard Shortcuts */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
        <Text dimColor bold>
          Shortcuts
        </Text>
        <Text dimColor>[1] Dashboard</Text>
        <Text dimColor>[2] Sessions</Text>
        <Text dimColor>[/] Search</Text>
        <Text dimColor>[q] Quit</Text>
      </Box>
    </Box>
  );
};

