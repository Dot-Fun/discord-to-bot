# Claude Discord Bot

A powerful Discord bot that uses Claude AI via OAuth authentication with persistent sessions, JIRA integration, and access to multiple tools through MCP (Model Context Protocol).

## 🚀 Quick Start

```bash
# Clone the repo
git clone https://github.com/Dot-Fun/discord-to-bot.git
cd discord-to-bot

# Install dependencies
npm install

# Make sure you're logged into Claude
claude login

# Run the bot
npm start
```

## ✨ Features

- **Persistent Sessions** - Conversations continue across bot restarts with Claude's session management
- **JIRA Integration** - Create, view, and manage JIRA tickets with interactive previews
- **MCP Tools** - Access to Discord, JIRA, Confluence, Gmail, Google Calendar, and Google Drive
- **Smart Context** - Channel-specific contexts and automatic message history inclusion
- **Clean UI** - Status embeds that auto-delete, keeping chat clean

## 🤖 How to Use

### Basic Commands
- `@Dot <your message>` - Chat with Claude
- `@Dot help` - Show all commands
- `@Dot clear` - Clear conversation history

### Session Management
- `@Dot session info` - View current session details
- `@Dot reset session` - Start a fresh conversation
- `@Dot list sessions` - Show all active sessions (admin only)

### Information Commands
- `@Dot debug` - Show recent errors
- `@Dot status` - Show bot configuration
- `@Dot refresh-context` - Reload preloaded data
- `@Dot show-context` - Display loaded context
- `@Dot show-jira` - Display JIRA context

### Examples
```
@Dot What is the weather like?
@Dot Write a Python function
@Dot Help me debug this code
@Dot check my gmail
@Dot what JIRA tickets are assigned to me?
@Dot create a ticket for implementing user authentication
```

## 📁 Project Structure

```
discord-to-bot/
├── discord-bot.js          # Main bot code
├── .env                    # Discord bot token
├── .mcp.json              # MCP server configurations
├── jira-context.json      # JIRA projects and user mappings
├── session-mappings.json  # Persistent session storage
├── channel-contexts/      # Channel-specific configurations
│   ├── base-context.json
│   ├── ai-news.json
│   └── jira-updates.json
└── discord-bot-errors.log # Error logging
```

## 🛠️ Development

Run with auto-restart on changes:
```bash
npm run dev
```

## ⚙️ Prerequisites

1. **Discord Bot Token** - Get from [Discord Developer Portal](https://discord.com/developers/applications)
2. **Claude CLI** - Install with `npm install -g @anthropic-ai/claude-code`
3. **Claude Login** - Run `claude login` to authenticate
4. **MCP Servers** (Optional) - For JIRA, Google services, etc.

## 🔧 Configuration

### Discord Token
Edit `.env`:
```env
DISCORD_BOT_TOKEN="your-discord-bot-token"
```

### MCP Tools (Optional)
Edit `.mcp.json` to configure tools:
- **JIRA/Confluence** - Atlassian integration
- **Gmail** - Email access
- **Google Calendar** - Calendar management
- **Google Drive** - File access

### JIRA Integration
Edit `jira-context.json` to:
- Map Discord users to JIRA accounts
- Configure available projects
- Set up issue types and templates

### Channel Contexts
Create channel-specific contexts in `channel-contexts/` to:
- Set default JIRA projects per channel
- Configure channel-specific behavior
- Define cross-channel references

## 🎯 JIRA Ticket Creation

When you ask the bot to create tickets, it will:
1. Analyze the conversation context
2. Show interactive preview cards with all ticket details
3. Let you approve, skip, or edit each ticket
4. Remember your decisions to avoid duplicate suggestions

## 🔍 Troubleshooting

### Google Authentication
If prompted to reauthenticate Google services on each restart:
- Check for `.credentials` directory in your project
- Ensure `GOOGLE_OAUTH_CREDENTIALS` path is correct in `.mcp.json`
- Consider using service account credentials for unattended operation

### Session Issues
- Sessions are stored in `session-mappings.json`
- Old sessions (>7 days) are automatically cleaned up
- Use `@Dot reset session` if encountering issues

### Error Logs
- Check `discord-bot-errors.log` for detailed error information
- Use `@Dot debug` to see recent errors in Discord

---

Built with ❤️ by [Alvin Cheung](mailto:alvinycheung@gmail.com) ([@alvinycheung](https://github.com/alvinycheung)) at [DotFun](https://dotfun.co)