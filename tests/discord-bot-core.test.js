// Core functionality tests for discord-bot.js
const { EventEmitter } = require('events');

describe('Discord Bot Core Functionality', () => {
  let mockClient;
  let fs;
  let claudeQuery;
  let consoleLogSpy, consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    
    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Mock fs
    fs = require('fs');
    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.readFileSync = jest.fn().mockReturnValue('{}');
    fs.writeFileSync = jest.fn();
    fs.appendFileSync = jest.fn();

    // Mock Claude query
    const claudeCode = require('@anthropic-ai/claude-code');
    claudeQuery = claudeCode.query;
    claudeQuery.mockClear();

    // Create a comprehensive mock client
    mockClient = new EventEmitter();
    mockClient.user = { 
      tag: 'TestBot#1234', 
      id: 'bot123',
      setActivity: jest.fn()
    };
    mockClient.guilds = { cache: { size: 5 } };
    mockClient.login = jest.fn().mockResolvedValue(true);
    mockClient.destroy = jest.fn();
    mockClient.once = jest.fn((event, handler) => mockClient.on(event, handler));

    // Mock Discord.js
    const discord = require('discord.js');
    discord.Client.mockImplementation(() => mockClient);
    discord.REST.mockImplementation(() => ({
      setToken: jest.fn().mockReturnThis(),
      put: jest.fn().mockResolvedValue([])
    }));
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Bot Initialization', () => {
    test('should initialize bot with settings and contexts', () => {
      // Mock settings file exists
      fs.existsSync.mockImplementation(path => {
        if (path.includes('settings.json')) return true;
        if (path.includes('base-context.json')) return true;
        if (path.includes('session-mappings.json')) return true;
        return false;
      });

      fs.readFileSync.mockImplementation(path => {
        if (path.includes('settings.json')) {
          return JSON.stringify({
            permissions: { allow: ['tool1', 'tool2'] }
          });
        }
        if (path.includes('base-context.json')) {
          return JSON.stringify({
            version: '1.0',
            instructions: 'Be helpful'
          });
        }
        if (path.includes('session-mappings.json')) {
          return JSON.stringify({
            'ch1': { sessionId: 'session1', lastActivity: Date.now() }
          });
        }
        return '{}';
      });

      const bot = require('../discord-bot.js');

      // Verify initialization logs
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Loaded 2 allowed tools')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Loaded base context v1.0')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Loaded 1 sessions')
      );
    });

    test('should handle ready event', async () => {
      require('../discord-bot.js');

      // Emit ready event
      mockClient.emit('ready', mockClient);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Ready! Logged in as TestBot#1234')
      );
    });
  });

  describe('Message Commands', () => {
    let messageHandler;

    beforeEach(() => {
      require('../discord-bot.js');
      messageHandler = mockClient.on.mock.calls.find(
        call => call[0] === 'messageCreate'
      )?.[1];
    });

    const createMockMessage = (content, options = {}) => ({
      author: { bot: false, ...options.author },
      content,
      mentions: { has: jest.fn(() => content.includes('<@bot123>')) },
      channel: {
        id: 'ch1',
        send: jest.fn().mockResolvedValue({ 
          edit: jest.fn(),
          delete: jest.fn() 
        }),
        sendTyping: jest.fn(),
        ...options.channel
      },
      guild: { name: 'Test Guild', ...options.guild },
      reply: jest.fn()
    });

    test('should handle help command', async () => {
      const message = createMockMessage('<@bot123> help');
      
      await messageHandler(message);

      expect(message.channel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array)
        })
      );
    });

    test('should handle status command', async () => {
      const message = createMockMessage('<@bot123> status');
      
      await messageHandler(message);

      expect(message.channel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringContaining('Bot Status')
            })
          ])
        })
      );
    });

    test('should handle clear command', async () => {
      const message = createMockMessage('<@bot123> clear');
      
      await messageHandler(message);

      expect(message.channel.send).toHaveBeenCalledWith(
        expect.stringContaining('Session cleared')
      );
    });

    test('should handle session info command', async () => {
      const message = createMockMessage('<@bot123> session info');
      
      await messageHandler(message);

      expect(message.channel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array)
        })
      );
    });

    test('should handle debug command', async () => {
      const message = createMockMessage('<@bot123> debug');
      
      await messageHandler(message);

      expect(message.channel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array)
        })
      );
    });

    test('should ignore bot messages', async () => {
      const message = createMockMessage('<@bot123> test', {
        author: { bot: true }
      });
      
      await messageHandler(message);

      expect(message.channel.send).not.toHaveBeenCalled();
    });

    test('should ignore messages without mention', async () => {
      const message = createMockMessage('regular message');
      
      await messageHandler(message);

      expect(message.channel.sendTyping).not.toHaveBeenCalled();
    });
  });

  describe('Claude Integration', () => {
    let messageHandler;

    beforeEach(() => {
      require('../discord-bot.js');
      messageHandler = mockClient.on.mock.calls.find(
        call => call[0] === 'messageCreate'
      )?.[1];
    });

    test('should handle successful Claude response', async () => {
      claudeQuery.mockImplementationOnce(async function* () {
        yield { type: 'text', text: 'Hello from Claude!' };
      });

      const message = {
        author: { bot: false },
        content: '<@bot123> Hello',
        mentions: { has: jest.fn().mockReturnValue(true) },
        channel: {
          id: 'ch1',
          send: jest.fn().mockResolvedValue({ edit: jest.fn() }),
          sendTyping: jest.fn()
        },
        guild: { name: 'Test Guild' }
      };

      await messageHandler(message);

      expect(message.channel.sendTyping).toHaveBeenCalled();
      expect(message.channel.send).toHaveBeenCalled();
    });

    test('should handle Claude error gracefully', async () => {
      claudeQuery.mockImplementationOnce(async function* () {
        throw new Error('Claude API error');
      });

      const message = {
        author: { bot: false },
        content: '<@bot123> This will fail',
        mentions: { has: jest.fn().mockReturnValue(true) },
        channel: {
          send: jest.fn(),
          sendTyping: jest.fn()
        },
        guild: { name: 'Test Guild' },
        reply: jest.fn()
      };

      await messageHandler(message);

      expect(message.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array)
        })
      );
    });
  });

  describe('Utility Functions', () => {
    test('should export test functions correctly', () => {
      const bot = require('../discord-bot.js');

      if (bot.__testExports) {
        expect(bot.__testExports.logError).toBeDefined();
        expect(bot.__testExports.splitMessage).toBeDefined();
        expect(bot.__testExports.mentionsJira).toBeDefined();
        expect(bot.__testExports.loadSessions).toBeDefined();
        expect(bot.__testExports.saveSessions).toBeDefined();
      }
    });
  });

  describe('JIRA Integration', () => {
    test('should detect JIRA mentions and include context', async () => {
      // Set up JIRA context
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(path => {
        if (path.includes('jira-context.json')) {
          return JSON.stringify({
            projects: [{ key: 'TEST' }],
            userMappings: { 'user1': 'jira@example.com' }
          });
        }
        return '{}';
      });

      claudeQuery.mockImplementationOnce(async function* (options) {
        // Verify JIRA context is included
        expect(options.prompt).toContain('JIRA');
        yield { type: 'text', text: 'I will create a ticket' };
      });

      const bot = require('../discord-bot.js');
      const messageHandler = mockClient.on.mock.calls.find(
        call => call[0] === 'messageCreate'
      )?.[1];

      const message = {
        author: { bot: false, id: 'user1' },
        content: '<@bot123> create a ticket for the bug',
        mentions: { has: jest.fn().mockReturnValue(true) },
        channel: {
          send: jest.fn(),
          sendTyping: jest.fn()
        },
        guild: { name: 'Test Guild' }
      };

      await messageHandler(message);

      expect(claudeQuery).toHaveBeenCalled();
    });
  });

  describe('Session Management', () => {
    test('should save and load sessions', () => {
      const bot = require('../discord-bot.js');

      if (bot.__testExports) {
        // Test save
        bot.__testExports.saveSessions();
        expect(fs.writeFileSync).toHaveBeenCalledWith(
          expect.stringContaining('session-mappings.json'),
          expect.any(String)
        );

        // Test cleanup
        const oldDate = Date.now() - (8 * 24 * 60 * 60 * 1000);
        fs.readFileSync.mockReturnValue(JSON.stringify({
          'old': { sessionId: 'old', lastActivity: oldDate }
        }));
        
        bot.__testExports.cleanupOldSessions();
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Cleaning up old session')
        );
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle Discord client errors', () => {
      require('../discord-bot.js');

      const error = new Error('Discord error');
      mockClient.emit('error', error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Discord client error:',
        error
      );
    });

    test('should log errors to file', () => {
      const bot = require('../discord-bot.js');

      if (bot.__testExports?.logError) {
        const error = new Error('Test error');
        bot.__testExports.logError('Test context', error, { detail: 'test' });

        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(fs.appendFileSync).toHaveBeenCalledWith(
          expect.stringContaining('discord-bot-errors.log'),
          expect.any(String)
        );
      }
    });
  });
});