import React, { useRef, useEffect, useState } from 'react';
import { ArrowLeft, Send, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../../lib/supabaseClient';
import {
  useMindCoachStore,
  type ChatMessage as ChatMessageType,
  type TherapistPersona,
} from '../../../store/mindCoachStore';
import { ChatMessage } from './ChatMessage';

const THERAPIST_META: Record<
  TherapistPersona,
  { name: string; color: string; style: string }
> = {
  maya: { name: 'Maya', color: '#B4A7D6', style: 'Warm & Empathetic' },
  alex: { name: 'Alex', color: '#D4A574', style: 'Direct & Solution-focused' },
  sage: { name: 'Sage', color: '#6B8F71', style: 'Calm & Mindful' },
};

const MOCK_REPLY =
  "I hear you. That sounds really important. Can you tell me more about how that makes you feel?";

interface TherapistChatProps {
  onBack: () => void;
  onViewProposal?: () => void;
}

export const TherapistChat: React.FC<TherapistChatProps> = ({ onBack, onViewProposal }) => {
  const profile = useMindCoachStore((s) => s.profile);
  const journey = useMindCoachStore((s) => s.journey);
  const activeSession = useMindCoachStore((s) => s.activeSession);
  const messages = useMindCoachStore((s) => s.messages);
  const isLoading = useMindCoachStore((s) => s.isLoading);
  const addMessage = useMindCoachStore((s) => s.addMessage);
  const setIsLoading = useMindCoachStore((s) => s.setIsLoading);
  const updateActiveSession = useMindCoachStore((s) => s.updateActiveSession);
  const setActiveSession = useMindCoachStore((s) => s.setActiveSession);
  const setSessions = useMindCoachStore((s) => s.setSessions);
  const sessions = useMindCoachStore((s) => s.sessions);
  const setCrisisDetected = useMindCoachStore((s) => s.setCrisisDetected);

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const persona = profile?.therapist_persona ?? 'maya';
  const meta = THERAPIST_META[persona];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !activeSession || isLoading) return;

    setInput('');

    const userMsg: ChatMessageType = {
      id: crypto.randomUUID(),
      session_id: activeSession.id,
      role: 'user',
      content: text,
      guardrail_status: null,
      created_at: new Date().toISOString(),
    };
    addMessage(userMsg);
    updateActiveSession({ message_count: activeSession.message_count + 1 });
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('mind-coach-chat', {
        body: {
          profile_id: profile?.id,
          session_id: activeSession.id,
          message_text: text,
          profile: profile ? {
            name: profile.name,
            age: profile.age,
            gender: profile.gender,
            concerns: profile.concerns,
            therapist_persona: profile.therapist_persona,
          } : null,
          journey_context: journey ? {
            id: journey.id,
            title: journey.title,
            current_phase: journey.current_phase,
            phases: journey.phases,
          } : null,
          session_state: activeSession.session_state,
          dynamic_theme: activeSession.dynamic_theme,
          pathway: activeSession.pathway,
        },
      });

      if (error || !data?.reply) throw new Error('Edge function failed');

      const assistantMsg: ChatMessageType = {
        id: crypto.randomUUID(),
        session_id: activeSession.id,
        role: 'assistant',
        content: data.reply,
        guardrail_status: data.guardrail_status ?? 'passed',
        created_at: new Date().toISOString(),
      };
      addMessage(assistantMsg);
      updateActiveSession({ message_count: activeSession.message_count + 2 });

      if (data.session_state) {
        updateActiveSession({ session_state: data.session_state });
      }
      if (data.dynamic_theme) {
        updateActiveSession({ dynamic_theme: data.dynamic_theme });
      }
      if (data.pathway) {
        updateActiveSession({ pathway: data.pathway });
      }
      if (typeof data.pathway_confidence === 'number') {
        updateActiveSession({ pathway_confidence: data.pathway_confidence });
      }
      if (data.crisis_detected) {
        setCrisisDetected(true);
      }
    } catch {
      const fallbackMsg: ChatMessageType = {
        id: crypto.randomUUID(),
        session_id: activeSession.id,
        role: 'assistant',
        content: MOCK_REPLY,
        guardrail_status: null,
        created_at: new Date().toISOString(),
      };
      addMessage(fallbackMsg);
      updateActiveSession({ message_count: activeSession.message_count + 2 });
    } finally {
      setIsLoading(false);
    }
  };

  const [showSummary, setShowSummary] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<Record<string, any> | null>(null);
  const [endingSession, setEndingSession] = useState(false);

  const handleEndSession = async () => {
    if (!activeSession || !profile || endingSession) return;
    setEndingSession(true);

    try {
      const { data, error } = await supabase.functions.invoke('mind-coach-session-end', {
        body: {
          session_id: activeSession.id,
          profile_id: profile.id,
        },
      });

      if (!error && data?.session_summary) {
        setSessionSummary(data.session_summary);
        setShowSummary(true);
      }

      const updated = {
        ...activeSession,
        session_state: 'completed' as const,
        ended_at: new Date().toISOString(),
        case_notes: data?.case_notes ?? null,
        summary_data: data?.session_summary ?? null,
      };
      setSessions(sessions.map((s) => (s.id === updated.id ? updated : s)));
      setActiveSession(null);
    } catch {
      const updated = {
        ...activeSession,
        session_state: 'completed' as const,
        ended_at: new Date().toISOString(),
      };
      setSessions(sessions.map((s) => (s.id === updated.id ? updated : s)));
      setActiveSession(null);
      onBack();
    } finally {
      setEndingSession(false);
    }
  };

  const handleCloseSummary = () => {
    setShowSummary(false);
    setSessionSummary(null);
    onBack();
  };

  const showEndSession = activeSession && activeSession.message_count >= 10 && activeSession.pathway !== 'engagement_rapport_and_assessment';

  if (showSummary && sessionSummary) {
    return (
      <div className="flex flex-col h-full bg-[#F9F6F2]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8E4DE] bg-white/80 backdrop-blur-sm shrink-0">
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#2C2A26]">Session Complete</p>
          </div>
          <button
            onClick={handleCloseSummary}
            className="text-[#2C2A26]/60 hover:text-[#2C2A26] text-sm font-medium"
          >
            Done
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <h3 className="text-lg font-semibold text-[#2C2A26] mb-1">
              {sessionSummary.title || 'Session Summary'}
            </h3>
            {sessionSummary.opening_reflection && (
              <p className="text-sm text-[#2C2A26]/70 leading-relaxed">
                {sessionSummary.opening_reflection}
              </p>
            )}
          </motion.div>

          {sessionSummary.key_themes?.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl p-4 border border-[#E8E4DE]">
              <p className="text-xs font-medium text-[#2C2A26]/50 uppercase mb-2">Themes Explored</p>
              <div className="flex flex-wrap gap-2">
                {sessionSummary.key_themes.map((theme: string, i: number) => (
                  <span key={i} className="px-3 py-1 bg-[#6B8F71]/10 text-[#6B8F71] text-xs font-medium rounded-full">
                    {theme}
                  </span>
                ))}
              </div>
            </motion.div>
          )}

          {sessionSummary.growth_moments?.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-2xl p-4 border border-[#E8E4DE]">
              <p className="text-xs font-medium text-[#2C2A26]/50 uppercase mb-2">Growth Moments</p>
              <ul className="space-y-2">
                {sessionSummary.growth_moments.map((m: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[#2C2A26]/80">
                    <span className="text-[#6B8F71] mt-0.5">&#10003;</span>
                    {m}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {sessionSummary.gentle_challenge && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-[#F5F0EB] rounded-2xl p-4">
              <p className="text-xs font-medium text-[#2C2A26]/50 uppercase mb-2">Reflection for Next Time</p>
              <p className="text-sm text-[#2C2A26]/80 italic">{sessionSummary.gentle_challenge}</p>
            </motion.div>
          )}

          {sessionSummary.phase_specific && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-white rounded-2xl p-4 border border-[#E8E4DE]">
              <p className="text-xs font-medium text-[#2C2A26]/50 uppercase mb-2">Phase Progress</p>
              <p className="text-xs font-medium text-[#6B8F71] mb-1">{sessionSummary.phase_specific.phase_name}</p>
              <p className="text-sm text-[#2C2A26]/70">{sessionSummary.phase_specific.progress_summary}</p>
            </motion.div>
          )}

          {sessionSummary.therapist_note && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-white rounded-2xl p-4 border border-[#E8E4DE]">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                  style={{ backgroundColor: meta.color }}
                >
                  {meta.name[0]}
                </div>
                <p className="text-xs font-medium text-[#2C2A26]/50">Note from {meta.name}</p>
              </div>
              <p className="text-sm text-[#2C2A26]/80 italic">{sessionSummary.therapist_note}</p>
            </motion.div>
          )}

          {sessionSummary.mood_shift && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="flex items-center justify-center gap-3 py-3">
              <span className="text-sm text-[#2C2A26]/60">{sessionSummary.mood_shift.start}</span>
              <span className="text-[#6B8F71]">&rarr;</span>
              <span className="text-sm font-medium text-[#6B8F71]">{sessionSummary.mood_shift.end}</span>
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8E4DE] bg-white/80 backdrop-blur-sm shrink-0">
        <button onClick={onBack} className="text-[#2C2A26]/60 hover:text-[#2C2A26]">
          <ArrowLeft size={20} />
        </button>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold"
          style={{ backgroundColor: meta.color }}
        >
          {meta.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#2C2A26]">{meta.name}</p>
          <p className="text-xs text-[#6B8F71]">Online</p>
        </div>
      </div>

      {/* Assessment/Thematic Compass UI */}
      {activeSession?.pathway === 'engagement_rapport_and_assessment' && (
        <div className="bg-[#FAF9F7] border-b border-[#E8E4DE] px-4 py-3 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2C2A26]/80 uppercase tracking-wide">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
              </svg>
              Clinical Insight
            </div>
            {activeSession.pathway_confidence !== undefined && (
              <span className="text-[10px] uppercase font-bold text-[#6B8F71] bg-[#6B8F71]/10 px-2 py-0.5 rounded-full">
                {activeSession.pathway_confidence < 40 ? 'Listening' :
                  activeSession.pathway_confidence < 80 ? 'Connecting' :
                    'Formulating'}
              </span>
            )}
          </div>

          <div className="text-sm text-[#2C2A26] mb-2">
            <span className="text-[#2C2A26]/50">Exploring: </span>
            <span className="font-medium">{activeSession.dynamic_theme || 'Understanding your story...'}</span>
          </div>

          {(activeSession.pathway_confidence !== undefined && activeSession.pathway_confidence >= 80) || activeSession.message_count >= 10 ? (
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="pt-2 border-t border-[#E8E4DE]">
              <p className="text-sm text-[#2C2A26]/80 mb-2">
                I have gathered enough context to propose a highly personalized therapy plan for you.
              </p>
              <button
                onClick={onViewProposal}
                className="w-full py-2 bg-[#2C2A26] text-white text-sm font-medium rounded-xl hover:bg-[#2C2A26]/90 transition-colors"
                disabled={!onViewProposal}
              >
                View Therapy Proposal
              </button>
            </motion.div>
          ) : (
            <div className="text-xs text-[#2C2A26]/40 italic">
              Share openly. A personalized path will be revealed soon.
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-[#2C2A26]/40 mt-10">
            Start the conversation — {meta.name} is here to listen.
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            therapistColor={meta.color}
            therapistInitial={meta.name[0]}
          />
        ))}
        {isLoading && (
          <div className="flex gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
              style={{ backgroundColor: meta.color }}
            >
              {meta.name[0]}
            </div>
            <div className="bg-white border border-[#E8E4DE] rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-[#2C2A26]/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-[#2C2A26]/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-[#2C2A26]/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* End Session Pill */}
      <AnimatePresence>
        {showEndSession && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex justify-center pb-2"
          >
            <button
              onClick={handleEndSession}
              disabled={endingSession}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#2C2A26]/8 hover:bg-[#2C2A26]/15 rounded-full text-xs font-medium text-[#2C2A26]/70 transition-colors disabled:opacity-50"
            >
              <X size={12} />
              {endingSession ? 'Wrapping up...' : 'End Session'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="px-3 py-3 border-t border-[#E8E4DE] bg-white shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type a message…"
            className="flex-1 px-4 py-2.5 text-sm bg-[#F5F0EB] rounded-full outline-none placeholder:text-[#2C2A26]/30 text-[#2C2A26]"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-[#6B8F71] text-white disabled:opacity-40 transition-opacity"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
