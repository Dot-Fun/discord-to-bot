const fs = require('fs');
const path = require('path');

// Mock all dependencies before requiring the bot
jest.mock('discord.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    user: { setActivity: jest.fn(), id: 'bot-id', tag: 'TestBot#1234' },
    guilds: { cache: { size: 1 } },
    on: jest.fn(),
    once: jest.fn(),
    login: jest.fn().mockResolvedValue(true),
    application: { commands: { set: jest.fn() } }
  })),
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
    setTimestamp: jest.fn().mockReturnThis()
  })),
  ActionRowBuilder: jest.fn(),
  ButtonBuilder: jest.fn(),
  ButtonStyle: { Success: 1, Secondary: 2, Primary: 3 },
  SlashCommandBuilder: jest.fn().mockImplementation(() => ({
    setName: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    addStringOption: jest.fn().mockReturnThis()
  })),
  REST: jest.fn().mockImplementation(() => ({
    setToken: jest.fn().mockReturnThis(),
    put: jest.fn().mockResolvedValue([])
  })),
  Routes: {
    applicationCommands: jest.fn((clientId) => `/applications/${clientId}/commands`),
    applicationGuildCommands: jest.fn((clientId, guildId) => `/applications/${clientId}/guilds/${guildId}/commands`)
  }
}));

jest.mock('@anthropic-ai/claude-code', () => ({
  query: jest.fn()
}));

jest.mock('dotenv', () => ({
  config: jest.fn()
}));

jest.mock('fs');

// Set up environment variables
process.env.DISCORD_BOT_TOKEN = 'test-token';

