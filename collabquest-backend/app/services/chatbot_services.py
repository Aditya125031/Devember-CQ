import os
import asyncio
import google.generativeai as genai
from dotenv import load_dotenv
from app.models import ChatMessage

load_dotenv()

# Configure Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

MODEL_NAME = os.getenv("GEMINI_MODEL","gemini-2.5-flash")

async def generate_chat_reply(question: str,user_skills: list[str], user_id: str)->str:
    """
    Generates a chatbot response using Gemini 2.5 Flash.
    Personalized based on the user's skill set.
    """

    system_instruction = f"""
    You are CollabQuest Mentor Bot.

    The user’s current skill set: {", ".join(user_skills) if user_skills else "Beginner"}.

    Your role:
    - Help with hackathons, team formation, software development, and project planning.
    - Suggest realistic next steps based on the user’s skill level.
    - Prefer actionable advice over theory.
    - Keep responses concise, practical, and encouraging.
    """


    model = genai.GenerativeModel(model_name=MODEL_NAME,system_instruction=system_instruction)

    past_messages = await ChatMessage.find(
        ChatMessage.user_id == user_id
    ).sort("-timestamp").limit(10).to_list()
    
    history = []

    for msg in reversed(past_messages):
        history.append({
            "role": "user",
            "parts": [msg.question]
        })
        history.append({
            "role": "model",
            "parts": [msg.answer]
        })

    chat = model.start_chat(history=history)

    try:
        # Gemini SDK is sync → run in thread
        response = await asyncio.to_thread(
            chat.send_message,
            question
        )
        return response.text

    except Exception as e:
        print(f"Chatbot AI Error: {e}")
        return "Sorry, I ran into an issue processing your request."
