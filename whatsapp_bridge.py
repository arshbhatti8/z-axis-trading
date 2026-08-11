import os
from fastapi import FastAPI, Form, Request, Response
from twilio.twiml.messaging_response import MessagingResponse
from google.antigravity import Agent, LocalAgentConfig

# The specific conversation ID for your CURRENT active CLI session
CURRENT_CONVERSATION_ID = "dfc29e86-9e7d-4ad7-b8ce-92a8d2c5d74e"

app = FastAPI()

@app.post("/whatsapp")
async def whatsapp_webhook(Body: str = Form(...)):
    """
    Twilio hits this webhook when you send a WhatsApp message to your Twilio number.
    """
    print(f"Received WhatsApp message: {Body}")

    # Configure the agent to attach to your live CLI conversation
    config = LocalAgentConfig(conversation_id=CURRENT_CONVERSATION_ID)
    
    # We use a Twilio MessagingResponse to reply
    response = MessagingResponse()
    
    try:
        # Attach to the running Antigravity conversation and send the message
        async with Agent(config) as agent:
            agent_response = await agent.chat(Body)
            
            # Gather the full response
            full_reply = "".join([token async for token in agent_response])
            print(f"Agent replied: {full_reply}")
            
            # Add the reply to the WhatsApp response
            response.message(full_reply)
            
    except Exception as e:
        print(f"Error: {e}")
        response.message("Oops, something went wrong connecting to Antigravity.")

    # Return the TwiML response as XML so Twilio routes it back to your phone
    return Response(content=str(response), media_type="application/xml")

if __name__ == "__main__":
    import uvicorn
    print("Starting WhatsApp bridge on port 8000...")
    print("Use ngrok to expose this port: ngrok http 8000")
    print("Then paste your ngrok URL + '/whatsapp' into the Twilio WhatsApp Sandbox webhook settings.")
    uvicorn.run(app, host="0.0.0.0", port=8000)
