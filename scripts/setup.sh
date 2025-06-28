#!/bin/bash

# Define colors
ORANGE='\033[38;2;252;63;31m'  # #fc3f1f in RGB
RESET='\033[0m'
BOLD='\033[1m'

echo
echo -e "${ORANGE}     _       _    __             "
echo -e "  __| | ___ | |_ / _|_   _ _ __  "
echo -e " / _\` |/ _ \\| __| |_| | | | '_ \\ "
echo -e "| (_| | (_) | |_|  _| |_| | | | |"
echo -e " \\__,_|\\___/ \\__|_|  \\__,_|_| |_|${RESET}"
echo
echo -e "${BOLD}🤖 JIRA Manager Setup Script${RESET}"
echo "=========================="
echo

# Trap function to handle script termination
cleanup() {
    echo
    echo "👋 Exiting setup script..."
    echo "Note: The Discord bot is logged in and should work as expected"
    exit 0
}

# Set up trap to call cleanup on SIGINT (Ctrl+C) and SIGTERM
trap cleanup SIGINT SIGTERM

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo
    echo "📦 Please install Node.js using NVM:"
    echo "   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    echo "   nvm install node"
    echo
    echo "Then run this setup script again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18 or higher is required!"
    echo "   Current version: $(node -v)"
    echo
    echo "📦 Please update Node.js:"
    echo "   nvm install node"
    echo
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Get the project root directory (parent of scripts directory)
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# Install npm dependencies if package.json exists
if [ -f "package.json" ]; then
    echo
    echo "📦 Installing npm dependencies..."
    npm install

    # Initialize git hooks with husky
    echo
    echo "🪝 Setting up git hooks..."
    npx husky init || true
fi

# Check for global CLI tools
echo
echo "🔍 Checking for required CLI tools..."

# Check Claude Code CLI
if ! command -v claude &> /dev/null; then
    echo "📦 Installing Claude Code CLI..."
    npm install -g @anthropic-ai/claude-code
else
    echo "✅ Claude Code CLI already installed"
fi

# Check Gemini CLI
if ! command -v gemini &> /dev/null; then
    echo "📦 Installing Gemini CLI..."
    npm install -g @google/generative-ai-cli
else
    echo "✅ Gemini CLI already installed"
fi

# Initialize and update git submodules
echo "📦 Initializing git submodules..."
git submodule init
git submodule update

# Ensure mcp-servers directory exists
if [ ! -d "mcp-servers" ]; then
    echo "📁 Creating mcp-servers directory..."
    mkdir -p mcp-servers
fi

# Clone mcp-discord if it doesn't exist
if [ ! -d "mcp-servers/mcp-discord" ]; then
    echo "📥 Cloning mcp-discord repository..."
    git clone https://github.com/hanweg/mcp-discord.git mcp-servers/mcp-discord
    if [ $? -ne 0 ]; then
        echo "❌ Error: Failed to clone mcp-discord repository!"
        exit 1
    fi
    echo "✅ Successfully cloned mcp-discord"
fi

# Navigate to discord mcp directory
cd mcp-servers/mcp-discord

# Check if uv is installed
if ! command -v uv &> /dev/null; then
    echo "📦 Installing uv (Python package manager)..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    source $HOME/.cargo/env
fi

# Create and activate virtual environment
echo "🔧 Setting up Python virtual environment..."
if [ ! -d "venv" ]; then
    uv venv
fi

# Install dependencies
echo "📚 Installing Discord MCP dependencies..."
uv pip install -e .

# Setup environment variables
echo
echo "🔐 Setting up Discord bot credentials..."
echo

# Check if .env already exists
if [ -f ".env" ]; then
    echo "⚠️  .env file already exists. Do you want to overwrite it? (y/N)"
    read -r overwrite
    if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
        echo "Keeping existing .env file."
    else
        # Prompt for Discord bot token
        echo "Please enter your Discord Bot Token:"
        echo "(You can get this from https://discord.com/developers/applications)"
        read -r bot_token

        # Prompt for testing guild ID
        echo
        echo "Please enter your Testing Guild ID (Discord Server ID):"
        echo "(Enable Developer Mode in Discord, right-click your server, and copy ID)"
        read -r guild_id

        # Create .env file directly
        cat > .env <<EOF
