import os
import asyncio
import json
from typing import TypedDict, Literal

from openai import AsyncOpenAI
from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END

from app.models import ChatMessage, Team
from app.services.recommendation_service import search_vectors

load_dotenv()

# --- CONFIGURATION ---
client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
)

# Models
ROUTER_MODEL = "arcee-ai/trinity-mini:free"
CODER_MODEL = "xiaomi/mimo-v2-flash:free"
MENTOR_MODEL = "allenai/olmo-3.1-32b-think:free" 

# --- 1. DEFINE THE STATE (The Memory of the Graph) ---
class AgentState(TypedDict):
    question: str
    user_id: str
    user_skills: list[str]
    intent: str
    final_response: str

# --- 2. DEFINE THE NODES (The Agents) ---

# app/services/chatbot_services.py

# ... existing imports ...

# REPLACE the router_node function with this:
async def router_node(state: AgentState):
    """Decides which path to take."""
    print(f"🧠 Routing: {state['question'][:30]}...")
    
    # 🔥 FIX: Use a simple string instead of ChatPromptTemplate
    router_prompt = """You are a Router. Classify the user input into EXACTLY ONE category:
    - CREATE_PROJECT (User wants to start/post a project)
    - CODE_REQUEST (User asks for code/debugging)
    - SEARCH_REQUEST (User wants to find/join teams)
    - GENERAL_QUERY (Greetings, platform questions)
    
    User Input: {question}
    
    Respond with ONLY the category name."""
    
    # 🔥 FIX: Synchronous standard python formatting
    chain_input = router_prompt.format(question=state["question"])
    
    try:
        completion = await client.chat.completions.create(
            model=ROUTER_MODEL,
            messages=[{"role": "user", "content": chain_input}],
            temperature=0.0
        )
        intent = completion.choices[0].message.content.strip().upper()
    except:
        intent = "GENERAL_QUERY"
        
    # Safety Check
    if intent not in ["CREATE_PROJECT", "CODE_REQUEST", "SEARCH_REQUEST", "GENERAL_QUERY"]:
        intent = "GENERAL_QUERY"
        
    return {"intent": intent}

async def planner_node(state: AgentState):
    """Handles Project Creation Logic."""
    print("🚀 Planner Node Active")
    
    system_prompt = """
    You are a Technical Project Manager.
    Convert the idea: "{idea}" into a JSON Project Plan.
    JSON Format: {{ "name": "...", "description": "...", "needed_skills": ["..."], "roadmap": ["..."] }}
    """
    
    try:
        completion = await client.chat.completions.create(
            model=MENTOR_MODEL,
            messages=[{"role": "user", "content": system_prompt.format(idea=state["question"])}]
        )
        raw_text = completion.choices[0].message.content
        clean_json = raw_text.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean_json)
        
        # Database Action
        new_team = Team(
            name=data["name"],
            description=data["description"],
            leader_id=state["user_id"],
            needed_skills=data["needed_skills"],
            members=[state["user_id"]],
            roadmap=data.get("roadmap", [])
        )
        await new_team.insert()
        
        response = f"✅ Created **{data['name']}**!\nStack: {', '.join(data['needed_skills'])}"
    except Exception as e:
        response = "I tried to create the project but hit a snag. Please try again."
        
    return {"final_response": response}

async def coder_node(state: AgentState):
    """Handles Coding Requests."""
    print("🔧 Coder Node Active")
    
    try:
        completion = await client.chat.completions.create(
            model=CODER_MODEL,
            messages=[
                {"role": "system", "content": "You are an expert coding assistant. Provide clean code."},
                {"role": "user", "content": state["question"]}
            ]
        )
        return {"final_response": completion.choices[0].message.content}
    except:
        return {"final_response": "I'm having trouble generating code right now."}

async def search_node(state: AgentState):
    """Handles Vector Search."""
    print("🔍 Search Node Active")
    
    # 1. Decide Filter
    filter_type = "team"
    if any(k in state["question"].lower() for k in ["developer", "member", "user"]):
        filter_type = "user"
        
    # 2. Search (Run synchronous function in thread)
    query = f"{state['question']} {', '.join(state['user_skills'])}"
    matches = await asyncio.to_thread(search_vectors, query, filter_type)
    
    if not matches:
        return {"final_response": "I couldn't find any matching teams or members right now."}
        
    # 3. Summarize Matches
    context = "\n\n".join(matches)
    prompt = f"""
    Recommend the best fit from these matches for the request: "{state['question']}"
    Matches:
    {context}
    """
    
    completion = await client.chat.completions.create(
        model=MENTOR_MODEL,
        messages=[{"role": "user", "content": prompt}]
    )
    return {"final_response": completion.choices[0].message.content}

# app/services/chatbot_services.py

