import React, { useState } from 'react';

interface ChatPanelProps {
    messages: { role: 'user' | 'assistant', content: string }[];
    onSendMessage: (msg: string) => void;
    hasSources: boolean;
    notebookTitle?: string;
    sourceCount?: number;
    onAddSource: () => void;
}

import Analytics from '../../../services/analytics';

const ChatPanel: React.FC<ChatPanelProps> = ({ messages, onSendMessage, hasSources, notebookTitle = 'Untitled Notebook', sourceCount = 0, onAddSource }) => {
    const [input, setInput] = useState('');

    const handleSend = () => {
        if (!input.trim()) return;
        Analytics.track('Message Sent', { notebook: notebookTitle, length: input.length });
        onSendMessage(input);
        setInput('');
    };

    return (
        <div className="flex flex-col h-full bg-[#F5F2EB] relative">
            <div className="flex justify-between items-center p-4 border-b border-[#D6D1C7] bg-[#F5F2EB]">
                <h2 className="text-[#2C2A26] font-medium">Chat</h2>
                <button className="text-[#2C2A26]/40 hover:text-[#2C2A26] transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col items-center">
                {!hasSources ? (
                    // EMPTY STATE
                    <div className="flex-1 flex flex-col items-center justify-center text-center mt-20 opacity-0 animate-fade-in-up" style={{ animationDelay: '0.1s', opacity: 1 }}>
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mb-6 text-blue-600">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                        </div>
                        <h3 className="text-xl text-[#2C2A26] mb-2 font-medium">Add a source to get started</h3>
                        <button
                            onClick={onAddSource}
                            className="px-6 py-2.5 mt-4 bg-[#2C2A26] hover:opacity-90 border border-transparent rounded-full text-sm text-[#F5F2EB] transition-all font-medium shadow-sm"
                        >
                            Upload a source
                        </button>
                    </div>
                ) : messages.length === 0 ? (
                    // SUMMARY VIEW (Sources added, no chat yet)
                    <div className="w-full max-w-3xl animate-fade-in-up">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-yellow-200 to-amber-400 rounded-lg flex items-center justify-center shadow-lg shadow-amber-900/10">
                                <span className="text-2xl">💡</span>
                            </div>
                            <div>
                                <h1 className="text-3xl text-[#2C2A26] font-serif leading-tight">{notebookTitle}</h1>
                                <p className="text-sm text-[#2C2A26]/60 font-medium">{sourceCount} sources</p>
                            </div>
                        </div>

                        <div className="prose prose-sm max-w-none text-[#2C2A26]/80 leading-relaxed mb-8 font-sans">
                            <p>
                                The provided sources offer a comprehensive guide to succeeding in <strong className="text-[#2C2A26]">Product Manager (PM) interviews</strong> at major technology companies like Amazon and Google. A significant portion of the text focuses on <strong className="text-[#2C2A26]">behavioral interview questions</strong>, emphasizing the use of structured frameworks like the <strong className="text-[#2C2A26]">STAR method</strong> to clearly articulate past experiences related to product leadership, conflict resolution, and failure.
                            </p>
                            <p>
                                The materials also explain <strong className="text-[#2C2A26]">technical concepts</strong> vital to the role, such as APIs (using a restaurant analogy) and algorithmic complexity (Big O notation), and review how to approach different interview types, including estimation questions and product design challenges.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2 mb-10">
                            <button className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#D6D1C7] hover:bg-[#EBE5D9] text-xs font-medium text-[#2C2A26] transition-colors shadow-sm">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                                Save to note
                            </button>
                            <button className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#D6D1C7] hover:bg-[#EBE5D9] text-xs font-medium text-[#2C2A26] transition-colors shadow-sm">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                Video Overview
                            </button>
                            <button className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#D6D1C7] hover:bg-[#EBE5D9] text-xs font-medium text-[#2C2A26] transition-colors shadow-sm">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 3-2 3 2zm0 0v-8" /></svg>
                                Audio Overview
                            </button>
                            <button className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#D6D1C7] hover:bg-[#EBE5D9] text-xs font-medium text-[#2C2A26] transition-colors shadow-sm">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                Mind Map
                            </button>
                        </div>
                    </div>
                ) : (
                    // CHAT HISTORY
                    <div className="w-full max-w-3xl space-y-6">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.role === 'assistant' && (
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex-shrink-0 mr-3 mt-1 text-[10px] flex items-center justify-center text-white font-bold">
                                        ✨
                                    </div>
                                )}
                                <div className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${msg.role === 'user'
                                    ? 'bg-[#2C2A26] text-[#F5F2EB]'
                                    : 'bg-white border border-[#D6D1C7] text-[#2C2A26] shadow-sm'
                                    }`}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="p-4 w-full max-w-3xl mx-auto pb-8 relative">
                {/* Suggested Chips */}
                {hasSources && messages.length === 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
                        {['What frameworks effectively structure behavioral...?', 'How does the product management role vary...?', 'Explain the STAR method'].map((q, i) => (
                            <button key={i} onClick={() => onSendMessage(q)} className="flex-shrink-0 bg-white hover:bg-[#EBE5D9] border border-[#D6D1C7] px-4 py-2 rounded-xl text-xs text-[#2C2A26] transition-colors text-left max-w-[200px] truncate shadow-sm">
                                {q}
                            </button>
                        ))}
                    </div>
                )}

                <div className="relative bg-white border border-[#D6D1C7] rounded-[24px] flex items-center px-2 py-2 shadow-lg group focus-within:border-[#2C2A26] transition-colors">
                    <button className="p-2 text-[#2C2A26]/40 hover:text-[#2C2A26] rounded-full hover:bg-black/5 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                    </button>
                    <input
                        type="text"
                        placeholder={hasSources ? "Start typing..." : "Upload a source to get started"}
                        className="flex-1 bg-transparent border-none text-[#2C2A26] placeholder-[#2C2A26]/40 focus:outline-none disabled:opacity-50 px-2 py-2 h-10"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        disabled={!hasSources}
                    />
                    {hasSources && (
                        <div className="flex items-center gap-1 pr-1 text-xs text-[#2C2A26]/40">
                            <span className="hidden sm:inline mr-2">{sourceCount} sources</span>
                            <button
                                onClick={handleSend}
                                disabled={!input.trim()}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${input.trim() ? 'bg-[#2C2A26] text-[#F5F2EB]' : 'bg-[#EBE5D9] text-[#2C2A26]/40'}`}
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>

                <div className="text-center mt-3">
                    <p className="text-[10px] text-[#2C2A26]/40">
                        InsightsLM can be inaccurate; please double check its responses.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ChatPanel;