DISCORD_BOT_TOKEN="$bot_token"
TESTING_GUILD_ID="$guild_id"
EOF

        echo "✅ Credentials saved to .env file"
    fi
else
    # No .env file exists, create one
    # Prompt for Discord bot token
    echo "Please enter your Discord Bot Token:"
    echo "(You can get this from https://discord.com/developers/applications)"
    read -r bot_token

    # Prompt for testing guild ID
    echo
    echo "Please enter your Testing Guild ID (Discord Server ID):"
    echo "(Enable Developer Mode in Discord, right-click your server, and copy ID)"
    read -r guild_id

    # Create .env file directly
    cat > .env <<EOF
DISCORD_BOT_TOKEN="$bot_token"
TESTING_GUILD_ID="$guild_id"
EOF

    echo "✅ Credentials saved to .env file"
fi

# Setup Google OAuth credentials for gdrive
echo
echo "🔐 Setting up Google OAuth credentials for Drive/Calendar/Gmail..."
echo

# Check if we need to prompt for Google OAuth credentials
if [ ! -f "$PROJECT_ROOT/gcp-oauth.keys.json" ]; then
    echo "📋 Google OAuth Setup Required!"
    echo "1. Go to https://console.cloud.google.com/apis/credentials"
    echo "2. Create an OAuth 2.0 Client ID (Desktop application)"
    echo "3. Download the JSON file"
    echo "4. Save it as gcp-oauth.keys.json in the project root"
    echo
    echo "Press Enter when you've saved the file to continue..."
    read -r
    
    if [ ! -f "$PROJECT_ROOT/gcp-oauth.keys.json" ]; then
        echo "⚠️  Warning: gcp-oauth.keys.json not found. Google services will not work."
    else
        echo "✅ Found gcp-oauth.keys.json"
    fi
else
    echo "✅ Google OAuth credentials already configured"
fi

# Extract CLIENT_ID and CLIENT_SECRET from gcp-oauth.keys.json if it exists
if [ -f "$PROJECT_ROOT/gcp-oauth.keys.json" ]; then
    export GOOGLE_CLIENT_ID=$(grep -o '"client_id":"[^"]*' "$PROJECT_ROOT/gcp-oauth.keys.json" | sed 's/"client_id":"//')
    export GOOGLE_CLIENT_SECRET=$(grep -o '"client_secret":"[^"]*' "$PROJECT_ROOT/gcp-oauth.keys.json" | sed 's/"client_secret":"//')
fi

# Build mcp-gdrive if it exists
if [ -d "$PROJECT_ROOT/mcp-servers/mcp-gdrive" ]; then
    echo
    echo "🔧 Building mcp-gdrive server..."
    cd "$PROJECT_ROOT/mcp-servers/mcp-gdrive"
    
    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        echo "📦 Installing mcp-gdrive dependencies..."
        npm install
    fi
    
    # Build the project
    echo "🏗️  Building mcp-gdrive..."
    npm run build
    
    if [ $? -eq 0 ]; then
        echo "✅ mcp-gdrive built successfully"
    else
        echo "⚠️  Warning: mcp-gdrive build failed, but continuing setup..."
    fi
    
    cd "$PROJECT_ROOT/mcp-servers/mcp-discord"
fi

# Get the project root directory
PROJECT_ROOT="$(dirname "$(dirname "$(readlink -f "$0")")")"

# Create .mcp.json file
echo
echo "📝 Creating .mcp.json configuration file..."

# Escape paths for JSON
ESCAPED_PROJECT_ROOT=$(echo "$PROJECT_ROOT" | sed 's/\//\\\//g')

