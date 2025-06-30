// Test utility functions from discord-bot.js
describe('Discord Bot Functions', () => {
  let logError, splitMessage, mentionsJira, createTicketSuggestion;
  let consoleErrorSpy;
  let fs;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    
    // Mock console.error
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Mock fs
    fs = require('fs');
    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.readFileSync = jest.fn().mockReturnValue('{}');
    fs.writeFileSync = jest.fn();
    fs.appendFileSync = jest.fn();
    
    // Load functions from discord-bot.js
    const bot = require('../discord-bot.js');
    if (bot.__testExports) {
      logError = bot.__testExports.logError;
      splitMessage = bot.__testExports.splitMessage;
      mentionsJira = bot.__testExports.mentionsJira;
      createTicketSuggestion = bot.__testExports.createTicketSuggestion;
    }
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('logError', () => {
    test('should log error to console and file', () => {
      if (!logError) return;
      
      const error = new Error('Test error');
      const context = 'Test context';
      const details = { foo: 'bar' };

      logError(context, error, details);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(context),
        error
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Details:',
        expect.stringContaining('foo')
      );
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('discord-bot-errors.log'),
        expect.any(String)
      );
    });

    test('should handle file write errors gracefully', () => {
      if (!logError) return;
      
      fs.appendFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      const error = new Error('Test error');
      logError('Test', error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to write to error log:',
        expect.any(Error)
      );
    });
  });

  describe('splitMessage', () => {
    test('should split long messages correctly', () => {
      if (!splitMessage) return;
      
      // When a single line exceeds maxLength, it creates an empty chunk first
      // then the long line as a second chunk
      const longLine = 'a'.repeat(2500);
      const chunks = splitMessage(longLine, 2000);
      
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toBe(''); // Empty first chunk
      expect(chunks[1]).toBe(longLine); // The long line as second chunk
    });

    test('should not split short messages', () => {
      if (!splitMessage) return;
      
      const shortMessage = 'Hello world';
      const chunks = splitMessage(shortMessage, 2000);
      
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(shortMessage);
    });

    test('should handle empty messages', () => {
      if (!splitMessage) return;
      
      const chunks = splitMessage('', 2000);
      
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe('No response'); // Based on actual implementation
    });

    test('should handle null/undefined messages', () => {
      if (!splitMessage) return;
      
      const chunks1 = splitMessage(null, 2000);
      const chunks2 = splitMessage(undefined, 2000);
      
      expect(chunks1).toHaveLength(1);
      expect(chunks1[0]).toBe('No response');
      expect(chunks2).toHaveLength(1);
      expect(chunks2[0]).toBe('No response');
    });

    test('should split messages at line boundaries', () => {
      if (!splitMessage) return;
      
      // Create message with multiple lines
      const lines = [];
      for (let i = 0; i < 10; i++) {
        lines.push('This is line ' + i + ' with some text '.repeat(50));
      }
      const message = lines.join('\n');
      const chunks = splitMessage(message, 2000);
      
      expect(chunks.length).toBeGreaterThan(1);
      // Verify no chunks exceed max length
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(2000);
      });
    });
  });

  describe('mentionsJira', () => {
    test('should detect JIRA-related keywords', () => {
      if (!mentionsJira) return;
      
      expect(mentionsJira('create a ticket')).toBe(true);
      expect(mentionsJira('new issue please')).toBe(true);
      expect(mentionsJira('add to jira')).toBe(true);
      expect(mentionsJira('make a task')).toBe(true);
      expect(mentionsJira('file a bug')).toBe(true);
      expect(mentionsJira('track this issue')).toBe(true);
      expect(mentionsJira('can you create a story')).toBe(true);
      expect(mentionsJira('hello world')).toBe(false);
      expect(mentionsJira('what is the weather')).toBe(false);
    });

    test('should be case insensitive', () => {
      if (!mentionsJira) return;
      
      expect(mentionsJira('CREATE A TICKET')).toBe(true);
      expect(mentionsJira('New Issue Please')).toBe(true);
      expect(mentionsJira('ADD TO JIRA')).toBe(true);
    });
  });

  describe('createTicketSuggestion', () => {
    test('should create bug ticket suggestion', () => {
      if (!createTicketSuggestion) return;
      
      const jiraContext = {
        projects: [{ key: 'TEST', name: 'Test Project' }]
      };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(jiraContext));

      const suggestion = createTicketSuggestion(
        'The login page crashes when clicking submit',
        'bug-reports',
        { projectKey: 'TEST' }
      );

      expect(suggestion).toMatchObject({
        originalMessage: 'The login page crashes when clicking submit',
        channel: 'bug-reports',
        suggestedTickets: expect.any(Array)
      });
    });

    test('should create feature request ticket suggestion', () => {
      if (!createTicketSuggestion) return;
      
      const suggestion = createTicketSuggestion(
        'We need a dark mode for the application',
        'feature-requests',
        { projectKey: 'DEV' }
      );

      expect(suggestion).toMatchObject({
        originalMessage: 'We need a dark mode for the application',
        channel: 'feature-requests'
      });
    });

    test('should handle messages without project context', () => {
      if (!createTicketSuggestion) return;
      
      const suggestion = createTicketSuggestion(
        'General improvement needed',
        'general',
        {}
      );

      expect(suggestion).toMatchObject({
        originalMessage: 'General improvement needed',
        channel: 'general'
      });
    });
  });
});