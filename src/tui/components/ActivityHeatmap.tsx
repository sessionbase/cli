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
    if (count === -1) return '  '; // Placeholder (double-width)
    if (count === 0) return '░░';

    // Color intensity based on count (double-width blocks)
    const intensity = count / maxCount;
    if (intensity >= 0.75) return '██';
    if (intensity >= 0.5) return '▓▓';
    if (intensity >= 0.25) return '▒▒';
    return '░░';
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
      {/* Day labels - wider spacing for double-width blocks */}
      <Box marginBottom={0}>
        <Text dimColor>M   T   W   T   F   S   S</Text>
      </Box>

      {/* Heatmap grid - double-width blocks */}
      <Box flexDirection="column">
        {weeks.map((week, weekIdx) => (
          <Box key={weekIdx}>
            {week.map((day, dayIdx) => (
              <Text key={dayIdx} color={getColor(day.count)}>
                {getBlock(day.count)}{dayIdx < 6 ? ' ' : ''}
              </Text>
            ))}
          </Box>
        ))}
      </Box>

      {/* Compact inline legend */}
      <Box marginTop={1}>
        <Text dimColor>
          Legend: <Text color="cyan">██</Text> high <Text color="cyan">▓▓</Text> med <Text color="cyan">▒▒</Text> low <Text color="cyan">░░</Text> none
        </Text>
      </Box>
    </Box>
  );
};

