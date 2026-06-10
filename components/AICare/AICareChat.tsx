import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { ChevronLeft, Plus, Volume2, Mic, Loader2, AlertTriangle } from 'lucide-react';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    options?: string[];
}

export const AICareChat: React.FC = () => {
    const navigate = useNavigate();
    const [, setUser] = useState<any>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [emergencyAlert, setEmergencyAlert] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const initChat = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate('/login?redirect=/ai-care/chat');
                return;
            }
            setUser(session.user);

            // Fetch active session or start a new one via Edge Function
            const { data: activeSession } = await supabase
                .from('jivi_chat_sessions')
                .select('*')
                .eq('user_id', session.user.id)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (activeSession) {
                setSessionId(activeSession.id);
                // Fetch messages
                const { data: history } = await supabase
                    .from('jivi_chat_messages')
                    .select('*')
                    .eq('session_id', activeSession.id)
                    .order('created_at', { ascending: true });
                if (history) setMessages(history.filter((m: ChatMessage) => m.role !== 'system'));
            } else {
                startNewSession(session.user.id);
            }
        };
        initChat();
    }, [navigate]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const startNewSession = async (userId: string) => {
        setLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('ai-care-proxy', {
                body: { action: 'start_session', user_id: userId }
            });

            if (error) throw error;

            setSessionId(data.session_id);
            // Re-fetch messages since edge function creates the first one
            const { data: history } = await supabase
                .from('jivi_chat_messages')
                .select('*')
                .eq('session_id', data.session_id)
                .order('created_at', { ascending: true });
            if (history) setMessages(history);
        } catch (error) {
            console.error('Failed to start session', error);
        } finally {
            setLoading(false);
        }
    };

    const sendMessage = async (text: string) => {
        if (!text.trim() || !sessionId || emergencyAlert) return;

        const optimisticMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text };
        setMessages(prev => [...prev, optimisticMsg]);
        setInputValue('');
        setLoading(true);

        try {
            const { data, error } = await supabase.functions.invoke('ai-care-proxy', {
                body: { action: 'send_message', session_id: sessionId, message: text }
            });

            if (error) throw error;

            if (data.emergency) {
                setEmergencyAlert(data.message);
            } else if (data.diagnosis_ready) {
                navigate('/ai-care/observations');
            } else {
                // Fetch the newly added assistant message from DB, or just use the response
                const assistantMsg: ChatMessage = {
                    id: Date.now().toString() + 'a',
                    role: 'assistant',
                    content: data.next_question,
                    options: data.options
                };
                setMessages(prev => [...prev, assistantMsg]);
            }
        } catch (error) {
            console.error('Failed to send message', error);
            alert('Failed to connect to Dr. Jivi. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const currentOptions = messages.length > 0 && messages[messages.length - 1].role === 'assistant' 
        ? messages[messages.length - 1].options 
        : [];

    return (
        <div className="h-screen bg-[#F5F2EB] font-sans text-[#2C2A26] flex flex-col overflow-hidden">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#F5F2EB]/90 backdrop-blur-md border-b flex items-center justify-between px-6 py-4 border-[#EBE7DE]">
                <div className="flex items-center gap-2">
                    <button onClick={() => navigate('/portfolio')} className="mr-2 p-1">
                        <ChevronLeft className="w-5 h-5 text-[#A8A29E] hover:text-[#2C2A26] transition-colors" />
                    </button>
                    <div className="bg-[#2C2A26] rounded-sm text-[#F5F2EB] font-serif w-8 h-8 flex items-center justify-center font-bold">
                        J
                    </div>
                    <span className="font-serif text-lg font-bold tracking-tight text-[#2C2A26]">Dr. Jivi</span>
                </div>

                <div className="flex items-center gap-6">
                    <button
                        onClick={() => navigate('/portfolio')}
                        className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A8A29E] hover:text-[#2C2A26] transition-colors hidden sm:block"
                    >
                        BACK TO PORTFOLIO
                    </button>
                </div>
            </header>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-4">
                {emergencyAlert && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md mb-4 shadow-sm flex items-start gap-3">
                        <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" />
                        <div>
                            <h3 className="text-red-800 font-semibold mb-1">Emergency Detected</h3>
                            <p className="text-red-700 text-sm">{emergencyAlert}</p>
                            <p className="text-red-700 text-sm font-bold mt-2">Please seek immediate medical attention or call emergency services.</p>
                        </div>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={msg.id || idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] px-5 py-4 rounded-2xl text-[15px] leading-relaxed shadow-sm ${
                            msg.role === 'user' 
                                ? 'bg-[#A84A00] text-white rounded-br-sm' 
                                : 'bg-white border border-[#EBE7DE] text-[#2C2A26] rounded-tl-sm'
                        }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                
                {loading && (
                    <div className="flex justify-start">
                        <div className="max-w-[85%] px-5 py-4 rounded-2xl bg-white border border-[#EBE7DE] text-[#2C2A26] rounded-tl-sm shadow-sm flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-[#A84A00]" />
                            <span className="text-[#A8A29E] text-sm">Dr. Jivi is typing...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Bottom Input Area */}
            <div className="p-4 bg-[#F5F2EB] border-t border-[#EBE7DE] shrink-0">
                {!emergencyAlert && currentOptions && currentOptions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                        {currentOptions.map((opt, i) => (
                            <button
                                key={i}
                                onClick={() => sendMessage(opt)}
                                disabled={loading}
                                className="bg-white border border-[#EBE7DE] text-[#2C2A26] text-sm px-4 py-3 rounded-2xl hover:border-[#A84A00] transition-colors text-left shadow-sm flex-1 min-w-[200px]"
                            >
                                {opt}
                            </button>
                        ))}
                    </div>
                )}

                <div className="relative">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendMessage(inputValue)}
                        disabled={loading || !!emergencyAlert}
                        placeholder="Describe your issue"
                        className="w-full bg-white border border-[#EBE7DE] rounded-full pl-6 pr-14 py-4 focus:outline-none focus:border-[#A84A00] focus:ring-1 focus:ring-[#A84A00] shadow-sm text-[#2C2A26]"
                    />
                    <button 
                        onClick={() => sendMessage(inputValue)}
                        disabled={loading || !!emergencyAlert || !inputValue.trim()}
                        className="absolute right-2 top-2 bottom-2 aspect-square rounded-full bg-[#A84A00] text-white flex items-center justify-center hover:bg-[#8A3D00] disabled:opacity-50 transition-colors"
                    >
                        <Mic className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
};
