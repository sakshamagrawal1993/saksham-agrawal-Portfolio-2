import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useHealthTwinStore, HealthTwin } from '../../store/healthTwin';
import { Plus, Loader2, LogOut } from 'lucide-react';

export const TwinLanding: React.FC = () => {
    const navigate = useNavigate();
    const { twins, setTwins, setActiveTwin, clearChat } = useHealthTwinStore();

    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'my-twins' | 'featured'>('my-twins');
    const [featuredTwins, setFeaturedTwins] = useState<HealthTwin[]>([]);

    // Create Modal State
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTwinName, setNewTwinName] = useState('');
    const [newTwinDesc, setNewTwinDesc] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate('/login?redirect=/health-twin');
                return;
            }
            setUser(session.user);
            fetchTwins(session.user.id);
            fetchFeaturedTwins();
        };

        checkUser();
    }, [navigate]);

    const fetchTwins = async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('health_twins')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setTwins(data || []);
        } catch (error) {
            console.error('Error fetching twins:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchFeaturedTwins = async () => {
        try {
            const { data, error } = await supabase
                .from('health_twins')
                .select('*')
                .eq('featured', true)
                .order('created_at', { ascending: false });
            if (error) throw error;
            setFeaturedTwins(data || []);
        } catch (error) {
            console.error('Error fetching featured twins:', error);
        }
    };

    const handleCreateTwin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTwinName.trim() || !user) return;

        setIsCreating(true);
        try {
            const { data, error } = await supabase
                .from('health_twins')
                .insert([{
                    user_id: user.id,
                    name: newTwinName.trim(),
                    description: newTwinDesc.trim() || null
                }])
                .select()
                .single();

            if (error) throw error;

            if (data) {
                setTwins([data, ...twins]);
                setShowCreateModal(false);
                setNewTwinName('');
                setNewTwinDesc('');

                // Navigate straight to the new twin
                handleTwinSelect(data);
            }
        } catch (error) {
            console.error('Error creating twin:', error);
            alert('Failed to create Twin Profile.');
        } finally {
            setIsCreating(false);
        }
    };

    const handleTwinSelect = (twin: HealthTwin) => {
        setActiveTwin(twin.id);
        clearChat(); // Clear old context
        navigate(`/health-twin/${twin.id}`);
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F5F2EB]">
                <Loader2 className="w-8 h-8 animate-spin text-[#A84A00]" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F5F2EB] font-sans text-[#2C2A26]">
            {/* Header matching InsightsLM */}
            <header className="fixed top-0 w-full z-50 bg-[#F5F2EB]/90 backdrop-blur-md border-b flex items-center justify-between px-6 py-4 border-[#EBE7DE]">
                <div className="flex items-center gap-2">
                    <div className="bg-[#2C2A26] rounded-sm text-[#F5F2EB] font-serif w-8 h-8 flex items-center justify-center font-bold">
                        H
                    </div>
                    <span className="font-serif text-lg font-bold tracking-tight">Health Twin</span>
                </div>

                <div className="flex items-center gap-6">
                    <button
                        onClick={() => navigate('/portfolio')}
                        className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A8A29E] hover:text-[#2C2A26] transition-colors"
                    >
                        BACK TO PORTFOLIO
                    </button>
                    {user && (
                        <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full bg-[#EBE7DE] flex items-center justify-center text-xs font-bold text-[#A8A29E]">
                                {user.email?.charAt(0).toUpperCase()}
                            </div>
                            <button
                                onClick={handleLogout}
                                className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-600 hover:text-rose-800 transition-colors flex items-center gap-1"
                            >
                                <LogOut className="w-3 h-3" /> LOGOUT
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main className="pt-32 px-6 max-w-[1440px] mx-auto animate-fade-in-up">
                <div className="mb-16">
                    <h1 className="text-5xl md:text-6xl font-serif tracking-tight text-[#2C2A26] mb-4">
                        Welcome to Health Twin
                    </h1>
                    <p className="text-lg md:text-xl text-[#A8A29E] font-serif italic max-w-2xl">
                        Your central intelligence for generating, analyzing, and optimizing digital biomarkers.
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex items-center justify-between border-b border-[#EBE7DE] mb-12">
                    <div className="flex gap-8">
                        <button
                            onClick={() => setActiveTab('my-twins')}
                            className={`pb-4 text-[11px] font-bold uppercase tracking-[0.15em] transition-colors relative ${activeTab === 'my-twins' ? 'text-[#2C2A26]' : 'text-[#A8A29E] hover:text-[#2C2A26]'
                                }`}
                        >
                            MY TWINS
                            {activeTab === 'my-twins' && (
                                <span className="absolute bottom-0 left-0 w-full h-[2px] bg-[#2C2A26]" />
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('featured')}
                            className={`pb-4 text-[11px] font-bold uppercase tracking-[0.15em] transition-colors relative ${activeTab === 'featured' ? 'text-[#2C2A26]' : 'text-[#A8A29E] hover:text-[#2C2A26]'
                                }`}
                        >
                            FEATURED
                            {activeTab === 'featured' && (
                                <span className="absolute bottom-0 left-0 w-full h-[2px] bg-[#2C2A26]" />
                            )}
                        </button>
                    </div>
                </div>

                <div className="mb-8">
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A8A29E] mb-6">
                        {activeTab === 'my-twins' ? 'YOUR ACTIVE PROFILES' : 'PUBLIC PROFILES'}
                    </h2>

                    {activeTab === 'my-twins' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {/* Create New Card */}
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="group relative aspect-video flex flex-col items-center justify-center bg-[#F5F2EB] border-2 border-dashed border-[#D6D1C7] rounded-xl hover:bg-white hover:border-[#A84A00] transition-all"
                            >
                                <div className="w-12 h-12 rounded-full bg-[#EBE7DE] group-hover:bg-[#A84A00]/10 flex items-center justify-center mb-4 transition-colors">
                                    <Plus className="w-5 h-5 text-[#A8A29E] group-hover:text-[#A84A00] transition-colors" />
                                </div>
                                <span className="font-serif font-medium text-[#2C2A26]">Create new twin</span>
                            </button>

                            {/* Existing Twin Cards */}
                            {twins.map((twin) => (
                                <div
                                    key={twin.id}
                                    onClick={() => handleTwinSelect(twin)}
                                    className="group cursor-pointer bg-white rounded-xl border border-[#EBE7DE] overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col"
                                >
                                    <div className="h-24 bg-gradient-to-br from-[#A84A00] to-[#E98226] p-4 flex items-start justify-between">
                                        <div className="w-8 h-8 rounded-md bg-white/20 backdrop-blur-sm flex items-center justify-center text-white font-serif">
                                            {twin.name.charAt(0).toUpperCase()}
                                        </div>
                                    </div>
                                    <div className="p-5 flex-1 flex flex-col justify-between">
                                        <div>
                                            <h3 className="font-serif font-bold text-lg text-[#2C2A26] mb-1 group-hover:text-[#A84A00] transition-colors truncate">
                                                {twin.name}
                                            </h3>
                                            <p className="text-xs text-[#A8A29E] line-clamp-2">
                                                {twin.description || 'No description provided.'}
                                            </p>
                                        </div>
                                        <span className="text-[10px] uppercase font-bold text-[#A8A29E] mt-4 tracking-widest">
                                            ID: {twin.id.split('-')[0]}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        featuredTwins.length === 0 ? (
                            <div className="flex items-center justify-center h-48 border border-dashed border-[#D6D1C7] rounded-xl bg-white/50">
                                <p className="font-serif italic text-[#A8A29E]">No featured twins available at the moment.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                {featuredTwins.map((twin) => (
                                    <div
                                        key={twin.id}
                                        onClick={() => handleTwinSelect(twin)}
                                        className="group cursor-pointer bg-white rounded-xl border border-[#EBE7DE] overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col"
                                    >
                                        <div className="h-24 bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] p-4 flex items-start justify-between">
                                            <div className="w-8 h-8 rounded-md bg-white/20 backdrop-blur-sm flex items-center justify-center text-white font-serif">
                                                {twin.name.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full backdrop-blur-sm">Featured</span>
                                        </div>
                                        <div className="p-5 flex-1 flex flex-col justify-between">
                                            <div>
                                                <h3 className="font-serif font-bold text-lg text-[#2C2A26] mb-1 group-hover:text-[#3b82f6] transition-colors truncate">
                                                    {twin.name}
                                                </h3>
                                                <p className="text-xs text-[#A8A29E] line-clamp-2">
                                                    {twin.description || 'No description provided.'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>
            </main>

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-md border border-[#EBE7DE] overflow-hidden">
                        <div className="p-6 border-b border-[#EBE7DE] flex items-center justify-between">
                            <h2 className="font-serif text-xl text-[#2C2A26]">Create New Twin</h2>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="text-[#A8A29E] hover:text-[#2C2A26]"
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <form onSubmit={handleCreateTwin} className="p-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-[#5D5A53] mb-2">
                                        Twin Name *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="E.g., My Profile, Mom's Data"
                                        value={newTwinName}
                                        onChange={(e) => setNewTwinName(e.target.value)}
                                        className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#A84A00] transition-shadow text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-[#5D5A53] mb-2">
                                        Description <span className="text-[#A8A29E] font-normal lowercase tracking-normal">(optional)</span>
                                    </label>
                                    <textarea
                                        placeholder="Brief context for this twin..."
                                        rows={3}
                                        value={newTwinDesc}
                                        onChange={(e) => setNewTwinDesc(e.target.value)}
                                        className="w-full bg-[#F5F2EB] border border-[#EBE7DE] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#A84A00] transition-shadow text-sm resize-none"
                                    />
                                </div>
                            </div>

                            <div className="mt-8 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="px-5 py-2.5 text-sm font-bold text-[#5D5A53] hover:bg-[#F5F2EB] rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isCreating || !newTwinName.trim()}
                                    className="px-5 py-2.5 text-sm font-bold bg-[#A84A00] text-white hover:bg-[#8A3D00] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center gap-2"
                                >
                                    {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Twin'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
