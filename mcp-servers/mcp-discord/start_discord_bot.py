import os
import discord
from discord import app_commands
from typing import Optional
import asyncio  # Import asyncio for event loop management if needed outside bot context
from aiohttp import ClientSession
from dotenv import load_dotenv # To load environment variables from .env file

# --- Configuration ---
# Load environment variables from a .env file if it exists
load_dotenv()

DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
# Optional: Put your test server ID in .env or replace None
# Useful for instantly registering slash commands for testing
TESTING_GUILD_ID_STR = os.getenv("TESTING_GUILD_ID")
TESTING_GUILD_ID = int(TESTING_GUILD_ID_STR) if TESTING_GUILD_ID_STR else None

# Basic check for the token
if not DISCORD_BOT_TOKEN:
    raise ValueError("DISCORD_BOT_TOKEN environment variable not set!")

# --- Bot Class ---
class WordcabBot(discord.Client):
    """Wordcab Discord Bot."""

    def __init__(
        self,
        *args,
        intents: discord.Intents, # Intents are now mandatory
        testing_guild_id: Optional[int] = None,
        **kwargs # Added **kwargs to pass other options to discord.Client
    ):
        """Client initialization."""
        super().__init__(*args, intents=intents, **kwargs)
        self.testing_guild_id = testing_guild_id
        self.tree = app_commands.CommandTree(self)
        # Initialize web_client as None, create it in setup_hook
        self.web_client: Optional[ClientSession] = None

    async def on_ready(self):
        """Called when the bot is ready and connected."""
        await self.wait_until_ready() # Good practice, though often implicitly waited for
        print(f'Logged on as {self.user} (ID: {self.user.id})')
        print('------')

    async def on_guild_join(self, guild: discord.Guild):
        """Called when the bot joins a new guild."""
        print(f'Joined guild: {guild.name} (ID: {guild.id})')
        # You could potentially sync commands here for the new guild if needed
        # await self.tree.sync(guild=guild) # Syncs commands specific to this guild

    async def on_guild_remove(self, guild: discord.Guild):
        """Called when the bot leaves or is removed from a guild."""
        print(f'Left guild: {guild.name} (ID: {guild.id})')

    async def setup_hook(self) -> None:
        """
        Asynchronous setup phase. Called before on_ready.
        Perfect place for creating sessions and syncing commands.
        """
        print("Running setup_hook...")

        # Create the aiohttp ClientSession here
        self.web_client = ClientSession()
        print("aiohttp.ClientSession created.")

        # --- Sync Application Commands ---
        # Choose ONE of the following sync methods:

        # Method 1: Sync specific commands to a testing guild (instant update)
        if self.testing_guild_id:
            guild = discord.Object(id=self.testing_guild_id)
            self.tree.copy_global_to(guild=guild)
            try:
                await self.tree.sync(guild=guild)
                print(f'Synced commands to test guild (ID: {self.testing_guild_id})')
            except discord.errors.Forbidden:
                 print(f'Error: Bot lacks APPLICATION_COMMANDS scope or permissions in test guild (ID: {self.testing_guild_id}).')
            except Exception as e:
                 print(f"Error syncing commands to test guild: {e}")


        # Method 2: Sync globally (can take up to an hour to propagate)
        # Uncomment this block and comment/remove Method 1 if you want global sync
        # else:
        #     try:
        #         await self.tree.sync()
        #         print('Synced commands globally.')
        #     except Exception as e:
        #         print(f"Error syncing commands globally: {e}")

        # Method 3: Sync to test guild AND globally (common pattern)
        # if self.testing_guild_id:
        #     guild = discord.Object(id=self.testing_guild_id)
        #     self.tree.copy_global_to(guild=guild)
        #     try:
        #         await self.tree.sync(guild=guild)
        #         print(f'Synced commands to test guild (ID: {self.testing_guild_id})')
        #     except Exception as e:
        #         print(f"Error syncing commands to test guild: {e}")
        # # Also sync globally
        # try:
        #     await self.tree.sync()
        #     print('Synced commands globally.')
        # except Exception as e:
        #     print(f"Error syncing commands globally: {e}")

        print("setup_hook finished.")

    async def close(self) -> None:
        """Properly close the bot and cleanup resources."""
        print("Closing bot...")
        if self.web_client:
            await self.web_client.close()
            print("aiohttp.ClientSession closed.")
        await super().close()
        print("Bot closed.")

# --- Define Intents ---
# Start with default intents
intents = discord.Intents.default()
# Add privileged intents if absolutely necessary AND enabled in Developer Portal
intents.message_content = True # Needed for reading message content (prefix commands, message analysis)
intents.members = True         # Needed for member join/leave events, accurate member lists
                               # REMINDER: Enable these in the Discord Developer Portal!

# --- Instantiate the Bot ---
bot = WordcabBot(intents=intents, testing_guild_id=TESTING_GUILD_ID)

# --- Define a Simple Slash Command (Example) ---
@bot.tree.command(name="hello", description="Says hello back to you!")
async def hello_command(interaction: discord.Interaction):
    """Responds with a greeting."""
    user_name = interaction.user.display_name
    await interaction.response.send_message(f"Hello {user_name}!")

# --- Main Execution ---
if __name__ == "__main__":
    try:
        print("Starting bot...")
        # Run the bot using the token from the environment variable
        bot.run(DISCORD_BOT_TOKEN)
    except discord.LoginFailure:
        print("Error: Invalid Discord Token. Please check your DISCORD_BOT_TOKEN environment variable.")
    except discord.PrivilegedIntentsRequired:
        print("Error: Privileged intents (Members or Message Content) are not enabled in the Discord Developer Portal.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")