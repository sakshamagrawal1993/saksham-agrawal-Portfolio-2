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

const STATUS_COPY: Record<string, string> = {
    started: 'Connecting to Dr. Jivi...',
    checking_safety_and_generating: 'Checking safety and drafting the next question...',
    safety_passed: 'Safety check passed...',
    generating_question: 'Drafting the next question...',
    running_diagnosis: 'Preparing your clinical summary...',
    emergency_end: 'Safety alert...',
};

export const AICareChat: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [, setUser] = useState<any>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [statusText, setStatusText] = useState<string | null>(null);
    const [streamingText, setStreamingText] = useState('');
    const [initializing, setInitializing] = useState(true);
    const [emergencyAlert, setEmergencyAlert] = useState<string | null>(null);
    const [resumePrompt, setResumePrompt] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const initKeyRef = useRef<string | null>(null);

    const requestedSessionId = searchParams.get('sessionId');
    const forceNew = searchParams.get('new') === '1';

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, resumePrompt, streamingText, statusText]);

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

    const invokeProxyJson = async (body: Record<string, unknown>, attempts = 3) => {
        let lastError: unknown = null;
        for (let i = 0; i < attempts; i++) {
            try {
                const { data, error } = await supabase.functions.invoke('ai-care-proxy', { body });
                if (error) {
                    const status = (error as any)?.context?.status ?? (error as any)?.status;
                    const msg = String((error as any)?.message || error || '');
                    const retryable =
                        status === 502 || status === 503 || status === 504 ||
                        /503|502|504|Failed to send a request|FunctionsFetchError|network|fetch|Service Unavailable/i.test(msg);
                    if (retryable && i < attempts - 1) {
                        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
                        continue;
                    }
                    throw error;
                }
                return data;
            } catch (error) {
                lastError = error;
                const status = (error as any)?.context?.status ?? (error as any)?.status;
                const msg = String((error as any)?.message || error || '');
                const retryable =
                    status === 502 || status === 503 || status === 504 ||
                    /503|502|504|Failed to send a request|FunctionsFetchError|network|fetch|Service Unavailable/i.test(msg);
                if (!retryable || i === attempts - 1) throw error;
                await new Promise((r) => setTimeout(r, 800 * (i + 1)));
            }
        }
        throw lastError;
    };

    /** Prefer SSE so the UI can show live status / tokens while n8n works. */
    const invokeProxyStream = async (body: Record<string, unknown>) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-care-proxy`;
        let lastError: unknown = null;

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`,
                        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                    },
                    body: JSON.stringify({ ...body, stream: true }),
                });

                if (!res.ok) {
                    const retryable = res.status === 502 || res.status === 503 || res.status === 504;
                    if (retryable && attempt < 2) {
                        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
                        continue;
                    }
                    throw new Error(`Proxy HTTP ${res.status}`);
                }

                if (!res.body) throw new Error('No stream body');

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let finalPayload: any = null;
                let eventName = 'message';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });

                    const parts = buffer.split('\n');
                    buffer = parts.pop() || '';

                    for (const line of parts) {
                        if (line.startsWith('event:')) {
                            eventName = line.slice(6).trim();
                            continue;
                        }
                        if (!line.startsWith('data:')) continue;
                        const raw = line.slice(5).trim();
                        if (!raw) continue;
                        let data: any;
                        try {
                            data = JSON.parse(raw);
                        } catch {
                            continue;
                        }

                        if (eventName === 'status' && data?.state) {
                            setStatusText(STATUS_COPY[data.state] || 'Dr. Jivi is working...');
                        } else if (eventName === 'token' && typeof data?.text === 'string') {
                            setStatusText(null);
                            setStreamingText((prev) => prev + data.text);
                        } else if (eventName === 'final') {
                            finalPayload = data;
                        }
                        eventName = 'message';
                    }
                }

                if (!finalPayload) throw new Error('Stream ended without final event');
                return finalPayload;
            } catch (error) {
                lastError = error;
                const msg = String((error as any)?.message || error || '');
                const retryable = /503|502|504|Failed to fetch|network|Proxy HTTP 50/i.test(msg);
                if (!retryable || attempt === 2) break;
                await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
            }
        }

        // Fallback to JSON path if streaming fails
        console.warn('SSE path failed, falling back to JSON', lastError);
        setStatusText('Finishing response...');
        return invokeProxyJson({ ...body, stream: false });
    };

    const beginFreshSession = async (userId: string) => {
        setLoading(true);
        setStatusText('Starting a new evaluation...');
        try {
            await closeOtherActiveSessions(userId);
            const data = await invokeProxyJson({ action: 'start_session', user_id: userId });

            setSessionId(data.session_id);
            setResumePrompt(false);
            await loadMessages(data.session_id);

            if (forceNew || requestedSessionId) {
                setSearchParams({}, { replace: true });
            }
        } finally {
            setLoading(false);
            setStatusText(null);
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

    const applyProxyResult = (data: any) => {
        if (data?.emergency || data?.state === 'emergency_end') {
            setEmergencyAlert(data.message || 'Please seek emergency care now.');
            return;
        }
        if (data?.diagnosis_ready || data?.state === 'diagnosis_ready') {
            navigate('/ai-care/observations');
            return;
        }
        if (data?.next_question) {
            setMessages((prev) => [...prev, {
                id: `${Date.now()}a`,
                role: 'assistant',
                content: data.next_question,
                options: Array.isArray(data.options) ? data.options : [],
            }]);
            return;
        }
        throw new Error(data?.error || 'Empty response from Dr. Jivi');
    };

    const sendMessage = async (text: string) => {
        if (!text.trim() || !sessionId || emergencyAlert || resumePrompt || loading) return;

        const optimisticMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text };
        setMessages((prev) => [...prev, optimisticMsg]);
        setInputValue('');
        setLoading(true);
        setStreamingText('');
        setStatusText('Sending...');

        try {
            const data = await invokeProxyStream({
                action: 'send_message',
                session_id: sessionId,
                message: text,
            });
            setStreamingText('');
            applyProxyResult(data);
        } catch (error) {
            console.error('Failed to send message', error);
            setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
            alert('Dr. Jivi is temporarily unavailable. Please try again in a moment.');
        } finally {
            setLoading(false);
            setStatusText(null);
            setStreamingText('');
        }
    };

    const currentOptions = !resumePrompt && !loading && messages.length > 0 && messages[messages.length - 1].role === 'assistant'
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

                {streamingText && (
                    <div className="flex justify-start">
                        <div className="max-w-[85%] px-5 py-4 rounded-2xl bg-white border border-[#EBE7DE] text-[#2C2A26] rounded-tl-sm shadow-sm text-[15px] leading-relaxed">
                            {streamingText}
                            <span className="inline-block w-1.5 h-4 ml-0.5 bg-[#A84A00]/70 animate-pulse align-middle" />
                        </div>
                    </div>
                )}

                {(loading || initializing) && !streamingText && (
                    <div className="flex justify-start">
                        <div className="max-w-[85%] px-5 py-4 rounded-2xl bg-white border border-[#EBE7DE] text-[#2C2A26] rounded-tl-sm shadow-sm flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-[#A84A00]" />
                            <span className="text-[#A8A29E] text-sm">
                                {initializing
                                    ? 'Starting chat...'
                                    : statusText || 'Dr. Jivi is typing...'}
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
                                className="bg-white border border-[#EBE7DE] text-[#2C2A26] text-sm px-4 py-3 rounded-2xl hover:border-[#A84A00] transition-colors text-left shadow-sm flex-1 min-w-[200px] disabled:opacity-50"
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
                        onKeyDown={e => e.key === 'Enter' && !loading && sendMessage(inputValue)}
                        disabled={loading || initializing || !!emergencyAlert || resumePrompt}
                        placeholder={resumePrompt ? 'Continue or start a new chat above' : 'Describe your issue'}
                        className="w-full bg-white border border-[#EBE7DE] rounded-full pl-6 pr-14 py-4 focus:outline-none focus:border-[#A84A00] focus:ring-1 focus:ring-[#A84A00] shadow-sm text-[#2C2A26] disabled:opacity-60"
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
