const fs = require('fs');
const path = require('path');

class SessionManager {
  constructor(sessionFile = path.join(__dirname, 'session-mappings.json')) {
    this.sessionFile = sessionFile;
    this.channelSessions = new Map();
    this.loadSessions();
  }

  // Load saved sessions on startup
  loadSessions() {
    try {
      if (fs.existsSync(this.sessionFile)) {
        const data = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
        // Convert array back to Map
        if (data.sessions && Array.isArray(data.sessions)) {
          data.sessions.forEach(([channelId, sessionData]) => {
            this.channelSessions.set(channelId, sessionData);
          });
          return data.sessions.length;
        }
      }
      return 0;
    } catch (error) {
      console.error('Failed to load sessions:', error);
      return 0;
    }
  }

  // Save sessions to file
  saveSessions() {
    try {
      const data = {
        version: '1.0',
        savedAt: new Date().toISOString(),
        sessions: Array.from(this.channelSessions.entries())
      };
      fs.writeFileSync(this.sessionFile, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error('Failed to save sessions:', error);
      return false;
    }
  }

  // Get session for a channel
  getSession(channelId) {
    return this.channelSessions.get(channelId);
  }

  // Set session for a channel
  setSession(channelId, sessionData) {
    this.channelSessions.set(channelId, sessionData);
    this.saveSessions();
  }

  // Delete session for a channel
  deleteSession(channelId) {
    const result = this.channelSessions.delete(channelId);
    if (result) {
      this.saveSessions();
    }
    return result;
  }

  // Validate session format and age
  validateSession(session) {
    if (!session || !session.sessionId) {
      return { valid: false, reason: 'No session or session ID' };
    }

    // Check UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!session.sessionId.match(uuidRegex)) {
      return { valid: false, reason: 'Invalid UUID format' };
    }

    // Check age (7 days)
    const sessionAge = Date.now() - session.lastActivity;
    const sessionAgeDays = Math.floor(sessionAge / (1000 * 60 * 60 * 24));
    if (sessionAgeDays >= 7) {
      return { valid: false, reason: `Session too old (${sessionAgeDays} days)` };
    }

    return { valid: true, ageHours: Math.floor(sessionAge / (1000 * 60 * 60)) };
  }

  // Clean up old sessions (older than 7 days)
  cleanupOldSessions() {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    let cleaned = 0;
    
    for (const [channelId, sessionData] of this.channelSessions.entries()) {
      if (sessionData.lastActivity < sevenDaysAgo) {
        this.channelSessions.delete(channelId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.saveSessions();
    }
    
    return cleaned;
  }

  // Get all sessions (for admin listing)
  getAllSessions() {
    return Array.from(this.channelSessions.entries()).map(([channelId, data]) => ({
      channelId,
      ...data
    }));
  }

  // Clear all sessions
  clearAllSessions() {
    this.channelSessions.clear();
    this.saveSessions();
  }

  // Get session count
  getSessionCount() {
    return this.channelSessions.size;
  }
}

module.exports = SessionManager;