"use client";
import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Cookies from "js-cookie";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { 
    ShieldCheck, Loader2, Edit2, X, Plus, 
    MessageSquare, UserCheck, Bell, CheckCircle, 
    Briefcase, UserPlus, Send, Code2, Mail, Clock, Search, XCircle, RotateCcw, Check 
} from "lucide-react";
import Link from "next/link";
import GlobalHeader from "@/components/GlobalHeader";

const PRESET_SKILLS = ["React", "Python", "Node.js", "TypeScript", "Next.js", "Tailwind", "MongoDB", "Firebase", "Flutter", "Java", "C++", "Rust", "Go", "Figma", "UI/UX", "AI/ML", "Docker", "AWS", "Solidity", "Blockchain"];

interface UserProfile {
  username: string;
  avatar_url: string;
  trust_score: number;
  is_verified_student: boolean;
  skills: { name: string; level: string }[]; 
  interests: string[];
  about: string;
  availability_hours: number;
  _id?: string;
  id?: string;
}

interface Match {
    id: string;
    name: string;
    avatar: string;
    contact: string;
    role: "Team Leader" | "Teammate";
    project_id: string;
    project_name: string;
    status: "matched" | "invited" | "requested" | "joined" | "rejected";
    rejected_by?: string;
}

interface Team {
    _id: string;
    name: string;
    description: string;
    members: string[];
}

interface Notification {
    _id: string;
    message: string;
    type: string;
    related_id?: string; // project_id
    sender_id: string;
    is_read: boolean;
    action_status?: "accepted" | "rejected"; // Added to track local UI state
}

