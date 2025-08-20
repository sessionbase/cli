export type SupportedPlatform = 'qchat' | 'claude-code' | 'gemini-cli';

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
  sessionId?: string;
  cwd?: string;
  // Allow platform-specific fields
  [key: string]: any;
}

export interface SessionInfo extends SessionData {
  id: string;
  filePath: string;
  projectPath: string;
  lastModified: Date;
  firstMessagePreview?: string;
  toolCalls?: number;
}

export interface SessionProvider {
  readonly platform: SupportedPlatform;
  readonly displayName: string;
  readonly emoji: string;
  
  /**
   * Check if this platform is available on the current system
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * List all sessions for this platform
   * @param filterPath - Optional path to filter sessions by
   * @param showGlobal - Whether to show sessions from all projects
   */
  listSessions(filterPath?: string, showGlobal?: boolean): Promise<SessionInfo[]>;
  
  /**
   * Find the most recent session for a given path
   * @param targetPath - The target directory path
   * @param options - Platform-specific options (e.g., force flag for Gemini)
   */
  findMostRecentSession(targetPath: string, options?: any): Promise<string | null>;
  
  /**
   * Parse a session file into standardized SessionData format
   * @param filePath - Path to the session file
   */
  parseSession(filePath: string): Promise<SessionData>;
  
  /**
   * Format a session for display in the CLI
   * @param session - The session info to format
   */
  formatSessionDisplay(session: SessionInfo): string;
}