// Comprehensive test suite to achieve 90% coverage
// This focuses on testing the session management code directly

const SessionManager = require('../session-manager');
const fs = require('fs');
const path = require('path');

// Mock fs module
jest.mock('fs');

describe('Session Manager Full Coverage', () => {
  let sessionManager;
  const testFile = 'test-sessions.json';
  
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('{}');
    fs.writeFileSync.mockImplementation(() => {});
  });
  
  describe('Complete Coverage Tests', () => {
    test('should achieve 100% statement coverage', () => {
      // Test constructor with no file
      sessionManager = new SessionManager(testFile);
      expect(sessionManager.getSessionCount()).toBe(0);
      
      // Test setting session
      const session1 = {
        sessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        lastActivity: Date.now(),
        messageCount: 10
      };
      sessionManager.setSession('channel1', session1);
      expect(sessionManager.getSession('channel1')).toEqual(session1);
      
      // Test deleting session
      expect(sessionManager.deleteSession('channel1')).toBe(true);
      expect(sessionManager.deleteSession('nonexistent')).toBe(false);
      
      // Test validation - valid
      const validResult = sessionManager.validateSession(session1);
      expect(validResult.valid).toBe(true);
      
      // Test validation - invalid UUID
      const invalidUUID = { sessionId: 'bad-id', lastActivity: Date.now() };
      expect(sessionManager.validateSession(invalidUUID).valid).toBe(false);
      
      // Test validation - old session
      const oldSession = {
        sessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        lastActivity: Date.now() - (8 * 24 * 60 * 60 * 1000)
      };
      expect(sessionManager.validateSession(oldSession).valid).toBe(false);
      
      // Test validation - null/missing
      expect(sessionManager.validateSession(null).valid).toBe(false);
      expect(sessionManager.validateSession({}).valid).toBe(false);
      
      // Test cleanup
      sessionManager.setSession('old', oldSession);
      sessionManager.setSession('new', session1);
      expect(sessionManager.cleanupOldSessions()).toBe(1);
      expect(sessionManager.cleanupOldSessions()).toBe(0);
      
      // Test get all sessions
      const all = sessionManager.getAllSessions();
      expect(all.length).toBeGreaterThan(0);
      expect(all[0]).toHaveProperty('channelId');
      
      // Test clear all
      sessionManager.clearAllSessions();
      expect(sessionManager.getSessionCount()).toBe(0);
      
      // Test file error handling
      fs.writeFileSync.mockImplementationOnce(() => {
        throw new Error('Write failed');
      });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      expect(sessionManager.saveSessions()).toBe(false);
      errorSpy.mockRestore();
      
      // Test loading with file
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        version: '1.0',
        sessions: [['ch1', { sessionId: 'test' }]]
      }));
      const newManager = new SessionManager(testFile);
      expect(newManager.getSessionCount()).toBe(1);
      
      // Test loading with error
      fs.readFileSync.mockImplementationOnce(() => {
        throw new Error('Read failed');
      });
      const errorSpy2 = jest.spyOn(console, 'error').mockImplementation();
      const errorManager = new SessionManager(testFile);
      expect(errorManager.getSessionCount()).toBe(0);
      errorSpy2.mockRestore();
      
      // Test malformed JSON
      fs.readFileSync.mockReturnValue('bad json');
      const errorSpy3 = jest.spyOn(console, 'error').mockImplementation();
      const badManager = new SessionManager(testFile);
      expect(badManager.getSessionCount()).toBe(0);
      errorSpy3.mockRestore();
      
      // Test empty sessions array
      fs.readFileSync.mockReturnValue(JSON.stringify({
        version: '1.0',
        sessions: []
      }));
      const emptyManager = new SessionManager(testFile);
      expect(emptyManager.getSessionCount()).toBe(0);
      
      // Test missing sessions property
      fs.readFileSync.mockReturnValue(JSON.stringify({
        version: '1.0'
      }));
      const noSessionsManager = new SessionManager(testFile);
      expect(noSessionsManager.getSessionCount()).toBe(0);
    });
    
    test('should cover all edge cases', () => {
      sessionManager = new SessionManager();
      
      // Multiple operations
      for (let i = 0; i < 5; i++) {
        sessionManager.setSession(`ch${i}`, {
          sessionId: `id-${i}`,
          lastActivity: Date.now() - (i * 24 * 60 * 60 * 1000)
        });
      }
      
      expect(sessionManager.getSessionCount()).toBe(5);
      
      // Update existing
      sessionManager.setSession('ch0', { sessionId: 'updated' });
      expect(sessionManager.getSession('ch0').sessionId).toBe('updated');
      
      // Get all and verify structure
      const allSessions = sessionManager.getAllSessions();
      expect(Array.isArray(allSessions)).toBe(true);
      allSessions.forEach(session => {
        expect(session).toHaveProperty('channelId');
        expect(session).toHaveProperty('sessionId');
      });
      
      // Default session file path
      const defaultManager = new SessionManager();
      expect(defaultManager.sessionFile).toContain('session-mappings.json');
    });
  });
});