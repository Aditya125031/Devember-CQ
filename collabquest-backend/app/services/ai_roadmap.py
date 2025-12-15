import os
import google.generativeai as genai
import json
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

async def generate_roadmap(project_idea: str, tech_stack: list[str], weeks: int = 4):
    """
    Generates a structured project roadmap using Gemini Pro.
    """
    model = genai.GenerativeModel('gemini-2.5-flash')
    
    prompt = f"""
    You are a Senior Project Manager.
    Create a {weeks}-week project roadmap for a team building: "{project_idea}".
    Tech Stack: {', '.join(tech_stack)}.
    
    You MUST return ONLY a valid JSON object.
    Structure:
    {{
        "title": "Project Name",
        "phases": [
            {{ "week": 1, "goal": "Goal", "tasks": [{{"role": "Frontend", "task": "..."}}] }}
        ]
    }}
    """
    try:
        response = model.generate_content(prompt)
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        return json.loads(clean_text)
    except Exception as e:
        print(f"AI Error: {e}")
        return None

async def suggest_tech_stack(description: str, current_stack: list[str]):
    model = genai.GenerativeModel('gemini-2.5-flash')
    prompt = f"""
    Review this tech stack for "{description}". Current: {current_stack}.
    Suggest modern tools to ADD and redundant ones to REMOVE.
    Return JSON: {{"add": [], "remove": []}}
    """
    try:
        response = model.generate_content(prompt)
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        return json.loads(clean_text)
    except Exception as e:
        return {"add": [], "remove": []}

async def expand_interests(interests: list[str]):
    if not interests: return []
    model = genai.GenerativeModel('gemini-1.5-flash')
    prompt = f"Normalize and add 2-3 synonyms for these tags: {interests}. Return JSON array of strings."
    try:
        response = model.generate_content(prompt)
        return json.loads(response.text.replace("```json", "").replace("```", "").strip())
    except: return interests