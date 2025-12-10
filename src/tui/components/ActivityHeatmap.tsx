import React from 'react';
import { Box, Text } from 'ink';
import { format, getDay } from 'date-fns';

interface ActivityHeatmapProps {
  activity: Array<{ date: Date; count: number }>;
}

export const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({ activity }) => {
  // Get the last 28 days (4 weeks)
  const last28Days = activity.slice(-28);
  
  // Group by weeks
  const weeks: Array<Array<{ date: Date; count: number }>> = [];
  let currentWeek: Array<{ date: Date; count: number }> = [];
  
  // Pad the beginning if needed to start on Monday
  const firstDayOfWeek = getDay(last28Days[0]?.date || new Date());
  const paddingDays = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Monday = 0 padding
  
  for (let i = 0; i < paddingDays; i++) {
    currentWeek.push({ date: new Date(0), count: -1 }); // Placeholder
  }
  
  // Fill in the actual days
  for (const day of last28Days) {
    currentWeek.push(day);
    
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  
  // Add remaining days to last week
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push({ date: new Date(0), count: -1 }); // Placeholder
    }
    weeks.push(currentWeek);
  }
  
  // Calculate max count for color intensity
  const maxCount = Math.max(...last28Days.map(d => d.count), 1);
  
  const getBlock = (count: number): string => {
    if (count === -1) return ' '; // Placeholder
    if (count === 0) return '░';
    
    // Color intensity based on count
    const intensity = count / maxCount;
    if (intensity >= 0.75) return '█';
    if (intensity >= 0.5) return '▓';
    if (intensity >= 0.25) return '▒';
    return '░';
  };
  
  const getColor = (count: number): string => {
    if (count === -1 || count === 0) return 'gray';
    
    const intensity = count / maxCount;
    if (intensity >= 0.75) return 'cyan';
    if (intensity >= 0.5) return 'cyan';
    if (intensity >= 0.25) return 'cyan';
    return 'cyan';
  };
  
  // Count active days (days with at least one session)
  const activeDays = last28Days.filter(d => d.count > 0).length;
  
  return (
    <Box flexDirection="column">
      <Text bold>Monthly Activity</Text>
      <Text dimColor>Last 28 days</Text>
      <Box marginTop={1}>
        <Text dimColor>M T W T F S S</Text>
      </Box>
      {weeks.map((week, weekIdx) => (
        <Box key={weekIdx}>
          {week.map((day, dayIdx) => (
            <Text key={dayIdx} color={getColor(day.count)}>
              {getBlock(day.count)}{' '}
            </Text>
          ))}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text>
          <Text color="cyan">🔥 </Text>
          <Text>{activeDays} active days</Text>
        </Text>
      </Box>
    </Box>
  );
};

