const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const { query } = require('@anthropic-ai/claude-code');
const dotenv = require('dotenv');

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
    BOT_PREFIX: '!claude',
    MAX_RESPONSE_LENGTH: 2000,
    MAX_CONTEXT_MESSAGES: 10,
    MAX_TURNS: 1
};

// Track conversations
const conversations = new Map();

// Helper: Query Claude using the SDK
async function queryClaudeSDK(prompt, context = []) {
    const messages = [];
    
    try {
        // Build the full prompt with context
        let fullPrompt = prompt;
        if (context.length > 0) {
            fullPrompt = 'Previous conversation:\n' + 
                        context.map(msg => `${msg.role}: ${msg.content}`).join('\n') + 
                        '\n\nCurrent message: ' + prompt;
        }
        
        console.log('Querying Claude with prompt:', fullPrompt);
        
        // Query Claude using the SDK
        for await (const message of query({
            prompt: fullPrompt,
            options: {
                maxTurns: CONFIG.MAX_TURNS
            }
        })) {
            messages.push(message);
        }
        
        // Extract the response text from messages
        let responseText = '';
        
        for (const msg of messages) {
            console.log('Processing message:', JSON.stringify(msg, null, 2));
            
            // Handle different message types from Claude SDK
            if (msg.type === 'assistant' && msg.message) {
                const content = msg.message.content;
                if (Array.isArray(content)) {
                    for (const item of content) {
                        if (item.type === 'text' && item.text) {
                            responseText += item.text + '\n';
                        }
                    }
                }
            } else if (typeof msg === 'string') {
                responseText += msg + '\n';
            }
        }
        
        responseText = responseText.trim();
        console.log('Extracted response:', responseText);
        
        // If we couldn't extract a response, try to be helpful
        if (!responseText) {
            console.log('All messages:', JSON.stringify(messages, null, 2));
            responseText = "I'm processing your request...";
        }
        
        return responseText;
        
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
    
    // Set activity
    client.user.setActivity('!claude help', { type: 'LISTENING' });
});

// Message handler
client.on(Events.MessageCreate, async message => {
    // Ignore bots
    if (message.author.bot) return;
    
    // Check for bot mention or prefix
    const isMentioned = message.mentions.has(client.user);
    const hasPrefix = message.content.toLowerCase().startsWith(CONFIG.BOT_PREFIX);
    
    if (!isMentioned && !hasPrefix) return;
    
    // Extract query
    let userQuery = message.content;
    if (hasPrefix) {
        userQuery = message.content.slice(CONFIG.BOT_PREFIX.length).trim();
    } else if (isMentioned) {
        userQuery = message.content.replace(/<@!?\d+>/g, '').trim();
    }
    
    // Handle special commands
    if (userQuery.toLowerCase() === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🤖 Claude Discord Bot Help')
            .setDescription('I use Claude AI to answer your questions!')
            .addFields(
                { name: '💬 Usage', value: '`!claude <question>` or mention me', inline: false },
                { name: '🧹 Clear', value: '`!claude clear` - Reset conversation', inline: false },
                { name: '🔐 Auth', value: 'Using Claude Code SDK with OAuth', inline: false }
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
        await message.reply('Hi! I\'m Claude. Ask me anything!');
        return;
    }
    
    // Show typing
    await message.channel.sendTyping();
    
    try {
        console.log(`📨 [${message.guild?.name || 'DM'}] ${message.author.tag}: ${userQuery}`);
        
        // Get conversation context
        const channelId = message.channel.id;
        let context = conversations.get(channelId) || [];
        
        // Format the query with user info
        const formattedQuery = `[${message.author.username}]: ${userQuery}`;
        
        // Query Claude
        const response = await queryClaudeSDK(formattedQuery, context);
        
        if (!response) {
            throw new Error('Received empty response from Claude');
        }
        
        // Update context
        context.push(
            { role: message.author.username, content: userQuery },
            { role: 'Claude', content: response }
        );
        
        // Keep only last N messages
        if (context.length > CONFIG.MAX_CONTEXT_MESSAGES * 2) {
            context = context.slice(-CONFIG.MAX_CONTEXT_MESSAGES * 2);
        }
        
        conversations.set(channelId, context);
        
        // Send response
        const chunks = splitMessage(response);
        for (let i = 0; i < chunks.length; i++) {
            if (i === 0) {
                await message.reply(chunks[i]);
            } else {
                await message.channel.send(chunks[i]);
            }
        }
        
        console.log(`✅ Response sent successfully`);
        
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