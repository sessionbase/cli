import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  isFocused: boolean;
  placeholder?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  isFocused,
  placeholder = 'Search sessions...',
}) => {
  return (
    <Box>
      <Text color="cyan">Search: </Text>
      <TextInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        focus={isFocused}
      />
    </Box>
  );
};