# Check if .mcp.json already exists in project root
if [ -f "$PROJECT_ROOT/.mcp.json" ]; then
    echo "⚠️  .mcp.json file already exists at $PROJECT_ROOT/.mcp.json"
    echo "Do you want to overwrite it? (y/N)"
    read -r overwrite_mcp
    if [[ ! "$overwrite_mcp" =~ ^[Yy]$ ]]; then
        echo "Keeping existing .mcp.json file."
    else
        # Create .mcp.json in the project root directory
        cat > "$PROJECT_ROOT/.mcp.json" <<EOF
{
  "mcpServers": {
    "atlassian": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.atlassian.com/v1/sse"
      ]
    },
    "discord": {
      "command": "$PROJECT_ROOT/mcp-servers/mcp-discord/venv/bin/uv",
      "args": [
        "--directory",
        "$PROJECT_ROOT/mcp-servers/mcp-discord",
        "run",
        "mcp-discord"
      ],
      "env": {
        "DISCORD_TOKEN": "$bot_token"
      }
    },
    "gmail": {
      "command": "npx",
      "args": [
        "@gongrzhe/server-gmail-autoauth-mcp"
      ]
    },
    "google-calendar": {
      "command": "npx",
      "args": [
        "@cocal/google-calendar-mcp"
      ],
      "env": {
        "GOOGLE_OAUTH_CREDENTIALS": "$PROJECT_ROOT/gcp-oauth.keys.json"
      }
    },
    "gdrive": {
      "command": "node",
      "args": [
        "$PROJECT_ROOT/mcp-servers/mcp-gdrive/dist/index.js"
      ],
      "env": {
        "GDRIVE_CREDS_DIR": "$PROJECT_ROOT",
        "CLIENT_ID": "\${GOOGLE_CLIENT_ID}",
        "CLIENT_SECRET": "\${GOOGLE_CLIENT_SECRET}"
      }
    }
  }
}
EOF
        echo "✅ Created .mcp.json configuration at $PROJECT_ROOT/.mcp.json"
    fi
else
    # Create .mcp.json in the project root directory
    cat > "$PROJECT_ROOT/.mcp.json" <<EOF
{
  "mcpServers": {
    "atlassian": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.atlassian.com/v1/sse"
      ]
    },
    "discord": {
      "command": "$PROJECT_ROOT/mcp-servers/mcp-discord/venv/bin/uv",
      "args": [
        "--directory",
        "$PROJECT_ROOT/mcp-servers/mcp-discord",
        "run",
        "mcp-discord"
      ],
      "env": {
        "DISCORD_TOKEN": "$bot_token"
      }
    },
    "gmail": {
      "command": "npx",
      "args": [
        "@gongrzhe/server-gmail-autoauth-mcp"
      ]
    },
    "google-calendar": {
      "command": "npx",
      "args": [
        "@cocal/google-calendar-mcp"
      ],
      "env": {
        "GOOGLE_OAUTH_CREDENTIALS": "$PROJECT_ROOT/gcp-oauth.keys.json"
      }
    },
    "gdrive": {
      "command": "node",
      "args": [
        "$PROJECT_ROOT/mcp-servers/mcp-gdrive/dist/index.js"
      ],
      "env": {
        "GDRIVE_CREDS_DIR": "$PROJECT_ROOT",
        "CLIENT_ID": "\${GOOGLE_CLIENT_ID}",
        "CLIENT_SECRET": "\${GOOGLE_CLIENT_SECRET}"
      }
    }
  }
}
EOF
    echo "✅ Created .mcp.json configuration at $PROJECT_ROOT/.mcp.json"
fi

# Create .gemini directory if it doesn't exist
if [ ! -d "$PROJECT_ROOT/.gemini" ]; then
    echo "📁 Creating .gemini directory..."
    mkdir -p "$PROJECT_ROOT/.gemini"
fi

# Create .gemini/settings.json
echo
echo "📝 Creating .gemini/settings.json configuration file..."