async def chat_node(state: AgentState):
    """
    Handles General Conversation.
    Includes:
    1. Full Platform Manual (Context)
    2. User Skills & ID (Personalization)
    3. Chat History (Memory)
    """
    print("🤖 Chat Node Active (Mentor Mode)")
    
    user_id = state["user_id"]
    user_skills = state["user_skills"]
    
    # --- 1. DEFINE THE KNOWLEDGE BASE ---
    platform_guide = """
    PLATFORM MANUAL FOR COLLABQUEST

    1. FINDING AND JOINING TEAMS
    To find a team, users should go to the Marketplace page where they can browse active project cards.
    To quickly find projects, users can use the Smart Match feature. Swiping right applies to the project, and swiping left passes.
    To check application status, users should visit the Dashboard and look under the My Applications section to see if they are Pending, Joined, or Rejected.

    2. CREATING AND RECRUITING
    To create a team, users must go to the Marketplace page and click the Post Idea button.
    To recruit developers, Team Leaders can use the Recruit page to swipe on candidates.
    Only Team Leaders can recruit or manage the team settings.

    3. PROFILE AND SKILLS
    To edit a profile, users should go to the My Profile page to update their bio, interests, and availability.
    To verify a skill, users must go to My Profile, add a skill, and click the Verify button to take a quiz.
    If a user fails a verification quiz, they can try again later.
    The Trust Score is a reliability rating from 0 to 10 that increases by verifying skills and completing projects.

    4. COMMUNICATION AND TOOLS
    To chat, users can click the Messages button in the header.
    To send an email, users can click the Mail icon on any user or project card.
    To check notifications, users should click the Bell Icon. This is where they accept Team Invites and Vote on team decisions.
    To set availability, users should go to the Weekly Availability section in their Profile.
    To log out, users must click their Profile Picture in the top right corner and select Logout.

    5. MANAGING TEAMS
    To leave a team, users must go to the Team Details page.
    Major actions like Deleting a Team or Marking a Project Complete require a democratic vote from all members.
    To re-apply after being rejected, users can go to the Dashboard and click the Reset button on the application.
    """

    system_instruction = f"""
    You are CollabQuest Mentor Bot, the official AI assistant for this platform.

    User Context:
    User ID: {user_id}
    Current Skills: {", ".join(user_skills) if user_skills else "Beginner"}

    {platform_guide}

    INSTRUCTIONS:
    - If the user asks about the Platform, use the Manual above.
    - If the user asks for code (and the coding model failed), provide the code yourself.
    
    - **ANTI-HALLUCINATION RULE:** If the user asks for "Team Suggestions" or "Project Ideas" and you reached this point, it means NO database matches were found.
    - **DO NOT INVENT FAKE PROJECTS.** - Instead, politely tell the user: "I don't have any specific projects for you right now, but you can post your own idea on the Marketplace!"
    
    - **FORMATTING:** Do NOT use bold text, asterisks (**), or Markdown headers (#). Write in clean, plain text. Use standard numbering (1., 2.) for lists.
    - Be patient, encouraging, and thorough.
    """
    
    # --- 2. FETCH & FORMAT HISTORY ---
    try:
        # Get NEWEST 6 messages first (so we don't get old stuff from last year)
        past_msgs_db = await ChatMessage.find(ChatMessage.user_id == user_id)\
            .sort("-timestamp")\
            .limit(6)\
            .to_list()
            
        # Reverse them so they read chronologically (Old -> New) for the AI context window
        past_msgs_db.reverse()
    except:
        past_msgs_db = []
        
    messages_payload = [{"role": "system", "content": system_instruction}]
    
    for m in past_msgs_db:
        # Truncate slightly to save tokens if messages are huge
        q_text = (m.question[:200] + '..') if len(m.question) > 200 else m.question
        a_text = (m.answer[:200] + '..') if len(m.answer) > 200 else m.answer
        
        messages_payload.append({"role": "user", "content": q_text})
        messages_payload.append({"role": "assistant", "content": a_text})
        
    # Add the current user question from the State
    messages_payload.append({"role": "user", "content": state["question"]})

    # --- 3. GENERATE REPLY ---
    try:
        completion = await client.chat.completions.create(
            model=MENTOR_MODEL,
            messages=messages_payload,
            extra_headers={
                "HTTP-Referer": "https://collabquest.com",
                "X-Title": "CollabQuest"
            }
        )
        return {"final_response": completion.choices[0].message.content}
    except Exception as e:
        print(f"Chat Node Error: {e}")
        return {"final_response": "I'm having trouble connecting to the network right now. Please try again."}

# --- 3. BUILD THE GRAPH ---

workflow = StateGraph(AgentState)

# Add Nodes
workflow.add_node("router", router_node)
workflow.add_node("planner", planner_node)
workflow.add_node("coder", coder_node)
workflow.add_node("searcher", search_node)
workflow.add_node("chatter", chat_node)

# Set Entry Point
workflow.set_entry_point("router")

# Define Logic (The Conditional Edges)
def route_decision(state):
    intent = state["intent"]
    if intent == "CREATE_PROJECT": return "planner"
    if intent == "CODE_REQUEST": return "coder"
    if intent == "SEARCH_REQUEST": return "searcher"
    return "chatter"

workflow.add_conditional_edges(
    "router",
    route_decision,
    {
        "planner": "planner",
        "coder": "coder",
        "searcher": "searcher",
        "chatter": "chatter"
    }
)

# All nodes end after they work
workflow.add_edge("planner", END)
workflow.add_edge("coder", END)
workflow.add_edge("searcher", END)
workflow.add_edge("chatter", END)

# Compile
app = workflow.compile()

# --- 4. EXPORT THE MAIN FUNCTION ---

async def generate_chat_reply(question: str, user_skills: list[str], user_id: str) -> str:
    """
    The entry point called by your API.
    It inputs the data into the Graph and waits for the result.
    """
    inputs = {
        "question": question,
        "user_skills": user_skills,
        "user_id": user_id,
        "intent": "",
        "final_response": ""
    }
    
    # Run the Graph
    result = await app.ainvoke(inputs)
    
    return result["final_response"]