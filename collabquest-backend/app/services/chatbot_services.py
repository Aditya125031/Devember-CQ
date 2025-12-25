import os
import asyncio
import json
from typing import TypedDict, Literal
from datetime import datetime, timedelta

from openai import AsyncOpenAI
from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END

from app.models import ChatMessage, Team, DeletionRequest, Notification, Task, User, CompletionRequest, MemberRequest, Match
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
    - DELETE_PROJECT (User wants to delete, remove, or cancel a project)
    - COMPLETE_PROJECT (User wants to mark a project as finished, done, or completed)
    - REMOVE_MEMBER (User wants to kick, remove, or fire a member from a team)
    - ASSIGN_TASK (User wants to assign, give, or create a task for someone)
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
    if intent not in ["CREATE_PROJECT", "DELETE_PROJECT", "COMPLETE_PROJECT", "REMOVE_MEMBER",
                       "ASSIGN_TASK", "CODE_REQUEST", "SEARCH_REQUEST", "GENERAL_QUERY"]:
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

async def manager_node(state: AgentState):
    """Handles Project Management (Deletion, Completion & Tasks)."""
    print("👔 Manager Node Active")
    user_id = state["user_id"]
    intent = state["intent"]
    
    # 1. Fetch projects where user is Leader
    owned_teams = await Team.find(Team.members[0] == user_id).to_list()
    
    if not owned_teams:
        return {"final_response": "You can only manage projects where you are the Team Leader. I didn't find any active projects led by you."}

    # 2. Identify Target Project (Common Logic)
    team_names = [t.name for t in owned_teams]
    project_prompt = f"""
    User Input: "{state['question']}"
    User's Projects: {', '.join(team_names)}
    
    Which project is the user talking about? Return JUST the exact name.
    If ambiguous or not found, return "NONE".
    """
    try:
        completion = await client.chat.completions.create(
            model=ROUTER_MODEL,
            messages=[{"role": "user", "content": project_prompt}],
            temperature=0.0
        )
        target_name = completion.choices[0].message.content.strip()
    except:
        target_name = "NONE"

    target_team = next((t for t in owned_teams if t.name.lower() == target_name.lower()), None)
    
    if not target_team:
        # 🔥 NEW: Instructional Error Message
        action_instruction = ""
        if intent == "DELETE_PROJECT": 
            action_instruction = "Delete [Project Name]"
        elif intent == "COMPLETE_PROJECT": 
            action_instruction = "Mark [Project Name] as complete"
        elif intent == "REMOVE_MEMBER":                                 
            action_instruction = "Remove [Member Name] from [Project Name]"
        elif intent == "ASSIGN_TASK": 
            action_instruction = "Assign task in [Project Name]"
        else:
            action_instruction = "Manage [Project Name]"

        return {
            "final_response": f"I'm not sure which project you mean. Please try again with the full command:\n\n👉 **'{action_instruction}'**"
        }
    
    # Check if already completed (unless we are trying to delete it, which is handled in branch A)
    if target_team.status == "completed" and intent != "DELETE_PROJECT":
        return {"final_response": f"❌ Project **{target_team.name}** is already completed and locked."}

    # --- BRANCH A: DELETE PROJECT ---
    if intent == "DELETE_PROJECT":
        # Case 1: Solo Project (Delete Immediately)
        if len(target_team.members) == 1:
            await target_team.delete()
            return {"final_response": f"🗑️ **{target_team.name}** has been permanently deleted."}
        
        # Case 2: Team Project (Start Vote)
        if target_team.deletion_request and target_team.deletion_request.is_active:
            return {"final_response": f"⚠️ A deletion vote is already active for **{target_team.name}**."}

        req = DeletionRequest(
            is_active=True, 
            initiator_id=user_id, 
            votes={user_id: "approve"} 
        )
        target_team.deletion_request = req
        await target_team.save()
        
        # Notify members
        for member_id in target_team.members:
            if member_id != user_id:
                await Notification(
                    recipient_id=member_id, 
                    sender_id=user_id, 
                    message=f"Vote to DELETE project '{target_team.name}'.", 
                    type="deletion_request", 
                    related_id=str(target_team.id)
                ).insert()

        return {"final_response": f"🚨 **Vote Initiated:** I've started a deletion vote for **{target_team.name}**. Your team members have been notified."}

    # --- BRANCH B: COMPLETE PROJECT (NEW) ---
    if intent == "COMPLETE_PROJECT":
        # Case 1: Solo Project (Complete Immediately)
        if len(target_team.members) == 1:
            target_team.status = "completed"
            target_team.is_looking_for_members = False
            await target_team.save()
            return {"final_response": f"🏆 **{target_team.name}** is now marked as Completed! Great job."}
        
        # Case 2: Team Project (Start Vote)
        if target_team.completion_request and target_team.completion_request.is_active:
            return {"final_response": f"⚠️ A completion vote is already active for **{target_team.name}**."}

        req = CompletionRequest(
            is_active=True, 
            initiator_id=user_id, 
            votes={user_id: "approve"} 
        )
        target_team.completion_request = req
        await target_team.save()
        
        # Notify members
        for member_id in target_team.members:
            if member_id != user_id:
                await Notification(
                    recipient_id=member_id, 
                    sender_id=user_id, 
                    message=f"Vote to mark project '{target_team.name}' as COMPLETED.", 
                    type="completion_request", 
                    related_id=str(target_team.id)
                ).insert()
        
        return {"final_response": f"🏁 **Vote Initiated:** I've started a vote to complete **{target_team.name}**. Team members must approve."}

    # --- BRANCH C: REMOVE MEMBER ---
    if intent == "REMOVE_MEMBER":
        # A. Fetch Member Names
        members_map = []
        for m_id in target_team.members:
            u = await User.get(m_id)
            if u:
                members_map.append(f"{u.username} (ID: {str(u.id)})")
        
        # B. Identify who to remove
        extraction_prompt = f"""
        User Input: "{state['question']}"
        Team Members: {', '.join(members_map)}
        
        Which member does the user want to remove? 
        Return JSON: {{ "target_id": "..." }}
        If self-referencing or unclear, return "NONE".
        """
        try:
            completion = await client.chat.completions.create(
                model=ROUTER_MODEL,
                messages=[{"role": "user", "content": extraction_prompt}]
            )
            raw = completion.choices[0].message.content
            clean_json = raw.replace("```json", "").replace("```", "").strip()
            data = json.loads(clean_json)
            target_id = data.get("target_id")
        except:
            target_id = "NONE"

        if target_id == "NONE" or target_id == user_id:
             return {"final_response": "I couldn't figure out who you want to remove. Please specify a valid member name."}

        # C. Execute Logic
        if target_id == target_team.members[0]:
             return {"final_response": "❌ You cannot remove the Team Leader."}

        # Scenario 1: Planning Phase (Instant Removal)
        if target_team.status == "planning":
            if target_id in target_team.members:
                target_team.members.remove(target_id)
                await target_team.save()
                
                await Match.find(Match.project_id == str(target_team.id), Match.user_id == target_id).delete()
                await Notification(
                    recipient_id=target_id, 
                    sender_id=user_id, 
                    message=f"You were removed from project '{target_team.name}'.", 
                    type="info"
                ).insert()
                
                return {"final_response": f"👋 **Removed.** I have removed <@{target_id}> from the team immediately since you are still in the planning phase."}

        # Scenario 2: Active Phase (Vote Required)
        else:
            existing = next((r for r in target_team.member_requests if r.target_user_id == target_id and r.is_active), None)
            if existing:
                return {"final_response": f"⚠️ A vote to remove <@{target_id}> is already active."}

            req = MemberRequest(
                target_user_id=target_id, 
                type="remove", 
                explanation="Removed via AI Manager", 
                initiator_id=user_id, 
                votes={user_id: "approve"}
            )
            target_team.member_requests.append(req)
            await target_team.save()
            
            for m_id in target_team.members:
                if m_id != user_id:
                    await Notification(
                        recipient_id=m_id, 
                        sender_id=user_id, 
                        message=f"Vote initiated to REMOVE a member from '{target_team.name}'.", 
                        type="member_request", 
                        related_id=str(target_team.id)
                    ).insert()

            return {"final_response": f"🗳️ **Vote Started.** Since the project is Active, I've initiated a vote to remove <@{target_id}>. Other members have been notified."}
    
    # --- BRANCH D: ASSIGN TASK ---
    if intent == "ASSIGN_TASK":
        # A. Fetch Member Names
        members_map = []
        for m_id in target_team.members:
            u = await User.get(m_id)
            if u:
                members_map.append(f"{u.username} (ID: {str(u.id)})")
        
        # B. Extract Task Details
        task_extraction_prompt = f"""
        Extract task details from: "{state['question']}"
        Team Members: {', '.join(members_map)}
        
        Return JSON object with fields:
        - "description": The task description
        - "assignee_id": The exact ID of the member to assign (pick best match from list, default to user_id if self)
        - "days": Number of days until deadline (default to 3 if not specified)
        
        Example JSON: {{ "description": "Fix bug", "assignee_id": "123", "days": 2 }}
        """
        
        try:
            completion = await client.chat.completions.create(
                model=MENTOR_MODEL,
                messages=[{"role": "user", "content": task_extraction_prompt}]
            )
            raw = completion.choices[0].message.content
            clean_json = raw.replace("```json", "").replace("```", "").strip()
            data = json.loads(clean_json)
            
            # C. Create Task Object
            new_task = Task(
                description=data["description"],
                assignee_id=data["assignee_id"],
                deadline=datetime.now() + timedelta(days=int(data.get("days", 3)))
            )
            
            # D. Save to DB
            target_team.tasks.append(new_task)
            await target_team.save()
            
            # E. Notify Assignee
            if data["assignee_id"] != user_id:
                await Notification(
                    recipient_id=data["assignee_id"],
                    sender_id=user_id,
                    message=f"New AI Task in {target_team.name}: {data['description']}",
                    type="info",
                    related_id=str(target_team.id)
                ).insert()

            return {"final_response": f"✅ **Task Assigned!**\n\n📝 **{data['description']}**\n👤 Assignee: <@{data['assignee_id']}>\n📅 Deadline: {new_task.deadline.strftime('%Y-%m-%d')}"}
            
        except Exception as e:
            print(f"Task Error: {e}")
            return {"final_response": "I understood the project, but failed to parse the task details. Try: 'Assign [Task] to [Person] in [Project]'."}

    return {"final_response": "I'm not sure what management action you wanted to take."}

