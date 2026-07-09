import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { ChevronLeft, ChevronDown, Plus, Mic, Globe, ShieldCheck, ChevronRight } from 'lucide-react';

export const AICareLanding: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [profileName, setProfileName] = useState<string | null>(null);
    const [recentSessions, setRecentSessions] = useState<any[]>([]);

    useEffect(() => {
        const checkUserAndProfile = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate('/login?redirect=/ai-care');
                return;
            }

            // Check if profile exists
            const { data, error } = await supabase
                .from('jivi_profiles')
                .select('id, name')
                .eq('user_id', session.user.id)
                .limit(1)
                .maybeSingle();

            if (!error && data) {
                setProfileName(data.name);
                
                // Fetch recent sessions
                const { data: sessions } = await supabase
                    .from('jivi_chat_sessions')
                    .select('id, created_at, status')
                    .eq('user_id', session.user.id)
                    .order('created_at', { ascending: false })
                    .limit(2);
                    
                if (sessions) {
                    setRecentSessions(sessions);
                }
            }
            setLoading(false);
        };

        checkUserAndProfile();
    }, [navigate]);

    const handleActionClick = () => {
        if (!profileName) {
            navigate('/ai-care/profile');
        } else {
            // Always open a fresh chat from the main input / categories
            navigate('/ai-care/chat?new=1');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
                <div className="w-8 h-8 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FDFBF7] font-sans text-gray-900 flex flex-col pb-10">
            {/* Header */}
            <header className="px-4 py-4 flex items-center bg-white sticky top-0 z-10 border-b border-gray-100">
                <button onClick={() => navigate('/portfolio')} className="mr-3 p-1">
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <h1 className="text-xl font-semibold">AI Care</h1>
            </header>

            <div className="px-5 mt-6 max-w-md w-full mx-auto">
                {/* Top Profile / Language Row */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div 
                            className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white cursor-pointer hover:bg-orange-600 transition"
                            onClick={handleActionClick}
                        >
                            <Plus className="w-6 h-6" />
                        </div>
                        {profileName && (
                            <button 
                                onClick={() => navigate('/ai-care/profile')}
                                className="flex items-center gap-1 font-semibold text-gray-800"
                            >
                                {profileName.split(' ')[0]} <ChevronDown className="w-4 h-4 text-orange-500" />
                            </button>
                        )}
                    </div>

                    <button className="flex items-center gap-2 border border-gray-200 rounded-full px-3 py-1.5 text-sm text-gray-600 hover:border-orange-300">
                        <span className="text-orange-500">English</span>
                        <Globe className="w-4 h-4" />
                    </button>
                </div>

                {/* Greeting */}
                <div className="text-center mb-10">
                    <h2 className="text-[28px] font-bold text-orange-500 mb-1">
                        {profileName ? `Hello ${profileName.split(' ')[0]}` : "Hello there!"}
                    </h2>
                    <h3 className="text-2xl font-bold text-gray-800">
                        How are you feeling today?
                    </h3>
                </div>

                {/* Pulsing Orb */}
                <div className="flex justify-center mb-10 relative">
                    <div className="w-48 h-48 rounded-full bg-gradient-to-tr from-orange-200/50 to-orange-50/10 flex items-center justify-center relative overflow-hidden shadow-inner">
                        {/* Core glow */}
                        <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-orange-100 to-orange-50 opacity-80 blur-md absolute animate-pulse"></div>
                        {/* Shimmer */}
                        <div className="w-full h-full absolute inset-0 bg-gradient-to-b from-white/40 to-transparent"></div>
                    </div>
                </div>

                {/* Input Bar */}
                <div className="relative mb-8 shadow-sm">
                    <input
                        type="text"
                        onClick={handleActionClick}
                        readOnly
                        placeholder="Frequent Headaches"
                        className="w-full bg-white border border-gray-100 rounded-full pl-6 pr-14 py-4 text-gray-400 focus:outline-none cursor-text shadow-sm"
                    />
                    <button 
                        onClick={handleActionClick}
                        className="absolute right-2 top-2 bottom-2 aspect-square rounded-full bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 transition-colors shadow-md"
                    >
                        <Mic className="w-5 h-5" />
                    </button>
                </div>

                {/* Recent Sessions */}
                {profileName && recentSessions.length > 0 && (
                    <div className="mb-8">
                        <div className="flex items-center mb-4">
                            <div className="h-px bg-orange-200 flex-1"></div>
                            <h4 className="px-4 font-semibold text-gray-800">Recent Sessions</h4>
                            <div className="h-px bg-orange-200 flex-1"></div>
                        </div>

                        <div className="space-y-3">
                            {recentSessions.map(session => (
                                <button 
                                    key={session.id}
                                    onClick={() => {
                                        if (session.status === 'completed') {
                                            navigate(`/ai-care/observations?sessionId=${session.id}`);
                                        } else {
                                            // Resume only when user picks an active evaluation
                                            navigate(`/ai-care/chat?sessionId=${session.id}`);
                                        }
                                    }}
                                    className="w-full bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between hover:border-orange-300 transition-colors text-left shadow-sm"
                                >
                                    <div>
                                        <h5 className="font-semibold text-gray-800 mb-1">
                                            {session.status === 'completed' ? 'Diagnosis Report' : 'Active Evaluation'}
                                        </h5>
                                        <p className="text-xs text-gray-400">
                                            {new Date(session.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} | {new Date(session.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()}
                                        </p>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-gray-800" />
                                </button>
                            ))}
                        </div>

                        <div className="flex justify-center mt-4">
                            <button className="flex items-center gap-2 border border-orange-200 text-orange-500 rounded-full px-6 py-2 text-sm font-semibold hover:bg-orange-50 transition-colors">
                                View All <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Categories */}
                <div className="mb-8">
                    <div className="flex items-center mb-6">
                        <div className="h-px bg-orange-200 flex-1"></div>
                        <h4 className="px-4 font-semibold text-gray-800">Select a Health Category</h4>
                        <div className="h-px bg-orange-200 flex-1"></div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <button onClick={handleActionClick} className="bg-white border border-gray-100 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 hover:border-orange-300 shadow-sm min-h-[100px]">
                            <span className="text-3xl">👨‍⚕️</span>
                            <span className="text-xs font-semibold text-center text-gray-700 leading-tight">General<br/>Care</span>
                        </button>
                        <button onClick={handleActionClick} className="bg-white border border-gray-100 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 hover:border-orange-300 shadow-sm min-h-[100px]">
                            <span className="text-3xl">🧠</span>
                            <span className="text-xs font-semibold text-center text-gray-700 leading-tight">Mental<br/>Wellness</span>
                        </button>
                        <button onClick={handleActionClick} className="bg-white border border-gray-100 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 hover:border-orange-300 shadow-sm min-h-[100px]">
                            <span className="text-3xl">👩</span>
                            <span className="text-xs font-semibold text-center text-gray-700 leading-tight">Women's<br/>Health</span>
                        </button>
                        <button onClick={handleActionClick} className="bg-white border border-gray-100 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 hover:border-orange-300 shadow-sm min-h-[100px]">
                            <span className="text-3xl">✨</span>
                            <span className="text-xs font-semibold text-center text-gray-700 leading-tight">Skin<br/>Care</span>
                        </button>
                        <button onClick={handleActionClick} className="bg-white border border-gray-100 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 hover:border-orange-300 shadow-sm min-h-[100px]">
                            <span className="text-3xl">❤️</span>
                            <span className="text-xs font-semibold text-center text-gray-700 leading-tight">Heart<br/>Care</span>
                        </button>
                        <button onClick={handleActionClick} className="bg-white border border-gray-100 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 hover:border-orange-300 shadow-sm min-h-[100px]">
                            <span className="text-3xl">🩺</span>
                            <span className="text-xs font-semibold text-center text-gray-700 leading-tight">Diabetes<br/>Care</span>
                        </button>
                    </div>

                    <div className="flex justify-center mt-6">
                        <button className="flex items-center gap-2 border border-orange-200 text-orange-500 rounded-full px-6 py-2 text-sm font-semibold hover:bg-orange-50 transition-colors">
                            View More <ChevronDown className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Footer Privacy */}
                <div className="flex items-center justify-center gap-2 text-gray-600 mt-10">
                    <ShieldCheck className="w-5 h-5 text-gray-700" />
                    <span className="text-sm font-medium">Your Privacy is Protected</span>
                </div>
            </div>
        </div>
    );
};
