import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { ChevronLeft, Mic, Loader2, AlertTriangle } from 'lucide-react';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    options?: string[];
}

export const AICareChat: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [, setUser] = useState<any>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [initializing, setInitializing] = useState(true);
    const [emergencyAlert, setEmergencyAlert] = useState<string | null>(null);
    const [resumePrompt, setResumePrompt] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const initKeyRef = useRef<string | null>(null);

    const requestedSessionId = searchParams.get('sessionId');
    const forceNew = searchParams.get('new') === '1';

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, resumePrompt]);

    useEffect(() => {
        const initKey = `${forceNew ? 'new' : 'resume'}:${requestedSessionId || ''}`;
        if (initKeyRef.current === initKey) return;
        initKeyRef.current = initKey;

        const initChat = async () => {
            setInitializing(true);
            setEmergencyAlert(null);
            setResumePrompt(false);
            setMessages([]);
            setSessionId(null);

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate('/login?redirect=/ai-care/chat');
                return;
            }
            setUser(session.user);

            try {
                if (requestedSessionId && !forceNew) {
                    await resumeSession(session.user.id, requestedSessionId);
                } else {
                    await beginFreshSession(session.user.id);
                }
            } catch (error) {
                console.error('Failed to init chat', error);
            } finally {
                setInitializing(false);
            }
        };

        initChat();
    }, [navigate, requestedSessionId, forceNew]);

    const closeOtherActiveSessions = async (userId: string, keepId?: string) => {
        let query = supabase
            .from('jivi_chat_sessions')
            .update({ status: 'abandoned' })
            .eq('user_id', userId)
            .eq('status', 'active');
        if (keepId) query = query.neq('id', keepId);
        await query;
    };

    const loadMessages = async (id: string) => {
        const { data: history } = await supabase
            .from('jivi_chat_messages')
            .select('*')
            .eq('session_id', id)
            .order('created_at', { ascending: true });
        if (history) {
            setMessages(history.filter((m: ChatMessage) => m.role !== 'system'));
        }
    };

    const beginFreshSession = async (userId: string) => {
        setLoading(true);
        try {
            await closeOtherActiveSessions(userId);
            const { data, error } = await supabase.functions.invoke('ai-care-proxy', {
                body: { action: 'start_session', user_id: userId },
            });
            if (error) throw error;

            setSessionId(data.session_id);
            setResumePrompt(false);
            await loadMessages(data.session_id);

            // Drop query flags so refresh doesn't keep forcing new forever
            if (forceNew || requestedSessionId) {
                setSearchParams({}, { replace: true });
            }
        } finally {
            setLoading(false);
        }
    };

    const resumeSession = async (userId: string, id: string) => {
        const { data: existing, error } = await supabase
            .from('jivi_chat_sessions')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .maybeSingle();

        if (error || !existing) {
            await beginFreshSession(userId);
            return;
        }

        if (existing.status === 'completed' || existing.status === 'emergency_stopped') {
            navigate(`/ai-care/observations?sessionId=${id}`);
            return;
        }

        setSessionId(existing.id);
        await loadMessages(existing.id);
        // Ask to continue when reopening an in-progress evaluation
        setResumePrompt(true);
    };

    const handleContinue = () => {
        setResumePrompt(false);
    };

    const handleStartNewInstead = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        initKeyRef.current = null;
        setResumePrompt(false);
        navigate('/ai-care/chat?new=1', { replace: true });
    };

    const sendMessage = async (text: string) => {
        if (!text.trim() || !sessionId || emergencyAlert || resumePrompt) return;

        const optimisticMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text };
        setMessages(prev => [...prev, optimisticMsg]);
        setInputValue('');
        setLoading(true);

        try {
            const { data, error } = await supabase.functions.invoke('ai-care-proxy', {
                body: {
                    action: 'send_message',
                    session_id: sessionId,
                    message: text,
                    stream: false,
                },
            });

            if (error) throw error;

            if (data?.emergency) {
                setEmergencyAlert(data.message || 'Please seek emergency care now.');
            } else if (data?.diagnosis_ready) {
                navigate('/ai-care/observations');
            } else if (data?.next_question) {
                setMessages(prev => [...prev, {
                    id: `${Date.now()}a`,
                    role: 'assistant',
                    content: data.next_question,
                    options: Array.isArray(data.options) ? data.options : [],
                }]);
            } else {
                throw new Error(data?.error || 'Empty response from Dr. Jivi');
            }
        } catch (error) {
            console.error('Failed to send message', error);
            alert('Failed to connect to Dr. Jivi. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const currentOptions = !resumePrompt && messages.length > 0 && messages[messages.length - 1].role === 'assistant'
        ? messages[messages.length - 1].options
        : [];

    return (
        <div className="h-screen bg-[#F5F2EB] font-sans text-[#2C2A26] flex flex-col overflow-hidden">
            <header className="sticky top-0 z-50 bg-[#F5F2EB]/90 backdrop-blur-md border-b flex items-center justify-between px-6 py-4 border-[#EBE7DE]">
                <div className="flex items-center gap-2">
                    <button onClick={() => navigate('/ai-care')} className="mr-2 p-1">
                        <ChevronLeft className="w-5 h-5 text-[#A8A29E] hover:text-[#2C2A26] transition-colors" />
                    </button>
                    <div className="bg-[#2C2A26] rounded-sm text-[#F5F2EB] font-serif w-8 h-8 flex items-center justify-center font-bold">
                        J
                    </div>
                    <span className="font-serif text-lg font-bold tracking-tight text-[#2C2A26]">Dr. Jivi</span>
                </div>

                <div className="flex items-center gap-6">
                    <button
                        onClick={() => navigate('/ai-care')}
                        className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A8A29E] hover:text-[#2C2A26] transition-colors hidden sm:block"
                    >
                        BACK TO AI CARE
                    </button>
                </div>
            </header>

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

                {resumePrompt && (
                    <div className="bg-white border border-[#EBE7DE] rounded-2xl p-5 shadow-sm">
                        <h3 className="font-serif text-lg font-bold mb-1">Continue this evaluation?</h3>
                        <p className="text-sm text-[#A8A29E] mb-4">
                            You have an active screening in progress. Continue where you left off, or start a new chat.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={handleContinue}
                                className="bg-[#A84A00] text-white text-sm px-5 py-2.5 rounded-full hover:bg-[#8A3D00] transition-colors"
                            >
                                Continue
                            </button>
                            <button
                                onClick={handleStartNewInstead}
                                className="bg-white border border-[#EBE7DE] text-[#2C2A26] text-sm px-5 py-2.5 rounded-full hover:border-[#A84A00] transition-colors"
                            >
                                Start new chat
                            </button>
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

                {(loading || initializing) && (
                    <div className="flex justify-start">
                        <div className="max-w-[85%] px-5 py-4 rounded-2xl bg-white border border-[#EBE7DE] text-[#2C2A26] rounded-tl-sm shadow-sm flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-[#A84A00]" />
                            <span className="text-[#A8A29E] text-sm">
                                {initializing ? 'Starting chat...' : 'Dr. Jivi is typing...'}
                            </span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-[#F5F2EB] border-t border-[#EBE7DE] shrink-0">
                {!emergencyAlert && !resumePrompt && currentOptions && currentOptions.length > 0 && (
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
                        disabled={loading || initializing || !!emergencyAlert || resumePrompt}
                        placeholder={resumePrompt ? 'Continue or start a new chat above' : 'Describe your issue'}
                        className="w-full bg-white border border-[#EBE7DE] rounded-full pl-6 pr-14 py-4 focus:outline-none focus:border-[#A84A00] focus:ring-1 focus:ring-[#A84A00] shadow-sm text-[#2C2A26]"
                    />
                    <button
                        onClick={() => sendMessage(inputValue)}
                        disabled={loading || initializing || !!emergencyAlert || resumePrompt || !inputValue.trim()}
                        className="absolute right-2 top-2 bottom-2 aspect-square rounded-full bg-[#A84A00] text-white flex items-center justify-center hover:bg-[#8A3D00] disabled:opacity-50 transition-colors"
                    >
                        <Mic className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
};
