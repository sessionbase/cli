import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';
import { App } from '../tui/App.js';

export const dashboardCommand = new Command('dashboard')
  .description('Launch interactive TUI dashboard')
  .action(async () => {
    try {
      const { unmount, waitUntilExit } = render(React.createElement(App));
      
      await waitUntilExit();
      unmount();
    } catch (error) {
      console.error('Dashboard error:', error);
      process.exit(1);
    }
  });

