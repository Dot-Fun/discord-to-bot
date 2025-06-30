const fs = require('fs');
const path = require('path');
const SessionManager = require('../session-manager');

// Mock fs module
jest.mock('fs');

describe('SessionManager', () => {
  let sessionManager;
  const testSessionFile = path.join(__dirname, 'test-sessions.json');
  
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Reset fs mock implementations
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('{}');
    fs.writeFileSync.mockImplementation(() => {});
  });

  afterEach(() => {
    // Clean up
    if (sessionManager) {
      sessionManager.clearAllSessions();
    }
  });

  describe('Constructor and Loading', () => {
    test('should create instance with default session file', () => {
      sessionManager = new SessionManager();
      expect(sessionManager.sessionFile).toBe(path.join(__dirname, '..', 'session-mappings.json'));
    });

    test('should create instance with custom session file', () => {
      sessionManager = new SessionManager(testSessionFile);
      expect(sessionManager.sessionFile).toBe(testSessionFile);
    });

    test('should load sessions from existing file', () => {
      const mockData = {
        version: '1.0',
        savedAt: '2025-06-30T12:00:00.000Z',
        sessions: [
          ['channel1', { sessionId: '123', lastActivity: Date.now() }],
          ['channel2', { sessionId: '456', lastActivity: Date.now() }]
        ]
      };
      
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockData));
      
      sessionManager = new SessionManager(testSessionFile);
      
      expect(fs.existsSync).toHaveBeenCalledWith(testSessionFile);
      expect(fs.readFileSync).toHaveBeenCalledWith(testSessionFile, 'utf8');
      expect(sessionManager.getSessionCount()).toBe(2);
    });

    test('should handle missing session file gracefully', () => {
      fs.existsSync.mockReturnValue(false);
      
      sessionManager = new SessionManager(testSessionFile);
      
      expect(sessionManager.getSessionCount()).toBe(0);
    });

    test('should handle corrupted session file gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      sessionManager = new SessionManager(testSessionFile);
      
      expect(consoleSpy).toHaveBeenCalled();
      expect(sessionManager.getSessionCount()).toBe(0);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Session CRUD Operations', () => {
    beforeEach(() => {
      sessionManager = new SessionManager(testSessionFile);
    });

    test('should set and get session', () => {
      const channelId = 'channel123';
      const sessionData = {
        sessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        lastActivity: Date.now(),
        messageCount: 5,
        channelName: 'test-channel',
        guildName: 'test-guild'
      };
      
      sessionManager.setSession(channelId, sessionData);
      
      const retrieved = sessionManager.getSession(channelId);
      expect(retrieved).toEqual(sessionData);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    test('should return undefined for non-existent session', () => {
      const result = sessionManager.getSession('non-existent');
      expect(result).toBeUndefined();
    });

    test('should delete session', () => {
      const channelId = 'channel123';
      const sessionData = { sessionId: 'test', lastActivity: Date.now() };
      
      sessionManager.setSession(channelId, sessionData);
      expect(sessionManager.getSession(channelId)).toBeDefined();
      
      const result = sessionManager.deleteSession(channelId);
      
      expect(result).toBe(true);
      expect(sessionManager.getSession(channelId)).toBeUndefined();
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2); // Once for set, once for delete
    });

    test('should return false when deleting non-existent session', () => {
      const result = sessionManager.deleteSession('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('Session Validation', () => {
    beforeEach(() => {
      sessionManager = new SessionManager(testSessionFile);
    });

    test('should validate correct session', () => {
      const session = {
        sessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        lastActivity: Date.now() - (2 * 60 * 60 * 1000) // 2 hours ago
      };
      
      const result = sessionManager.validateSession(session);
      
      expect(result.valid).toBe(true);
      expect(result.ageHours).toBe(2);
    });

    test('should reject session with invalid UUID format', () => {
      const session = {
        sessionId: 'invalid-uuid',
        lastActivity: Date.now()
      };
      
      const result = sessionManager.validateSession(session);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invalid UUID format');
    });

    test('should reject session older than 7 days', () => {
      const session = {
        sessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        lastActivity: Date.now() - (8 * 24 * 60 * 60 * 1000) // 8 days ago
      };
      
      const result = sessionManager.validateSession(session);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Session too old');
    });

    test('should reject null or missing session', () => {
      expect(sessionManager.validateSession(null).valid).toBe(false);
      expect(sessionManager.validateSession({}).valid).toBe(false);
      expect(sessionManager.validateSession({ sessionId: null }).valid).toBe(false);
    });
  });

  describe('Cleanup Operations', () => {
    beforeEach(() => {
      sessionManager = new SessionManager(testSessionFile);
    });

    test('should cleanup old sessions', () => {
      const now = Date.now();
      
      // Add mix of old and new sessions
      sessionManager.setSession('old1', {
        sessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        lastActivity: now - (8 * 24 * 60 * 60 * 1000) // 8 days old
      });
      sessionManager.setSession('old2', {
        sessionId: 'a47ac10b-58cc-4372-a567-0e02b2c3d479',
        lastActivity: now - (10 * 24 * 60 * 60 * 1000) // 10 days old
      });
      sessionManager.setSession('new1', {
        sessionId: 'b47ac10b-58cc-4372-a567-0e02b2c3d479',
        lastActivity: now - (2 * 24 * 60 * 60 * 1000) // 2 days old
      });
      
      const cleaned = sessionManager.cleanupOldSessions();
      
      expect(cleaned).toBe(2);
      expect(sessionManager.getSession('old1')).toBeUndefined();
      expect(sessionManager.getSession('old2')).toBeUndefined();
      expect(sessionManager.getSession('new1')).toBeDefined();
    });

    test('should return 0 when no sessions to cleanup', () => {
      const now = Date.now();
      
      sessionManager.setSession('new1', {
        sessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        lastActivity: now
      });
      
      const cleaned = sessionManager.cleanupOldSessions();
      expect(cleaned).toBe(0);
    });

    test('should clear all sessions', () => {
      sessionManager.setSession('channel1', { sessionId: 'test1' });
      sessionManager.setSession('channel2', { sessionId: 'test2' });
      
      expect(sessionManager.getSessionCount()).toBe(2);
      
      sessionManager.clearAllSessions();
      
      expect(sessionManager.getSessionCount()).toBe(0);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('Session Listing and Info', () => {
    beforeEach(() => {
      sessionManager = new SessionManager(testSessionFile);
    });

    test('should get all sessions', () => {
      const sessions = {
        channel1: { sessionId: 'test1', lastActivity: Date.now() },
        channel2: { sessionId: 'test2', lastActivity: Date.now() }
      };
      
      Object.entries(sessions).forEach(([channelId, data]) => {
        sessionManager.setSession(channelId, data);
      });
      
      const allSessions = sessionManager.getAllSessions();
      
      expect(allSessions).toHaveLength(2);
      expect(allSessions[0]).toHaveProperty('channelId');
      expect(allSessions[0]).toHaveProperty('sessionId');
    });

    test('should get correct session count', () => {
      expect(sessionManager.getSessionCount()).toBe(0);
      
      sessionManager.setSession('channel1', { sessionId: 'test1' });
      expect(sessionManager.getSessionCount()).toBe(1);
      
      sessionManager.setSession('channel2', { sessionId: 'test2' });
      expect(sessionManager.getSessionCount()).toBe(2);
      
      sessionManager.deleteSession('channel1');
      expect(sessionManager.getSessionCount()).toBe(1);
    });
  });

  describe('File Operations Error Handling', () => {
    beforeEach(() => {
      sessionManager = new SessionManager(testSessionFile);
    });

    test('should handle save errors gracefully', () => {
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Write error');
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const result = sessionManager.saveSessions();
      
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to save sessions:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });

    test('should handle load errors gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const newManager = new SessionManager(testSessionFile);
      
      expect(newManager.getSessionCount()).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load sessions:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      sessionManager = new SessionManager(testSessionFile);
    });

    test('should handle empty sessions array in file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        version: '1.0',
        savedAt: new Date().toISOString(),
        sessions: []
      }));
      
      const newManager = new SessionManager(testSessionFile);
      expect(newManager.getSessionCount()).toBe(0);
    });

    test('should handle malformed session data in file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        version: '1.0',
        // Missing sessions array
      }));
      
      const newManager = new SessionManager(testSessionFile);
      expect(newManager.getSessionCount()).toBe(0);
    });

    test('should handle updating existing session', () => {
      const channelId = 'channel123';
      const session1 = { sessionId: 'test1', messageCount: 1 };
      const session2 = { sessionId: 'test1', messageCount: 2 };
      
      sessionManager.setSession(channelId, session1);
      sessionManager.setSession(channelId, session2);
      
      const retrieved = sessionManager.getSession(channelId);
      expect(retrieved.messageCount).toBe(2);
    });
  });
});