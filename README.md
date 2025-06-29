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
- `!claude <your message>` - Ask Claude anything
- `@BotName <your message>` - Mention the bot
- `!claude help` - Show help
- `!claude clear` - Clear conversation history

### Examples
```
!claude What is the weather like?
!claude Write a Python function
@Claude Help me debug this code
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