# SessionBase CLI

CLI tool for SessionBase - manage and share AI chat sessions from Claude Code, Gemini CLI, and Amazon Q Chat.

## Quick Start

### Installation

Install the SessionBase CLI globally:

```bash
npm install -g @sessionbase/cli
```

This provides two commands:
- `sessionbase` - Main CLI interface
- `sessionbase-mcp` - MCP server for AI platforms

### Authentication

Authenticate with your SessionBase account:

```bash
sessionbase login
```

This will open your browser to complete the authentication process with GitHub or Google.

Verify you're logged in:

```bash
sessionbase whoami
```

### Push Your First Session

Push your most recent AI chat session:

```bash
# From Claude Code
sessionbase push --claude

# From Gemini CLI (after saving with /chat save)
sessionbase push --gemini

# From Amazon Q Chat
sessionbase push --qchat
```

## MCP Server Setup (Recommended)

The MCP server enables you to push sessions directly from your AI chat without breaking your workflow.

### Claude Code

```bash
claude mcp add sessionbase sessionbase-mcp --scope user
```

### Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "sessionbase": {
      "command": "sessionbase-mcp"
    }
  }
}
```

### Amazon Q Chat

Add to `~/.aws/amazonq/mcp.json`:

```json
{
  "mcpServers": {
    "sessionbase": {
      "command": "sessionbase-mcp"
    }
  }
}
```

## Usage Examples

### CLI Commands

```bash
# List all sessions
sessionbase list --global

# Push with metadata
sessionbase push --claude --title "Debug Session" --tags "debugging,api" --private

# Push specific file
sessionbase push /path/to/session.json
```

### MCP Server (Natural Language)

Once configured, use natural language in your AI chat:

- "Push this to SessionBase"
- "List my recent Claude Code sessions"  
- "Push this session as private with the tags 'API debugging'"

## Platform Support

| Platform | Local Storage | SessionBase Access |
|----------|----------------|-------------------|
| **Claude Code** | Stores all session files automatically | Can push current session or list/choose from directory |
| **Gemini CLI** | Only stores if you use `/chat save` | Can push saved sessions and list/choose from directory |
| **Amazon Q Chat** | Only stores most recent session per directory | Can detect and push current session automatically |

## Troubleshooting

### "No such file or directory" Error

Ensure the package is installed globally:

```bash
npm install -g @sessionbase/cli
which sessionbase-mcp  # Should show the binary path
```

### Authentication Issues

Verify you're logged in:

```bash
sessionbase whoami
```

If not authenticated, run `sessionbase login` again.

## Development

### Setup
```bash
# Install dependencies
npm install

# Build the CLI
npm run build

# Link globally for testing
npm link

# Verify installation
sessionbase --help
sessionbase --version
```

### Unlink (when done testing)
```bash
npm unlink -g
```
