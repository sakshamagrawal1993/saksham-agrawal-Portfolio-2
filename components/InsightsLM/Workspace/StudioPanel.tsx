import React from 'react';

interface StudioPanelProps {
    onAction: (action: string) => void;
}

const StudioPanel: React.FC<StudioPanelProps> = ({ onAction }) => {

    const TOOLS = [
        { label: 'Audio Overview', icon: '🎧', id: 'audio' },
        { label: 'Video Overview', icon: '🎬', id: 'video' },
        { label: 'Mind Map', icon: '🧠', id: 'mindmap' },
        { label: 'Reports', icon: '📄', id: 'reports' },
        { label: 'Flashcards', icon: '🗂️', id: 'flashcards' },
        { label: 'Quiz', icon: '📝', id: 'quiz' },
        { label: 'Infographic', icon: '📊', id: 'infographic' },
        { label: 'Slide Deck', icon: '🖥️', id: 'slides' },
    ];

    return (
        <div className="flex flex-col h-full bg-[#EBE5D9]/30 text-[#2C2A26] border-l border-[#D6D1C7] p-4 text-sm font-sans">
            <div className="flex justify-between items-center mb-6">
                <h2 className="font-medium text-[#2C2A26]">Studio</h2>
                <button className="text-[#2C2A26]/40 hover:text-[#2C2A26] transition-colors">
                    {/* Collapse icon */}
                </button>
            </div>

            {/* Audio Language Banner */}
            <div className="bg-white border border-blue-100 rounded-lg p-3 mb-6 relative overflow-hidden shadow-sm">
                <div className="text-[10px] text-blue-600 mb-1 font-bold uppercase">New</div>
                <p className="text-xs text-blue-900/80 leading-relaxed">
                    Create an Audio Overview in multiple languages!
                </p>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-8">
                {TOOLS.map((tool) => (
                    <button
                        key={tool.id}
                        onClick={() => onAction(tool.id)}
                        className="bg-white hover:bg-[#F5F2EB] border border-[#D6D1C7] hover:border-[#2C2A26] rounded-xl p-3 flex flex-col items-start gap-2 transition-all text-left group shadow-sm"
                    >
                        <div className="flex justify-between w-full">
                            <span className="text-lg opacity-80">{tool.icon}</span>
                            <div className="w-5 h-5 rounded-full bg-[#2C2A26]/5 flex items-center justify-center text-[#2C2A26]/40 group-hover:bg-[#2C2A26]/10 group-hover:text-[#2C2A26]">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </div>
                        </div>
                        <span className="text-[10px] font-medium text-[#2C2A26]">{tool.label}</span>
                    </button>
                ))}
            </div>

            {/* Assets List */}
            <div className="flex-1 overflow-y-auto mb-4">
                <div className="space-y-3">
                    <div className="group flex items-center justify-between p-2 rounded hover:bg-white cursor-pointer border border-transparent hover:border-[#D6D1C7]">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-white border border-[#D6D1C7] flex items-center justify-center text-[#2C2A26]/60">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            </div>
                            <div>
                                <p className="text-xs text-[#2C2A26] font-medium">Product Manager Roles, Skills, and APIs</p>
                                <p className="text-[10px] text-[#2C2A26]/40">20 sources • 37d ago</p>
                            </div>
                        </div>
                        <button className="text-[#2C2A26]/40 hover:text-[#2C2A26]">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>
                        </button>
                    </div>

                    <div className="group flex items-center justify-between p-2 rounded hover:bg-white cursor-pointer border border-transparent hover:border-[#D6D1C7]">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-white border border-[#D6D1C7] flex items-center justify-center text-[#2C2A26]/60">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            </div>
                            <div>
                                <p className="text-xs text-[#2C2A26] font-medium">Product Management Interview Concepts...</p>
                                <p className="text-[10px] text-[#2C2A26]/40">8 sources • 37d ago</p>
                            </div>
                        </div>
                        <button className="text-[#2C2A26]/40 hover:text-[#2C2A26]">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>
                        </button>
                    </div>
                </div>
            </div>

            <button
                onClick={() => onAction('new_note')}
                className="w-full bg-[#2C2A26] text-[#F5F2EB] font-bold py-2 rounded-full flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-lg mt-auto"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Add note
            </button>
        </div>
    );
};

export default StudioPanel;
