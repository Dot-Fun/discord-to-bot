const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const { query } = require('@anthropic-ai/claude-code');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

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
    MAX_RESPONSE_LENGTH: 2000,
    MAX_CONTEXT_MESSAGES: 10,
    MAX_TURNS: 3, // Increased to allow tool use
    CWD: process.cwd() // Working directory for Claude to find .mcp.json
};

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

// Track conversations
const conversations = new Map();

// Helper: Query Claude using the SDK with streaming
async function queryClaudeSDK(prompt, context = [], originalMessage) {
    try {
        // Build the full prompt with context
        let fullPrompt = prompt;
        if (context.length > 0) {
            fullPrompt = 'Previous conversation:\n' + 
                        context.map(msg => `${msg.role}: ${msg.content}`).join('\n') + 
                        '\n\nCurrent message: ' + prompt;
        }
        
        console.log('Querying Claude with prompt:', fullPrompt);
        console.log('Working directory for Claude:', CONFIG.CWD);
        
        // Enable debug mode to see errors
        process.env.DEBUG = 'true';
        
        // Keep track of Discord messages for streaming
        let responseMessage = null;
        let currentContent = '';
        let isProcessing = true;
        
        // Send typing indicator periodically while processing
        const typingInterval = setInterval(() => {
            if (isProcessing) {
                originalMessage.channel.sendTyping();
            }
        }, 5000);
        
        try {
            // Query Claude using the SDK with MCP support
            // Using 'default' permission mode should respect .claude/settings.json
            for await (const msg of query({
                prompt: fullPrompt,
                options: {
                    maxTurns: CONFIG.MAX_TURNS,
                    // Enable MCP by setting the working directory
                    cwd: CONFIG.CWD,
                    // Use default permission mode to respect .claude/settings.json
                    permissionMode: 'default',
                    // Uncomment this line if settings.json isn't being respected:
                    // allowedTools: allowedToolsList
                }
            })) {
                console.log('Streaming message type:', msg.type);
                
                // Handle different message types from Claude SDK
                if (msg.type === 'assistant' && msg.message) {
                    const content = msg.message.content;
                    if (Array.isArray(content)) {
                        for (const item of content) {
                            if (item.type === 'text' && item.text) {
                                // Add text to current content
                                currentContent += item.text + '\n';
                                
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
                            } else if (item.type === 'tool_use') {
                                // Notify about tool usage
                                const toolMessage = `🔧 Using tool: ${item.name}...`;
                                if (!responseMessage) {
                                    responseMessage = await originalMessage.reply(toolMessage);
                                } else {
                                    await originalMessage.channel.send(toolMessage);
                                }
                            }
                        }
                    }
                } else if (msg.type === 'tool_result') {
                    // Log tool results
                    console.log('Tool completed:', msg);
                    
                    // Send a status update
                    if (msg.tool_use_id) {
                        await originalMessage.channel.send('✅ Tool completed');
                    }
                } else if (msg.type === 'error') {
                    // Handle error messages
                    const errorMsg = `❌ Error: ${msg.error || 'Unknown error'}`;
                    await originalMessage.channel.send(errorMsg);
                }
            }
        } finally {
            // Stop typing indicator
            isProcessing = false;
            clearInterval(typingInterval);
        }
        
        // If no response was sent, send a default message
        if (!responseMessage && !currentContent) {
            return "I'm processing your request...";
        }
        
        return currentContent.trim();
        
    } catch (error) {
        console.error('Error querying Claude:', error);
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

// Bot ready event
client.once(Events.ClientReady, readyClient => {
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
    
    // Set activity
    client.user.setActivity('@Dot help | Tools enabled', { type: 'LISTENING' });
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
                { name: '🛠️ Available Tools', value: 'Discord, JIRA, Confluence, Gmail, Google Calendar, Google Drive', inline: false },
                { name: '📝 Examples', value: 
                    '`@Dot check my gmail`\n' +
                    '`@Dot what JIRA tickets are assigned to me?`\n' +
                    '`@Dot search google drive for project docs`\n' +
                    '`@Dot send a discord message to #general`', 
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
        let context = conversations.get(channelId) || [];
        
        // Format the query with user info and context about Discord
        const formattedQuery = `[${message.author.username}]: ${userQuery}
        
Context: You are in Discord server "${message.guild?.name || 'DM'}" (ID: ${message.guild?.id || 'DM'}) in channel #${message.channel.name || 'DM'} (ID: ${message.channel.id}).
Server ID: ${message.guild?.id || 'N/A'}
Channel ID: ${message.channel.id}
User ID: ${message.author.id}
You have access to MCP tools for Discord, JIRA, Confluence, Gmail, Google Calendar, and Google Drive.
When using Discord MCP tools, use these IDs directly.`;
        
        // Query Claude - this will now handle streaming internally
        const response = await queryClaudeSDK(formattedQuery, context, message);
        
        // Update context with the final response
        if (response) {
            context.push(
                { role: message.author.username, content: userQuery },
                { role: 'Claude', content: response }
            );
            
            // Keep only last N messages
            if (context.length > CONFIG.MAX_CONTEXT_MESSAGES * 2) {
                context = context.slice(-CONFIG.MAX_CONTEXT_MESSAGES * 2);
            }
            
            conversations.set(channelId, context);
        }
        
        console.log(`✅ Streaming completed`);
        
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

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    client.destroy();
    process.exit(0);
});

// Login
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
    console.error('❌ DISCORD_BOT_TOKEN not found!');
    console.error('Please add DISCORD_BOT_TOKEN to your .env file');
    process.exit(1);
}

client.login(token).catch(error => {
    console.error('❌ Failed to login:', error);
    process.exit(1);
});