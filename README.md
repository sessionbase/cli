<p align="center">
  <img src="./sessionbase-logo.png" alt="SessionBase" width="400" />
</p>

# SessionBase CLI

CLI tool for SessionBase - manage and share AI coding sessions from Claude Code, Gemini CLI, Amazon Q Chat, and OpenAI Codex CLI.

## Quick Start

For more detailed documentation, see [docs.sessionbase.ai](https://docs.sessionbase.ai).

### Installation

Install the SessionBase CLI globally:

```bash
npm install -g @sessionbase/cli
```

This provides two commands:
- `sessionbase` - Main CLI interface
 - `sb` - Shorthand alias for faster typing 
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

Note that all sessions are public and discoverable by default, unless you supply the `--private` flag. Private sessions are only visible to the owner of the session.

Push your most recent AI chat session:

```bash
# From Claude Code
sessionbase push --claude

# From Gemini CLI (after saving with /chat save)
sessionbase push --gemini

# From Amazon Q Chat
sessionbase push --qchat

# From OpenAI Codex CLI
sessionbase push --codex
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

### OpenAI Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.sessionbase]
command = "sessionbase-mcp"
```

## Usage Examples

### CLI Commands

```bash
# List all sessions
sessionbase ls --global

# Push private session with metadata
sessionbase push --claude --title "Debug Session" --tags "debugging,api" --private

# Push specific file
sessionbase push /path/to/session.json
```

### MCP Server (Natural Language)

Once configured, use natural language in your AI chat:

- "Push this to SessionBase"
- "Push this session as private with the tags 'API debugging'"

## Platform Support

| Platform | Local Storage | SessionBase Access |
|----------|----------------|-------------------|
| **Claude Code** | Stores all session files automatically | Can push current session or list/choose from directory |
| **Gemini CLI** | Only stores if you use `/chat save` | Can push saved sessions and list/choose from directory |
| **Amazon Q Chat** | Only stores most recent session per directory | Can detect and push current session automatically |
| **OpenAI Codex CLI** | Stores all session files automatically | Can push current session or list/choose from directory |

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
