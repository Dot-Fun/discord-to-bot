const { Client, GatewayIntentBits } = require('discord.js');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create a test client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const AI_NEWS_CHANNEL_ID = '1319782530249003100';
const BOT_USER_ID = '1387839680724209746'; // From the token in .mcp.json

client.once('ready', async () => {
    console.log(`✅ Test client ready as ${client.user.tag}`);
    
    try {
        // Get the channel
        const channel = await client.channels.fetch(AI_NEWS_CHANNEL_ID);
        if (!channel) {
            console.error('❌ Could not find #ai-news channel');
            process.exit(1);
        }
        
        console.log(`📍 Found channel: #${channel.name}`);
        
        // Send the test message mentioning the bot
        const testMessage = `<@${BOT_USER_ID}> please create a new ticket for implementing a notification system that works across Discord, JIRA, and email`;
        
        console.log('📤 Sending test message...');
        const sentMessage = await channel.send(testMessage);
        console.log(`✅ Message sent! ID: ${sentMessage.id}`);
        console.log('🕐 Waiting 10 seconds to observe bot response...');
        
        // Wait to see the response
        setTimeout(() => {
            console.log('✅ Test complete. Check Discord to see if the interactive ticket flow was triggered.');
            client.destroy();
            process.exit(0);
        }, 10000);
        
    } catch (error) {
        console.error('❌ Error:', error);
        client.destroy();
        process.exit(1);
    }
});

// Login with the same token
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
    console.error('❌ DISCORD_BOT_TOKEN not found in .env file');
    process.exit(1);
}

client.login(token).catch(error => {
    console.error('❌ Failed to login:', error);
    process.exit(1);
});