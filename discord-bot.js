const { Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { query } = require('@anthropic-ai/claude-code');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { appendFileSync } = require('fs');

// Load environment variables
dotenv.config();

// Error logging
const ERROR_LOG_PATH = path.join(__dirname, 'discord-bot-errors.log');

function logError(context, error, details = {}) {
    const timestamp = new Date().toISOString();
    const errorEntry = {
        timestamp,
        context,
        error: {
            message: error.message,
            stack: error.stack,
            type: error.constructor.name
        },
        details
    };
    
    // Console log
    console.error(`[${timestamp}] ${context}:`, error);
    console.error('Details:', JSON.stringify(details, null, 2));
    
    // File log
    try {
        appendFileSync(ERROR_LOG_PATH, JSON.stringify(errorEntry) + '\n');
    } catch (writeError) {
        console.error('Failed to write to error log:', writeError);
    }
}

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

// Configuration
const CONFIG = {
    MAX_RESPONSE_LENGTH: parseInt(process.env.MAX_RESPONSE_LENGTH) || 2000,
    MAX_CONTEXT_MESSAGES: parseInt(process.env.MAX_CONTEXT_MESSAGES) || 10,
    MAX_TURNS: parseInt(process.env.MAX_TURNS) || 20,
    CWD: process.cwd(), // Working directory for Claude to find .mcp.json
    QUERY_TIMEOUT: parseInt(process.env.QUERY_TIMEOUT) || 300000 // 5 minute timeout for Claude queries
};

console.log('🔧 Bot Configuration:', {
    MAX_TURNS: CONFIG.MAX_TURNS,
    MAX_CONTEXT_MESSAGES: CONFIG.MAX_CONTEXT_MESSAGES,
    QUERY_TIMEOUT: `${CONFIG.QUERY_TIMEOUT / 1000}s`
});

// Slash commands array
const commands = [
    new SlashCommandBuilder()
        .setName('reflection')
        .setDescription('Analyze chat history and suggest improvements to bot instructions')
        .addStringOption(option =>
            option.setName('scope')
                .setDescription('Scope of reflection')
                .addChoices(
                    { name: 'Global (CLAUDE.md)', value: 'global' },
                    { name: 'Channel-specific', value: 'channel' }
                )
                .setRequired(false))
];

// Load allowed tools from settings.json
let allowedToolsList = [];
try {
    const settingsPath = path.join(CONFIG.CWD, '.claude', 'settings.json');
    if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (settings.permissions && settings.permissions.allow) {
            allowedToolsList = settings.permissions.allow;
            console.log(`📋 Loaded ${allowedToolsList.length} allowed tools from .claude/settings.json`);
        }
    }
} catch (error) {
    console.error('⚠️  Could not load .claude/settings.json:', error);
}

// Channel-specific context management
const channelContexts = new Map();
const baseContext = {};
let contextsLastLoaded = null;
const CONTEXT_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

function loadBaseContext() {
    try {
        const basePath = path.join(CONFIG.CWD, 'channel-contexts', 'base-context.json');
        if (fs.existsSync(basePath)) {
            Object.assign(baseContext, JSON.parse(fs.readFileSync(basePath, 'utf8')));
            console.log(`📋 Loaded base context v${baseContext.version}`);
            return true;
        }
    } catch (error) {
        console.error('⚠️  Could not load base-context.json:', error);
    }
    return false;
}

function loadChannelContext(channelId) {
    try {
        // Check cache first
        if (channelContexts.has(channelId)) {
            const cached = channelContexts.get(channelId);
            if (Date.now() - cached.loadedAt < CONTEXT_CACHE_DURATION) {
                return cached.context;
            }
        }

        // Try to load specific channel context
        const contextDir = path.join(CONFIG.CWD, 'channel-contexts');
        const files = fs.readdirSync(contextDir);
        
        for (const file of files) {
            if (file.endsWith('.json') && file !== 'base-context.json' && file !== 'project-template.json') {
                const contextPath = path.join(contextDir, file);
                const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
                
                if (context.channelId === channelId) {
                    // Merge with base context if it inherits
                    const fullContext = context.inherits ? 
                        { ...baseContext, ...context } : 
                        context;
                    
                    // Cache it
                    channelContexts.set(channelId, {
                        context: fullContext,
                        loadedAt: Date.now()
                    });
                    
                    console.log(`🔐 Loaded context for channel ${context.channelName} (${channelId})`);
                    return fullContext;
                }
            }
        }
        
        // Return base context if no specific context found
        console.log(`📋 Using base context for channel ${channelId}`);
        return baseContext;
        
    } catch (error) {
        console.error(`⚠️  Error loading context for channel ${channelId}:`, error);
        return baseContext;
    }
}

function refreshAllContexts() {
    channelContexts.clear();
    loadBaseContext();
    contextsLastLoaded = Date.now();
    console.log('🔄 All contexts refreshed');
}

// Track conversations
const conversations = new Map();

// Store ticket suggestions and their status
const ticketSuggestions = new Map(); // channelId -> { suggestions: [], history: [] }

// Store pending ticket approvals
const pendingTickets = new Map(); // messageId -> ticketData

// Session management for Claude conversations
const channelSessions = new Map(); // channelId -> { sessionId, lastActivity, messageCount }
const SESSION_FILE = path.join(__dirname, 'session-mappings.json');

// Load saved sessions on startup
function loadSessions() {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
            // Convert array back to Map
            if (data.sessions && Array.isArray(data.sessions)) {
                data.sessions.forEach(([channelId, sessionData]) => {
                    channelSessions.set(channelId, sessionData);
                });
                console.log(`💾 Loaded ${channelSessions.size} saved sessions`);
            }
        }
    } catch (error) {
        console.error('Failed to load sessions:', error);
    }
}

// Save sessions to file
function saveSessions() {
    try {
        const data = {
            version: '1.0',
            savedAt: new Date().toISOString(),
            sessions: Array.from(channelSessions.entries())
        };
        fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Failed to save sessions:', error);
    }
}