async def coder_node(state: AgentState):
    """Handles Coding Requests with Context."""
    print("🔧 Coder Node Active")
    
    # 1. Build context from history
    messages_payload = [{"role": "system", "content": "You are an expert coding assistant. Provide clean code."}]
    
    # Add last 2 messages for context (so it knows what code to fix)
    if state.get("history"):
        messages_payload.extend(state["history"][-2:]) 
    
    messages_payload.append({"role": "user", "content": state["question"]})
    
    try:
        completion = await client.chat.completions.create(
            model=CODER_MODEL,
            messages=messages_payload
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
    Uses the history ALREADY loaded in state['history'].
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
    You are CollabQuest Mentor Bot.
    User Context: ID {user_id}, Skills: {", ".join(user_skills) if user_skills else "Beginner"}
    {platform_guide}
    INSTRUCTIONS:
    - If user asks about Platform, use the Manual.
    - If user asks for code, provide it.
    """
    
    # --- 2. USE EXISTING HISTORY (No DB Call!) ---
    # Start with System Prompt
    messages_payload = [{"role": "system", "content": system_instruction}]
    
    # Add History from State (This comes from generate_chat_reply)
    if state.get("history"):
        messages_payload.extend(state["history"])
        
    # Add Current Question
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
        return {"final_response": "I'm having trouble connecting right now."}
    
# --- 3. BUILD THE GRAPH ---

workflow = StateGraph(AgentState)

# Add Nodes
workflow.add_node("router", router_node)
workflow.add_node("planner", planner_node)
workflow.add_node("manager", manager_node)
workflow.add_node("coder", coder_node)
workflow.add_node("searcher", search_node)
workflow.add_node("chatter", chat_node)

# Set Entry Point
workflow.set_entry_point("router")

# Define Logic (The Conditional Edges)
def route_decision(state):
    intent = state["intent"]
    if intent == "CREATE_PROJECT": return "planner"
    if intent == "DELETE_PROJECT": return "manager"
    if intent == "COMPLETE_PROJECT": return "manager"
    if intent == "REMOVE_MEMBER": return "manager"
    if intent == "ASSIGN_TASK": return "manager"
    if intent == "CODE_REQUEST": return "coder"
    if intent == "SEARCH_REQUEST": return "searcher"
    return "chatter"

workflow.add_conditional_edges(
    "router",
    route_decision,
    {
        "planner": "planner",
        "manager": "manager",
        "coder": "coder",
        "searcher": "searcher",
        "chatter": "chatter"
    }
)

# All nodes end after they work
workflow.add_edge("planner", END)
workflow.add_edge("manager", END)
workflow.add_edge("coder", END)
workflow.add_edge("searcher", END)
workflow.add_edge("chatter", END)

# Compile
app = workflow.compile()

# --- 4. EXPORT THE MAIN FUNCTION ---

async def generate_chat_reply(question: str, user_skills: list[str], user_id: str):
    """
    Entry point. Fetches history, runs graph, yields stream.
    """
    
    # 1. Fetch History
    try:
        past_msgs_db = await ChatMessage.find(ChatMessage.user_id == user_id)\
            .sort("-timestamp").limit(6).to_list()
        past_msgs_db.reverse()
        
        formatted_history = []
        for m in past_msgs_db:
             formatted_history.append({"role": "user", "content": m.question})
             formatted_history.append({"role": "assistant", "content": m.answer})
    except:
        formatted_history = []

    # 2. Build State
    inputs = {
        "question": question,
        "user_skills": user_skills,
        "user_id": user_id,
        "intent": "",
        "final_response": "",
        "history": formatted_history
    }
    
    # 3. Run Graph
    result = await app.ainvoke(inputs)
    
    # 4. Return result
    return result["final_response"]