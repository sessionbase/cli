import { z } from 'zod';
import { SessionbaseCLI } from './cli-wrapper.js';

const cli = new SessionbaseCLI();

export const listSessionsTool = {
  name: 'list_sessions',
  description: 'List local chat sessions from Claude Code, Gemini CLI, Amazon Q Chat, and OpenAI Codex',
  inputSchema: z.object({
    claude: z.boolean().optional().describe('Filter for Claude Code sessions only'),
    gemini: z.boolean().optional().describe('Filter for Gemini CLI sessions only'),
    qchat: z.boolean().optional().describe('Filter for Amazon Q Chat sessions only'),
    codex: z.boolean().optional().describe('Filter for OpenAI Codex sessions only'),
    path: z.string().optional().describe('Filter sessions by specific directory path'),
    global: z.boolean().optional().describe('Include sessions from all projects')
  }),
  handler: async (params: {
    claude?: boolean;
    gemini?: boolean;
    qchat?: boolean;
    codex?: boolean;
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

export const pushSessionTool = {
  name: 'push_session',
  description: 'Push a chat session to SessionBase. IMPORTANT: You must specify which client you are - if you are Claude Code, use claude=true; if you are Gemini CLI, use gemini=true; if you are Amazon Q Chat, use qchat=true; if you are OpenAI Codex, use codex=true. Always generate a descriptive title, relevant tags, and helpful summary based on the conversation content to make the session discoverable and useful. If a Gemini session is stale (>10 minutes old), you can use the force parameter to push it anyway.',
  inputSchema: z.object({
    claude: z.boolean().optional().describe('Set to true if you are Claude Code'),
    gemini: z.boolean().optional().describe('Set to true if you are Gemini CLI'),
    qchat: z.boolean().optional().describe('Set to true if you are Amazon Q Chat'),
    codex: z.boolean().optional().describe('Set to true if you are OpenAI Codex'),
    private: z.boolean().optional().describe('Make the session private'),
    title: z.string().optional().describe('RECOMMENDED: Generate a clear, descriptive title that summarizes what was accomplished or discussed in this session (e.g., "Built SessionBase MCP Server", "Debugged React Authentication Issues")'),
    tags: z.string().optional().describe('RECOMMENDED: Generate relevant comma-separated tags based on technologies, topics, or tasks discussed (e.g., "typescript,mcp,sessionbase,api" or "react,debugging,authentication,frontend")'),
    summary: z.string().optional().describe('RECOMMENDED: Generate a 1-2 sentence summary of the key outcomes, solutions, or learnings from this conversation to help others understand the session\'s value'),
    force: z.boolean().optional().describe('Set to true to push old Gemini checkpoints without age verification. Use when user wants to proceed with stale sessions.')
  }),
  handler: async (params: {
    claude?: boolean;
    gemini?: boolean;
    qchat?: boolean;
    codex?: boolean;
    private?: boolean;
    title?: string;
    tags?: string;
    summary?: string;
    force?: boolean;
  }) => {
    try {
      // Check if no client was specified
      if (!params.claude && !params.gemini && !params.qchat && !params.codex) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ **No client specified**

You must specify which AI client you are:
- If you are **Claude Code**, use: claude=true
- If you are **Gemini CLI**, use: gemini=true  
- If you are **Amazon Q Chat**, use: qchat=true
- If you are **OpenAI Codex**, use: codex=true

Example: \`sessionbase push --claude\``
          }],
          isError: true
        };
      }

      const result = await cli.pushSession(undefined, {
        claude: params.claude,
        gemini: params.gemini,
        qchat: params.qchat,
        codex: params.codex,
        private: params.private,
        title: params.title,
        tags: params.tags,
        summary: params.summary,
        force: params.force
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
            text: `No Gemini CLI checkpoints found for this project. To create a session that can be pushed, run \`/chat save\` in your Gemini CLI session first, then try pushing again.`
          }],
          isError: true
        };
      }
      
      // Check if this is a stale checkpoint error (non-interactive mode)
      if (params.gemini && errorMessage.includes('Checkpoint is') && errorMessage.includes('old. Use --force to proceed')) {
        // Extract the age from the error message
        const ageMatch = errorMessage.match(/Checkpoint is (.+?) old\./);
        const age = ageMatch ? ageMatch[1] : 'more than 10 minutes';
        
        return {
          content: [{
            type: 'text' as const,
            text: `⚠️  **Stale Gemini Checkpoint Detected**

The most recent Gemini CLI checkpoint is **${age} old**.

**You need to choose one of these options:**

1. **Create fresh checkpoint**: 
   - Switch to your Gemini CLI terminal
   - Run \`/chat save <tag>\` to create a new checkpoint
   - Then come back and try pushing again

2. **Push old session anyway**: 
   - I can push the old session using the force option

The MCP cannot run \`/chat save\` for you - you must do this in your actual Gemini CLI session.`
          }],
          isError: false
        };
      }
      
      // Check if this is a user-cancelled upload due to old checkpoint
      if (params.gemini && errorMessage.includes('Upload cancelled')) {
        return {
          content: [{
            type: 'text' as const,
            text: `Upload cancelled due to old checkpoint. Run \`/chat save <tag>\` in your Gemini CLI session to create a fresh checkpoint, then try pushing again.`
          }],
          isError: false // This is intentional cancellation, not an error
        };
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: `Error pushing session: ${error}`
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