describe('Discord Bot Session Management', () => {
  let mockClient;
  let messageHandlers = {};
  let readyHandlers = [];
  
  // Session test data
  const testChannelId = '1234567890';
  const testSessionId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const mockSessionData = {
    version: '1.0',
    savedAt: new Date().toISOString(),
    sessions: [
      [testChannelId, {
        sessionId: testSessionId,
        lastActivity: Date.now(),
        messageCount: 5,
        channelName: 'test-channel',
        guildName: 'test-guild'
      }]
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    messageHandlers = {};
    readyHandlers = [];
    
    // Mock file system for session loading
    fs.existsSync.mockImplementation((filePath) => {
      if (filePath.includes('session-mappings.json')) return true;
      if (filePath.includes('.mcp.json')) return false;
      if (filePath.includes('settings.json')) return false;
      if (filePath.includes('base-context.json')) return false;
      if (filePath.includes('jira-context.json')) return false;
      return false;
    });
    
    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath.includes('session-mappings.json')) {
        return JSON.stringify(mockSessionData);
      }
      return '{}';
    });
    
    fs.writeFileSync.mockImplementation(() => {});
    fs.readdirSync.mockReturnValue([]);
    
    // Mock Discord client
    const { Client } = require('discord.js');
    mockClient = {
      user: { setActivity: jest.fn(), id: 'bot-id', tag: 'TestBot#1234' },
      guilds: { cache: { size: 1 } },
      on: jest.fn((event, handler) => {
        if (event === 'messageCreate' || event === 'interactionCreate') {
          messageHandlers[event] = handler;
        }
      }),
      once: jest.fn((event, handler) => {
        if (event === 'ready') {
          readyHandlers.push(handler);
        }
      }),
      login: jest.fn().mockResolvedValue(true)
    };
    Client.mockReturnValue(mockClient);
    
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Session Loading on Startup', () => {
    test('should load existing sessions from file', () => {
      // Require the bot to trigger initialization
      require('../discord-bot');
      
      // Simulate bot ready event
      readyHandlers.forEach(handler => handler(mockClient));
      
      // Check that session file was read
      expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('session-mappings.json'));
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('session-mappings.json'),
        'utf8'
      );
      
      // Check that sessions were loaded
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Loaded 1 saved sessions'));
    });

    test('should handle missing session file gracefully', () => {
      fs.existsSync.mockImplementation(() => false);
      
      require('../discord-bot');
      readyHandlers.forEach(handler => handler(mockClient));
      
      // Should not throw error
      expect(console.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Failed to load sessions')
      );
    });

    test('should schedule cleanup of old sessions', () => {
      jest.useFakeTimers();
      
      require('../discord-bot');
      readyHandlers.forEach(handler => handler(mockClient));
      
      // Fast forward 24 hours
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
      
      // Cleanup should have been scheduled
      expect(setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        24 * 60 * 60 * 1000
      );
      
      jest.useRealTimers();
    });
  });

  describe('Session Commands', () => {
    let mockMessage;
    let mockChannel;
    let mockReply;

    beforeEach(() => {
      mockReply = jest.fn().mockResolvedValue({ edit: jest.fn() });
      mockChannel = {
        id: testChannelId,
        name: 'test-channel',
        send: jest.fn().mockResolvedValue({}),
        sendTyping: jest.fn().mockResolvedValue({})
      };
      
      mockMessage = {
        author: { bot: false, id: 'user123', username: 'testuser' },
        content: '',
        mentions: { has: jest.fn().mockReturnValue(true) },
        channel: mockChannel,
        guild: { id: 'guild123', name: 'test-guild' },
        reply: mockReply
      };
      
      require('../discord-bot');
      readyHandlers.forEach(handler => handler(mockClient));
    });

    test('should show session info when requested', async () => {
      mockMessage.content = '<@bot-id> session info';
      
      await messageHandlers.messageCreate(mockMessage);
      
      expect(mockReply).toHaveBeenCalledWith(expect.objectContaining({
        embeds: expect.arrayContaining([expect.any(Object)])
      }));
    });

    test('should reset session when requested', async () => {
      mockMessage.content = '<@bot-id> reset session';
      
      await messageHandlers.messageCreate(mockMessage);
      
      expect(mockReply).toHaveBeenCalledWith(
        expect.stringContaining('Session')
      );
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    test('should list all sessions for admin', async () => {
      mockMessage.content = '<@bot-id> list sessions';
      mockMessage.member = {
        permissions: { has: jest.fn().mockReturnValue(true) }
      };
      mockMessage.guild.channels = {
        cache: new Map([[testChannelId, { name: 'test-channel' }]])
      };
      
      await messageHandlers.messageCreate(mockMessage);
      
      expect(mockReply).toHaveBeenCalledWith(expect.objectContaining({
        embeds: expect.arrayContaining([expect.any(Object)])
      }));
    });

    test('should deny session list for non-admin', async () => {
      mockMessage.content = '<@bot-id> list sessions';
      mockMessage.member = {
        permissions: { has: jest.fn().mockReturnValue(false) }
      };
      
      await messageHandlers.messageCreate(mockMessage);
      
      expect(mockReply).toHaveBeenCalledWith(
        expect.stringContaining('requires administrator permissions')
      );
    });
  });

  describe('Session Resume Logic', () => {
    let mockQuery;
    let mockMessage;

    beforeEach(() => {
      const { query } = require('@anthropic-ai/claude-code');
      mockQuery = query;
      
      mockMessage = {
        author: { bot: false, id: 'user123', username: 'testuser' },
        content: '<@bot-id> hello',
        mentions: { has: jest.fn().mockReturnValue(true) },
        channel: {
          id: testChannelId,
          name: 'test-channel',
          send: jest.fn().mockResolvedValue({}),
          sendTyping: jest.fn().mockResolvedValue({})
        },
        guild: { id: 'guild123', name: 'test-guild' },
        reply: jest.fn().mockResolvedValue({ edit: jest.fn() })
      };
      
      require('../discord-bot');
      readyHandlers.forEach(handler => handler(mockClient));
    });

    test('should attempt to resume existing session', async () => {
      // Mock successful query with session
      mockQuery.mockImplementation(async function* ({ options }) {
        // Check that resume option was passed
        expect(options).toHaveProperty('resume', testSessionId);
        
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Hello!' }] }
        };
      });
      
      await messageHandlers.messageCreate(mockMessage);
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(`Attempting to resume session ${testSessionId}`)
      );
    });

    test('should create new session for new channel', async () => {
      mockMessage.channel.id = 'new-channel-id';
      
      mockQuery.mockImplementation(async function* ({ options }) {
        // Should not have resume option for new channel
        expect(options).not.toHaveProperty('resume');
        
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Hello!' }] },
          session_id: 'new-session-id'
        };
      });
      
      await messageHandlers.messageCreate(mockMessage);
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Creating new session')
      );
    });

    test('should validate session before resuming', async () => {
      // Mock old session (8 days)
      const oldSessionData = {
        version: '1.0',
        sessions: [[testChannelId, {
          sessionId: testSessionId,
          lastActivity: Date.now() - (8 * 24 * 60 * 60 * 1000),
          messageCount: 5
        }]]
      };
      
      fs.readFileSync.mockImplementation((filePath) => {
        if (filePath.includes('session-mappings.json')) {
          return JSON.stringify(oldSessionData);
        }
        return '{}';
      });
      
      // Re-require to reload with old session
      jest.resetModules();
      require('../discord-bot');
      
      mockQuery.mockImplementation(async function* ({ options }) {
        // Should not resume old session
        expect(options).not.toHaveProperty('resume');
        
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Hello!' }] }
        };
      });
      
      await messageHandlers.messageCreate(mockMessage);
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('days old. Creating new session')
      );
    });
  });

  describe('Error Handling and Fallback', () => {
    let mockQuery;
    let mockMessage;

    beforeEach(() => {
      const { query } = require('@anthropic-ai/claude-code');
      mockQuery = query;
      
      mockMessage = {
        author: { bot: false, id: 'user123', username: 'testuser' },
        content: '<@bot-id> test error handling',
        mentions: { has: jest.fn().mockReturnValue(true) },
        channel: {
          id: testChannelId,
          name: 'test-channel',
          send: jest.fn().mockResolvedValue({}),
          sendTyping: jest.fn().mockResolvedValue({})
        },
        guild: { id: 'guild123', name: 'test-guild' },
        reply: jest.fn().mockResolvedValue({ edit: jest.fn() })
      };
      
      require('../discord-bot');
      readyHandlers.forEach(handler => handler(mockClient));
    });

    test('should fallback to new session on resume error', async () => {
      let callCount = 0;
      
      mockQuery.mockImplementation(async function* ({ options }) {
        callCount++;
        
        if (callCount === 1 && options.resume) {
          // First call with resume fails
          throw new Error('Session not found');
        }
        
        // Second call without resume succeeds
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Fallback response' }] },
          session_id: 'new-session-after-error'
        };
      });
      
      await messageHandlers.messageCreate(mockMessage);
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Session resume failed')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Attempting to create a new session instead')
      );
    });

    test('should handle timeout errors', async () => {
      mockQuery.mockImplementation(async function* () {
        // Simulate timeout
        await new Promise(resolve => setTimeout(resolve, 1000));
        throw new Error('Query timeout after 5 minutes');
      });
      
      // Set a shorter timeout for testing
      jest.setTimeout(2000);
      
      try {
        await messageHandlers.messageCreate(mockMessage);
      } catch (error) {
        expect(error.message).toContain('timeout');
      }
      
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        expect.stringContaining('encountered an issue')
      );
    });
  });

  describe('Channel Isolation', () => {
    test('should maintain separate sessions per channel', async () => {
      const { query } = require('@anthropic-ai/claude-code');
      
      const channel1 = { id: 'channel1', name: 'channel-1', send: jest.fn(), sendTyping: jest.fn() };
      const channel2 = { id: 'channel2', name: 'channel-2', send: jest.fn(), sendTyping: jest.fn() };
      
      const message1 = {
        author: { bot: false, id: 'user123' },
        content: '<@bot-id> message in channel 1',
        mentions: { has: jest.fn().mockReturnValue(true) },
        channel: channel1,
        guild: { id: 'guild123', name: 'test-guild' },
        reply: jest.fn().mockResolvedValue({ edit: jest.fn() })
      };
      
      const message2 = {
        ...message1,
        channel: channel2,
        content: '<@bot-id> message in channel 2'
      };
      
      require('../discord-bot');
      readyHandlers.forEach(handler => handler(mockClient));
      
      // Mock different session IDs for different channels
      let sessionCounter = 0;
      query.mockImplementation(async function* ({ options }) {
        sessionCounter++;
        const sessionId = `session-${sessionCounter}`;
        
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: `Response ${sessionCounter}` }] },
          session_id: sessionId
        };
      });
      
      // Send messages to both channels
      await messageHandlers.messageCreate(message1);
      await messageHandlers.messageCreate(message2);
      
      // Verify sessions were saved separately
      const savedCalls = fs.writeFileSync.mock.calls.filter(
        call => call[0].includes('session-mappings.json')
      );
      
      expect(savedCalls.length).toBeGreaterThanOrEqual(2);
      
      // Check last saved data
      const lastSavedData = JSON.parse(savedCalls[savedCalls.length - 1][1]);
      const sessions = new Map(lastSavedData.sessions);
      
      expect(sessions.has('channel1')).toBe(true);
      expect(sessions.has('channel2')).toBe(true);
      expect(sessions.get('channel1').sessionId).not.toBe(sessions.get('channel2').sessionId);
    });
  });

  describe('Session Persistence', () => {
    test('should save session after successful query', async () => {
      const { query } = require('@anthropic-ai/claude-code');
      
      query.mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Response' }] },
          session_id: 'new-session-id'
        };
      });
      
      const mockMessage = {
        author: { bot: false, id: 'user123' },
        content: '<@bot-id> test persistence',
        mentions: { has: jest.fn().mockReturnValue(true) },
        channel: { id: 'new-channel', name: 'test', send: jest.fn(), sendTyping: jest.fn() },
        guild: { id: 'guild123', name: 'test-guild' },
        reply: jest.fn().mockResolvedValue({ edit: jest.fn() })
      };
      
      require('../discord-bot');
      readyHandlers.forEach(handler => handler(mockClient));
      
      await messageHandlers.messageCreate(mockMessage);
      
      // Check that session was saved
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('session-mappings.json'),
        expect.stringContaining('new-session-id')
      );
    });

    test('should update last activity on resumed session', async () => {
      const { query } = require('@anthropic-ai/claude-code');
      
      const originalLastActivity = mockSessionData.sessions[0][1].lastActivity;
      
      query.mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Resumed response' }] }
          // Note: No new session_id when resuming
        };
      });
      
      const mockMessage = {
        author: { bot: false, id: 'user123' },
        content: '<@bot-id> test activity update',
        mentions: { has: jest.fn().mockReturnValue(true) },
        channel: { id: testChannelId, name: 'test-channel', send: jest.fn(), sendTyping: jest.fn() },
        guild: { id: 'guild123', name: 'test-guild' },
        reply: jest.fn().mockResolvedValue({ edit: jest.fn() })
      };
      
      require('../discord-bot');
      readyHandlers.forEach(handler => handler(mockClient));
      
      await messageHandlers.messageCreate(mockMessage);
      
      // Get the last saved session data
      const savedCalls = fs.writeFileSync.mock.calls.filter(
        call => call[0].includes('session-mappings.json')
      );
      
      if (savedCalls.length > 0) {
        const lastSavedData = JSON.parse(savedCalls[savedCalls.length - 1][1]);
        const updatedSession = lastSavedData.sessions.find(s => s[0] === testChannelId);
        
        expect(updatedSession[1].lastActivity).toBeGreaterThan(originalLastActivity);
      }
    });
  });
});