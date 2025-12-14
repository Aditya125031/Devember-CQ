"use client";
import { useEffect, useState, useRef } from "react";
import Cookies from "js-cookie";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { 
    ShieldCheck, Bell, MessageSquare, CheckCircle, XCircle, X
} from "lucide-react";
import Link from "next/link";

interface UserProfile {
  username: string;
  avatar_url: string;
  trust_score: number;
}

interface Notification {
    _id: string;
    message: string;
    type: string;
    related_id?: string;
    sender_id: string;
    is_read: boolean;
    action_status?: string;
}

export default function GlobalHeader() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = Cookies.get("token");
    if (token) {
        fetchUserProfile(token);
        fetchNotifications(token);
        fetchUnreadCount(token);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleClickOutside = (event: MouseEvent) => {
    if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifDropdown(false);
    }
  };

  const fetchUserProfile = async (jwt: string) => {
    try {
      const res = await axios.get("http://localhost:8000/users/me", { headers: { Authorization: `Bearer ${jwt}` } });
      setUser(res.data);
      // Connect WS for header updates
      const ws = new WebSocket(`ws://localhost:8000/chat/ws/${res.data._id || res.data.id}`);
      ws.onmessage = () => { 
          setUnreadCount(p => p + 1); 
          fetchNotifications(jwt); 
      };
    } catch (e) { console.error(e); }
  };

  const fetchNotifications = async (jwt: string) => {
    try {
        const res = await axios.get("http://localhost:8000/notifications/", { headers: { Authorization: `Bearer ${jwt}` } });
        setNotifications(res.data);
    } catch (e) {}
  };

  const fetchUnreadCount = async (jwt: string) => {
    try {
        const res = await axios.get("http://localhost:8000/chat/unread-count", { headers: { Authorization: `Bearer ${jwt}` } });
        setUnreadCount(res.data.count);
    } catch (e) {}
  }

  const toggleNotifications = async () => {
      const newState = !showNotifDropdown;
      setShowNotifDropdown(newState);
      if (newState) {
          const token = Cookies.get("token");
          // Mark non-actionable as read locally
          setNotifications(prev => prev.map(n => (n.type === "team_invite" || n.type === "join_request") ? n : { ...n, is_read: true }));
          try { await axios.post("http://localhost:8000/notifications/read-all", {}, { headers: { Authorization: `Bearer ${token}` } }); } catch(e) {}
      }
  }

  // Helper actions inside notification dropdown
  const handleNotificationAction = async (notif: Notification) => {
      if(!notif.related_id) return;
      const token = Cookies.get("token");
      try {
          // Simplified action logic just for the header dropdown
          let target = notif.type === "join_request" ? notif.sender_id : "ME"; 
          // Note: Full logic requires user ID, for hackathon assuming endpoint handles "ME" or we fetch user again. 
          // To keep this component simple, we might just redirect or do a quick post. 
          // For now, let's just refresh list. 
          // Ideally, actions should happen on Dashboard.
          // Let's redirect to Dashboard for actions to ensure context.
          window.location.href = "/dashboard";
      } catch (err) {}
  };

  const getScoreColor = (score: number) => { if (score >= 8) return "text-green-400"; if (score >= 5) return "text-yellow-400"; return "text-red-400"; };
  
  if (!user) return <div className="h-20"></div>; // Placeholder to prevent jump

  return (
    <header className="flex items-center justify-between mb-8 py-4 border-b border-gray-800">
        <div className="flex items-center gap-8">
            <Link href="/dashboard">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent cursor-pointer">CollabQuest</h1>
            </Link>
            <nav className="hidden md:flex gap-6 text-sm font-medium text-gray-400">
                <Link href="/dashboard" className="hover:text-white transition">Dashboard</Link>
                <Link href="/find-team" className="hover:text-white transition">Marketplace</Link>
                <Link href="/matches?type=users" className="hover:text-white transition">Recruit</Link>
            </nav>
        </div>
        
        <div className="flex items-center gap-4">
        <div className="relative" ref={notifRef}>
            <button onClick={toggleNotifications} className="p-2.5 bg-gray-900 hover:bg-gray-800 rounded-full border border-gray-700 transition relative">
                <Bell className="w-5 h-5 text-yellow-400"/>
                {notifications.filter(n=>!n.is_read).length > 0 && <span className="absolute top-0 right-0 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">{notifications.filter(n=>!n.is_read).length}</span>}
            </button>
            <AnimatePresence>
                {showNotifDropdown && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl z-50 overflow-hidden">
                        <div className="p-3 border-b border-gray-800 font-bold text-sm bg-gray-950">Notifications</div>
                        <div className="max-h-64 overflow-y-auto">
                            {notifications.length === 0 ? <p className="p-4 text-gray-500 text-sm text-center">No notifications</p> : (
                                notifications.map(n => (
                                    <div key={n._id} className={`p-3 border-b border-gray-800 hover:bg-gray-800/50 transition ${n.is_read ? 'opacity-50' : ''}`}>
                                        <p className="text-xs text-gray-300 mb-2">{n.message}</p>
                                        {(n.type === 'team_invite' || n.type === 'join_request') && !n.is_read && (
                                            <Link href="/dashboard"><button className="w-full text-xs py-1.5 bg-blue-600 text-white rounded font-bold">View in Dashboard</button></Link>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        <Link href="/chat">
            <button className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 px-4 py-2 rounded-full border border-gray-700 transition relative">
                <MessageSquare className="w-4 h-4 text-blue-400"/> 
                <span className="hidden sm:inline">Messages</span>
                {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>}
            </button>
        </Link>

        <Link href="/profile">
            <div className="flex items-center gap-3 bg-gray-900 px-4 py-2 rounded-full border border-gray-800 shadow-sm cursor-pointer hover:border-gray-600 transition">
                <ShieldCheck className={getScoreColor(user.trust_score) + " h-5 w-5"} />
                <div className="flex flex-col"><span className="text-[10px] text-gray-400 font-mono uppercase">Score</span><span className="font-bold text-sm leading-none">{user.trust_score.toFixed(1)}</span></div>
            </div>
        </Link>
        </div>
    </header>
  );
}