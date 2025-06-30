const fs = require('fs');
const path = require('path');
const { 
  createMockClient, 
  createMockMessage, 
  setupDiscordMocks 
} = require('./test-utils');

// Setup mocks before requiring the bot
setupDiscordMocks();

describe('Session Management Integration Tests', () => {
  let mockClient;
  let mockFs;
  let mockQuery;
  let botInstance;
  
  const testSessionData = {
    version: '1.0',
    savedAt: new Date().toISOString(),
    sessions: [
      ['channel-1', {
        sessionId: 'session-1-uuid',
        lastActivity: Date.now(),
        messageCount: 5,
        channelName: 'general',
        guildName: 'Test Server'
      }],
      ['channel-2', {
        sessionId: 'session-2-uuid',
        lastActivity: Date.now() - (2 * 24 * 60 * 60 * 1000), // 2 days old
        messageCount: 10,
        channelName: 'support',
        guildName: 'Test Server'
      }]
    ]
  };
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    jest.resetModules();
    
    // Setup environment
    process.env.DISCORD_BOT_TOKEN = 'test-token';
    
    // Re-setup mocks for each test
    setupDiscordMocks();
    
    // Get mocked dependencies
    mockFs = require('fs');
    mockQuery = require('@anthropic-ai/claude-code').query;
    
    // Setup file system mocks
    mockFs.existsSync.mockImplementation((filePath) => {
      if (filePath.includes('session-mappings.json')) return true;
      return false;
    });
    
    mockFs.readFileSync.mockImplementation((filePath) => {
      if (filePath.includes('session-mappings.json')) {
        return JSON.stringify(testSessionData);
      }
      return '{}';
    });
    
    mockFs.writeFileSync.mockImplementation(() => {});
    mockFs.readdirSync.mockReturnValue([]);
    
    // Mock console to reduce noise
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    
    // Require the bot (this will create the client)
    require('../discord-bot');
    
    // Get the mocked client instance
    const { Client } = require('discord.js');
    mockClient = Client.mock.results[0].value;
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('Bot Initialization', () => {
    test('should load sessions on startup', () => {
      // Simulate bot ready
      mockClient._ready();
      
      // Verify sessions were loaded
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('session-mappings.json')
      );
      expect(mockFs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('session-mappings.json'),
        'utf8'
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Loaded 2 saved sessions')
      );
    });
    
    test('should handle missing session file gracefully', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      // Re-require the bot with no session file
      jest.resetModules();
      setupDiscordMocks();
      require('../discord-bot');
      
      const { Client } = require('discord.js');
      const newClient = Client.mock.results[Client.mock.results.length - 1].value;
      newClient._ready();
      
      // Should not crash and should log appropriately
      expect(console.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Failed to load sessions')
      );
    });
  });
  
  describe('Message Handling with Sessions', () => {
    beforeEach(() => {
      mockClient._ready();
    });
    
    test('should resume existing session for known channel', async () => {
      const message = createMockMessage({
        content: '<@bot-id> Hello, continue our conversation',
        channel: { 
          id: 'channel-1',
          name: 'general',
          send: jest.fn(),
          sendTyping: jest.fn()
        }
      });
      message.mentions.has.mockReturnValue(true);
      
      // Mock query to verify session resume
      mockQuery.mockImplementation(async function* ({ prompt, options }) {
        // Verify resume option is passed
        expect(options).toMatchObject({
          resume: 'session-1-uuid',
          maxTurns: expect.any(Number),
          cwd: expect.any(String)
        });
        
        yield {
          type: 'assistant',
          message: { 
            content: [{ type: 'text', text: 'Continuing our conversation!' }] 
          }
        };
      });
      
      // Simulate message
      await mockClient._emit('messageCreate', message);
      
      // Wait for async operations
      await new Promise(resolve => setImmediate(resolve));
      
      // Verify session was resumed
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Attempting to resume session session-1-uuid')
      );
      
      // Verify response was sent
      expect(message.reply).toHaveBeenCalled();
    });
    
    test('should create new session for unknown channel', async () => {
      const message = createMockMessage({
        content: '<@bot-id> Hello from new channel',
        channel: { 
          id: 'channel-new',
          name: 'new-channel',
          send: jest.fn(),
          sendTyping: jest.fn()
        }
      });
      message.mentions.has.mockReturnValue(true);
      
      const newSessionId = 'new-session-uuid';
      
      mockQuery.mockImplementation(async function* ({ prompt, options }) {
        // Should not have resume option
        expect(options).not.toHaveProperty('resume');
        
        yield {
          type: 'assistant',
          message: { 
            content: [{ type: 'text', text: 'Hello! I\'m starting a new conversation.' }] 
          },
          session_id: newSessionId
        };
      });
      
      await mockClient._emit('messageCreate', message);
      await new Promise(resolve => setImmediate(resolve));
      
      // Verify new session creation
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Creating new session for channel channel-new')
      );
      
      // Verify session was saved
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('session-mappings.json'),
        expect.stringContaining(newSessionId)
      );
    });
    
    test('should handle session info command', async () => {
      const message = createMockMessage({
        content: '<@bot-id> session info',
        channel: { id: 'channel-1', name: 'general' }
      });
      message.mentions.has.mockReturnValue(true);
      
      await mockClient._emit('messageCreate', message);
      
      // Verify embed was sent with session info
      expect(message.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([expect.any(Object)])
        })
      );
    });
    
    test('should handle session reset command', async () => {
      const message = createMockMessage({
        content: '<@bot-id> reset session',
        channel: { id: 'channel-1', name: 'general' }
      });
      message.mentions.has.mockReturnValue(true);
      
      await mockClient._emit('messageCreate', message);
      
      // Verify session was reset
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('Session session-1-uuid has been reset')
      );
      
      // Verify session was removed and saved
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });
  
  describe('Session Validation and Cleanup', () => {
    beforeEach(() => {
      mockClient._ready();
    });
    
    test('should reject sessions older than 7 days', async () => {
      // Create old session data
      const oldSessionData = {
        version: '1.0',
        sessions: [['channel-old', {
          sessionId: 'old-session-uuid',
          lastActivity: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days old
          messageCount: 5
        }]]
      };
      
      mockFs.readFileSync.mockReturnValue(JSON.stringify(oldSessionData));
      
      // Re-initialize to load old session
      jest.resetModules();
      setupDiscordMocks();
      require('../discord-bot');
      const { Client } = require('discord.js');
      const newClient = Client.mock.results[Client.mock.results.length - 1].value;
      newClient._ready();
      
      const message = createMockMessage({
        content: '<@bot-id> test old session',
        channel: { id: 'channel-old', name: 'old-channel' }
      });
      message.mentions.has.mockReturnValue(true);
      
      mockQuery.mockImplementation(async function* ({ options }) {
        // Should create new session, not resume
        expect(options).not.toHaveProperty('resume');
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'New session created' }] },
          session_id: 'fresh-session-uuid'
        };
      });
      
      await newClient._emit('messageCreate', message);
      await new Promise(resolve => setImmediate(resolve));
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('8 days old. Creating new session')
      );
    });
    
    test('should clean up old sessions periodically', () => {
      jest.useFakeTimers();
      
      mockClient._ready();
      
      // Fast forward 24 hours
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
      
      // Verify cleanup was scheduled
      expect(setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        24 * 60 * 60 * 1000
      );
      
      jest.useRealTimers();
    });
  });
  
  describe('Error Handling and Recovery', () => {
    beforeEach(() => {
      mockClient._ready();
    });
    
    test('should fallback to new session on resume error', async () => {
      const message = createMockMessage({
        content: '<@bot-id> test error recovery',
        channel: { id: 'channel-1', name: 'general' }
      });
      message.mentions.has.mockReturnValue(true);
      
      let callCount = 0;
      mockQuery.mockImplementation(async function* ({ options }) {
        callCount++;
        
        if (callCount === 1 && options.resume) {
          throw new Error('Session not found or expired');
        }
        
        // Second call should succeed without resume
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Created new session after error' }] },
          session_id: 'recovery-session-uuid'
        };
      });
      
      await mockClient._emit('messageCreate', message);
      await new Promise(resolve => setImmediate(resolve));
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Session resume failed')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Successfully created new session after resume failure')
      );
    });
    
    test('should handle corrupted session data', () => {
      mockFs.readFileSync.mockReturnValue('invalid json data');
      
      // Should not crash on startup
      jest.resetModules();
      setupDiscordMocks();
      require('../discord-bot');
      
      const { Client } = require('discord.js');
      const newClient = Client.mock.results[Client.mock.results.length - 1].value;
      newClient._ready();
      
      expect(console.error).toHaveBeenCalledWith(
        'Failed to load sessions:',
        expect.any(Error)
      );
    });
  });
  
  describe('Channel Isolation', () => {
    beforeEach(() => {
      mockClient._ready();
    });
    
    test('should maintain separate sessions per channel', async () => {
      const channels = ['channel-a', 'channel-b', 'channel-c'];
      const sessionIds = ['session-a', 'session-b', 'session-c'];
      
      for (let i = 0; i < channels.length; i++) {
        const message = createMockMessage({
          content: `<@bot-id> Message in ${channels[i]}`,
          channel: { 
            id: channels[i], 
            name: `Channel ${i}`,
            send: jest.fn(),
            sendTyping: jest.fn()
          }
        });
        message.mentions.has.mockReturnValue(true);
        
        mockQuery.mockImplementationOnce(async function* () {
          yield {
            type: 'assistant',
            message: { content: [{ type: 'text', text: `Response for ${channels[i]}` }] },
            session_id: sessionIds[i]
          };
        });
        
        await mockClient._emit('messageCreate', message);
        await new Promise(resolve => setImmediate(resolve));
      }
      
      // Get the last saved session data
      const savedCalls = mockFs.writeFileSync.mock.calls.filter(
        call => call[0].includes('session-mappings.json')
      );
      
      const lastSavedData = JSON.parse(savedCalls[savedCalls.length - 1][1]);
      const savedSessions = new Map(lastSavedData.sessions);
      
      // Verify each channel has its own session
      channels.forEach((channelId, index) => {
        expect(savedSessions.has(channelId)).toBe(true);
        expect(savedSessions.get(channelId).sessionId).toBe(sessionIds[index]);
      });
    });
  });
  
  describe('Performance and Edge Cases', () => {
    beforeEach(() => {
      mockClient._ready();
    });
    
    test('should handle rapid sequential messages', async () => {
      const channel = { 
        id: 'channel-rapid', 
        name: 'rapid-test',
        send: jest.fn(),
        sendTyping: jest.fn()
      };
      
      const messages = Array(5).fill(null).map((_, i) => 
        createMockMessage({
          content: `<@bot-id> Message ${i}`,
          channel
        })
      );
      
      messages.forEach(msg => msg.mentions.has.mockReturnValue(true));
      
      let responseCount = 0;
      mockQuery.mockImplementation(async function* () {
        responseCount++;
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: `Response ${responseCount}` }] },
          session_id: responseCount === 1 ? 'rapid-session-uuid' : undefined
        };
      });
      
      // Send all messages rapidly
      await Promise.all(
        messages.map(msg => mockClient._emit('messageCreate', msg))
      );
      
      // Wait for all to process
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // All messages should be processed
      expect(mockQuery).toHaveBeenCalledTimes(5);
      
      // Session should be created once and reused
      const sessionCreationLogs = console.log.mock.calls.filter(
        call => call[0]?.includes('Creating new session')
      );
      expect(sessionCreationLogs.length).toBe(1);
    });
    
    test('should handle very long session IDs', () => {
      const longSessionId = 'a'.repeat(1000) + '-uuid';
      const sessionData = {
        version: '1.0',
        sessions: [['channel-long', {
          sessionId: longSessionId,
          lastActivity: Date.now()
        }]]
      };
      
      mockFs.readFileSync.mockReturnValue(JSON.stringify(sessionData));
      
      // Should handle gracefully
      jest.resetModules();
      setupDiscordMocks();
      require('../discord-bot');
      
      const { Client } = require('discord.js');
      const newClient = Client.mock.results[Client.mock.results.length - 1].value;
      newClient._ready();
      
      // Should reject due to invalid UUID format
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Invalid session ID format')
      );
    });
  });
});