import { z } from 'zod';
import { SessionbaseCLI } from './cli-wrapper.js';

const cli = new SessionbaseCLI();

export const listSessionsTool = {
  name: 'list_sessions',
  description: 'List local chat sessions from Claude Code, Gemini CLI, and Amazon Q Chat',
  inputSchema: z.object({
    claude: z.boolean().optional().describe('Filter for Claude Code sessions only'),
    gemini: z.boolean().optional().describe('Filter for Gemini CLI sessions only'),
    qchat: z.boolean().optional().describe('Filter for Amazon Q Chat sessions only'),
    path: z.string().optional().describe('Filter sessions by specific directory path'),
    global: z.boolean().optional().describe('Include sessions from all projects')
  }),
  handler: async (params: {
    claude?: boolean;
    gemini?: boolean;
    qchat?: boolean;
    path?: string;
    global?: boolean;
  }) => {
    try {
      const result = await cli.listSessions(params);
      return {
        content: [{
          type: 'text' as const,
          text: result
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error listing sessions: ${error}`
        }],
        isError: true
      };
    }
  }
};

export const uploadSessionTool = {
  name: 'upload_session',
  description: 'Upload a chat session to SessionBase. IMPORTANT: Always generate a descriptive title, relevant tags, and helpful summary based on the conversation content to make the session discoverable and useful.',
  inputSchema: z.object({
    filePath: z.string().optional().describe('Path to the session file (.json or .jsonl)'),
    claude: z.boolean().optional().describe('Upload most recent Claude Code session from current directory'),
    gemini: z.boolean().optional().describe('Upload most recent Gemini CLI session from current directory'),
    qchat: z.boolean().optional().describe('Upload most recent Amazon Q Chat session from current directory'),
    private: z.boolean().optional().describe('Make the session private'),
    title: z.string().optional().describe('RECOMMENDED: Generate a clear, descriptive title that summarizes what was accomplished or discussed in this session (e.g., "Built SessionBase MCP Server", "Debugged React Authentication Issues")'),
    tags: z.string().optional().describe('RECOMMENDED: Generate relevant comma-separated tags based on technologies, topics, or tasks discussed (e.g., "typescript,mcp,sessionbase,api" or "react,debugging,authentication,frontend")'),
    summary: z.string().optional().describe('RECOMMENDED: Generate a 1-2 sentence summary of the key outcomes, solutions, or learnings from this conversation to help others understand the session\'s value')
  }),
  handler: async (params: {
    filePath?: string;
    claude?: boolean;
    gemini?: boolean;
    qchat?: boolean;
    private?: boolean;
    title?: string;
    tags?: string;
    summary?: string;
  }) => {
    try {
      const result = await cli.uploadSession(params.filePath, {
        claude: params.claude,
        gemini: params.gemini,
        qchat: params.qchat,
        private: params.private,
        title: params.title,
        tags: params.tags,
        summary: params.summary
      });
      return {
        content: [{
          type: 'text' as const,
          text: result
        }]
      };
    } catch (error) {
      const errorMessage = String(error);
      
      // Check if this is a Gemini session not found error
      if (params.gemini && errorMessage.includes('No Gemini CLI checkpoints found for project:')) {
        return {
          content: [{
            type: 'text' as const,
            text: `No Gemini CLI checkpoints found for this project. To create a session that can be uploaded, run \`/chat save\` in your Gemini CLI session first, then try uploading again.`
          }],
          isError: true
        };
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: `Error uploading session: ${error}`
        }],
        isError: true
      };
    }
  }
};

export const whoamiTool = {
  name: 'whoami',
  description: 'Show current SessionBase authentication status and user information',
  inputSchema: z.object({}),
  handler: async () => {
    try {
      const result = await cli.whoami();
      return {
        content: [{
          type: 'text' as const,
          text: result
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error checking authentication status: ${error}`
        }],
        isError: true
      };
    }
  }
};