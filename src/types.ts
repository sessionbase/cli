export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface SessionData {
  messages: Message[];
  isPrivate?: boolean;
  title?: string;
  summary?: string;
  tags?: string[];
  tokenCount?: number;
  messageCount?: number;
  modelName?: string;
  platform?: string;
}

export interface UploadResponse {
  id: string;
  url: string;
  title: string;
  isPrivate: boolean;
}

export type SupportedPlatform = 'qchat' | 'claude-code' | 'gemini-cli';

export interface PlatformDetectionResult {
  platform: SupportedPlatform;
  modelName?: string;
  tokenCount?: number;
}