export default function Dashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  
  const [talentPool, setTalentPool] = useState<Match[]>([]);
  const [projectOpportunities, setProjectOpportunities] = useState<Match[]>([]);
  const [myProjects, setMyProjects] = useState<Team[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0); 
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  const [searchTalent, setSearchTalent] = useState("");
  const [searchProjects, setSearchProjects] = useState("");
  const [emailRecipient, setEmailRecipient] = useState<{id: string, name: string} | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  
  // Profile Form State
  const [mySkills, setMySkills] = useState<string[]>([]);
  const [myInterests, setMyInterests] = useState<string[]>([]);
  const [myAbout, setMyAbout] = useState("");
  const [myHours, setMyHours] = useState(10);
  
  const [dropdownValue, setDropdownValue] = useState("");
  const [interestInput, setInterestInput] = useState("");

  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const urlToken = searchParams.get("token");
    let activeToken = urlToken;
    if (urlToken) { Cookies.set("token", urlToken, { expires: 7 }); router.replace("/dashboard"); } 
    else { activeToken = Cookies.get("token") || null; if (!activeToken) { router.push("/"); return; } }
    if (activeToken) { fetchUserProfile(activeToken); fetchMatches(activeToken); fetchNotifications(activeToken); fetchUnreadCount(activeToken); fetchMyProjects(activeToken); }
    const handleClickOutside = (e: MouseEvent) => { if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifDropdown(false); };
    document.addEventListener("mousedown", handleClickOutside); return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchParams, router]);

  useEffect(() => {
      if (!user) return;
      const userId = user._id || user.id;
      if (!userId) return;
      const ws = new WebSocket(`ws://localhost:8000/chat/ws/${userId}`);
      ws.onmessage = () => { setUnreadCount(prev => prev + 1); const token = Cookies.get("token"); if(token) fetchNotifications(token); };
      return () => ws.close();
  }, [user]);

  const fetchUserProfile = async (jwt: string) => { 
      try { 
          const response = await axios.get("http://localhost:8000/users/me", { headers: { Authorization: `Bearer ${jwt}` } }); 
          setUser(response.data); 
          const rawSkills = response.data.skills.map((s: any) => s.name); 
          setMySkills(Array.from(new Set(rawSkills)) as string[]);
          setMyInterests(response.data.interests || []);
          setMyAbout(response.data.about || "");
          setMyHours(response.data.availability_hours || 10);
      } catch (error) { Cookies.remove("token"); router.push("/"); } 
  };
  
  const fetchMatches = async (jwt: string) => { try { const res = await axios.get("http://localhost:8000/matches/mine", { headers: { Authorization: `Bearer ${jwt}` } }); const allMatches: Match[] = res.data; setTalentPool(allMatches.filter(m => m.role === "Teammate").reverse()); setProjectOpportunities(allMatches.filter(m => m.role === "Team Leader").reverse()); } catch (e) { console.error("Failed to fetch matches"); } }
  const fetchNotifications = async (jwt: string) => { try { const res = await axios.get("http://localhost:8000/notifications/", { headers: { Authorization: `Bearer ${jwt}` } }); setNotifications(res.data); } catch (e) { console.error("Failed to fetch notifications"); } }
  const fetchUnreadCount = async (jwt: string) => { try { const res = await axios.get("http://localhost:8000/chat/unread-count", { headers: { Authorization: `Bearer ${jwt}` } }); setUnreadCount(res.data.count); } catch (e) { console.error("Failed unread count"); } }
  
  const fetchMyProjects = async (jwt: string) => {
      try {
          const res = await axios.get("http://localhost:8000/teams/", { headers: { Authorization: `Bearer ${jwt}` } });
          const uid = (await axios.get("http://localhost:8000/users/me", { headers: { Authorization: `Bearer ${jwt}` } })).data._id;
          setMyProjects(res.data.filter((t: any) => t.members[0] === uid));
      } catch (e) { }
  }

  const toggleNotifications = async () => {
      const newState = !showNotifDropdown;
      setShowNotifDropdown(newState);
      if (newState) {
          const token = Cookies.get("token");
          // Mark generic alerts as read, keep actionable ones unread
          setNotifications(prev => prev.map(n => (n.type === "team_invite" || n.type === "join_request") ? n : { ...n, is_read: true }));
          try { await axios.post("http://localhost:8000/notifications/read-all", {}, { headers: { Authorization: `Bearer ${token}` } }); } catch(e) {}
      }
  }

  // --- ACTIONS ---

  const handleReapply = async (match: Match) => {
      const token = Cookies.get("token");
      setProcessingId(match.id + match.project_id);
      try {
          const updateStatus = (prev: Match[]) => prev.map(m => m.id === match.id && m.project_id === match.project_id ? { ...m, status: "matched" as const } : m);
          if (match.role === "Teammate") setTalentPool(updateStatus); else setProjectOpportunities(updateStatus);
          await axios.post(`http://localhost:8000/teams/${match.project_id}/reset`, { target_user_id: match.id }, { headers: { Authorization: `Bearer ${token}` } });
          alert("Status reset! You can now apply/invite again.");
          fetchMatches(token!);
      } catch (err) { alert("Action failed"); }
      finally { setProcessingId(null); }
  }

  const handleReject = async (match: Match) => {
      if(!confirm("Are you sure you want to reject this request?")) return;
      const token = Cookies.get("token");
      const myId = user?._id || user?.id || "";
      try {
          // 1. Optimistic Update (Keep visible but mark rejected)
          const updateStatus = (prev: Match[]) => prev.map(m => m.id === match.id && m.project_id === match.project_id ? { ...m, status: "rejected" as const, rejected_by: myId } : m);
          if (match.role === "Teammate") setTalentPool(updateStatus); else setProjectOpportunities(updateStatus);
          
          await axios.post(`http://localhost:8000/teams/${match.project_id}/reject`, { target_user_id: match.id }, { headers: { Authorization: `Bearer ${token}` } });
          
          // 2. Update related notification to read/rejected
          const relatedNotif = notifications.find(n => n.related_id === match.project_id && !n.is_read);
          if (relatedNotif) { 
              await axios.put(`http://localhost:8000/notifications/${relatedNotif._id}/read?status=rejected`, {}, { headers: { Authorization: `Bearer ${token}` } }); 
              setNotifications(prev => prev.map(n => n._id === relatedNotif._id ? { ...n, is_read: true, action_status: "rejected" } : n)); 
          }
          
          // REMOVED: fetchMatches(token!); 
          // Reason: This prevents the user from disappearing from the list immediately.
      } catch (err) { alert("Action failed"); }
  }

  const sendInvite = async (match: Match) => { const token = Cookies.get("token"); setProcessingId(match.id + match.project_id); try { setTalentPool(prev => prev.map(m => m.id === match.id && m.project_id === match.project_id ? { ...m, status: "invited" as const } : m)); await axios.post(`http://localhost:8000/teams/${match.project_id}/invite`, { target_user_id: match.id }, { headers: { Authorization: `Bearer ${token}` } }); setTimeout(() => fetchMatches(token!), 500); } catch (err: any) { alert("Failed"); fetchMatches(token!); } finally { setProcessingId(null); } }
  const requestJoin = async (match: Match) => { const token = Cookies.get("token"); setProcessingId(match.id + match.project_id); try { setProjectOpportunities(prev => prev.map(m => m.id === match.id && m.project_id === match.project_id ? { ...m, status: "requested" as const } : m)); await axios.post(`http://localhost:8000/teams/${match.project_id}/invite`, { target_user_id: "LEADER" }, { headers: { Authorization: `Bearer ${token}` } }); setTimeout(() => fetchMatches(token!), 500); } catch (err: any) { alert("Failed"); fetchMatches(token!); } finally { setProcessingId(null); } }
  const handleConnectionAction = async (match: Match) => { const token = Cookies.get("token"); setProcessingId(match.id + match.project_id); try { let target = ""; if (match.role === "Teammate") target = match.id; if (match.role === "Team Leader") target = await getCurrentUserId(token!); if (match.role === "Teammate") setTalentPool(prev => prev.map(m => m.id === match.id && m.project_id === match.project_id ? { ...m, status: "joined" as const } : m)); else setProjectOpportunities(prev => prev.map(m => m.id === match.id && m.project_id === match.project_id ? { ...m, status: "joined" as const } : m)); await axios.post(`http://localhost:8000/teams/${match.project_id}/members`, { target_user_id: target }, { headers: { Authorization: `Bearer ${token}` } }); const relatedNotif = notifications.find(n => n.related_id === match.project_id && !n.is_read); if (relatedNotif) { await axios.put(`http://localhost:8000/notifications/${relatedNotif._id}/read`, {}, { headers: { Authorization: `Bearer ${token}` } }); setNotifications(prev => prev.map(n => n._id === relatedNotif._id ? { ...n, is_read: true } : n)); } alert("Success!"); setTimeout(() => { fetchMatches(token!); fetchMyProjects(token!); }, 500); } catch (err) { alert("Action failed"); fetchMatches(token!); } finally { setProcessingId(null); } }
  
  // --- NOTIFICATION HANDLERS (SYNCED) ---

  const syncStateWithNotification = (notif: Notification, status: "joined" | "rejected") => {
      // Helper to update the main lists when a notification action occurs
      const updateList = (list: Match[]) => list.map(m => {
          // Logic: Check if match corresponds to notification
          const isMatch = m.project_id === notif.related_id && (m.id === notif.sender_id || status === "joined"); 
          // Note: Logic allows some loose matching for efficiency, ideally match ID exactly
          if (isMatch) return { ...m, status: status as any };
          return m;
      });
      setTalentPool(prev => updateList(prev));
      setProjectOpportunities(prev => updateList(prev));
  };

  const handleNotificationAction = async (notif: Notification) => { 
      if(!notif.related_id) return; 
      const token = Cookies.get("token"); 
      try { 
          let target = ""; 
          if (notif.type === "team_invite") target = await getCurrentUserId(token!); 
          if (notif.type === "join_request") target = notif.sender_id; 
          
          await axios.post(`http://localhost:8000/teams/${notif.related_id}/members`, { target_user_id: target }, { headers: { Authorization: `Bearer ${token}` } }); 
          await axios.put(`http://localhost:8000/notifications/${notif._id}/read`, {}, { headers: { Authorization: `Bearer ${token}` } }); 
          
          // Sync UI
          setNotifications(prev => prev.map(n => n._id === notif._id ? { ...n, is_read: true, action_status: "accepted" } : n)); 
          syncStateWithNotification(notif, "joined");
          
          setTimeout(() => { fetchMatches(token!); fetchMyProjects(token!); }, 1000); 
      } catch (err) { alert("Action failed"); } 
  };

  const handleNotificationReject = async (notif: Notification) => {
      if(!notif.related_id) return;
      if(!confirm("Reject this request?")) return;
      const token = Cookies.get("token");
      try {
          await axios.post(`http://localhost:8000/teams/${notif.related_id}/reject`, { target_user_id: notif.sender_id }, { headers: { Authorization: `Bearer ${token}` } });
          await axios.put(`http://localhost:8000/notifications/${notif._id}/read?status=rejected`, {}, { headers: { Authorization: `Bearer ${token}` } });

          // Sync UI
          setNotifications(prev => prev.map(n => n._id === notif._id ? { ...n, is_read: true, action_status: "rejected" } : n));
          syncStateWithNotification(notif, "rejected");

      } catch (err) { alert("Action failed"); }
  };
  
  const openEmailComposer = (match: Match) => { setEmailRecipient({ id: match.id, name: match.name }); setShowEmailModal(true); }
  const handleSendEmail = async () => { const token = Cookies.get("token"); if (!emailRecipient) return; try { await axios.post("http://localhost:8000/communication/send-email", { recipient_id: emailRecipient.id, subject: emailSubject, body: emailBody }, { headers: { Authorization: `Bearer ${token}` } }); alert("Email sent!"); setShowEmailModal(false); setEmailSubject(""); setEmailBody(""); } catch (err) { alert("Failed"); } }
  const getCurrentUserId = async (token: string) => { const res = await axios.get("http://localhost:8000/users/me", { headers: { Authorization: `Bearer ${token}` } }); return res.data._id || res.data.id; }
  
  // --- PROFILE HELPERS ---
  const saveProfile = async () => { 
      const token = Cookies.get("token"); 
      try { 
          await axios.put("http://localhost:8000/users/profile", { 
              skills: mySkills, interests: myInterests, about: myAbout, availability_hours: parseInt(myHours.toString()), availability: [] 
          }, { headers: { Authorization: `Bearer ${token}` } }); 
          setShowProfileModal(false); 
          if (user) setUser({ ...user, skills: mySkills.map(s => ({ name: s, level: "Intermediate" })) }); 
      } catch (err) { alert("Failed to save profile"); } 
  };
  const addSkill = (skill: string) => { if (!skill || mySkills.includes(skill)) return; setMySkills([...mySkills, skill]); setDropdownValue(""); };
  const removeSkill = (skill: string) => { setMySkills(mySkills.filter(s => s !== skill)); };
  const addInterest = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && interestInput) { if(!myInterests.includes(interestInput)) setMyInterests([...myInterests, interestInput]); setInterestInput(""); } };
  const removeInterest = (int: string) => { setMyInterests(myInterests.filter(i => i !== int)); };
  const getScoreColor = (score: number) => { if (score >= 8) return "text-green-400"; if (score >= 5) return "text-yellow-400"; return "text-red-400"; };
  const getUnreadNotifCount = () => notifications.filter(n => !n.is_read).length;

  const renderMatchButton = (match: Match) => {
      const isProcessing = processingId === (match.id + match.project_id);
      if (match.status === "rejected") {
          const myId = user?._id || user?.id;
          const isMe = match.rejected_by === myId;
          const text = isMe ? "Rejected by You" : (match.role === "Teammate" ? "Rejected by Candidate" : "Rejected by Leader");
          return (
              <div className="flex-1 flex gap-1">
                 <div className="flex-1 bg-red-900/20 text-red-400 border border-red-900/50 py-1.5 rounded text-xs font-bold text-center flex items-center justify-center gap-1"><XCircle className="w-3 h-3"/> {text}</div>
                 <button onClick={() => handleReapply(match)} disabled={isProcessing} className="bg-gray-700 hover:bg-gray-600 px-2 rounded text-white" title="Re-apply / Reset Status">{isProcessing ? <Loader2 className="w-3 h-3 animate-spin"/> : <RotateCcw className="w-3 h-3"/>}</button>
              </div>
          );
      }
      if (match.role === "Teammate") {
          if (match.status === "matched") return <button onClick={() => sendInvite(match)} disabled={isProcessing} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1">{isProcessing ? <Loader2 className="w-3 h-3 animate-spin"/> : <><Plus className="w-3 h-3"/> Invite</>}</button>;
          if (match.status === "invited") return <div className="flex-1 bg-gray-700 text-gray-400 py-1.5 rounded text-xs flex items-center justify-center gap-1"><Clock className="w-3 h-3"/> Pending</div>;
          if (match.status === "requested") return <div className="flex gap-1 flex-1"><button onClick={() => handleConnectionAction(match)} disabled={isProcessing} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1">{isProcessing ? <Loader2 className="w-3 h-3 animate-spin"/> : <><CheckCircle className="w-3 h-3"/> Accept</>}</button><button onClick={() => handleReject(match)} className="bg-red-600 hover:bg-red-500 text-white px-2 rounded"><XCircle className="w-3 h-3"/></button></div>;
          if (match.status === "joined") return <div className="flex-1 bg-gray-800 text-green-400 border border-green-900 py-1.5 rounded text-xs font-bold text-center">Member</div>;
      } else {
          if (match.status === "matched") return <button onClick={() => requestJoin(match)} disabled={isProcessing} className="flex-1 bg-purple-600 hover:bg-purple-500 text-white py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1">{isProcessing ? <Loader2 className="w-3 h-3 animate-spin"/> : <><Send className="w-3 h-3"/> Request Join</>}</button>;
          if (match.status === "requested") return <div className="flex-1 bg-gray-700 text-gray-400 py-1.5 rounded text-xs flex items-center justify-center gap-1"><Clock className="w-3 h-3"/> Pending</div>;
          if (match.status === "invited") return <div className="flex gap-1 flex-1"><button onClick={() => handleConnectionAction(match)} disabled={isProcessing} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1">{isProcessing ? <Loader2 className="w-3 h-3 animate-spin"/> : <><CheckCircle className="w-3 h-3"/> Join Team</>}</button><button onClick={() => handleReject(match)} className="bg-red-600 hover:bg-red-500 text-white px-2 rounded"><XCircle className="w-3 h-3"/></button></div>;
          if (match.status === "joined") return <div className="flex-1 bg-gray-800 text-green-400 border border-green-900 py-1.5 rounded text-xs font-bold text-center">Joined</div>;
      }
      return <div className="flex-1 text-gray-500 text-xs text-center py-1 bg-gray-900/50 rounded">Status: {match.status}</div>;
  };

  if (!user) return <div className="flex h-screen items-center justify-center bg-gray-950 text-white"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-gray-950 text-white relative">
      <GlobalHeader />
      
      {/* NOTIFICATION TOGGLE (Assuming you want to manually place it or overwrite global header behavior) */}
      <div className="absolute top-4 right-20 z-50" ref={notifRef}>
        <button onClick={toggleNotifications} className="relative p-2 rounded-full hover:bg-gray-800">
            <Bell className="w-6 h-6 text-gray-300"/>
            {unreadCount > 0 && <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center">{unreadCount}</span>}
        </button>

        {showNotifDropdown && (
            <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="p-3 border-b border-gray-800 font-bold flex justify-between">
                    <span>Notifications</span>
                    <span onClick={() => setShowNotifDropdown(false)} className="cursor-pointer text-gray-500 hover:text-white"><X className="w-4 h-4"/></span>
                </div>
                <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? <p className="p-4 text-center text-gray-500 text-sm">No notifications</p> : (
                        notifications.map(n => (
                            <div key={n._id} className={`p-3 border-b border-gray-800 ${!n.is_read ? 'bg-gray-800/50' : ''}`}>
                                <p className="text-sm mb-2">{n.message}</p>
                                {/* ACTION BUTTONS */}
                                {!n.is_read && (n.type === "team_invite" || n.type === "join_request") && (
                                    <div className="flex gap-2 mt-2">
                                        <button 
                                            onClick={() => handleNotificationAction(n)}
                                            className="flex-1 bg-green-600 hover:bg-green-500 text-white py-1 rounded text-xs font-bold flex items-center justify-center gap-1"
                                        >
                                            <Check className="w-3 h-3"/> Accept
                                        </button>
                                        <button 
                                            onClick={() => handleNotificationReject(n)}
                                            className="flex-1 bg-red-600 hover:bg-red-500 text-white py-1 rounded text-xs font-bold flex items-center justify-center gap-1"
                                        >
                                            <X className="w-3 h-3"/> Reject
                                        </button>
                                    </div>
                                )}
                                {/* STATUS TEXT AFTER ACTION */}
                                {n.is_read && n.action_status && (
                                    <div className={`text-xs mt-1 font-bold ${n.action_status === 'accepted' ? 'text-green-400' : 'text-red-400'}`}>
                                        {n.action_status === 'accepted' ? 'Accepted' : 'Rejected'}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </motion.div>
        )}
      </div>

      <div className="max-w-6xl mx-auto p-8 pt-12">
        {/* TOP SECTION: PROFILE & ACTIONS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* Profile Card */}
          <Link href="/profile">
            <motion.div whileHover={{ scale: 1.02 }} className="p-6 rounded-2xl bg-gray-900 border border-gray-800 shadow-xl flex items-center gap-4 cursor-pointer group hover:border-purple-500/50 transition-all relative">
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"><Edit2 className="w-4 h-4 text-purple-400" /></div>
                <img src={user.avatar_url} alt="Avatar" className="w-16 h-16 rounded-full border-2 border-purple-500" />
                <div><h2 className="text-xl font-semibold">Welcome, {user.username}!</h2><div className="flex flex-wrap gap-2 mt-2">{user.skills.length > 0 ? user.skills.slice(0, 3).map((s, i) => <span key={i} className="text-xs bg-gray-800 px-2 py-1 rounded text-gray-300 border border-gray-700">{s.name}</span>) : <span className="text-xs text-yellow-500 italic">Tap to add skills +</span>}</div></div>
            </motion.div>
          </Link>
          
          <motion.div whileHover={{ scale: 1.02 }} className="p-6 rounded-2xl bg-gradient-to-br from-purple-900/50 to-blue-900/50 border border-purple-500/20 flex flex-col justify-center items-start">
            <h2 className="text-xl font-semibold mb-2">Build Your Dream Team</h2>
            <p className="text-sm text-gray-400 mb-4">Post an idea and find hackers instantly.</p>
            <Link href="/find-team"><button className="w-full px-6 py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition shadow-lg flex items-center gap-2"><Plus className="w-4 h-4"/> Create Project</button></Link>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* MY PROJECTS */}
            <div>
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-blue-300"><UserPlus className="w-5 h-5"/> My Projects</h3>
                {myProjects.length === 0 ? <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center text-gray-500"><p>You haven't created any projects yet.</p></div> : (
                    <div className="space-y-4">
                        {myProjects.map((p) => (
                            <div key={p._id} className="bg-gray-900 border border-gray-800 p-4 rounded-xl flex items-center justify-between hover:border-blue-500/50 transition">
                                <div><h4 className="font-bold text-sm">{p.name}</h4><p className="text-xs text-gray-400">{p.members.length} members</p></div>
                                <Link href={`/teams/${p._id}`}><button className="bg-blue-900/30 text-blue-300 px-4 py-2 rounded-lg text-xs font-bold border border-blue-500/30 hover:bg-blue-900/50">Manage</button></Link>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* PROJECT OPPORTUNITIES */}
            <div>
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-purple-300"><Briefcase className="w-5 h-5"/> My Applications</h3>
                {projectOpportunities.length === 0 ? <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 text-center text-gray-500"><p>No active applications.</p><Link href="/matches?type=projects" className="text-purple-400 hover:underline text-sm">Find Projects</Link></div> : (
                    <div className="space-y-4">
                        {projectOpportunities.map((m) => (
                            <div key={m.id + m.project_id} className="bg-gray-900 border border-gray-800 p-4 rounded-xl">
                                <div className="flex items-center gap-3 mb-3"><div className="w-8 h-8 bg-purple-900/50 rounded-full flex items-center justify-center border border-purple-500/30"><Code2 className="w-4 h-4 text-purple-400"/></div><div><h4 className="font-bold text-sm">{m.project_name}</h4><p className="text-xs text-gray-400">Leader: {m.name}</p></div></div>
                                <div className="flex gap-2">{renderMatchButton(m)}<button onClick={() => openEmailComposer(m)} className="bg-gray-800 p-1.5 rounded hover:text-green-400" title="Email"><Mail className="w-4 h-4"/></button></div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* --- MODALS --- */}
      <AnimatePresence>
        {showEmailModal && emailRecipient && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-gray-900 border border-gray-800 p-8 rounded-2xl w-full max-w-md relative">
                <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold flex items-center gap-2"><Mail className="w-5 h-5"/> Send Secure Message</h2><button onClick={() => setShowEmailModal(false)}><X className="text-gray-500 hover:text-white"/></button></div>
                <div className="space-y-4 mt-4"><div className="bg-gray-800/50 p-3 rounded-lg text-sm text-gray-400">To: <span className="text-white font-bold">{emailRecipient.name}</span> (Email Hidden)</div><input className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 outline-none focus:border-green-500" placeholder="Subject" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} /><textarea className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 h-32 outline-none focus:border-green-500 resize-none" placeholder="Message" value={emailBody} onChange={e => setEmailBody(e.target.value)} /><button onClick={handleSendEmail} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2"><Send className="w-4 h-4"/> Send Message</button></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}