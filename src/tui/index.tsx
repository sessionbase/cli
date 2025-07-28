import React, { useState } from 'react';
import { render, Text, Box } from 'ink';
import { SessionList } from './components/SessionList.js';
import { SessionData } from './utils/sessionService.js';
import { getToken } from '../auth.js';
import { BASE_URL } from '../config.js';
import chalk from 'chalk';
import ora from 'ora';

type AppState = 'loading' | 'list' | 'uploading' | 'success' | 'error';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>('list');
  const [selectedSession, setSelectedSession] = useState<SessionData | null>(null);
  const [uploadResult, setUploadResult] = useState<{ id: string; url?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (session: SessionData) => {
    setSelectedSession(session);
    setState('uploading');
    
    try {
      // Check authentication
      const token = await getToken();
      if (!token) {
        // Trigger OAuth flow
        const { createLoginCommand } = await import('../commands/login.js');
        const loginCommand = createLoginCommand();
        
        // This is a bit tricky in TUI context - we might need to exit and ask user to login
        setError('Authentication required. Please run `sessionbase login` first, then try again.');
        setState('error');
        return;
      }

      // Read session file
      const fs = await import('node:fs');
      
      let content: string;
      let sessionData: any;
      
      // Handle different session types
      if (session.platform === 'qchat') {
        // Q Chat sessions are in database, we need to export them differently
        // For now, show error that Q Chat upload isn't implemented yet
        setError('Q Chat session upload not yet implemented in TUI mode. Please use CLI: sessionbase upload --qchat');
        setState('error');
        return;
      } else {
        // Read file for Claude/Gemini
        content = fs.readFileSync(session.filePath, 'utf-8');
        
        const isJsonl = session.filePath.endsWith('.jsonl');
        
        if (isJsonl) {
          // Convert JSONL to JSON (Claude format)
          const lines = content.trim().split('\n').filter(line => line.trim());
          const entries = lines.map(line => JSON.parse(line));
          
          const firstEntry = entries[0];
          const claudeSessionId = firstEntry?.sessionId;
          const claudeCwd = firstEntry?.cwd;
          
          sessionData = {
            messages: entries,
            title: `JSONL Import ${new Date().toISOString().split('T')[0]}`,
            platform: 'claude-code',
            sessionId: claudeSessionId,
            cwd: claudeCwd
          };
        } else {
          // Parse regular JSON (Gemini format)
          const parsed = JSON.parse(content);
          
          if (Array.isArray(parsed) && parsed.length > 0 && 
              parsed.some(msg => 
                msg.role && ['user', 'model'].includes(msg.role) && 
                msg.parts && Array.isArray(msg.parts) &&
                msg.parts.some(part => part.text || part.functionCall || part.functionResponse)
              )) {
            // Wrap Gemini CLI array in standard format
            sessionData = {
              messages: parsed,
              title: `Gemini CLI Session ${new Date().toISOString().split('T')[0]}`,
              platform: 'gemini-cli'
            };
          } else {
            sessionData = parsed;
          }
        }
      }

      // Validate messages exist
      if (!sessionData.messages || !Array.isArray(sessionData.messages)) {
        setError('Session file must contain a "messages" array');
        setState('error');
        return;
      }

      // Build the payload
      const payload = {
        messages: sessionData.messages,
        isPrivate: false,
        title: sessionData.title || 'Untitled Session',
        summary: sessionData.summary || '',
        tags: sessionData.tags || [],
        tokenCount: sessionData.tokenCount || 0,
        messageCount: sessionData.messages.length,
        modelName: sessionData.modelName || 'unknown',
        platform: sessionData.platform || session.platform,
        ...(sessionData.sessionId && { sessionId: sessionData.sessionId }),
        ...(sessionData.cwd && { cwd: sessionData.cwd })
      };

      // Make the API call
      const response = await fetch(`${BASE_URL}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        setError(`Upload failed: ${response.status} ${response.statusText} - ${errorText}`);
        setState('error');
        return;
      }

      const result = await response.json();
      setUploadResult(result);
      setState('success');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setState('error');
    }
  };

  const handleExit = () => {
    process.exit(0);
  };

  const handleRetry = () => {
    setState('list');
    setError(null);
    setUploadResult(null);
    setSelectedSession(null);
  };

  if (state === 'uploading') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="blue">🚀 Uploading session: {selectedSession?.sessionName}</Text>
        <Text color="gray">Please wait...</Text>
      </Box>
    );
  }

  if (state === 'success' && uploadResult) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green">✅ Session uploaded successfully!</Text>
        <Text color="white">Session ID: {uploadResult.id}</Text>
        {uploadResult.url && (
          <Text color="blue">URL: {uploadResult.url}</Text>
        )}
        <Text color="gray" marginTop={1}>Press any key to continue, 'q' to quit</Text>
      </Box>
    );
  }

  if (state === 'error' && error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">❌ Error: {error}</Text>
        <Text color="gray" marginTop={1}>Press 'r' to retry, 'q' to quit</Text>
      </Box>
    );
  }

  return (
    <SessionList 
      onUpload={handleUpload}
      onExit={handleExit}
    />
  );
};

export async function launchTUI() {
  const { waitUntilExit } = render(<App />);
  await waitUntilExit();
}