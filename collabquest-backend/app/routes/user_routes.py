from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from app.models import User, Skill, DayAvailability, TimeRange, Block, Link, Achievement, ConnectedAccounts, Education
from app.auth.dependencies import get_current_user
from app.services.vector_store import generate_embedding
from app.auth.utils import fetch_codeforces_stats, fetch_leetcode_stats
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
    education: List[Education] = []
    social_links: List[Link] = []
    professional_links: List[Link] = []
    achievements: List[Achievement] = []

class ConnectRequest(BaseModel):
    handle_or_url: str

class SkillsUpdate(BaseModel):
    skills: List[str]

# Add a model to handle visibility updates
class VisibilityUpdate(BaseModel):
    settings: VisibilitySettings

@router.put("/visibility", response_model=User)
async def update_visibility(data: VisibilityUpdate, current_user: User = Depends(get_current_user)):
    current_user.visibility_settings = data.settings
    await current_user.save()
    return current_user

async def update_trust_score(user: User):
    """Recalculates trust score based on verified connected accounts"""
    breakdown = user.trust_score_breakdown
    
    # Reset external scores in details to prevent duplicates (keeping GitHub/Base)
    breakdown.details = [d for d in breakdown.details if not any(p in d for p in ["Codeforces", "LeetCode", "LinkedIn"])]
    
    # 1. Codeforces
    if user.connected_accounts.codeforces:
        stats = await fetch_codeforces_stats(user.connected_accounts.codeforces)
        if stats and "rating" in stats:
            rating = stats["rating"]
            points = 0.0
            if rating >= 1200: points = 1.0
            if rating >= 1500: points = 1.5
            if rating >= 1900: points = 2.0
            breakdown.codeforces = points
            breakdown.details.append(f"Codeforces: Rating {rating} (+{points})")
            
    # 2. LeetCode
    if user.connected_accounts.leetcode:
        stats = await fetch_leetcode_stats(user.connected_accounts.leetcode)
        if stats:
            total_solved = 0
            for item in stats["submitStats"]["acSubmissionNum"]:
                if item["difficulty"] == "All":
                    total_solved = item["count"]
            points = 0.0
            if total_solved >= 50: points = 0.5
            if total_solved >= 100: points = 1.0
            if total_solved >= 300: points = 1.5
            breakdown.leetcode = points
            breakdown.details.append(f"LeetCode: {total_solved} Solved (+{points})")

    # 3. LinkedIn (Placeholder verification)
    if user.connected_accounts.linkedin:
        breakdown.linkedin = 0.5
        breakdown.details.append("LinkedIn: Connected (+0.5)")
        
    total = breakdown.base + breakdown.github + breakdown.codeforces + breakdown.leetcode + breakdown.linkedin
    user.trust_score = round(min(10.0, total), 1)
    user.trust_score_breakdown = breakdown
    await user.save()

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
    current_user.education = data.education
    current_user.social_links = data.social_links
    current_user.professional_links = data.professional_links
    current_user.achievements = data.achievements
    
    # Embedding generation
    achievements_text = " ".join([a.title for a in data.achievements])
    edu_text = " ".join([f"{e.course} at {e.institute}" for e in data.education if e.is_visible])
    profile_text = f"{' '.join(data.skills)} {' '.join(data.interests)} {data.about} {edu_text} {achievements_text}"
    current_user.embedding = generate_embedding(profile_text)
    
    await current_user.save()
    return current_user

@router.post("/connect/{platform}")
async def connect_platform(platform: str, req: ConnectRequest, current_user: User = Depends(get_current_user)):
    platform = platform.lower()
    stats_data = {}

    # 1. LINKEDIN (Verification is just URL check for now)
    if platform == "linkedin":
        if "linkedin.com/in/" not in req.handle_or_url:
            raise HTTPException(400, "Invalid LinkedIn Profile URL")
        current_user.connected_accounts.linkedin = req.handle_or_url
        stats_data = {"url": req.handle_or_url, "verified": True}
        
    # 2. CODEFORCES (Verification is fetching the API)
    elif platform == "codeforces":
        stats = await fetch_codeforces_stats(req.handle_or_url)
        if not stats:
            raise HTTPException(404, "Codeforces handle not found") # <--- THIS IS THE VERIFICATION
        
        # Save specific stats we want to show
        stats_data = {
            "handle": req.handle_or_url,
            "rating": stats.get("rating", "Unrated"),
            "rank": stats.get("rank", "Newbie"),
            "maxRating": stats.get("maxRating", 0)
        }
        current_user.connected_accounts.codeforces = req.handle_or_url
        
    # 3. LEETCODE (Verification is fetching the API)
    elif platform == "leetcode":
        stats = await fetch_leetcode_stats(req.handle_or_url)
        if not stats:
            raise HTTPException(404, "LeetCode user not found") # <--- THIS IS THE VERIFICATION
            
        # Extract total solved
        total_solved = 0
        ac_submissions = stats.get("submitStats", {}).get("acSubmissionNum", [])
        for item in ac_submissions:
            if item["difficulty"] == "All":
                total_solved = item["count"]
                
        stats_data = {
            "username": req.handle_or_url,
            "total_solved": total_solved,
            # Note: Daily streak is hard to get via public API, usually requires authentication
        }
        current_user.connected_accounts.leetcode = req.handle_or_url
    
    else:
        raise HTTPException(400, "Invalid platform")

    # SAVE THE STATS TO THE DATABASE
    if not current_user.platform_stats:
        current_user.platform_stats = {}
    
    current_user.platform_stats[platform] = stats_data
    
    # Update Trust Score (Existing Logic)
    await update_trust_score(current_user)
    
    await current_user.save()
        
    return {
        "status": "connected", 
        "trust_score": current_user.trust_score, 
        "stats": stats_data
    }

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