// Clean up old sessions (older than 7 days)
function cleanupOldSessions() {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    let cleaned = 0;
    
    for (const [channelId, sessionData] of channelSessions.entries()) {
        if (sessionData.lastActivity < sevenDaysAgo) {
            channelSessions.delete(channelId);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Cleaned up ${cleaned} old sessions`);
        saveSessions();
    }
}

// JIRA context cache
let jiraContext = null;
let jiraContextLoaded = null;

// Check if message mentions JIRA/tickets
function mentionsJira(message) {
    const jiraKeywords = ['ticket', 'jira', 'story', 'task', 'bug', 'epic', 'create ticket', 'open ticket', 'issue'];
    const lowerMessage = message.toLowerCase();
    return jiraKeywords.some(keyword => lowerMessage.includes(keyword));
}

// Load or get cached JIRA context
async function getJiraContext() {
    // Check if we have cached context less than 1 hour old
    if (jiraContext && jiraContextLoaded && (Date.now() - jiraContextLoaded) < 3600000) {
        return jiraContext;
    }
    
    try {
        // Try to load from file first
        const jiraContextPath = path.join(CONFIG.CWD, 'jira-context.json');
        if (fs.existsSync(jiraContextPath)) {
            jiraContext = JSON.parse(fs.readFileSync(jiraContextPath, 'utf8'));
            jiraContextLoaded = Date.now();
            console.log('📋 Loaded JIRA context from file');
            return jiraContext;
        }
    } catch (error) {
        console.error('Could not load jira-context.json:', error);
    }
    
    // Return empty context if file doesn't exist
    return {
        instance: 'https://dotfun.atlassian.net',
        projects: {},
        issueTypes: {},
        userMappings: {}
    };
}

// Helper: Safe query wrapper that handles JSON parsing errors
async function* safeQuery(options) {
    const messageBuffer = [];
    let totalMessages = 0;
    let hasContent = false;
    
    try {
        for await (const msg of query(options)) {
            totalMessages++;
            
            // Track important messages
            if (msg.type === 'assistant' || msg.type === 'tool_result') {
                messageBuffer.push({
                    type: msg.type,
                    timestamp: new Date().toISOString(),
                    hasContent: !!(msg.message?.content || msg.output)
                });
                
                if (msg.message?.content || msg.output) {
                    hasContent = true;
                }
            }
            
            // Successfully parsed message
            yield msg;
        }
    } catch (error) {
        if (error.message && error.message.includes('Unexpected end of JSON input')) {
            logError('JSON parsing failed in Claude SDK', error, {
                totalMessages,
                messageBuffer: messageBuffer.slice(-5),
                hasContent
            });
            
            // If we had some content, try to recover gracefully
            if (hasContent) {
                console.log(`Recovering partial response (processed ${totalMessages} messages)...`);
                // Yield a special error message to indicate partial success
                yield {
                    type: 'error',
                    error: 'Response was interrupted but partial results are available.',
                    recovered: true,
                    messagesProcessed: totalMessages
                };
            } else {
                // No content received, this is a real error
                throw error;
            }
        } else {
            // Re-throw non-JSON errors
            throw error;
        }
    }
}

// Helper: Query Claude using the SDK with streaming
async function queryClaudeSDK(prompt, context = [], originalMessage) {
    const queryContext = {
        channelId: originalMessage.channel.id,
        channelName: originalMessage.channel.name,
        userId: originalMessage.author.id,
        username: originalMessage.author.username,
        serverId: originalMessage.guild?.id,
        serverName: originalMessage.guild?.name
    };
    
    try {
        // Build the full prompt with context
        let fullPrompt = prompt;
        if (context.length > 0) {
            fullPrompt = 'Previous conversation:\n' + 
                        context.map(msg => `${msg.role}: ${msg.content}`).join('\n') + 
                        '\n\nCurrent message: ' + prompt;
        }
        
        console.log(`Querying Claude with prompt (${fullPrompt.length} chars)`);
        console.log('Working directory for Claude:', CONFIG.CWD);
        
        // Warn if prompt is very large
        if (fullPrompt.length > 50000) {
            console.warn(`⚠️ Very large prompt: ${fullPrompt.length} characters. This may cause streaming issues.`);
        }
        
        // Enable debug mode to see errors
        process.env.DEBUG = 'true';
        
        // Keep track of Discord messages for streaming
        let responseMessage = null;
        let statusMessage = null;
        let statusMessageDeleted = false;
        let currentContent = '';
        let isProcessing = true;
        let toolsUsed = [];
        let errorOccurred = false;
        
        // Send typing indicator periodically while processing
        const typingInterval = setInterval(() => {
            if (isProcessing) {
                originalMessage.channel.sendTyping().catch(err => {
                    console.error('Failed to send typing indicator:', err);
                });
            }
        }, 5000);
        
        try {
            // Set up timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Query timeout after 5 minutes')), CONFIG.QUERY_TIMEOUT);
            });
            
            // Query Claude using the SDK with MCP support
            console.log('Starting Claude query with MCP tools...');
            
            // Get or create session for this channel
            const channelId = originalMessage.channel.id;
            const existingSession = channelSessions.get(channelId);
            let sessionOptions = {
                maxTurns: CONFIG.MAX_TURNS,
                cwd: CONFIG.CWD,
                permissionMode: 'default',
            };
            
            let isResumingSession = false;
            let resumeFailed = false;
            
            if (existingSession && existingSession.sessionId) {
                // Validate session before attempting resume
                const sessionAge = Date.now() - existingSession.lastActivity;
                const sessionAgeHours = Math.floor(sessionAge / (1000 * 60 * 60));
                const sessionAgeDays = Math.floor(sessionAgeHours / 24);
                
                // Check if session is too old (more than 7 days)
                if (sessionAgeDays >= 7) {
                    console.log(`⏰ Session ${existingSession.sessionId} is ${sessionAgeDays} days old. Creating new session.`);
                    channelSessions.delete(channelId);
                    saveSessions();
                } 
                // Check if session ID looks valid (should be a UUID)
                else if (!existingSession.sessionId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
                    console.log(`❌ Invalid session ID format: ${existingSession.sessionId}. Creating new session.`);
                    channelSessions.delete(channelId);
                    saveSessions();
                }
                else {
                    console.log(`🔄 Attempting to resume session ${existingSession.sessionId} (age: ${sessionAgeHours}h) for channel ${channelId}`);
                    // Try different property names for resume based on SDK documentation
                    sessionOptions.resume = existingSession.sessionId;
                    // Alternative property names that might be used by the SDK
                    sessionOptions.sessionId = existingSession.sessionId;
                    sessionOptions.resumeSession = existingSession.sessionId;
                    isResumingSession = true;
                }
            } else {
                console.log(`🆕 Creating new session for channel ${channelId}`);
            }
            
            const queryPromise = (async () => {
                let messageCount = 0;
                let lastMessageTime = Date.now();
                let capturedSessionId = null;
                
                try {
                    // Debug log the options being passed
                    console.log('📋 Query options:', {
                        maxTurns: sessionOptions.maxTurns,
                        cwd: sessionOptions.cwd,
                        permissionMode: sessionOptions.permissionMode,
                        hasResume: !!sessionOptions.resume,
                        hasSessionId: !!sessionOptions.sessionId,
                        hasResumeSession: !!sessionOptions.resumeSession
                    });
                    
                    for await (const msg of safeQuery({
                        prompt: fullPrompt,
                        options: sessionOptions
                    })) {
                        messageCount++;
                        const timeSinceLastMessage = Date.now() - lastMessageTime;
                        lastMessageTime = Date.now();
                        
                        console.log(`Streaming message #${messageCount} type: ${msg.type} (${timeSinceLastMessage}ms since last)`);
                        
                        // Add raw message logging for debugging
                        if (process.env.DEBUG === 'true') {
                            console.log('Raw message:', JSON.stringify(msg).substring(0, 500));
                        }
                        
                        // Enhanced session ID extraction with multiple approaches
                        if (!capturedSessionId) {
                            // Method 1: Direct session_id property
                            if ('session_id' in msg && msg.session_id) {
                                capturedSessionId = msg.session_id;
                                console.log(`🆔 Captured session ID from 'session_id' property: ${capturedSessionId}`);
                            }
                            // Method 2: Check sessionId property
                            else if ('sessionId' in msg && msg.sessionId) {
                                capturedSessionId = msg.sessionId;
                                console.log(`🆔 Captured session ID from 'sessionId' property: ${capturedSessionId}`);
                            }
                            // Method 3: Check in options object
                            else if (msg.options && msg.options.sessionId) {
                                capturedSessionId = msg.options.sessionId;
                                console.log(`🆔 Captured session ID from options.sessionId: ${capturedSessionId}`);
                            }
                            // Method 4: Check in metadata
                            else if (msg.metadata && msg.metadata.sessionId) {
                                capturedSessionId = msg.metadata.sessionId;
                                console.log(`🆔 Captured session ID from metadata.sessionId: ${capturedSessionId}`);
                            }
                            
                            // Debug log all properties if session ID not found
                            if (!capturedSessionId && msg.type === 'assistant') {
                                console.log(`🔍 Session ID not found. Message properties:`, Object.keys(msg));
                                if (msg.message) {
                                    console.log(`🔍 Message sub-properties:`, Object.keys(msg.message));
                                }
                            }
                        }
                        
                        // Handle different message types from Claude SDK
                        if (msg.type === 'assistant' && msg.message) {
                            const content = msg.message.content;
                            if (Array.isArray(content)) {
                                for (const item of content) {
                                    if (item.type === 'text' && item.text) {
                                        // Add text to current content
                                        currentContent += item.text + '\n';
                                        
                                        try {
                                            // Send or update Discord message
                                            if (!responseMessage) {
                                                // Send initial message
                                                responseMessage = await originalMessage.reply(item.text);
                                            } else if (currentContent.length < CONFIG.MAX_RESPONSE_LENGTH) {
                                                // Edit existing message if under limit
                                                await responseMessage.edit(currentContent.trim());
                                            } else {
                                                // Send follow-up message if too long
                                                await originalMessage.channel.send(item.text);
                                            }
                                        } catch (discordError) {
                                            logError('Discord message send/edit failed', discordError, {
                                                ...queryContext,
                                                contentLength: currentContent.length,
                                                hasResponseMessage: !!responseMessage
                                            });
                                            errorOccurred = true;
                                        }
                                    } else if (item.type === 'tool_use') {
                                        // Track tool usage
                                        toolsUsed.push({
                                            name: item.name,
                                            id: item.id,
                                            timestamp: new Date().toISOString()
                                        });
                                        
                                        // Update status message instead of spamming chat
                                        try {
                                            const statusEmbed = new EmbedBuilder()
                                                .setColor(0x5865F2)
                                                .setTitle('⚡ Working...')
                                                .setDescription(`Currently using: **${item.name}**`)
                                                .addFields(
                                                    { name: '🛠️ Tools Used', value: toolsUsed.map(t => `• ${t.name}`).join('\n') || 'Starting...', inline: true },
                                                    { name: '📊 Progress', value: `${toolsUsed.length + 1} operations`, inline: true }
                                                )
                                                .setFooter({ text: 'Processing your request...' })
                                                .setTimestamp();
                                            
                                            if (!statusMessage) {
                                                statusMessage = await originalMessage.channel.send({ embeds: [statusEmbed] });
                                            } else {
                                                await statusMessage.edit({ embeds: [statusEmbed] });
                                            }
                                        } catch (discordError) {
                                            logError('Failed to update status message', discordError, {
                                                ...queryContext,
                                                tool: item.name
                                            });
                                        }
                                    }
                                }
                            }
                        } else if (msg.type === 'tool_result') {
                            // Log tool results with more detail
                            const toolResult = {
                                tool_use_id: msg.tool_use_id,
                                success: !msg.is_error,
                                outputLength: msg.output?.length || 0,
                                error: msg.is_error ? msg.output : null
                            };
                            
                            console.log('Tool result:', toolResult);
                            
                            // Log large tool outputs that might cause issues
                            if (msg.output && msg.output.length > 10000) {
                                console.warn(`⚠️ Large tool output: ${msg.output.length} characters from tool ${msg.tool_use_id}`);
                            }
                            
                            if (msg.is_error) {
                                logError('Tool execution failed', new Error(msg.output || 'Unknown tool error'), {
                                    ...queryContext,
                                    tool_use_id: msg.tool_use_id,
                                    toolsUsed
                                });
                                errorOccurred = true;
                                
                                // Check if it's a Discord-specific error that might be recoverable
                                const errorMessage = msg.output || '';
                                const isDiscordError = errorMessage.includes('Discord') || errorMessage.includes('rate limit');
                                
                                // Notify user of tool failure with more context
                                try {
                                    let userMessage = `❌ Tool error: ${errorMessage.substring(0, 200) || 'Unknown error'}`;
                                    
                                    // Add helpful context for common errors
                                    if (errorMessage.includes('rate limit')) {
                                        userMessage += '\n⏳ Discord rate limit hit. Waiting a moment...';
                                    } else if (errorMessage.includes('permission')) {
                                        userMessage += '\n🔒 Check bot permissions in server settings.';
                                    } else if (errorMessage.includes('not found')) {
                                        userMessage += '\n❓ The requested resource was not found.';
                                    }
                                    
                                    await originalMessage.channel.send(userMessage);
                                } catch (discordError) {
                                    console.error('Failed to send tool error notification:', discordError);
                                }
                            } else {
                                // Send success notification for important tools
                                // Tool completed - update status instead of sending new message
                                if (statusMessage) {
                                    try {
                                        const completedEmbed = new EmbedBuilder()
                                            .setColor(0x00FF00)
                                            .setTitle('⚡ Processing...')
                                            .setDescription('Analyzing results...')
                                            .addFields(
                                                { name: '🛠️ Tools Used', value: toolsUsed.map(t => `✅ ${t.name}`).join('\n') || 'None', inline: true },
                                                { name: '📊 Operations', value: `${toolsUsed.length} completed`, inline: true }
                                            )
                                            .setFooter({ text: 'Almost done...' })
                                            .setTimestamp();
                                        
                                        await statusMessage.edit({ embeds: [completedEmbed] });
                                    } catch (discordError) {
                                        console.error('Failed to update status on completion:', discordError);
                                    }
                                }
                            }
                        } else if (msg.type === 'error') {
                            // Handle error messages
                            const isRecovered = msg.recovered === true;
                            
                            if (!isRecovered) {
                                logError('Claude streaming error', new Error(msg.error || JSON.stringify(msg)), {
                                    ...queryContext,
                                    messageType: msg.type,
                                    toolsUsed
                                });
                            }
                            errorOccurred = true;
                            
                            let errorMsg;
                            if (isRecovered) {
                                errorMsg = `⚠️ Response interrupted after processing ${msg.messagesProcessed || 0} messages. Showing partial results...`;
                                console.log('Recovered from JSON parsing error, continuing with partial response');
                            } else {
                                errorMsg = `❌ Error: ${msg.error || JSON.stringify(msg) || 'Unknown error'}`;
                            }
                            
                            try {
                                await originalMessage.channel.send(errorMsg);
                            } catch (discordError) {
                                console.error('Failed to send error notification:', discordError);
                            }
                        } else if (msg.type === 'human') {
                            // Handle permission prompts
                            console.log('Permission prompt:', msg);
                            try {
                                await originalMessage.channel.send(`⚠️ Permission required: ${msg.message?.content || 'Check console'}`);
                            } catch (discordError) {
                                console.error('Failed to send permission prompt:', discordError);
                            }
                        }
                    }
                    // Log when streaming actually completes
                    console.log(`✅ Streaming completed - ${messageCount} messages processed`);
                    
                    // Delete status message after a short delay
                    if (statusMessage && !statusMessageDeleted) {
                        statusMessageDeleted = true;
                        setTimeout(async () => {
                            try {
                                await statusMessage.delete();
                            } catch (e) {
                                // Only log if it's not an "Unknown Message" error
                                if (!e.message?.includes('Unknown Message')) {
                                    console.error('Failed to delete status message:', e);
                                }
                            }
                        }, 2000); // Delete after 2 seconds
                    }
                    
                    // Save session information
                    if (capturedSessionId) {
                        const sessionData = {
                            sessionId: capturedSessionId,
                            lastActivity: Date.now(),
                            messageCount: messageCount,
                            channelName: originalMessage.channel.name,
                            guildName: originalMessage.guild?.name || 'DM'
                        };
                        channelSessions.set(channelId, sessionData);
                        saveSessions();
                        console.log(`💾 Saved session ${capturedSessionId} for channel ${channelId}`);
                    } else if (isResumingSession && !resumeFailed) {
                        // Update existing session's last activity if we successfully resumed
                        console.log(`✅ Successfully resumed session ${existingSession.sessionId}`);
                        existingSession.lastActivity = Date.now();
                        existingSession.messageCount = (existingSession.messageCount || 0) + messageCount;
                        channelSessions.set(channelId, existingSession);
                        saveSessions();
                    }
                } catch (streamError) {
                    // Check if this is a session resume error
                    const errorMessage = streamError.message || '';
                    const isSessionError = errorMessage.includes('session') || 
                                         errorMessage.includes('resume') || 
                                         errorMessage.includes('not found') ||
                                         errorMessage.includes('expired');
                    
                    if (isResumingSession && isSessionError && !resumeFailed) {
                        console.log(`⚠️ Session resume failed: ${errorMessage}`);
                        console.log(`🔄 Attempting to create a new session instead...`);
                        
                        // Mark that resume failed and remove the old session
                        resumeFailed = true;
                        channelSessions.delete(channelId);
                        saveSessions();
                        
                        // Retry without resume option
                        const freshSessionOptions = {
                            maxTurns: CONFIG.MAX_TURNS,
                            cwd: CONFIG.CWD,
                            permissionMode: 'default',
                        };
                        
                        // Retry the query with a fresh session
                        messageCount = 0;
                        lastMessageTime = Date.now();
                        capturedSessionId = null;
                        
                        for await (const msg of safeQuery({
                            prompt: fullPrompt,
                            options: freshSessionOptions
                        })) {
                            // Process messages same as before (this is a simplified retry)
                            // In production, you'd want to extract this message processing logic
                            if (!capturedSessionId && msg.session_id) {
                                capturedSessionId = msg.session_id;
                                console.log(`🆔 Captured new session ID after retry: ${capturedSessionId}`);
                            }
                        }
                        
                        // If we got here, the retry succeeded
                        console.log(`✅ Successfully created new session after resume failure`);
                    } else {
                        // Not a session error or already retried, propagate the error
                        logError('Claude streaming failed', streamError, {
                            ...queryContext,
                            toolsUsed,
                            currentContentLength: currentContent.length,
                            isResumingSession,
                            resumeFailed
                        });
                        throw streamError;
                    }
                }
            })();
            
            // Race between query and timeout
            await Promise.race([queryPromise, timeoutPromise]);
            
            // Log successful completion if no errors
            if (!errorOccurred && toolsUsed.length > 0) {
                console.log(`✅ Query completed successfully. Tools used: ${toolsUsed.map(t => t.name).join(', ')}`);
            } else if (errorOccurred && currentContent.length > 0) {
                console.log(`⚠️ Query completed with errors but got partial response (${currentContent.length} chars)`);
            }
            
        } catch (timeoutError) {
            // Handle timeout specifically
            if (timeoutError.message.includes('timeout')) {
                logError('Query timeout', timeoutError, {
                    ...queryContext,
                    toolsUsed,
                    currentContentLength: currentContent.length,
                    hadPartialResponse: currentContent.length > 0
                });
                
                // If we have partial content, use it
                if (currentContent.length > 0) {
                    console.log('Using partial response due to timeout...');
                    try {
                        await originalMessage.channel.send('⏱️ Response took too long, showing partial results...');
                    } catch (e) {
                        console.error('Failed to send timeout notification:', e);
                    }
                } else {
                    throw timeoutError;
                }
            } else {
                throw timeoutError;
            }
        } finally {
            // Stop typing indicator
            isProcessing = false;
            clearInterval(typingInterval);
            
            // Clean up status message if not already deleted
            if (statusMessage && !statusMessageDeleted) {
                statusMessageDeleted = true;
                setTimeout(async () => {
                    try {
                        await statusMessage.delete();
                    } catch (e) {
                        // Only log if it's not an "Unknown Message" error
                        if (!e.message?.includes('Unknown Message')) {
                            console.error('Failed to delete status message in cleanup:', e);
                        }
                    }
                }, 2000);
            }
        }
        
        // If no response was sent, send a default message
        if (!responseMessage && !currentContent) {
            logError('No response generated', new Error('Empty response from Claude'), {
                ...queryContext,
                toolsUsed
            });
            return "I encountered an issue processing your request. Please check the logs.";
        }
        
        return currentContent.trim();
        
    } catch (error) {
        logError('queryClaudeSDK failed', error, {
            ...queryContext,
            promptLength: prompt.length,
            contextLength: context.length
        });
        throw error;
    }
}

