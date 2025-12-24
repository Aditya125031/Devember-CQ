from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from app.models import User, Skill, DayAvailability, TimeRange, Block, Link, Achievement, ConnectedAccounts
from app.auth.dependencies import get_current_user
from app.services.vector_store import generate_embedding
from bson import ObjectId

router = APIRouter()

class ProfileUpdate(BaseModel):
    skills: List[str]
    interests: List[str]
    about: str
    availability: List[DayAvailability]
    is_looking_for_team: bool = True
    
    # New Fields
    age: Optional[str] = None
    school: Optional[str] = None
    social_links: List[Link] = []
    professional_links: List[Link] = []
    achievements: List[Achievement] = []

class ConnectRequest(BaseModel):
    handle_or_url: str

class SkillsUpdate(BaseModel):
    skills: List[str]

@router.get("/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.put("/profile", response_model=User)
async def update_profile(data: ProfileUpdate, current_user: User = Depends(get_current_user)):
    new_skills = [Skill(name=s, level="Intermediate") for s in data.skills]
    current_user.skills = new_skills
    current_user.interests = data.interests
    current_user.about = data.about
    current_user.availability = data.availability
    current_user.is_looking_for_team = data.is_looking_for_team
    
    # Save New Fields
    current_user.age = data.age
    current_user.school = data.school
    current_user.social_links = data.social_links
    current_user.professional_links = data.professional_links
    current_user.achievements = data.achievements
    
    # Embedding generation
    achievements_text = " ".join([a.title for a in data.achievements])
    profile_text = f"{' '.join(data.skills)} {' '.join(data.interests)} {data.about} {data.school or ''} {achievements_text}"
    current_user.embedding = generate_embedding(profile_text)
    
    await current_user.save()
    return current_user

@router.post("/connect/{platform}")
async def connect_platform(platform: str, req: ConnectRequest, current_user: User = Depends(get_current_user)):
    """
    Connects external platforms and boosts trust score.
    Platforms: 'linkedin', 'codeforces', 'leetcode'
    """
    platform = platform.lower()
    boost_amount = 0.5 
    
    if platform == "linkedin":
        if not current_user.connected_accounts.linkedin:
            current_user.trust_score = min(10.0, current_user.trust_score + boost_amount)
        current_user.connected_accounts.linkedin = req.handle_or_url
        
    elif platform == "codeforces":
        if not current_user.connected_accounts.codeforces:
            current_user.trust_score = min(10.0, current_user.trust_score + boost_amount)
        current_user.connected_accounts.codeforces = req.handle_or_url
        
    elif platform == "leetcode":
        if not current_user.connected_accounts.leetcode:
            current_user.trust_score = min(10.0, current_user.trust_score + boost_amount)
        current_user.connected_accounts.leetcode = req.handle_or_url
    
    else:
        raise HTTPException(400, "Invalid platform")
        
    await current_user.save()
    return {"status": "connected", "trust_score": current_user.trust_score, "account": req.handle_or_url}

@router.put("/skills", response_model=User)
async def update_skills_legacy(data: SkillsUpdate, current_user: User = Depends(get_current_user)):
    new_skills = [Skill(name=s, level="Intermediate") for s in data.skills]
    current_user.skills = new_skills
    
    profile_text = f"{' '.join(data.skills)} {' '.join(current_user.interests)} {current_user.about or ''}"
    current_user.embedding = generate_embedding(profile_text)
    
    await current_user.save()
    return current_user

@router.get("/{user_id}", response_model=User)
async def get_user_details(user_id: str, current_user: User = Depends(get_current_user)):
    if not ObjectId.is_valid(user_id): raise HTTPException(status_code=404, detail="Invalid ID")
    
    is_blocked = await Block.find_one(Block.blocker_id == user_id, Block.blocked_id == str(current_user.id))
    if is_blocked:
        raise HTTPException(status_code=403, detail="Profile Unavailable")

    try:
        user = await User.get(user_id)
        if not user: raise HTTPException(404, detail="User not found")
        return user
    except Exception as e: raise HTTPException(500, detail=str(e))