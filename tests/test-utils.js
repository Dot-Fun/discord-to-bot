// Test utilities for mocking Discord.js and other dependencies

const createMockClient = () => {
  const client = {
    user: null,
    guilds: { cache: { size: 0 } },
    on: jest.fn(),
    once: jest.fn(),
    login: jest.fn().mockResolvedValue(true),
    application: { 
      id: 'app-id',
      commands: { set: jest.fn().mockResolvedValue([]) } 
    }
  };
  
  // Track event handlers
  client._handlers = {
    ready: [],
    messageCreate: [],
    interactionCreate: []
  };
  
  // Override on/once to capture handlers
  client.on.mockImplementation((event, handler) => {
    if (client._handlers[event]) {
      client._handlers[event].push(handler);
    }
    return client;
  });
  
  client.once.mockImplementation((event, handler) => {
    if (event === 'ready') {
      client._handlers.ready.push(handler);
    }
    return client;
  });
  
  // Helper to simulate events
  client._emit = (event, ...args) => {
    if (client._handlers[event]) {
      client._handlers[event].forEach(handler => handler(...args));
    }
  };
  
  // Helper to simulate ready
  client._ready = () => {
    client.user = { 
      id: 'bot-id', 
      tag: 'TestBot#1234',
      setActivity: jest.fn()
    };
    client.guilds.cache.size = 1;
    client._emit('ready', client);
  };
  
  return client;
};

const createMockMessage = (overrides = {}) => {
  const defaults = {
    id: 'msg-id',
    author: { 
      bot: false, 
      id: 'user-id', 
      username: 'testuser' 
    },
    content: '',
    channel: {
      id: 'channel-id',
      name: 'test-channel',
      send: jest.fn().mockResolvedValue({ 
        edit: jest.fn(),
        delete: jest.fn() 
      }),
      sendTyping: jest.fn().mockResolvedValue({})
    },
    guild: { 
      id: 'guild-id', 
      name: 'test-guild',
      channels: { cache: new Map() }
    },
    member: null,
    mentions: { 
      has: jest.fn().mockReturnValue(false),
      users: new Map()
    },
    reply: jest.fn().mockResolvedValue({ 
      edit: jest.fn(),
      delete: jest.fn()
    })
  };
  
  return { ...defaults, ...overrides };
};

const createMockInteraction = (overrides = {}) => {
  const defaults = {
    id: 'interaction-id',
    isButton: jest.fn().mockReturnValue(false),
    isChatInputCommand: jest.fn().mockReturnValue(false),
    customId: '',
    commandName: '',
    user: { id: 'user-id', username: 'testuser' },
    channel: {
      id: 'channel-id',
      name: 'test-channel',
      send: jest.fn()
    },
    guild: { id: 'guild-id', name: 'test-guild' },
    member: { permissions: { has: jest.fn() } },
    deferReply: jest.fn().mockResolvedValue({}),
    reply: jest.fn().mockResolvedValue({}),
    editReply: jest.fn().mockResolvedValue({}),
    message: null
  };
  
  return { ...defaults, ...overrides };
};

const setupDiscordMocks = () => {
  // Reset modules to ensure clean state
  jest.resetModules();
  
  // Mock Discord.js
  jest.doMock('discord.js', () => ({
    Client: jest.fn().mockImplementation(createMockClient),
    GatewayIntentBits: {
      Guilds: 1,
      GuildMessages: 2,
      MessageContent: 3,
      DirectMessages: 4
    },
    Events: {
      ClientReady: 'ready',
      MessageCreate: 'messageCreate',
      InteractionCreate: 'interactionCreate'
    },
    EmbedBuilder: jest.fn().mockImplementation(() => ({
      setColor: jest.fn().mockReturnThis(),
      setTitle: jest.fn().mockReturnThis(),
      setDescription: jest.fn().mockReturnThis(),
      addFields: jest.fn().mockReturnThis(),
      setFooter: jest.fn().mockReturnThis(),
      setTimestamp: jest.fn().mockReturnThis(),
      setAuthor: jest.fn().mockReturnThis(),
      setThumbnail: jest.fn().mockReturnThis()
    })),
    ActionRowBuilder: jest.fn().mockImplementation(() => ({
      addComponents: jest.fn().mockReturnThis()
    })),
    ButtonBuilder: jest.fn().mockImplementation(() => ({
      setCustomId: jest.fn().mockReturnThis(),
      setLabel: jest.fn().mockReturnThis(),
      setStyle: jest.fn().mockReturnThis(),
      setEmoji: jest.fn().mockReturnThis()
    })),
    ButtonStyle: { 
      Success: 1, 
      Secondary: 2, 
      Primary: 3,
      Danger: 4,
      Link: 5
    },
    SlashCommandBuilder: jest.fn().mockImplementation(() => ({
      setName: jest.fn().mockReturnThis(),
      setDescription: jest.fn().mockReturnThis(),
      addStringOption: jest.fn().mockReturnThis(),
      toJSON: jest.fn().mockReturnValue({})
    })),
    REST: jest.fn().mockImplementation(() => ({
      setToken: jest.fn().mockReturnThis(),
      put: jest.fn().mockResolvedValue([])
    })),
    Routes: {
      applicationCommands: jest.fn((id) => `/applications/${id}/commands`),
      applicationGuildCommands: jest.fn((id, gid) => `/applications/${id}/guilds/${gid}/commands`)
    }
  }));
  
  // Mock other dependencies
  jest.doMock('@anthropic-ai/claude-code', () => ({
    query: jest.fn()
  }));
  
  jest.doMock('dotenv', () => ({
    config: jest.fn()
  }));
  
  jest.doMock('fs');
  jest.doMock('path', () => {
    const actual = jest.requireActual('path');
    return {
      ...actual,
      join: jest.fn((...args) => args.join('/'))
    };
  });
};

module.exports = {
  createMockClient,
  createMockMessage,
  createMockInteraction,
  setupDiscordMocks
};