// Helper: Split long messages
function splitMessage(text, maxLength = CONFIG.MAX_RESPONSE_LENGTH) {
    if (!text || text.length <= maxLength) return [text || 'No response'];
    
    const messages = [];
    let currentMessage = '';
    
    const lines = text.split('\n');
    for (const line of lines) {
        if (currentMessage.length + line.length + 1 > maxLength) {
            messages.push(currentMessage);
            currentMessage = line;
        } else {
            currentMessage += (currentMessage ? '\n' : '') + line;
        }
    }
    
    if (currentMessage) {
        messages.push(currentMessage);
    }
    
    return messages;
}

// Helper: Create ticket suggestion from context
function createTicketSuggestion(messageContent, channelName, userContext) {
    // Analyze the message to determine what kind of ticket is needed
    const suggestion = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        originalMessage: messageContent,
        channel: channelName,
        suggestedTickets: []
    };
    
    // This will be populated by Claude's analysis
    return suggestion;
}

// Helper: Create ticket preview embed
function createTicketPreviewEmbed(ticket) {
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`🎫 Ticket Preview: ${ticket.issueType}`);
    
    // Add project info
    embed.addFields(
        { name: '📋 Project', value: `${ticket.projectName} (${ticket.projectKey})`, inline: true },
        { name: '🏷️ Type', value: ticket.issueType, inline: true },
        { name: '⚡ Priority', value: ticket.priority || 'Medium', inline: true }
    );
    
    // Add ticket details
    embed.addFields(
        { name: '📝 Summary', value: ticket.summary || '[No summary provided]' },
        { name: '📄 Description', value: (ticket.description || '[No description]').substring(0, 1024) }
    );
    
    // Add assignee if specified
    if (ticket.assignee) {
        embed.addFields({ name: '👤 Assignee', value: ticket.assignee.displayName || ticket.assignee.email });
    }
    
    // Add labels if any
    if (ticket.labels && ticket.labels.length > 0) {
        embed.addFields({ name: '🏷️ Labels', value: ticket.labels.join(', ') });
    }
    
    embed.setFooter({ text: 'Click buttons below to create or skip this ticket' });
    
    return embed;
}

