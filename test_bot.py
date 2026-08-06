import asyncio
from unittest.mock import AsyncMock, MagicMock
from telegram_bot import handle_message

async def main():
    print("Simulating a Telegram message from phone...")
    
    # Create mock update
    mock_update = MagicMock()
    mock_update.message.text = "Can you list the files in the current directory?"
    mock_update.effective_chat.id = 123456
    mock_update.message.reply_text = AsyncMock()

    # Create mock context
    mock_context = MagicMock()
    mock_context.bot.send_chat_action = AsyncMock()

    # Run the handler
    await handle_message(mock_update, mock_context)
    
    # Verify the reply
    mock_update.message.reply_text.assert_called_once()
    reply_args = mock_update.message.reply_text.call_args[0]
    print(f"\n--- Bot's Response to Phone ---\n{reply_args[0]}\n-------------------------------")

if __name__ == '__main__':
    asyncio.run(main())
