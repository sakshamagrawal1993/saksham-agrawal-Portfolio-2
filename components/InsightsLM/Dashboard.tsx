
import React, { useState } from 'react';
import NotebookWorkspace from './NotebookWorkspace';

interface DashboardProps {
    onLogout: () => void;
    onBack: () => void;
}

interface Notebook {
    id: string;
    title: string;
    date: string;
    sourceCount: number;
    icon?: string;
    color?: string; // For the gradient/background style
}

// Mock Data for "Returning User" feeling
const MOCK_NOTEBOOKS: Notebook[] = [
    { id: '1', title: 'Product Mgmt 101', date: 'Oct 30, 2025', sourceCount: 20, icon: '💡', color: 'from-blue-500/20 to-purple-500/20' },
    { id: '2', title: 'Smart Health Research', date: 'Aug 17, 2025', sourceCount: 42, icon: '🏋️', color: 'from-green-500/20 to-emerald-500/20' },
    { id: '3', title: 'Q3 Financial Strategy', date: 'Jun 22, 2025', sourceCount: 5, icon: '📊', color: 'from-orange-500/20 to-red-500/20' },
    { id: '4', title: 'Agentic AI Trends', date: 'May 10, 2025', sourceCount: 12, icon: '🤖', color: 'from-indigo-500/20 to-cyan-500/20' },
];

const FEATURED_NOTEBOOKS: Notebook[] = [
    { id: 'f1', title: 'How do scientists link genetics to health?', date: 'Jul 9, 2025', sourceCount: 16, color: 'from-blue-600 to-indigo-700' },
    { id: 'f2', title: 'The World Ahead 2025', date: 'Jul 7, 2025', sourceCount: 70, color: 'from-red-600 to-orange-700' },
    { id: 'f3', title: 'Secrets of the Super Agers', date: 'May 6, 2025', sourceCount: 17, color: 'from-green-600 to-emerald-800' },
];

import Analytics from '../../services/analytics';

