# Session Resume Testing Guide

## Overview
This guide outlines how to test the enhanced session resume functionality in the Discord bot.

## Implementation Summary

### What Was Added:
1. **Enhanced Session ID Detection**: Multiple methods to capture session ID from Claude SDK responses
2. **Improved Error Handling**: Automatic fallback to new session if resume fails
3. **Session Validation**: Pre-validation of session age and format before resume attempts
4. **Better Logging**: Detailed debug logs for troubleshooting

## Test Scenarios

### 1. Basic Session Creation
**Steps:**
1. Mention the bot with a simple query: `@Dot hello`
2. Check console logs for:
   - `🆕 Creating new session for channel [ID]`
   - `🆔 Captured session ID from [property]: [UUID]`
   - `💾 Saved session [UUID] for channel [ID]`
3. Run `@Dot session info` to verify session details

**Expected Result:** New session created and saved to `session-mappings.json`

### 2. Session Resume - Success Case
**Steps:**
1. Send a message to establish a session
2. Wait a few seconds
3. Send another message: `@Dot continue our conversation`
4. Check console logs for:
   - `🔄 Attempting to resume session [UUID] (age: Xh) for channel [ID]`
   - `✅ Successfully resumed session [UUID]`

**Expected Result:** Bot continues with existing session context

### 3. Session Resume - Failure with Fallback
**Steps:**
1. Manually edit `session-mappings.json` to corrupt a session ID
2. Send a message in that channel
3. Check console logs for:
   - `❌ Invalid session ID format: [corrupted-id]. Creating new session.`
   - Or if resume fails: `⚠️ Session resume failed: [error]`
   - `🔄 Attempting to create a new session instead...`

**Expected Result:** Bot creates new session after failed resume

### 4. Old Session Cleanup
**Steps:**
1. Manually edit `session-mappings.json` to set a session's lastActivity to 8+ days ago
2. Send a message in that channel
3. Check console logs for:
   - `⏰ Session [UUID] is X days old. Creating new session.`

**Expected Result:** Old session removed, new session created

### 5. Multi-Channel Sessions
**Steps:**
1. Start conversations in 3 different channels
2. Run `@Dot list sessions` (admin only)
3. Verify each channel has its own session
4. Switch between channels and verify context is maintained

**Expected Result:** Each channel maintains independent session

## Debug Commands

### Check Current Session
```
@Dot session info
```

### Reset Session
```
@Dot reset session
```

### List All Sessions (Admin)
```
@Dot list sessions
```

## Monitoring Points

### Console Logs to Watch:
- `📋 Query options:` - Shows what session options are being passed
- `🔍 Session ID not found. Message properties:` - Helps debug SDK response format
- Session validation messages (age, format checks)
- Error messages with session resume failures

### Session File Structure
Check `session-mappings.json` for:
```json
{
  "version": "1.0",
  "savedAt": "2025-06-30T18:34:23.300Z",
  "sessions": [
    [
      "channelId",
      {
        "sessionId": "valid-uuid-format",
        "lastActivity": timestamp,
        "messageCount": number,
        "channelName": "string",
        "guildName": "string"
      }
    ]
  ]
}
```

## Troubleshooting

### Session Not Resuming
1. Check if session ID is being captured (look for `🆔 Captured session ID`)
2. Verify session is not older than 7 days
3. Check session ID format is valid UUID
4. Look for error messages about session resume failures

### Session ID Not Found
1. Enable debug mode: `process.env.DEBUG = 'true'`
2. Check raw message logs for session ID location
3. The implementation checks multiple properties:
   - `msg.session_id`
   - `msg.sessionId`
   - `msg.options.sessionId`
   - `msg.metadata.sessionId`

### Testing After Bot Restart
1. Ensure sessions exist in `session-mappings.json`
2. Restart the bot
3. Send a message in a channel with existing session
4. Verify session resumes successfully

## Success Criteria

✅ Sessions persist across bot restarts
✅ Each channel maintains independent context
✅ Failed resume attempts fallback gracefully
✅ Old sessions are cleaned up automatically
✅ Session info commands work correctly
✅ Debug logs provide clear troubleshooting info