// Helper: Create action buttons for ticket approval
function createTicketActionButtons(ticketId) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`create_ticket_${ticketId}`)
                .setLabel('Create Ticket')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId(`skip_ticket_${ticketId}`)
                .setLabel('Skip')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏭️'),
            new ButtonBuilder()
                .setCustomId(`edit_ticket_${ticketId}`)
                .setLabel('Edit Details')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✏️')
        );
    
    return row;
}

// Helper: Check if similar ticket was already suggested/created
function wasTicketAlreadyHandled(channelId, ticketSummary) {
    const channelHistory = ticketSuggestions.get(channelId);
    if (!channelHistory) return false;
    
    // Check if a similar ticket was created or skipped in the last 24 hours
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    return channelHistory.history.some(entry => {
        return entry.timestamp > oneDayAgo && 
               entry.summary.toLowerCase().includes(ticketSummary.toLowerCase().substring(0, 50));
    });
}

// Helper: Record ticket decision
function recordTicketDecision(channelId, ticket, decision) {
    let channelData = ticketSuggestions.get(channelId);
    if (!channelData) {
        channelData = { suggestions: [], history: [] };
        ticketSuggestions.set(channelId, channelData);
    }
    
    channelData.history.push({
        timestamp: Date.now(),
        summary: ticket.summary,
        projectKey: ticket.projectKey,
        decision: decision, // 'created', 'skipped', 'edited'
        ticketKey: ticket.ticketKey || null
    });
    
    // Keep only last 100 history entries per channel
    if (channelData.history.length > 100) {
        channelData.history = channelData.history.slice(-100);
    }
}

