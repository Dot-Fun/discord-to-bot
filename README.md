# JIRA Manager

An AI-powered project management system that integrates Claude AI with JIRA, Confluence, and Discord through Model Context Protocol (MCP) to create intelligent development workflows.

## Quick Start

1. **Clone and Setup**

   Copy and paste the following into your terminal:

   ```bash
   # Clone the repository
   mkdir dotfun
   cd dotfun
   git clone https://github.com/Dot-Fun/jira-manager.git
   cd jira-manager

   # Run setup script
   ./scripts/setup.sh
   ```

   Follow these instructions:
   https://start.1password.com/open/i?a=EOWIIJAUAFH3PA3ASTBVPQR43Q&v=wqxlqfoy7zgb7jwhoivqpn5ldq&i=ymhlpptz4zfa3djx4idmyobf6q&h=team-dotfun.1password.com

   This will:

   - Check for Node.js 18+ (prompts to install if missing)
   - Install npm dependencies and git hooks
   - Install Claude Code and Gemini CLI tools
   - Set up Discord integration
   - Create `.mcp.json` configuration
   - Create `.gemini/settings.json` configuration
   - Configure MCP servers for Atlassian and Discord

2. **Gmail Setup (Optional)**

   ```bash
   # Login to Gmail MCP server
   npx @emails-ai/mcp-server-gmail auth login

   # Follow the OAuth flow in your browser
   ```

3. **Google Calendar Setup (Optional)**

   ```bash
   # Login to Google Calendar MCP server
   npx @modelcontextprotocol/server-google-calendar auth login

   # Follow the OAuth flow in your browser
   ```

4. **Start Claude or Gemini**

   ```bash
   # For Claude
   claude

   # For Gemini
   gemini
   ```

5. **Prime the Project Context**

   ```bash
   /prime
   ```

6. **Check Current Sprint**
   ```bash
   /read_board
   ```

![JIRA Manager](assets/Jira%20Manager.png)

## Overview

JIRA Manager transforms how teams interact with JIRA by providing an AI assistant that understands your project context and automates repetitive tasks. It seamlessly integrates with:

📚 **[View our AI Integration Guide](https://dotfun.atlassian.net/wiki/spaces/RUNGOOD/pages/85884930)** - Learn how to supercharge your workflows with AI

- **JIRA** - For issue tracking, sprint management, and reporting
- **Confluence** - For documentation sync and knowledge management
- **Discord** - For team notifications and bot commands
- **GitHub** - For automated PR creation and code review

## Key Features

### 🤖 Intelligent Automation

- Automatic story point estimation (1 point = 1 hour)
- Smart issue creation with proper formatting
- Automated PR creation with JIRA links
- Sprint velocity tracking and analysis

### 📊 Project Management Commands

- `/prime` - Initialize project context and analyze current state
- `/project-management` - Comprehensive JIRA project management
- `/read_board` - Visualize current sprint and board status
- `/check-velocity` - Analyze team velocity and performance
- `/story-point` - Estimate story points for issues

### 🔧 Development Workflow Commands

- `/work_on_ticket_support_engineer` - QA workflow with automated testing
- `/confluence` - Sync documentation between local and Confluence
- `/technicalManager` - Technical planning and architecture decisions

## Project Structure

```
jira-manager/
├── .claude/
│   ├── commands/           # AI command definitions
│   │   ├── check-velocity.md
│   │   ├── confluence.md
│   │   ├── prime.md
│   │   ├── project-management.md
│   │   ├── read_board.md
│   │   ├── story-point.md
│   │   └── work_on_ticket_support_engineer.md
│   ├── settings.json       # Global settings
│   └── settings.local.json # Local overrides
├── ai_docs/               # AI integration documentation
│   ├── anthropic-tool-use.md
│   ├── discord-settings.md
│   ├── jira-settings.md
│   └── jira-and-confluence-tool-use.md
├── mcp-servers/           # MCP server integrations
│   ├── mcp-discord/       # Discord bot integration
│   └── mcp-gdrive/        # Google Drive integration (submodule)
├── scripts/               # Setup and utility scripts
│   └── setup.sh          # Main setup script
└── CLAUDE.md             # AI assistant instructions
```

## Configuration

### System Requirements

1. **Node.js 18+** - The setup script will check and guide installation
2. **Atlassian Account** with access to JIRA and Confluence
3. **Discord Bot Token** (optional, for Discord integration)

### MCP Setup

The project uses Model Context Protocol (MCP) to integrate with external services. Ensure your MCP configuration includes:

- Atlassian MCP server for JIRA/Confluence access
- Discord MCP server (if using Discord features)

## Workflow Integration

### JIRA Workflow

1. **Issue Hierarchy**: Epic → Story → Task/Subtask
2. **Status Flow**: Backlog → Ready → In Progress → Review → Done
3. **Automatic Updates**: Story points, status transitions, and comments

### Git Integration

- Conventional commits with JIRA references
- Automated PR creation with issue links
- Branch naming follows JIRA issue keys

## Advanced Features

### Custom Commands

Create new commands in `.claude/commands/` to extend functionality:

```markdown
# My Custom Command

RUN:

- Your bash commands here

READ:

- Files to read

INSTRUCTIONS:

- What the AI should do
```

### Sprint Velocity Tracking

The system automatically tracks:

- Story points completed per sprint
- Team velocity trends
- Burndown charts
- Performance metrics

### Intelligent Issue Management

- Smart labeling based on content
- Automatic assignment suggestions
- Priority recommendations
- Dependency tracking

## Best Practices

1. **Always run `/prime` at session start** - Loads project context
2. **Use JIRA references in commits** - Maintains traceability
3. **Keep story points updated** - Enables accurate tracking
4. **Sync documentation regularly** - Keeps knowledge current
5. **Review velocity weekly** - Identifies bottlenecks

## Troubleshooting

### Common Issues

**MCP Connection Failed**

- Verify Atlassian credentials in MCP config
- Check network connectivity
- Ensure MCP servers are running

**Story Points Not Updating**

- Use Atlassian MCP to find custom field ID
- Verify field permissions in JIRA

**Discord Bot Not Responding**

- Check bot token in `.env` file
- Verify bot has server permissions
- Ensure bot is online

## Contributing

To extend JIRA Manager:

1. Add custom commands in `.claude/commands/`
2. Update `CLAUDE.md` with project-specific context
3. Create JQL filters for your workflow
4. Submit PRs with descriptive commits

## License

This project is designed for team productivity and process automation. Customize for your organization's needs.

---

Built with ❤️ using [Claude Code](https://claude.ai/code) by [Alvin Cheung](https://github.com/alvinycheung) at [dotfun](https://dotfun.co)
