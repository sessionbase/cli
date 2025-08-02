# SessionBase CLI UX Enhancement Plan

## Current UX Pain Points

### Platform Inconsistencies
- **QChat**: Requires `/save` command → `sessionbase upload [path]` OR `sessionbase list --qchat` (only shows most recent) → copy path → upload
- **Claude**: `sessionbase list --claude` → copy path → upload (don't use `/export` due to lost context)
- **Gemini**: Either `/chat save [filename]` → upload OR `sessionbase list --gemini` → copy path → upload

### Key Issues
1. **Inconsistent workflows** - Each platform requires different approaches
2. **Manual path copying** - Users must copy/paste file paths from list commands  
3. **Platform limitations** - QChat only shows most recent session, different export behaviors
4. **Cognitive overhead** - Users must remember different commands for different platforms

## Proposed Solutions

### Phase 1: Smart Upload + TUI (Quick Win)

#### New Upload Command Structure
```bash
# Primary use case - upload most recent session from platform
sessionbase upload --claude    # Auto-finds most recent Claude session in cwd
sessionbase upload --gemini    # Auto-finds most recent Gemini session in cwd  
sessionbase upload --qchat     # Auto-finds most recent QChat session in cwd

# Explicit file path (power users, automation)
sessionbase upload path/to/session.jsonl
sessionbase upload path/to/session.json

# Error handling
sessionbase upload             # → "Please specify a platform (--claude, --gemini, --qchat) or provide a file path"
sessionbase upload --claude ./session.json  # → "Cannot specify both platform and file path"
```

#### Hybrid Command Structure
```bash
sessionbase                    # Opens TUI (default - new behavior)
sessionbase list --claude      # CLI list command (existing)
sessionbase upload --claude    # Smart upload command (new primary UX)
sessionbase login             # CLI login command (existing)
sessionbase --help            # CLI help (existing)
```

#### TUI Features
- **Zero friction entry**: Just type `sessionbase`
- **Rich session previews**: Show metadata, message counts, tool calls
- **Keyboard shortcuts**: Arrow keys for navigation, Enter to upload, 'q' to quit
- **Platform filtering**: Tab between Claude/Gemini/QChat sessions
- **Batch operations**: Multi-select for bulk uploads
- **Full backwards compatibility**: All existing CLI commands still work

#### Implementation Options
- **Option 1**: `ink` (React-like TUI framework)
- **Option 2**: `blessed` or `terminal-kit` for more control  
- **Option 3**: Simple `inquirer.js` for basic selection interface

#### Entry Point Logic
```typescript
// In src/index.ts - if no arguments provided, launch TUI
if (process.argv.length === 2) {
  await launchTUI();
  process.exit(0);
}

// Otherwise process CLI commands normally
program.parseAsync(process.argv)
```

### Phase 2: MCP Server Integration (Highest UX Value)

#### Natural Language Upload
```
User: "Upload this session to sessionbase"
MCP Server: *detects platform, finds session file, uploads*

User: "Upload this with tags 'debugging, react' and make it private"  
MCP Server: *applies metadata and uploads*
```

#### Detection Strategy
1. **Platform detection** from chat context/environment variables
2. **Session matching** via session ID or first message hash
3. **Timing heuristic** (recent file activity within 5 minutes)
4. **Fallback prompts** if multiple matches found

#### Technical Challenges
- Session detection in active chat vs completed session files
- Platform detection accuracy across different environments
- Handling edge cases (multiple sessions, interrupted sessions)

### Phase 3: Advanced Features + Enhanced CLI

#### Additional Upload Options
```bash
sessionbase upload --interactive              # Numbered selection interface across all platforms
sessionbase upload --select-multiple          # Bulk upload interface
```

#### Enhanced List Integration
```bash
sessionbase list --claude --upload            # List with upload prompts
```

#### Implementation Logic
```typescript
// Mutually exclusive: platform flags OR file path
.argument('[file]', 'Path to specific session file')
.option('--claude', 'Upload most recent Claude session in current directory')
.option('--gemini', 'Upload most recent Gemini session in current directory') 
.option('--qchat', 'Upload most recent QChat session in current directory')
.action(async (filePath, options) => {
  const platformFlags = [options.claude, options.gemini, options.qchat].filter(Boolean);
  
  if (filePath && platformFlags.length > 0) {
    console.error('Cannot specify both platform and file path');
    process.exit(1);
  }
  
  if (filePath) {
    await uploadFile(filePath, options);
  } else if (platformFlags.length === 1) {
    const recentFile = await findMostRecentSession(options);
    await uploadFile(recentFile, options);
  } else {
    console.error('Please specify a platform (--claude, --gemini, --qchat) or provide a file path');
    process.exit(1);
  }
});
```

## Implementation Task Breakdown

### Phase 1: Smart Upload 

#### Core Upload Command

- [x] Smart upload command with platform flags (`sessionbase upload --claude`) uploads most recent session in current working directory
- [x] Mutually exclusive platform/file path arguments
- [x] Clear up naming with --all vs --global etc. it's confusing that --all means all directories when there are also multiple platforms
- [x] Support for upload of q chat session stored in sqlite db, try to get a timestamp for the session

#### Integration & Polish
- [ ] Update help text and documentation
- [ ] Performance benchmarking
- [ ] Cross-platform testing (Windows, macOS, Linux)

### Phase 2: MCP Server Integration (Medium Term - Highest UX Value)

#### MCP Server Foundation
- [ ] Basic MCP server setup and registration
- [ ] Platform detection logic (Claude, Gemini, QChat)
- [ ] Session file detection and matching
- [ ] Natural language command parsing
- [ ] Error handling and fallback prompts

#### Upload Integration
- [ ] Session ID matching for active chats
- [ ] File timestamp heuristics (5-minute window)
- [ ] Metadata extraction and application
- [ ] Privacy settings integration
- [ ] Tag, title, summary application from natural language

#### Advanced Detection
- [ ] Multi-session handling
- [ ] Interrupted session recovery
- [ ] Environment variable detection
- [ ] Context-aware platform switching

### Phase 3: Advanced Features (Future Enhancement)

#### Enhanced CLI Options
- [ ] Bulk upload workflows

#### Workflow Automation
- [ ] Configuration file support
- [ ] Default platform preferences
- [ ] Custom upload scripts
- [ ] Webhook integration for automated uploads
- [ ] API rate limiting and retry logic

#### Documentation & UX
- [ ] Comprehensive platform-specific guides
- [ ] Video tutorials for common workflows
- [ ] Migration guide from current workflows
- [ ] Troubleshooting documentation
- [ ] Community examples and templates