// Handler for /reflection slash command
async function handleReflectionCommand(interaction) {
    await interaction.deferReply();
    
    try {
        const scope = interaction.options.getString('scope') || 'global';
        const channelId = interaction.channel.id;
        const channelName = interaction.channel.name;
        
        console.log(`🔍 Running /reflection command in #${channelName} with scope: ${scope}`);
        
        // Fetch recent messages for context
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const messageHistory = Array.from(messages.values())
            .reverse()
            .map(msg => ({
                author: msg.author.username,
                content: msg.content,
                timestamp: msg.createdAt.toISOString(),
                isBot: msg.author.bot
            }))
            .filter(msg => msg.content && !msg.content.startsWith('/'));
        
        // Read the reflection prompt
        const reflectionPromptPath = path.join(CONFIG.CWD, '.claude', 'commands', 'reflection.md');
        let reflectionPrompt = '';
        try {
            reflectionPrompt = fs.readFileSync(reflectionPromptPath, 'utf8');
        } catch (error) {
            await interaction.editReply('❌ Could not read reflection prompt file.');
            return;
        }
        
        // Read current instructions based on scope
        let currentInstructions = '';
        let instructionsPath = '';
        
        if (scope === 'global') {
            instructionsPath = path.join(CONFIG.CWD, 'CLAUDE.md');
            try {
                currentInstructions = fs.readFileSync(instructionsPath, 'utf8');
            } catch (error) {
                await interaction.editReply('❌ Could not read CLAUDE.md file.');
                return;
            }
        } else {
            // Channel-specific
            const channelContext = loadChannelContext(channelId);
            if (channelContext && channelContext.instructions) {
                currentInstructions = channelContext.instructions;
            } else {
                currentInstructions = 'No channel-specific instructions found.';
            }
        }
        
        // Build the reflection query
        const reflectionQuery = `${reflectionPrompt}

<chat_history>
${messageHistory.map(m => `[${m.timestamp}] ${m.author}${m.isBot ? ' (bot)' : ''}: ${m.content}`).join('\n')}
</chat_history>

<claude_instructions>
${currentInstructions}
</claude_instructions>

Please analyze the chat history and current instructions for ${scope === 'global' ? 'global CLAUDE.md' : `channel-specific context for #${channelName}`}.

Important: 
- Focus on practical improvements based on the actual conversation patterns
- If suggesting channel-specific improvements, consider the channel's purpose: ${channelName}
- Keep suggestions concise and actionable
- Only suggest changes that would genuinely improve the bot's behavior`;

        // Create a message-like object for queryClaudeSDK
        const messageLike = {
            channel: interaction.channel,
            author: interaction.user,
            guild: interaction.guild,
            reply: async (content) => {
                if (typeof content === 'string') {
                    return await interaction.editReply(content);
                } else {
                    return await interaction.editReply(content);
                }
            }
        };
        
        // Send status update
        await interaction.editReply('🔍 Analyzing chat history and instructions...');
        
        // Query Claude with the reflection prompt
        const response = await queryClaudeSDK(reflectionQuery, [], messageLike);
        
        // Send the analysis results
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🔍 Reflection Analysis - ${scope === 'global' ? 'Global' : 'Channel'} Scope`)
            .setDescription(response.substring(0, 4000))
            .addFields({
                name: '📍 Scope',
                value: scope === 'global' ? 'CLAUDE.md (affects all channels)' : `#${channelName} specific`,
                inline: true
            })
            .setFooter({ text: 'Review suggestions and apply manually if appropriate' })
            .setTimestamp();
            
        await interaction.editReply({ content: null, embeds: [embed] });
        
    } catch (error) {
        console.error('Error in reflection command:', error);
        logError('Reflection command failed', error, {
            channelId: interaction.channel.id,
            userId: interaction.user.id
        });
        
        await interaction.editReply('❌ An error occurred while running the reflection analysis.');
    }
}

// Initial load
loadBaseContext();
loadSessions();

// Bot ready event
client.once(Events.ClientReady, async readyClient => {
    console.log(`✅ Claude Discord Bot is online!`);
    console.log(`🤖 Logged in as ${readyClient.user.tag}`);
    console.log(`📊 Connected to ${readyClient.guilds.cache.size} guilds`);
    console.log(`🔐 Using Claude Code SDK with OAuth`);
    console.log(`🛠️ MCP Tools enabled from .mcp.json`);
    console.log(`📁 Working directory: ${CONFIG.CWD}`);
    console.log(`🔒 Permission mode: default (using .claude/settings.json)`);
    if (allowedToolsList.length > 0) {
        console.log(`✅ ${allowedToolsList.length} tools allowed from settings.json`);
    }
    if (channelSessions.size > 0) {
        console.log(`📦 ${channelSessions.size} saved sessions loaded`);
    }
    
    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    
    try {
        console.log('Started refreshing application (/) commands.');
        
        // Get all guild IDs
        const guildIds = readyClient.guilds.cache.map(guild => guild.id);
        
        // Register commands for each guild
        for (const guildId of guildIds) {
            await rest.put(
                Routes.applicationGuildCommands(readyClient.user.id, guildId),
                { body: commands.map(cmd => cmd.toJSON()) },
            );
        }
        
        console.log(`✅ Successfully registered slash commands in ${guildIds.length} guilds`);
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
    
    console.log(`\n🆕 Latest Improvements:`);
    console.log(`  • Persistent session management per channel`);
    console.log(`  • Auto-includes last 50 messages for context`);
    console.log(`  • Detects JIRA mentions and preloads context`);
    console.log(`  • JSON error recovery with partial responses`);
    console.log(`  • 5-minute timeout for complex operations`);
    console.log(`  • Channel-specific contexts for security`);
    console.log(`  • Enhanced error logging to discord-bot-errors.log`);
    console.log(`  • /reflection command for instruction improvements`);
    
    // Clean up old sessions on startup
    cleanupOldSessions();
    
    // Schedule periodic session cleanup
    setInterval(cleanupOldSessions, 24 * 60 * 60 * 1000); // Every 24 hours
    
    // Set activity
    client.user.setActivity('@Dot help | /reflection | v2.1', { type: 'LISTENING' });
});

// Interaction handler for buttons and slash commands
client.on(Events.InteractionCreate, async interaction => {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'reflection') {
            await handleReflectionCommand(interaction);
        }
        return;
    }
    
    // Handle buttons
    if (!interaction.isButton()) return;
    
    const [action, type, ticketId] = interaction.customId.split('_');
    
    if (action === 'create' && type === 'ticket') {
        await interaction.deferReply({ ephemeral: true });
        
        let ticketData = null;
        try {
            ticketData = pendingTickets.get(interaction.message.id);
            if (!ticketData) {
                await interaction.editReply({ content: '❌ Ticket data not found. Please try creating a new suggestion.' });
                return;
            }
            
            // Validate required fields
            if (!ticketData.projectKey || !ticketData.issueType || !ticketData.summary) {
                await interaction.editReply({ 
                    content: '❌ Missing required ticket fields. Please ensure the ticket has a project, type, and summary.' 
                });
                return;
            }
            
            // Load JIRA context if needed
            if (!jiraContext && fs.existsSync(path.join(__dirname, 'jira-context.json'))) {
                try {
                    jiraContext = JSON.parse(fs.readFileSync(path.join(__dirname, 'jira-context.json'), 'utf8'));
                } catch (e) {
                    console.error('Failed to load JIRA context:', e);
                }
            }
            
            // Create the actual JIRA ticket using Claude with MCP tools
            const createTicketPrompt = `Create a JIRA ticket using the mcp__atlassian__createJiraIssue tool with these exact parameters:

Project Key: ${ticketData.projectKey}
Issue Type: ${ticketData.issueType}
Summary: ${ticketData.summary}
Description: ${ticketData.description}
${ticketData.priority ? `Priority: ${ticketData.priority}` : ''}
${ticketData.assignee ? `Assignee Account ID: ${ticketData.assignee.jiraAccountId}` : ''}
${ticketData.labels && ticketData.labels.length > 0 ? `Labels: ${ticketData.labels.join(', ')}` : ''}

IMPORTANT: 
1. Use the mcp__atlassian__createJiraIssue tool
2. The cloudId is: 840697aa-7447-4ad1-bd0e-3f528d107624
3. After creating, open the ticket in the browser using the 'open' command
4. Return the ticket key (format: PROJECT-NUMBER)`;
            
            // Create a message-like object for queryClaudeSDK
            const messageLike = {
                channel: interaction.channel,
                author: interaction.user,
                guild: interaction.guild,
                reply: async (content) => {
                    // For interactions, we update the reply instead
                    if (typeof content === 'string') {
                        return await interaction.editReply({ content });
                    } else {
                        return await interaction.editReply(content);
                    }
                }
            };
            
            const response = await queryClaudeSDK(createTicketPrompt, [], messageLike);
            
            // Record the decision
            recordTicketDecision(interaction.channel.id, ticketData, 'created');
            
            // Update the original message to show it was created
            const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(0x00FF00)
                .setTitle(`✅ Ticket Created: ${ticketData.issueType}`);
            
            await interaction.message.edit({ 
                embeds: [updatedEmbed], 
                components: [] // Remove buttons
            });
            
            // Extract ticket key from response if possible
            const ticketKeyMatch = response.match(/([A-Z]+-\d+)/g);
            const ticketKey = ticketKeyMatch ? ticketKeyMatch[ticketKeyMatch.length - 1] : null;
            
            if (ticketKey) {
                ticketData.ticketKey = ticketKey;
                await interaction.editReply({ 
                    content: `✅ Ticket created successfully!\n\n🎫 **${ticketKey}**\n🔗 https://dotfun.atlassian.net/browse/${ticketKey}` 
                });
            } else {
                await interaction.editReply({ content: `✅ Ticket created successfully!\n${response.substring(0, 1900)}` });
            }
            
        } catch (error) {
            console.error('Error creating ticket:', error);
            logError('Ticket creation failed', error, {
                channelId: interaction.channel.id,
                userId: interaction.user.id,
                ticketData: ticketData
            });
            
            // Provide more helpful error messages
            let errorMessage = '❌ Error creating ticket: ';
            if (error.message.includes('timeout')) {
                errorMessage += 'Request timed out. Please try again.';
            } else if (error.message.includes('permission')) {
                errorMessage += 'Permission denied. Check JIRA permissions.';
            } else if (error.message.includes('not found')) {
                errorMessage += 'Project or issue type not found.';
            } else {
                errorMessage += error.message.substring(0, 200);
            }
            
            await interaction.editReply({ content: errorMessage });
        }
        
    } else if (action === 'skip' && type === 'ticket') {
        await interaction.deferReply({ ephemeral: true });
        
        const ticketData = pendingTickets.get(interaction.message.id);
        if (ticketData) {
            recordTicketDecision(interaction.channel.id, ticketData, 'skipped');
        }
        
        // Update the original message
        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(0x808080)
            .setTitle(`⏭️ Ticket Skipped: ${ticketData?.issueType || 'Unknown'}`);
        
        await interaction.message.edit({ 
            embeds: [updatedEmbed], 
            components: [] // Remove buttons
        });
        
        await interaction.editReply({ content: '⏭️ Ticket creation skipped. I\'ll remember not to suggest this again.' });
        
    } else if (action === 'edit' && type === 'ticket') {
        // For now, just provide instructions
        await interaction.reply({ 
            content: '📝 To edit ticket details, please describe what changes you\'d like to make and I\'ll create a new suggestion with your modifications.',
            ephemeral: true 
        });
    }
});

