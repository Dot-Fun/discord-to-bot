// Mock Discord.js globally
const mockDiscordJS = {
  Client: jest.fn(() => ({
    once: jest.fn(),
    on: jest.fn(),
    login: jest.fn().mockResolvedValue(true),
    destroy: jest.fn(),
    user: { 
      tag: 'TestBot#1234', 
      id: 'bot123',
      setActivity: jest.fn()
    },
    guilds: { cache: { size: 5 } }
  })),
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4,
    DirectMessages: 8
  },
  Events: {
    ClientReady: 'ready',
    MessageCreate: 'messageCreate',
    InteractionCreate: 'interactionCreate',
    Error: 'error'
  },
  EmbedBuilder: jest.fn(() => ({
    setColor: jest.fn().mockReturnThis(),
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    addFields: jest.fn().mockReturnThis(),
    setFooter: jest.fn().mockReturnThis(),
    setTimestamp: jest.fn().mockReturnThis()
  })),
  ActionRowBuilder: jest.fn(() => ({
    addComponents: jest.fn().mockReturnThis()
  })),
  ButtonBuilder: jest.fn(() => ({
    setCustomId: jest.fn().mockReturnThis(),
    setLabel: jest.fn().mockReturnThis(),
    setStyle: jest.fn().mockReturnThis(),
    setEmoji: jest.fn().mockReturnThis()
  })),
  ButtonStyle: {
    Primary: 1,
    Secondary: 2,
    Success: 3,
    Danger: 4
  },
  SlashCommandBuilder: jest.fn(() => ({
    setName: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    addStringOption: jest.fn().mockReturnThis()
  })),
  REST: jest.fn(() => ({
    setToken: jest.fn().mockReturnThis(),
    put: jest.fn().mockResolvedValue([])
  })),
  Routes: {
    applicationCommands: jest.fn()
  }
};

// Mock anthropic claude-code
jest.mock('@anthropic-ai/claude-code', () => ({
  query: jest.fn()
}));

// Mock discord.js
jest.mock('discord.js', () => mockDiscordJS);

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

// Mock fs
jest.mock('fs');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DISCORD_BOT_TOKEN = 'test-token';
process.env.CLAUDE_API_KEY = 'test-api-key';