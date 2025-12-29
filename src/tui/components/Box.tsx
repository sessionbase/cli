import React from 'react';
import { Box as InkBox, Text } from 'ink';
import chalk from 'chalk';

interface BorderedBoxProps {
  title?: string;
  children: React.ReactNode;
  borderColor?: string;
  width?: number | string;
  height?: number;
  padding?: number;
}

export const BorderedBox: React.FC<BorderedBoxProps> = ({
  title,
  children,
  borderColor = 'cyan',
  width,
  height,
  padding = 1,
}) => {
  const colorFn = (chalk as any)[borderColor] || chalk.cyan;
  
  return (
    <InkBox flexDirection="column" width={width} height={height}>
      {title && (
        <InkBox>
          <Text color={borderColor}>{title}</Text>
        </InkBox>
      )}
      <InkBox
        flexDirection="column"
        borderStyle="round"
        borderColor={borderColor}
        padding={padding}
      >
        {children}
      </InkBox>
    </InkBox>
  );
};