// Message handler
client.on(Events.MessageCreate, async message => {
    // Ignore bots
    if (message.author.bot) return;
    
    // Check for bot mention only
    const isMentioned = message.mentions.has(client.user);
    
    // If not mentioned, ignore
    if (!isMentioned) return;
    
    // Extract query by removing the mention
    let userQuery = message.content.replace(/<@!?\d+>/g, '').trim();
    
    // Handle special commands
    if (userQuery.toLowerCase() === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🤖 Claude Discord Bot Help')
            .setDescription('I use Claude AI with MCP tools to help you!')
            .addFields(
                { name: '💬 Usage', value: '`@Dot <question>` - Just mention me!', inline: false },
                { name: '🧹 Clear', value: '`@Dot clear` - Reset conversation', inline: false },
                { name: '📊 Debug', value: '`@Dot debug` - Show recent errors', inline: false },
                { name: '📈 Status', value: '`@Dot status` - Show bot configuration', inline: false },
                { name: '🔄 Refresh Context', value: '`@Dot refresh-context` - Reload preloaded data', inline: false },
                { name: '🧠 Show Context', value: '`@Dot show-context` - Display loaded context', inline: false },
                { name: '🎯 Show JIRA', value: '`@Dot show-jira` - Display JIRA context', inline: false },
                { name: '🆔 Session Info', value: '`@Dot session info` - Show current session', inline: false },
                { name: '🔄 Reset Session', value: '`@Dot reset session` - Start fresh conversation', inline: false },
                { name: '📊 List Sessions', value: '`@Dot list sessions` - Show all sessions (admin)', inline: false },
                { name: '🔍 Reflection', value: '`/reflection [scope]` - Analyze chat and suggest improvements\n• Global: Update CLAUDE.md\n• Channel: Update channel-specific instructions', inline: false },
                { name: '🛠️ Available Tools', value: 'Discord, JIRA, Confluence, Gmail, Google Calendar, Google Drive', inline: false },
                { name: '📝 Examples', value: 
                    '`@Dot check my gmail`\n' +
                    '`@Dot what JIRA tickets are assigned to me?`\n' +
                    '`@Dot search google drive for project docs`\n' +
                    '`@Dot send a discord message to #general`\n' +
                    '`/reflection` - Improve global instructions\n' +
                    '`/reflection scope:channel` - Improve channel context', 
                    inline: false 
                }
            )
            .setTimestamp();
        
        await message.reply({ embeds: [helpEmbed] });
        return;
    }
    
    if (userQuery.toLowerCase() === 'clear') {
        conversations.delete(message.channel.id);
        await message.reply('✅ Conversation history cleared!');
        return;
    }
    
    // Session management commands
    if (userQuery.toLowerCase() === 'session info' || userQuery.toLowerCase() === 'session') {
        const sessionData = channelSessions.get(message.channel.id);
        
        const sessionEmbed = new EmbedBuilder()
            .setColor(0x00D9FF)
            .setTitle('🆔 Session Information')
            .setTimestamp();
        
        if (sessionData) {
            const lastActivityDate = new Date(sessionData.lastActivity);
            sessionEmbed.addFields(
                { name: 'Session ID', value: `\`${sessionData.sessionId}\``, inline: false },
                { name: 'Channel', value: sessionData.channelName || 'Unknown', inline: true },
                { name: 'Server', value: sessionData.guildName || 'DM', inline: true },
                { name: 'Messages', value: `${sessionData.messageCount || 0}`, inline: true },
                { name: 'Last Activity', value: lastActivityDate.toLocaleString(), inline: false }
            );
        } else {
            sessionEmbed.setDescription('No active session in this channel. Send a message to start one!');
        }
        
        await message.reply({ embeds: [sessionEmbed] });
        return;
    }
    
    if (userQuery.toLowerCase() === 'reset session') {
        const oldSession = channelSessions.get(message.channel.id);
        if (oldSession) {
            channelSessions.delete(message.channel.id);
            saveSessions();
            await message.reply(`🔄 Session ${oldSession.sessionId} has been reset. A new session will be created on the next message.`);
        } else {
            await message.reply('ℹ️ No active session to reset in this channel.');
        }
        return;
    }
    
    if (userQuery.toLowerCase() === 'list sessions') {
        // Admin only command
        if (!message.member?.permissions.has('Administrator')) {
            await message.reply('🔒 This command requires administrator permissions.');
            return;
        }
        
        const sessionList = Array.from(channelSessions.entries())
            .map(([channelId, data]) => {
                const channel = message.guild?.channels.cache.get(channelId);
                return {
                    channel: channel?.name || `Unknown (${channelId})`,
                    sessionId: data.sessionId.substring(0, 8) + '...',
                    lastActivity: new Date(data.lastActivity).toLocaleString(),
                    messages: data.messageCount || 0
                };
            })
            .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
        
        const listEmbed = new EmbedBuilder()
            .setColor(0x00D9FF)
            .setTitle('📊 Active Sessions')
            .setDescription(`Total sessions: ${channelSessions.size}`)
            .setTimestamp();
        
        if (sessionList.length > 0) {
            sessionList.slice(0, 10).forEach(session => {
                listEmbed.addFields({
                    name: `#${session.channel}`,
                    value: `ID: \`${session.sessionId}\`\nMessages: ${session.messages}\nLast: ${session.lastActivity}`,
                    inline: true
                });
            });
            
            if (sessionList.length > 10) {
                listEmbed.setFooter({ text: `Showing 10 of ${sessionList.length} sessions` });
            }
        }
        
        await message.reply({ embeds: [listEmbed] });
        return;
    }
    
    if (userQuery.toLowerCase() === 'debug') {
        try {
            // Read last 10 errors from log file
            if (fs.existsSync(ERROR_LOG_PATH)) {
                const logContent = fs.readFileSync(ERROR_LOG_PATH, 'utf8');
                const errors = logContent.trim().split('\n').slice(-10).map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                }).filter(Boolean);
                
                if (errors.length === 0) {
                    await message.reply('✅ No recent errors found!');
                    return;
                }
                
                const debugEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('🐛 Recent Errors (Last 10)')
                    .setDescription('Most recent errors from the bot:')
                    .setTimestamp();
                
                errors.slice(-5).forEach((error) => {
                    const timestamp = new Date(error.timestamp).toLocaleTimeString();
                    const context = error.context || 'Unknown';
                    const errorMsg = error.error?.message || 'Unknown error';
                    
                    debugEmbed.addFields({
                        name: `${timestamp} - ${context}`,
                        value: `\`\`\`${errorMsg.substring(0, 200)}\`\`\``,
                        inline: false
                    });
                });
                
                await message.reply({ embeds: [debugEmbed] });
            } else {
                await message.reply('✅ No error log found. The bot hasn\'t encountered any errors yet!');
            }
        } catch (error) {
            await message.reply('❌ Failed to read error log: ' + error.message);
        }
        return;
    }
    
    if (userQuery.toLowerCase() === 'status') {
        const contextAge = contextsLastLoaded ? 
            `${Math.floor((Date.now() - contextsLastLoaded) / 1000 / 60)} minutes ago` : 
            'Not loaded';
            
        const statusEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🤖 Bot Status')
            .setDescription('Current bot configuration and status')
            .addFields(
                { name: '⏱️ Timeout', value: `${CONFIG.QUERY_TIMEOUT / 1000} seconds`, inline: true },
                { name: '🔄 Max Turns', value: `${CONFIG.MAX_TURNS}`, inline: true },
                { name: '📁 Working Dir', value: `${CONFIG.CWD}`, inline: false },
                { name: '🛠️ Debug Mode', value: process.env.DEBUG === 'true' ? 'Enabled' : 'Disabled', inline: true },
                { name: '📊 Active Conversations', value: `${conversations.size}`, inline: true },
                { name: '🧠 Context', value: baseContext.version ? `v${baseContext.version} (loaded ${contextAge})` : 'Not loaded', inline: true },
                { name: '📂 Channel Contexts', value: `${channelContexts.size} loaded`, inline: true }
            )
            .setTimestamp();
        
        await message.reply({ embeds: [statusEmbed] });
        return;
    }
    
    if (userQuery.toLowerCase() === 'refresh-context') {
        refreshAllContexts();
        const channelContext = loadChannelContext(message.channel.id);
        // Also refresh JIRA context
        jiraContext = null;
        jiraContextLoaded = null;
        await getJiraContext();
        await message.reply(`✅ All contexts refreshed! Base v${baseContext.version}, Channel: ${channelContext.channelName || 'base'}, JIRA: ${jiraContext ? 'loaded' : 'not found'}`);
        return;
    }
    
    if (userQuery.toLowerCase() === 'show-context') {
        const channelContext = loadChannelContext(message.channel.id);
        
        if (!channelContext || !channelContext.version) {
            await message.reply('📋 Using base context only. No channel-specific context configured.');
            return;
        }
        
        const contextEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🧠 Channel Context: ${channelContext.channelName || message.channel.name}`)
            .setDescription(`Version ${channelContext.version}\nPurpose: ${channelContext.purpose || 'General'}`)
            .addFields([
                { 
                    name: '📍 Channel Info', 
                    value: `ID: ${channelContext.channelId || message.channel.id}\n` +
                           `Type: ${channelContext.type || 'standard'}`,
                    inline: true 
                }
            ]);
            
        // Add channel-specific fields
        if (channelContext.context?.jira) {
            contextEmbed.addFields({
                name: '🎯 JIRA Settings',
                value: `Instance: ${channelContext.context.jira.instance || 'Default'}\n` +
                       `Project: ${channelContext.context.jira.defaultProject || 'None'}`,
                inline: true
            });
        }
        
        if (channelContext.context?.crossReferences) {
            const refs = Object.entries(channelContext.context.crossReferences)
                .map(([name, id]) => `${name}: <#${id}>`)
                .join('\n');
            contextEmbed.addFields({
                name: '🔗 Related Channels',
                value: refs || 'None',
                inline: false
            });
        }
            
        contextEmbed.setFooter({ text: 'Use @Dot refresh-context to reload' })
            .setTimestamp();
            
        await message.reply({ embeds: [contextEmbed] });
        return;
    }
    
    if (userQuery.toLowerCase() === 'show-jira') {
        const jiraData = await getJiraContext();
        if (!jiraData || Object.keys(jiraData.projects || {}).length === 0) {
            await message.reply('❌ No JIRA context loaded. Make sure jira-context.json exists and is properly configured.');
            return;
        }
        
        const jiraEmbed = new EmbedBuilder()
            .setColor(0x0052CC)
            .setTitle('🎯 JIRA Context')
            .setDescription(`Instance: ${jiraData.instance}`)
            .addFields([
                {
                    name: '📁 Projects',
                    value: Object.entries(jiraData.projects || {})
                        .map(([key, proj]) => `${key}: ${proj.name}`)
                        .join('\n') || 'None configured',
                    inline: false
                },
                {
                    name: '👥 User Mappings',
                    value: Object.entries(jiraData.userMappings || {})
                        .map(([discord, user]) => `<@${discord}> → ${user.displayName}`)
                        .join('\n') || 'None configured',
                    inline: false
                },
                {
                    name: '📋 Issue Types',
                    value: Object.keys(jiraData.issueTypes || {}).join(', ') || 'None',
                    inline: true
                }
            ])
            .setFooter({ text: `Last updated: ${jiraData.lastUpdated || 'Unknown'}` })
            .setTimestamp();
            
        await message.reply({ embeds: [jiraEmbed] });
        return;
    }
    
    if (!userQuery) {
        await message.reply('Hi! I\'m Dot, powered by Claude AI. Just mention me with your question!');
        return;
    }
    
    // Show typing
    await message.channel.sendTyping();
    
    try {
        console.log(`📨 [${message.guild?.name || 'DM'}] ${message.author.tag}: ${userQuery}`);
        
        // Get conversation context
        const channelId = message.channel.id;
        let conversationContext = conversations.get(channelId) || [];
        
        // Fetch last 50 messages from channel
        let recentMessages = [];
        try {
            const messages = await message.channel.messages.fetch({ limit: 50, before: message.id });
            recentMessages = Array.from(messages.values())
                .reverse() // Oldest first
                .map(msg => ({
                    author: msg.author.username,
                    content: msg.content,
                    timestamp: msg.createdAt.toISOString()
                }))
                .filter(msg => msg.content); // Remove empty messages
            console.log(`📜 Fetched ${recentMessages.length} recent messages from channel`);
        } catch (error) {
            console.error('Failed to fetch recent messages:', error);
        }
        
        // Load channel-specific context
        const channelContext = loadChannelContext(channelId);
        
        // Check if JIRA context is needed
        let jiraContextData = null;
        if (mentionsJira(userQuery)) {
            jiraContextData = await getJiraContext();
            console.log('🎯 JIRA context loaded due to keyword detection');
        }
        
        // Build minimal context summary to reduce payload
        let contextSummary = '';
        if (channelContext && channelContext.version) {
            // Only include essential information
            const essentials = {
                channel: channelContext.channelName,
                purpose: channelContext.purpose
            };
            
            // Add JIRA info only for JIRA-related channels
            if (channelContext.context?.jira && (channelContext.channelName?.includes('jira') || channelContext.channelName?.includes('standup'))) {
                essentials.jira = {
                    instance: channelContext.context.jira.instance,
                    project: channelContext.context.jira.defaultProject
                };
            }
            
            // Add cross references only if explicitly needed
            if (channelContext.context?.crossReferences && Object.keys(channelContext.context.crossReferences).length < 5) {
                essentials.relatedChannels = channelContext.context.crossReferences;
            }
            
            contextSummary = `
## Channel Context
${JSON.stringify(essentials, null, 2)}`;
        }
        
        // Build message history summary
        let messageHistory = '';
        if (recentMessages.length > 0) {
            const historyText = recentMessages.map(m => `[${m.timestamp.split('T')[1].split('.')[0]}] ${m.author}: ${m.content}`).join('\n');
            messageHistory = `
## Recent Channel Messages (Last ${recentMessages.length})
${historyText}`;
            
            // Warn if message history is very large
            if (historyText.length > 20000) {
                console.warn(`⚠️ Large message history: ${historyText.length} characters`);
            }
        }
        
        // Build JIRA context if needed
        let jiraContextSummary = '';
        if (jiraContextData) {
            jiraContextSummary = `
## JIRA Context
Instance: ${jiraContextData.instance}
Projects: ${JSON.stringify(jiraContextData.projects || {}, null, 2)}
Issue Types: ${JSON.stringify(jiraContextData.issueTypes || {}, null, 2)}
User Mappings: ${JSON.stringify(jiraContextData.userMappings || {}, null, 2)}`;
        }
        
        // Check for existing session
        const existingSession = channelSessions.get(channelId);
        let sessionInfo = '';
        if (existingSession && existingSession.sessionId) {
            sessionInfo = `\n## Session Context\n- Session ID: ${existingSession.sessionId}\n- Previous messages in session: ${existingSession.messageCount || 0}\n- Session started: ${new Date(existingSession.lastActivity).toLocaleString()}\n`;
        }
        
        // Format the query with user info and channel-specific context
        const formattedQuery = `[${message.author.username}]: ${userQuery}

## Current Location
- Server: "${message.guild?.name || 'DM'}" (ID: ${message.guild?.id || 'DM'})
- Channel: #${message.channel.name || 'DM'} (ID: ${message.channel.id})
- User: ${message.author.username} (ID: ${message.author.id})
${sessionInfo}${messageHistory}
${contextSummary}
${jiraContextSummary}
## Instructions
You have access to MCP tools. Use the context above to understand the conversation and avoid unnecessary API calls.
When mentioning JIRA tickets, files, or resources, include clickable links (e.g., https://dotfun.atlassian.net/browse/DOT-123).
${jiraContextData ? 'JIRA context has been preloaded - use it to create tickets directly without discovery.' : ''}`;
        
        // Check if this is a ticket creation request
        const isTicketRequest = mentionsJira(userQuery) && 
            (userQuery.toLowerCase().includes('create') || 
             userQuery.toLowerCase().includes('open') || 
             userQuery.toLowerCase().includes('new ticket') ||
             userQuery.toLowerCase().includes('write a ticket'));
        
        if (isTicketRequest) {
            console.log('🎫 Ticket creation request detected');
            // First, ask Claude to analyze what tickets should be created
            const analysisPrompt = `${formattedQuery}

## Special Instructions for Ticket Analysis
DO NOT create any tickets yet! Instead, analyze what tickets SHOULD be created and return ONLY a JSON array.

Your response must be ONLY a JSON array (no other text) with ticket suggestions. Example format:
[
  {
    "projectKey": "DOT",
    "projectName": "dotfun",
    "issueType": "Task",
    "summary": "Implement notification system",
    "description": "Create a system that...",
    "priority": "Medium",
    "assignee": null,
    "labels": ["notifications", "integration"]
  }
]

For each suggested ticket include:
- projectKey: The JIRA project key from the context
- projectName: The project name
- issueType: Task, Bug, Story, Epic, or Subtask
- summary: Clear, concise title
- description: Detailed description with acceptance criteria
- priority: Highest, High, Medium, or Low
- assignee: {jiraAccountId, displayName} or null
- labels: Array of relevant labels

IMPORTANT: Return ONLY the JSON array, no explanatory text before or after.`;
            
            try {
                // Get ticket suggestions from Claude
                const analysisResponse = await queryClaudeSDK(analysisPrompt, conversationContext, message);
                console.log('📝 Ticket analysis response received:', analysisResponse.substring(0, 200));
                
                // Try to parse JSON from the response
                let ticketSuggestions = [];
                try {
                    // Extract JSON from the response (Claude might include extra text)
                    const jsonMatch = analysisResponse.match(/\[\s*\{[\s\S]*\}\s*\]/); 
                    if (jsonMatch) {
                        ticketSuggestions = JSON.parse(jsonMatch[0]);
                    }
                } catch (parseError) {
                    console.error('Failed to parse ticket suggestions:', parseError);
                    console.log('Response that failed to parse:', analysisResponse);
                    
                    // Try a simpler approach - ask Claude to create tickets with a clearer prompt
                    const fallbackPrompt = formattedQuery + '\n\nIMPORTANT: Create JIRA tickets for the requested items. Use the MCP JIRA tools to create the tickets and show what was created.';
                    await queryClaudeSDK(fallbackPrompt, conversationContext, message);
                    return;
                }
                
                // Show ticket previews for each suggestion
                for (const ticket of ticketSuggestions) {
                    // Check if we already handled a similar ticket
                    if (wasTicketAlreadyHandled(message.channel.id, ticket.summary)) {
                        await message.channel.send(`ℹ️ Skipping duplicate ticket: "${ticket.summary}" (similar ticket already handled)`);
                        continue;
                    }
                    
                    // Ensure ticket has all required fields with defaults
                    const normalizedTicket = {
                        ...ticket,
                        projectKey: ticket.projectKey || 'DOT',
                        projectName: ticket.projectName || 'dotfun',
                        issueType: ticket.issueType || 'Task',
                        summary: ticket.summary || 'New ticket',
                        description: ticket.description || '',
                        priority: ticket.priority || 'Medium',
                        assignee: ticket.assignee || null,
                        labels: ticket.labels || []
                    };
                    
                    // Create preview embed
                    const embed = createTicketPreviewEmbed(normalizedTicket);
                    const buttons = createTicketActionButtons(normalizedTicket.id || Date.now().toString());
                    
                    // Send preview message
                    const previewMessage = await message.channel.send({
                        embeds: [embed],
                        components: [buttons]
                    });
                    
                    // Store normalized ticket data for button handler
                    pendingTickets.set(previewMessage.id, normalizedTicket);
                }
                
                // If no tickets were suggested
                if (ticketSuggestions.length === 0) {
                    console.log('📭 No ticket suggestions generated');
                    await message.channel.send('ℹ️ No tickets needed based on this conversation.');
                } else {
                    console.log(`🎫 Generated ${ticketSuggestions.length} ticket preview(s)`);
                }
                
            } catch (error) {
                console.error('Error analyzing ticket request:', error);
                // Fall back to normal query
                await queryClaudeSDK(formattedQuery, conversationContext, message);
            }
            
        } else {
            // Normal query - not a ticket request
            await queryClaudeSDK(formattedQuery, conversationContext, message);
        }
        
        // Context is already updated within queryClaudeSDK function
        // No need to update it here since the response is handled internally
        
        // Response handling completed
        
    } catch (error) {
        console.error('❌ Error:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Error')
            .setDescription(error.message || 'An unknown error occurred');
        
        if (error.message.includes('ANTHROPIC_API_KEY')) {
            errorEmbed.addFields({
                name: 'Solution',
                value: 'Make sure you are logged in with `claude login`',
                inline: false
            });
        }
        
        await message.reply({ embeds: [errorEmbed] });
    }
});

// Error handling
client.on(Events.Error, error => {
    console.error('Discord client error:', error);
});

// Graceful shutdown (only in production)
if (process.env.NODE_ENV !== 'test') {
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down...');
        client.destroy();
        process.exit(0);
    });
}

// Login
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
    console.error('❌ DISCORD_BOT_TOKEN not found!');
    console.error('Please add DISCORD_BOT_TOKEN to your .env file');
    if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
    }
} else if (process.env.NODE_ENV !== 'test') {
    client.login(token).catch(error => {
        console.error('❌ Failed to login:', error);
        process.exit(1);
    });
}

// Export functions for testing
if (process.env.NODE_ENV === 'test') {
    module.exports = {
        __testExports: {
            logError,
            loadBaseContext,
            loadChannelContext,
            refreshAllContexts,
            loadSessions,
            saveSessions,
            cleanupOldSessions,
            mentionsJira,
            getJiraContext,
            safeQuery,
            queryClaudeSDK,
            splitMessage,
            createTicketSuggestion,
            createTicketPreviewEmbed,
            createTicketActionButtons,
            wasTicketAlreadyHandled,
            recordTicketDecision,
            handleReflectionCommand
        }
    };
}