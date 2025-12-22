import os
import httpx
import bcrypt
from datetime import datetime, timedelta
from jose import jwt
from dotenv import load_dotenv
from jose.exceptions import JWTError

load_dotenv()

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"

# --- HEADERS TO MIMIC A BROWSER ---
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/html, application/xhtml+xml, application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

async def get_github_token(code: str):
    """Exchange the login code for a permanent access token"""
    url = "https://github.com/login/oauth/access_token"
    headers = {"Accept": "application/json"}
    data = {
        "client_id": GITHUB_CLIENT_ID,
        "client_secret": GITHUB_CLIENT_SECRET,
        "code": code
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=data, headers=headers)
        return response.json().get("access_token")

async def get_github_user(token: str):
    """Fetch user profile using the access token"""
    async with httpx.AsyncClient() as client:
        headers = {"Authorization": f"Bearer {token}"}
        response = await client.get("https://api.github.com/user", headers=headers)
        return response.json()

def calculate_trust_score(github_data: dict) -> tuple[float, dict]:
    """
    Hackathon Magic: Calculate 'Trust' based on GitHub stats.
    Returns: (total_score, breakdown_dict)
    """
    base_score = 5.0
    
    # Extract stats
    public_repos = github_data.get("public_repos", 0)
    followers = github_data.get("followers", 0)
    created_at_str = github_data.get("created_at")
    
    account_age_years = 0
    if created_at_str:
        try:
            created_at = datetime.strptime(created_at_str, "%Y-%m-%dT%H:%M:%SZ")
            account_age_years = (datetime.now() - created_at).days / 365
        except:
            pass
    
    # Calculate Bonus
    repo_points = min(2.0, public_repos * 0.1) # Max 2 points for repos
    follower_points = min(2.0, followers * 0.2) # Max 2 points for followers
    age_points = min(1.0, account_age_years * 0.5) # Max 1 point for age
    
    github_total = round(repo_points + follower_points + age_points, 1)
    
    breakdown = {
        "base": base_score,
        "github": github_total,
        "linkedin": 0.0,
        "codeforces": 0.0,
        "leetcode": 0.0,
        "details": [
            f"GitHub: {public_repos} Repos (+{round(repo_points, 1)})",
            f"GitHub: {followers} Followers (+{round(follower_points, 1)})",
            f"GitHub: {round(account_age_years, 1)} Years Old (+{round(age_points, 1)})"
        ]
    }
    
    total = base_score + github_total
    return round(min(10.0, total), 1), breakdown

async def fetch_codeforces_stats(handle: str):
    """Fetches user stats from Codeforces API to verify existence and score."""
    url = f"https://codeforces.com/api/user.info?handles={handle}"
    # Use headers to avoid 403 Forbidden
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, headers=HEADERS, timeout=10.0)
            if resp.status_code == 200:
                data = resp.json()
                if data["status"] == "OK":
                    return data["result"][0]
        except Exception as e:
            print(f"Codeforces Fetch Error: {e}")
            pass
    return None

async def fetch_leetcode_stats(username: str):
    """Fetches user stats from LeetCode GraphQL API."""
    url = "https://leetcode.com/graphql"
    query = """
    query userPublicProfile($username: String!) {
      matchedUser(username: $username) {
        username
        submitStats: submitStatsGlobal {
          acSubmissionNum {
            difficulty
            count
          }
        }
      }
    }
    """
    # LeetCode specifically requires Referer and User-Agent
    lc_headers = HEADERS.copy()
    lc_headers["Referer"] = f"https://leetcode.com/{username}/"
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                url, 
                json={"query": query, "variables": {"username": username}}, 
                headers=lc_headers, 
                timeout=10.0
            )
            if resp.status_code == 200:
                data = resp.json()
                if "data" in data and data["data"] and data["data"]["matchedUser"]:
                    return data["data"]["matchedUser"]
        except Exception as e:
            print(f"LeetCode Fetch Error: {e}")
            pass
    return None

def create_access_token(data: dict):
    """Create a JWT token for our frontend to use"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=7) # Token lasts 7 days
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    password_bytes = password[:72].encode('utf-8')
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password_bytes, salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    password_bytes = plain_password[:72].encode('utf-8')
    hashed_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_bytes, hashed_bytes)

async def get_google_token(code: str, redirect_uri: str):
    """Exchange Google authorization code for access token"""
    url = "https://oauth2.googleapis.com/token"
    data = {
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, data=data)
        return response.json().get("access_token")

async def get_google_user(token: str):
    """Fetch user profile from Google using access token"""
    async with httpx.AsyncClient() as client:
        headers = {"Authorization": f"Bearer {token}"}
        response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers=headers
        )
        return response.json()
    
def verify_token(token: str):
    """Decode and verify the JWT token manually"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None