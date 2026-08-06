import asyncio
from telegram import Update
from telegram.ext import ApplicationBuilder, MessageHandler, filters, ContextTypes
from google.antigravity import Agent, LocalAgentConfig, CapabilitiesConfig
import os

# Configure agent with full write/command capabilities
config = LocalAgentConfig(capabilities=CapabilitiesConfig())

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_message = update.message.text
    print(f"Received message: {user_message}")
    
    # Send a "typing..." indicator to your phone
    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action='typing')
    
    # Forward to the agent
    async with Agent(config) as agent:
        response = await agent.chat(user_message)
        
        # Gather the response tokens
        full_response = "".join([token async for token in response])
        
        # Send back to Telegram
        await update.message.reply_text(full_response)
        print(f"Sent reply: {full_response}")

def main():
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        print("Error: TELEGRAM_BOT_TOKEN environment variable not set.")
        print("Please set it using: export TELEGRAM_BOT_TOKEN='your-token-here'")
        return

    app = ApplicationBuilder().token(token).build()
    app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_message))
    
    print("Telegram bot is up and listening! Send a message from your phone.")
    app.run_polling()

if __name__ == '__main__':
    main()