# Check if .gemini/settings.json already exists
if [ -f "$PROJECT_ROOT/.gemini/settings.json" ]; then
    echo "⚠️  .gemini/settings.json file already exists"
    echo "Do you want to overwrite it? (y/N)"
    read -r overwrite_gemini
    if [[ ! "$overwrite_gemini" =~ ^[Yy]$ ]]; then
        echo "Keeping existing .gemini/settings.json file."
    else
        # Create .gemini/settings.json
        cat > "$PROJECT_ROOT/.gemini/settings.json" <<EOF
{
  "theme": "GitHub",
  "mcpServers": {
    "atlassian": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.atlassian.com/v1/sse"
      ]
    },
    "discord": {
      "command": "$PROJECT_ROOT/mcp-servers/mcp-discord/venv/bin/uv",
      "args": [
        "--directory",
        "$PROJECT_ROOT/mcp-servers/mcp-discord",
        "run",
        "mcp-discord"
      ],
      "env": {
        "DISCORD_TOKEN": "$bot_token"
      }
    },
    "gmail": {
      "command": "npx",
      "args": [
        "@gongrzhe/server-gmail-autoauth-mcp"
      ]
    },
    "google-calendar": {
      "command": "npx",
      "args": [
        "@cocal/google-calendar-mcp"
      ],
      "env": {
        "GOOGLE_OAUTH_CREDENTIALS": "$PROJECT_ROOT/gcp-oauth.keys.json"
      }
    },
    "gdrive": {
      "command": "node",
      "args": [
        "$PROJECT_ROOT/mcp-servers/mcp-gdrive/dist/index.js"
      ],
      "env": {
        "GDRIVE_CREDS_DIR": "$PROJECT_ROOT",
        "CLIENT_ID": "\${GOOGLE_CLIENT_ID}",
        "CLIENT_SECRET": "\${GOOGLE_CLIENT_SECRET}"
      }
    }
  },
  "usageStatisticsEnabled": true
}
EOF
        echo "✅ Created .gemini/settings.json configuration"
    fi
else
    # Create .gemini/settings.json
    cat > "$PROJECT_ROOT/.gemini/settings.json" <<EOF
{
  "theme": "GitHub",
  "mcpServers": {
    "atlassian": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.atlassian.com/v1/sse"
      ]
    },
    "discord": {
      "command": "$PROJECT_ROOT/mcp-servers/mcp-discord/venv/bin/uv",
      "args": [
        "--directory",
        "$PROJECT_ROOT/mcp-servers/mcp-discord",
        "run",
        "mcp-discord"
      ],
      "env": {
        "DISCORD_TOKEN": "$bot_token"
      }
    },
    "gmail": {
      "command": "npx",
      "args": [
        "@gongrzhe/server-gmail-autoauth-mcp"
      ]
    },
    "google-calendar": {
      "command": "npx",
      "args": [
        "@cocal/google-calendar-mcp"
      ],
      "env": {
        "GOOGLE_OAUTH_CREDENTIALS": "$PROJECT_ROOT/gcp-oauth.keys.json"
      }
    },
    "gdrive": {
      "command": "node",
      "args": [
        "$PROJECT_ROOT/mcp-servers/mcp-gdrive/dist/index.js"
      ],
      "env": {
        "GDRIVE_CREDS_DIR": "$PROJECT_ROOT",
        "CLIENT_ID": "\${GOOGLE_CLIENT_ID}",
        "CLIENT_SECRET": "\${GOOGLE_CLIENT_SECRET}"
      }
    }
  },
  "usageStatisticsEnabled": true
}
EOF
    echo "✅ Created .gemini/settings.json configuration"
fi

echo
echo "✅ JIRA Manager setup complete!"
echo

# Start the Discord bot
echo "🤖 Starting Discord bot to verify credentials..."
echo
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║   🛑 ACTION REQUIRED: PRESS CTRL+C TO CONTINUE! 🛑            ║"
echo "║                                                               ║"
echo "║   1. Wait for the bot login messages below to stop            ║"
echo "║      (usually takes 5-10 seconds)                             ║"
echo "║                                                               ║"
echo "║   2. Then press Ctrl+C to exit this setup script              ║"
echo "║                                                               ║"
echo "║   ✅ The bot will keep running in the background for MCP      ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo

cd "$(dirname "$(dirname "$(readlink -f "$0")")")/mcp-servers/mcp-discord"
source venv/bin/activate
python start_discord_bot.py