const Dashboard: React.FC<DashboardProps> = ({ onLogout, onBack }) => {
    const [selectedNotebook, setSelectedNotebook] = useState<Notebook | null>(null);

    React.useEffect(() => {
        Analytics.track('Dashboard View');
    }, []);

    const handleSelectNotebook = (notebook: Notebook) => {
        if (notebook.id === 'new') {
            Analytics.track('Create Notebook Start');
        } else {
            Analytics.track('Select Notebook', { notebook_id: notebook.id, title: notebook.title });
        }
        setSelectedNotebook(notebook);
    };

    // If a notebook is selected, show the workspace view
    if (selectedNotebook) {
        return (
            <NotebookWorkspace
                notebookId={selectedNotebook.id}
                notebookTitle={selectedNotebook.title}
                onClose={() => {
                    setSelectedNotebook(null);
                    Analytics.track('Dashboard View'); // Re-track when returning
                }}
                onLogout={onLogout}
            />
        );
    }

    // Otherwise, show the Dashboard (Notebook List View)
    return (
        <div className="min-h-screen bg-[#F5F2EB] text-[#2C2A26] font-sans flex flex-col">

            {/* Top Navigation Bar */}
            <div className="h-16 border-b border-[#D6D1C7] bg-[#F5F2EB]/95 backdrop-blur-sm flex items-center justify-between px-6 md:px-12 fixed top-0 w-full z-50">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setSelectedNotebook(null)}>
                    <div className="w-8 h-8 bg-[#2C2A26] rounded-md flex items-center justify-center text-[#F5F2EB] font-serif font-bold text-lg">
                        I
                    </div>
                    <span className="font-serif font-bold text-xl tracking-tight text-[#2C2A26]">InsightsLM</span>
                </div>

                <div className="flex items-center gap-6">
                    <button
                        onClick={(e) => { e.stopPropagation(); onBack(); }}
                        className="text-xs font-bold uppercase tracking-widest text-[#2C2A26]/50 hover:text-[#2C2A26] transition-colors bg-transparent border-none cursor-pointer"
                    >
                        Back to Portfolio
                    </button>
                    <div className="w-8 h-8 rounded-full bg-[#EBE5D9] border border-[#D6D1C7] flex items-center justify-center text-xs font-bold cursor-pointer hover:bg-[#D6D1C7] transition-colors" title="Settings">
                        S
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); onLogout(); }}
                        className="text-xs text-red-800 hover:text-red-900 font-bold uppercase tracking-widest bg-transparent border-none cursor-pointer"
                    >
                        Logout
                    </button>
                </div>
            </div>

            {/* Main Scrollable Content */}
            <div className="flex-1 pt-24 px-6 md:px-12 pb-12 max-w-[1400px] mx-auto w-full animate-fade-in-up">

                {/* Welcome / Header Section */}
                <div className="mb-12">
                    <h1 className="text-4xl md:text-5xl font-serif text-[#2C2A26] mb-2">Welcome to InsightsLM</h1>
                    <p className="text-[#2C2A26]/60 text-lg font-serif">Your AI-powered research assistant.</p>
                </div>

                {/* Controls / Tabs */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex gap-8 border-b-2 border-transparent">
                        <button className="pb-2 border-b-2 border-[#2C2A26] text-sm font-bold uppercase tracking-widest text-[#2C2A26]">
                            My notebooks
                        </button>
                        <button className="pb-2 border-b-2 border-transparent text-[#2C2A26]/40 hover:text-[#2C2A26] text-sm font-bold uppercase tracking-widest transition-colors">
                            Featured
                        </button>
                    </div>

                    <div className="hidden md:flex items-center gap-2 bg-[#EBE5D9] p-1 rounded-lg border border-[#D6D1C7]">
                        <button className="p-1.5 bg-white rounded shadow-sm text-[#2C2A26]">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                            </svg>
                        </button>
                        <button className="p-1.5 text-[#2C2A26]/40 hover:text-[#2C2A26]">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Notebooks Grid */}
                <div className="mb-16">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-[#2C2A26]/40 mb-6">Recent Notebooks</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                        {/* Create New Card */}
                        <div
                            onClick={() => handleSelectNotebook({ id: 'new', title: 'Untitled Notebook', date: 'Just now', sourceCount: 0 })}
                            className="aspect-[4/3] rounded-2xl border-2 border-dashed border-[#D6D1C7] flex flex-col items-center justify-center cursor-pointer hover:bg-[#EBE5D9]/30 hover:border-[#2C2A26]/30 transition-all group"
                        >
                            <div className="w-12 h-12 rounded-full bg-[#EBE5D9] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform text-[#2C2A26]">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            </div>
                            <span className="font-serif font-bold text-[#2C2A26]">Create new notebook</span>
                        </div>

                        {/* Existing Notebooks */}
                        {MOCK_NOTEBOOKS.map(notebook => (
                            <div
                                key={notebook.id}
                                onClick={() => handleSelectNotebook(notebook)}
                                className="aspect-[4/3] bg-white rounded-2xl border border-[#D6D1C7] flex flex-col justify-between cursor-pointer hover:shadow-md hover:border-[#2C2A26]/30 transition-all relative group overflow-hidden"
                            >
                                {/* Cover Image Area */}
                                <div className={`h-2/5 w-full bg-gradient-to-br ${notebook.color || 'from-gray-200 to-gray-300'} relative p-4 flex items-start justify-between`}>
                                    <div className="w-10 h-10 rounded bg-white/30 backdrop-blur-sm flex items-center justify-center text-xl shadow-sm border border-white/20 text-[#2C2A26]">
                                        {notebook.icon}
                                    </div>
                                    <button className="text-[#2C2A26]/40 hover:text-[#2C2A26] bg-white/30 rounded-full p-1 transition-colors">
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="p-5 flex-1 flex flex-col justify-between">
                                    <h3 className="font-serif font-bold text-lg leading-tight line-clamp-2 text-[#2C2A26] group-hover:text-black transition-colors">{notebook.title}</h3>
                                    <div className="flex items-center gap-2 text-[10px] text-[#2C2A26]/50 uppercase tracking-widest font-bold">
                                        <span>{notebook.date}</span>
                                        <span>•</span>
                                        <span>{notebook.sourceCount} sources</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Featured Notebooks Section */}
                <div>
                    <h2 className="text-sm font-bold uppercase tracking-widest text-[#2C2A26]/40 mb-6">Featured Notebooks</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {FEATURED_NOTEBOOKS.map(notebook => (
                            <div
                                key={notebook.id}
                                className="aspect-video rounded-2xl relative overflow-hidden cursor-pointer group shadow-sm hover:shadow-lg transition-all border border-[#D6D1C7]"
                            >
                                {/* Background Gradient/Image */}
                                <div className={`absolute inset-0 bg-gradient-to-br ${notebook.color} opacity-90 group-hover:scale-105 transition-transform duration-500`}></div>
                                <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition-colors"></div>

                                <div className="absolute bottom-0 left-0 p-6 text-white">
                                    <div className="flex items-center gap-2 mb-2 opacity-80">
                                        <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                                            <span className="text-[10px]">G</span>
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Google Research</span>
                                    </div>
                                    <h3 className="font-serif font-bold text-xl leading-tight mb-2 drop-shadow-md">{notebook.title}</h3>
                                    <div className="flex items-center gap-2 text-[10px] opacity-80 uppercase tracking-widest font-bold">
                                        <span>{notebook.date}</span>
                                        <span>•</span>
                                        <span>{notebook.sourceCount} sources</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Dashboard;
