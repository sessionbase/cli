import React from 'react';
import { Box, Text } from 'ink';

interface StatsCardProps {
  label: string;
  value: string | number;
  color?: string;
}

export const StatsCard: React.FC<StatsCardProps> = ({ label, value, color = 'cyan' }) => {
  // Format large numbers (e.g., 302758 → "302.8K")
  const formatValue = (val: string | number): string => {
    if (typeof val === 'string') return val;
    
    if (val >= 1000000) {
      return `${(val / 1000000).toFixed(1)}M`;
    } else if (val >= 1000) {
      return `${(val / 1000).toFixed(1)}K`;
    }
    return val.toString();
  };

  return (
    <Box flexDirection="column" paddingX={2}>
      <Text dimColor>{label}</Text>
      <Text bold color={color}>{formatValue(value)}</Text>
    </Box>
  );
};

