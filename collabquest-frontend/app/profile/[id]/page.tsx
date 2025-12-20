"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import GlobalHeader from "@/components/GlobalHeader";
import { ArrowLeft, Code2, Heart, User as UserIcon, GraduationCap, Link as LinkIcon, Award, Star, Loader2 } from "lucide-react";

export default function PublicProfile() {
    const params = useParams();
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get(`/users/${params.id}`)
            .then(res => setUser(res.data))
            .catch(() => alert("Error: Profile unavailable or user blocked."))
            .finally(() => setLoading(false));
    }, [params.id]);

    if (loading) return <div className="h-screen bg-black text-white flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
    if (!user) return null;

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <GlobalHeader />
            <div className="max-w-4xl mx-auto p-8">
                <button onClick={() => router.back()} className="mb-6 flex items-center gap-2 text-gray-400 hover:text-white transition">
                    <ArrowLeft className="w-4 h-4"/> Back
                </button>

                <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 mb-8">
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <img src={user.avatar_url || "https://github.com/shadcn.png"} className="w-32 h-32 rounded-full border-4 border-gray-800" />
                        <div className="text-center md:text-left flex-1">
                            <h1 className="text-4xl font-bold">{user.username}</h1>
                            <p className="text-gray-400 mt-2 max-w-xl">{user.about}</p>
                            <div className="flex flex-wrap justify-center md:justify-start gap-4 mt-4 text-sm">
                                {user.age && <span className="bg-gray-800 px-3 py-1 rounded-full text-gray-300">Age: {user.age}</span>}
                                {user.school && <span className="flex items-center gap-2 bg-gray-800 px-3 py-1 rounded-full text-gray-300"><GraduationCap className="w-4 h-4"/> {user.school}</span>}
                                <span className="bg-purple-900/30 text-purple-400 border border-purple-500/30 px-3 py-1 rounded-full font-bold">Trust Score: {user.trust_score.toFixed(1)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Skills */}
                    <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
                        <h3 className="font-bold mb-4 flex items-center gap-2 text-blue-400"><Code2 className="w-4 h-4"/> Skills</h3>
                        <div className="flex flex-wrap gap-2">
                            {user.skills.map((s:any) => (
                                <span key={s.name} className="bg-blue-900/20 text-blue-300 border border-blue-500/20 px-3 py-1 rounded-full text-xs">
                                    {s.name} ({s.level})
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Ratings */}
                    <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
                        <h3 className="font-bold mb-4 flex items-center gap-2 text-yellow-400"><Star className="w-4 h-4"/> Ratings</h3>
                        <div className="space-y-3">
                            {user.ratings_received?.slice(0, 3).map((r:any, i:number) => (
                                <div key={i} className="text-sm border-b border-gray-800 pb-2">
                                    <p className="font-bold">{r.project_name} - {r.score}/10</p>
                                    <p className="text-gray-500 italic text-xs">"{r.explanation}"</p>
                                </div>
                            )) || <p className="text-gray-500 text-sm">No ratings yet.</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}