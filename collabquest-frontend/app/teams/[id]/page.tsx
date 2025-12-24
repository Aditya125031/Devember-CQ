"use client";
import { useEffect, useState, use } from "react";
import api from "@/lib/api";
import { Code, Users, CheckCircle, Clock, Trash2, Calendar, Edit3, MessageCircle, AlertTriangle, ArrowRight, ShieldAlert, Award, ChevronRight, Hash, Link as LinkIcon, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";

interface Task {
    id: string;
    title: string;
    status: "todo" | "in-progress" | "done";
    assigned_to: string | null;
}

interface TeamMember {
    id: string;
    username: string;
    avatar_url: string;
    role: string;
}

interface Team {
    id: string;
    name: string;
    description: string;
    needed_skills: string[];
    owner_id: string;
    members: TeamMember[];
    tasks: Task[];
    project_status: "planning" | "in-development" | "completed";
}

export default function TeamDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: teamId } = use(params);
    const router = useRouter();

    const [team, setTeam] = useState<Team | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [newTaskTitle, setNewTaskTitle] = useState("");
    const [techStack, setTechStack] = useState<string[]>([]);
    const [newSkill, setNewSkill] = useState("");
    const [candidates, setCandidates] = useState<any[]>([]);

    useEffect(() => {
        const fetchTeam = async () => {
            try {
                const token = Cookies.get("token");
                if (!token) { router.push("/"); return; }

                const userRes = await api.get("/users/me");
                setCurrentUserId(userRes.data._id || userRes.data.id);

                const res = await api.get(`/teams/${teamId}`);
                setTeam(res.data);
                setTechStack(res.data.needed_skills || []);

                const tasksRes = await api.get(`/teams/${teamId}/tasks`);
                setTasks(tasksRes.data);

                // Fetch candidates for matching
                const matchRes = await api.get(`/matches/team/${teamId}`);
                setCandidates(matchRes.data.matches || []);

            } catch (error) {
                console.error("Failed to fetch team data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchTeam();
    }, [teamId]);

    const updateStatus = async (status: "planning" | "in-development" | "completed") => {
        try {
            await api.put(`/teams/${teamId}`, { project_status: status });
            setTeam(prev => prev ? { ...prev, project_status: status } : null);
        } catch (e) {
            alert("Failed to update status");
        }
    };

    const addTask = async () => {
        if (!newTaskTitle.trim()) return;
        try {
            const res = await api.post(`/teams/${teamId}/tasks`, { title: newTaskTitle });
            setTasks([...tasks, res.data]);
            setNewTaskTitle("");
        } catch (e) {
            alert("Failed to add task");
        }
    };

    const updateTask = async (taskId: string, status: "todo" | "in-progress" | "done") => {
        try {
            const res = await api.put(`/teams/${teamId}/tasks/${taskId}`, { status });
            setTasks(tasks.map(t => t.id === taskId ? res.data : t));
        } catch (e) {
            alert("Failed to update task");
        }
    };

    const assignTask = async (taskId: string) => {
        try {
            const res = await api.put(`/teams/${teamId}/tasks/${taskId}`, { assigned_to: currentUserId });
            setTasks(tasks.map(t => t.id === taskId ? res.data : t));
        } catch (e) {
            alert("Failed to assign task");
        }
    };

    const addSkill = async () => {
        if (!newSkill.trim()) return;
        const updated = [...techStack, newSkill];
        setTechStack(updated);
        setNewSkill("");
        await api.post(`/teams/${teamId}/skills`, { needed_skills: updated });
    };

    const removeSkill = async (skill: string) => {
        const updated = techStack.filter(s => s !== skill);
        setTechStack(updated);
        await api.post(`/teams/${teamId}/skills`, { needed_skills: updated });
    };

    // --- DELETE PROJECT VOTE ---
    const initiateDelete = async () => {
        if (!confirm("Start a vote to DELETE this project?")) return;
        try {
            await api.post(`/teams/${teamId}/delete/initiate`, {});
            alert("Delete vote initiated! Members have 24h to vote.");
        } catch (e: any) {
            if (e.response && e.response.status === 400) alert(e.response.data.detail);
            else alert("Failed to initiate delete vote.");
        }
    };

    // --- COMPLETE PROJECT VOTE ---
    const initiateComplete = async () => {
        if (!confirm("Start vote to mark project as COMPLETED?")) return;
        try {
            await api.post(`/teams/${teamId}/complete/initiate`, {});
            alert("Completion vote started!");
        } catch (e: any) {
            if (e.response && e.response.status === 400) alert(e.response.data.detail);
            else alert("Failed to initiate completion vote.");
        }
    };

    if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-purple-500">Loading Team HQ...</div>;
    if (!team) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-red-500">Team not found</div>;

    const isOwner = team.owner_id === currentUserId;

    return (
        <div className="min-h-screen bg-gray-950 text-white font-sans selection:bg-purple-500/30">
            <div className="max-w-7xl mx-auto px-6 py-12">

                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
                    <div>
                        <div className="flex items-center gap-4 mb-2">
                            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">{team.name}</h1>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${team.project_status === 'planning' ? 'bg-blue-900/30 border-blue-500/50 text-blue-400' :
                                    team.project_status === 'in-development' ? 'bg-yellow-900/30 border-yellow-500/50 text-yellow-400' :
                                        'bg-green-900/30 border-green-500/50 text-green-400'
                                }`}>
                                {team.project_status.replace("-", " ")}
                            </span>
                        </div>
                        <p className="text-gray-400 text-lg max-w-2xl leading-relaxed">{team.description}</p>
                    </div>

                    <div className="flex gap-3">
                        {isOwner && (
                            <button onClick={() => router.push(`/teams/${teamId}/edit`)} className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 border border-gray-700">
                                <Edit3 className="w-4 h-4" /> Edit Team
                            </button>
                        )}
                        <button onClick={() => router.push(`/chat?targetId=${teamId}`)} className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-purple-900/20 transition-all flex items-center gap-2">
                            <MessageCircle className="w-5 h-5" /> Team Chat
                        </button>
                    </div>
                </div>

                {/* Main Grid Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* LEFT COLUMN - Members & Tech Stack */}
                    <div className="space-y-8">
                        {/* Members Card */}
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 p-6 rounded-3xl">
                            <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-200"><Users className="w-5 h-5 text-purple-400" /> Squad</h3>
                            <div className="space-y-4">
                                {team.members.map(member => (
                                    <div key={member.id} className="flex items-center gap-4 group p-2 rounded-xl hover:bg-gray-800/50 transition cursor-pointer" onClick={() => router.push(`/profile/${member.id}`)}>
                                        <div className="relative">
                                            <img src={member.avatar_url || "https://github.com/shadcn.png"} className="w-12 h-12 rounded-full border-2 border-gray-800 group-hover:border-purple-500 transition" />
                                            {member.role === 'owner' && <span className="absolute -bottom-1 -right-1 bg-yellow-500 text-black text-[10px] font-bold px-1.5 rounded-full border-2 border-gray-900">LEAD</span>}
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-200 group-hover:text-purple-400 transition">{member.username}</p>
                                            <p className="text-xs text-gray-500 uppercase tracking-wide">{member.role}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>

                        {/* Tech Stack Card */}
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 p-6 rounded-3xl">
                            <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-200"><Code className="w-5 h-5 text-blue-400" /> Tech Stack</h3>
                            <div className="flex flex-wrap gap-2 mb-6">
                                {techStack.map((skill, i) => (
                                    <span key={i} className="bg-gray-800 text-gray-300 px-3 py-1.5 rounded-lg text-sm border border-gray-700 flex items-center gap-2">
                                        {skill}
                                        {isOwner && <button onClick={() => removeSkill(skill)} className="hover:text-red-400"><Trash2 className="w-3 h-3" /></button>}
                                    </span>
                                ))}
                            </div>
                            {isOwner && (
                                <div className="flex gap-2">
                                    <input className="bg-gray-800 border-gray-700 rounded-lg px-3 py-2 text-sm w-full outline-none focus:border-blue-500 transition" placeholder="Add tech..." value={newSkill} onChange={e => setNewSkill(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSkill()} />
                                    <button onClick={addSkill} className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg transition"><CheckCircle className="w-4 h-4" /></button>
                                </div>
                            )}
                        </motion.div>

                        {/* Candidates Match Card (Only for Owner) */}
                        {isOwner && candidates.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 p-6 rounded-3xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/20 blur-3xl rounded-full"></div>
                                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 relative z-10"><Award className="w-5 h-5 text-yellow-400" /> Top Candidates</h3>
                                <div className="space-y-3 relative z-10">
                                    {candidates.slice(0, 3).map((scorer: any, i: number) => (
                                        <div key={scorer.user_id} className="bg-black/40 p-3 rounded-xl flex justify-between items-center hover:bg-black/60 transition cursor-pointer" onClick={() => router.push(`/profile/${scorer.user_id}`)}>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-800 text-xs font-bold text-gray-400">#{i + 1}</div>
                                                <div>
                                                    <p className="font-bold text-sm">Candidate</p>
                                                    <p className="text-[10px] text-green-400 font-mono">{(scorer.score * 100).toFixed(0)}% Match</p>
                                                </div>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-gray-500" />
                                        </div>
                                    ))}
                                    <button className="w-full mt-2 py-2 text-center text-xs text-purple-400 font-bold hover:text-purple-300 transition">View All Matches</button>
                                </div>
                            </motion.div>
                        )}
                    </div>

                    {/* MIDDLE & RIGHT - Task Board */}
                    <div className="lg:col-span-2 space-y-8">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-gray-900 border border-gray-800 rounded-3xl p-6 min-h-[500px]">
                            <div className="flex justify-between items-center mb-8">
                                <h3 className="text-2xl font-bold flex items-center gap-3"><CheckCircle className="w-6 h-6 text-green-500" /> Project Board</h3>
                                <div className="flex gap-2">

                                    <button onClick={initiateDelete} className="text-xs bg-red-900/20 text-red-400 px-3 py-1.5 rounded-lg border border-red-900/50 hover:bg-red-900/40 transition">Delete Project</button>
                                    <button onClick={initiateComplete} className="text-xs bg-green-900/20 text-green-400 px-3 py-1.5 rounded-lg border border-green-900/50 hover:bg-green-900/40 transition">Complete Project</button>
                                </div>
                            </div>

                            {/* Task Columns */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* TODO */}
                                <div className="bg-gray-950/50 rounded-2xl p-4 border border-gray-800/50">
                                    <h4 className="font-bold text-gray-400 mb-4 flex items-center gap-2 text-sm"><Hash className="w-4 h-4" /> TO DO</h4>

                                    <div className="mb-4">
                                        <input className="w-full bg-gray-900 border-gray-800 rounded-lg p-2 text-sm outline-none focus:border-purple-500 mb-2" placeholder="New Task..." value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTask()} />
                                    </div>

                                    <div className="space-y-3">
                                        {tasks.filter(t => t.status === 'todo').map(task => (
                                            <div key={task.id} className="bg-gray-900 p-3 rounded-xl border border-gray-800 hover:border-gray-700 transition group">
                                                <p className="font-medium text-sm mb-2">{task.title}</p>
                                                <div className="flex justify-between items-center mt-2">
                                                    {task.assigned_to ? (
                                                        <img src={team.members.find(m => m.id === task.assigned_to)?.avatar_url || "https://github.com/shadcn.png"} className="w-6 h-6 rounded-full" title="Assigned" />
                                                    ) : (
                                                        <button onClick={() => assignTask(task.id)} className="text-[10px] bg-gray-800 px-2 py-1 rounded text-gray-400 hover:text-white transition">Claim</button>
                                                    )}
                                                    <button onClick={() => updateTask(task.id, 'in-progress')} className="text-gray-600 hover:text-blue-400"><ArrowRight className="w-4 h-4" /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* IN PROGRESS */}
                                <div className="bg-gray-950/50 rounded-2xl p-4 border border-gray-800/50">
                                    <h4 className="font-bold text-blue-400 mb-4 flex items-center gap-2 text-sm"><Clock className="w-4 h-4" /> IN PROGRESS</h4>
                                    <div className="space-y-3">
                                        {tasks.filter(t => t.status === 'in-progress').map(task => (
                                            <div key={task.id} className="bg-blue-900/10 p-3 rounded-xl border border-blue-900/30 hover:border-blue-500/30 transition">
                                                <p className="font-medium text-sm mb-2 text-blue-100">{task.title}</p>
                                                <div className="flex justify-between items-center mt-2">
                                                    <img src={team.members.find(m => m.id === task.assigned_to)?.avatar_url || "https://github.com/shadcn.png"} className="w-6 h-6 rounded-full border border-blue-500/30" />
                                                    <button onClick={() => updateTask(task.id, 'done')} className="text-blue-400 hover:text-green-400"><CheckCircle className="w-4 h-4" /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* DONE */}
                                <div className="bg-gray-950/50 rounded-2xl p-4 border border-gray-800/50">
                                    <h4 className="font-bold text-green-400 mb-4 flex items-center gap-2 text-sm"><CheckCircle className="w-4 h-4" /> DONE</h4>
                                    <div className="space-y-3">
                                        {tasks.filter(t => t.status === 'done').map(task => (
                                            <div key={task.id} className="bg-green-900/10 p-3 rounded-xl border border-green-900/30 opacity-60 hover:opacity-100 transition">
                                                <p className="font-medium text-sm mb-2 text-green-100 line-through">{task.title}</p>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <img src={team.members.find(m => m.id === task.assigned_to)?.avatar_url || "https://github.com/shadcn.png"} className="w-6 h-6 rounded-full grayscale" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                            </div>

                        </motion.div>
                    </div>
                </div>
            </div>
        </div>
    );
}