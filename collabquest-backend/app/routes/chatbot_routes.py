import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.models import ChatMessage, User
from app.auth.dependencies import get_current_user
from app.services.chatbot_services import generate_chat_reply
from dotenv import load_dotenv

load_dotenv()
router = APIRouter()

class ChatRequest(BaseModel):
    question: str

class ChatResponse(BaseModel):
    answer: str

@router.post("/", response_model=ChatResponse)
async def ask_chatbot(data : ChatRequest, current_user: User = Depends(get_current_user)):
    try:
        # Extract skills from User object
        user_skills = [s.name for s in current_user.skills]

        # Call service layer (Gemini handled inside chat_service)
        answer = await generate_chat_reply(data.question, user_skills, str(current_user.id))

        # Save chat to database
        chat_message = ChatMessage(
            user_id=str(current_user.id),
            question=data.question,
            answer=answer
        )
        await chat_message.insert()

        return {"answer": answer}
    except Exception as e:
        print(f"Error in chat route: {e}")
        raise HTTPException(status_code=500, detail="Chat processing failed")

@router.get("/history")
async def get_chat_history(current_user: User = Depends(get_current_user)):

    messages = await ChatMessage.find(ChatMessage.user_id == str(current_user.id)).sort("+timestamp").to_list()

    history = [
        {
            "question": msg.question,
            "answer": msg.answer,
            "timestamp": msg.timestamp
        }
        for msg in messages
    ]

    return {"history" : history}