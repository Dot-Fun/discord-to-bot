# Claude Discord Bot

A Discord bot that uses Claude AI via OAuth authentication (no API key needed!).

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

## 🤖 How to Use

The bot responds to:
- `@Dot <your message>` - Just mention the bot!
- `@Dot help` - Show help
- `@Dot clear` - Clear conversation history

### Examples
```
@Dot What is the weather like?
@Dot Write a Python function
@Dot Help me debug this code
@Dot check my gmail
@Dot what JIRA tickets are assigned to me?
```

## 📁 Files

- `discord-bot.js` - The bot code
- `.env` - Discord bot token
- `package.json` - Dependencies

## 🛠️ Development

Run with auto-restart on changes:
```bash
npm run dev
```

## ⚙️ Prerequisites

1. **Discord Bot Token** - Get from [Discord Developer Portal](https://discord.com/developers/applications)
2. **Claude CLI** - Install with `npm install -g @anthropic-ai/claude-code`
3. **Claude Login** - Run `claude login` to authenticate

## 🔧 Configuration

Edit `.env`:
```env
DISCORD_BOT_TOKEN="your-discord-bot-token"
```

---

Built with ❤️ by [DotFun](https://dotfun.co)