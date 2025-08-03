#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolResult,
  ListToolsResult,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import {
  listSessionsTool,
  pushSessionTool,
  whoamiTool,
} from './tools.js';

class SessionBaseMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'sessionbase-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async (): Promise<ListToolsResult> => {
      return {
        tools: [
          {
            name: listSessionsTool.name,
            description: listSessionsTool.description,
            inputSchema: {
              type: "object",
              properties: {
                claude: { type: "boolean", description: "Filter for Claude Code sessions only" },
                gemini: { type: "boolean", description: "Filter for Gemini CLI sessions only" },
                qchat: { type: "boolean", description: "Filter for Amazon Q Chat sessions only" },
                path: { type: "string", description: "Filter sessions by specific directory path" },
                global: { type: "boolean", description: "Include sessions from all projects" }
              }
            },
          },
          {
            name: pushSessionTool.name,
            description: pushSessionTool.description,
            inputSchema: {
              type: "object",
              properties: {
                filePath: { type: "string", description: "Path to session file (.json or .jsonl)" },
                claude: { type: "boolean", description: "Push most recent Claude Code session" },
                gemini: { type: "boolean", description: "Push most recent Gemini CLI session" },
                qchat: { type: "boolean", description: "Push most recent Amazon Q Chat session" },
                private: { type: "boolean", description: "Make the session private" },
                title: { type: "string", description: "RECOMMENDED: Generate a clear, descriptive title that summarizes what was accomplished or discussed in this session (e.g., \"Built SessionBase MCP Server\", \"Debugged React Authentication Issues\")" },
                tags: { type: "string", description: "RECOMMENDED: Generate relevant comma-separated tags based on technologies, topics, or tasks discussed (e.g., \"typescript,mcp,sessionbase,api\" or \"react,debugging,authentication,frontend\")" },
                summary: { type: "string", description: "RECOMMENDED: Generate a 1-2 sentence summary of the key outcomes, solutions, or learnings from this conversation to help others understand the session's value" }
              }
            },
          },
          {
            name: whoamiTool.name,
            description: whoamiTool.description,
            inputSchema: {
              type: "object",
              properties: {}
            },
          },
        ] as Tool[],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case listSessionsTool.name:
            return await listSessionsTool.handler(args || {});

          case pushSessionTool.name:
            return await pushSessionTool.handler(args || {});

          case whoamiTool.name:
            return await whoamiTool.handler();

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${error}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Send a startup message to stderr for debugging
    console.error('SessionBase MCP Server started successfully');
  }
}

// Start the server
const server = new SessionBaseMCPServer();
server.run().catch((error) => {
  console.error('Failed to start SessionBase MCP Server:', error);
  process.exit(1);
});