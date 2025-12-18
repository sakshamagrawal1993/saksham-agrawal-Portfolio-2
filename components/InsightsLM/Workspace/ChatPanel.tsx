import React, { useState, useEffect, useRef } from 'react';
import Analytics from '../../../services/analytics';

interface ChatPanelProps {
    messages: { role: 'user' | 'assistant', content: string }[];
    onSendMessage: (msg: string) => void;
    hasSources: boolean;
    notebookTitle?: string;
    sourceCount?: number;
    onAddSource: () => void;
    isLoadingSummary?: boolean;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ messages, onSendMessage, hasSources, notebookTitle = 'Untitled Notebook', sourceCount = 0, onAddSource, isLoadingSummary }) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoadingSummary]);

    const handleSend = () => {
        if (!input.trim()) return;
        Analytics.track('Message Sent', { notebook: notebookTitle, length: input.length });
        onSendMessage(input);
        setInput('');
    };

    // Helper for Action Buttons
    const MessageActions = () => (
        <div className="flex flex-wrap gap-2 mt-4">
            <button className="flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-[#D6D1C7] hover:bg-[#EBE5D9] text-sm font-medium text-[#2C2A26] transition-all shadow-sm group">
                <svg className="w-4 h-4 text-[#2C2A26]/60 group-hover:text-[#2C2A26]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                Save to note
            </button>
            <div className="flex items-center gap-1 bg-white border border-[#D6D1C7] rounded-full px-2 py-1 shadow-sm">
                <button className="p-2 hover:bg-[#EBE5D9] rounded-full text-[#2C2A26]/60 hover:text-[#2C2A26] transition-colors" title="Copy">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </button>
                <div className="w-px h-4 bg-[#D6D1C7]"></div>
                <button className="p-2 hover:bg-[#EBE5D9] rounded-full text-[#2C2A26]/60 hover:text-[#2C2A26] transition-colors" title="Good response">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" /></svg>
                </button>
                <button className="p-2 hover:bg-[#EBE5D9] rounded-full text-[#2C2A26]/60 hover:text-[#2C2A26] transition-colors" title="Bad response">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" /></svg>
                </button>
            </div>
        </div>
    );

    // Helper to render the Overview (Summary) Message
    const OverviewMessage = ({ content }: { content: string }) => (
        <div className="w-full max-w-3xl animate-fade-in-up mb-8 pt-8">
            <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 flex items-center justify-center">
                    <span className="text-4xl filter drop-shadow-sm">💡</span>
                </div>
                <div>
                    <h1 className="text-4xl text-[#2C2A26] font-serif leading-tight tracking-tight">{notebookTitle}</h1>
                    <p className="text-sm text-[#2C2A26]/60 font-medium mt-1">{sourceCount} sources</p>
                </div>
            </div>

            <div className="prose prose-lg max-w-none text-[#2C2A26]/90 leading-relaxed mb-6 font-sans">
                <div dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br/>') }} />
            </div>

            <MessageActions />
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-[#F5F2EB] relative text-[#2C2A26] overflow-hidden">
            {/* Header (Minimal) */}
            <div className="flex justify-between items-center p-4 border-b border-[#D6D1C7] bg-[#F5F2EB] flex-shrink-0">
                <h2 className="text-[#2C2A26] font-medium tracking-wide">Chat</h2>
                {hasSources && (
                    <div className="text-xs text-[#2C2A26]/40 font-mono hidden md:block">{sourceCount} SOURCES</div>
                )}
                <button className="text-[#2C2A26]/40 hover:text-[#2C2A26] transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                </button>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-8 flex flex-col items-center custom-scrollbar">
                {!hasSources ? (
                    // EMPTY STATE
                    <div className="flex-1 flex flex-col items-center justify-center text-center mt-20 opacity-0 animate-fade-in-up" style={{ animationDelay: '0.1s', opacity: 1 }}>
                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-6 text-blue-600 border border-blue-200">
                            <span className="text-xl">✨</span>
                        </div>
                        <h3 className="text-xl text-[#2C2A26] mb-2 font-medium">Add a source to get started</h3>
                        <p className="text-[#2C2A26]/60 max-w-sm mb-6">Upload documents to generate summaries and chat with your knowledge base.</p>
                        <button
                            onClick={onAddSource}
                            className="px-6 py-2.5 bg-[#2C2A26] hover:opacity-90 text-[#F5F2EB] rounded-full text-sm font-medium transition-all shadow-sm"
                        >
                            Upload a source
                        </button>
                    </div>
                ) : (
                    // UNIFIED CHAT STREAM
                    <div className="w-full max-w-3xl space-y-6 pb-4">
                        {/* Message Stream */}
                        {messages.map((msg, idx) => {
                            if ((msg as any).type === 'summary') {
                                return <OverviewMessage key={idx} content={msg.content} />;
                            }

                            const isUser = msg.role === 'user';

                            // User Message Style (Bubble)
                            if (isUser) {
                                return (
                                    <div key={idx} className="flex justify-end animate-fade-in">
                                        <div className="max-w-[85%] bg-[#2C2A26] text-[#F5F2EB] rounded-2xl rounded-tr-none px-5 py-3.5 text-sm leading-relaxed shadow-sm">
                                            <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }} />
                                        </div>
                                    </div>
                                );
                            }

                            // Agent Message Style (NotebookLM Style: Clean Text + Actions)
                            return (
                                <div key={idx} className="w-full animate-fade-in mb-6">
                                    <div className="prose prose-lg max-w-none text-[#2C2A26]/90 leading-relaxed font-sans">
                                        <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }} />
                                    </div>
                                    <MessageActions />
                                </div>
                            );
                        })}

                        {/* Loading State for Latest Summary */}
                        {isLoadingSummary && (
                            <div className="w-full max-w-3xl animate-pulse pt-8 mb-8">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 bg-[#EBE5D9] rounded-full"></div>
                                    <div className="space-y-2">
                                        <div className="h-8 bg-[#EBE5D9] rounded w-64"></div>
                                        <div className="h-4 bg-[#EBE5D9] rounded w-24"></div>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="h-4 bg-[#EBE5D9] rounded w-full"></div>
                                    <div className="h-4 bg-[#EBE5D9] rounded w-full"></div>
                                    <div className="h-4 bg-[#EBE5D9] rounded w-5/6"></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 w-full max-w-3xl mx-auto pb-8 relative bg-[#F5F2EB] flex-shrink-0">
                {/* Suggested Chips (Only show if no user messages yet) */}
                {hasSources && messages.filter(m => m.role === 'user').length === 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide mb-2">
                        {['What are the key takeaways?', 'Summarize the main points', 'Explain the technical concepts'].map((q, i) => (
                            <button key={i} onClick={() => onSendMessage(q)} className="flex-shrink-0 bg-white hover:bg-[#EBE5D9] border border-[#D6D1C7] px-4 py-2 rounded-xl text-xs text-[#2C2A26] transition-colors text-left whitespace-nowrap shadow-sm">
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
                    <p className="text-[10px] text-[#2C2A26]/30">
                        InsightsLM can be inaccurate; please double check its responses.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ChatPanel;
