import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MessageCircle, Clock } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import {
  useMindCoachStore,
  type MindCoachSession,
  type ChatMessage as ChatMessageType,
} from '../../../store/mindCoachStore';
import { TherapistChat } from '../Chat/TherapistChat';
import { PlanProposalModal } from '../PlanProposalModal';

export const SessionsScreen: React.FC = () => {
  const profile = useMindCoachStore((s) => s.profile);
  const journey = useMindCoachStore((s) => s.journey);
  const sessions = useMindCoachStore((s) => s.sessions);
  const activeSession = useMindCoachStore((s) => s.activeSession);
  const setActiveSession = useMindCoachStore((s) => s.setActiveSession);
  const setSessions = useMindCoachStore((s) => s.setSessions);
  const setMessages = useMindCoachStore((s) => s.setMessages);
  const [starting, setStarting] = useState(false);
  const [showProposal, setShowProposal] = useState(false);

  const completedSessions = sessions.filter((s) => s.session_state === 'completed');
  const currentPhase = journey?.current_phase ?? 1;

  const handleStartSession = useCallback(async () => {
    if (!profile || starting) return;
    setStarting(true);

    const completedInPhase = sessions.filter(
      (s) => s.session_state === 'completed' && s.phase_number === currentPhase
    ).length;

    const newSession: Partial<MindCoachSession> = {
      profile_id: profile.id,
      journey_id: journey?.id ?? null,
      phase_number: currentPhase,
      session_number: completedInPhase + 1,
      session_state: 'intake',
      message_count: 0,
    };

    const { data, error } = await supabase
      .from('mind_coach_sessions')
      .insert(newSession)
      .select()
      .single();

    if (!error && data) {
      setActiveSession(data);
      setSessions([data, ...sessions]);
      setMessages([]);
    }

    setStarting(false);
  }, [profile, journey, sessions, currentPhase, starting, setActiveSession, setSessions, setMessages]);

  const handleResumeSession = useCallback(
    async (session: MindCoachSession) => {
      setActiveSession(session);

      const { data } = await supabase
        .from('mind_coach_messages')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true });

      setMessages((data as ChatMessageType[]) ?? []);
    },
    [setActiveSession, setMessages]
  );

  const handleBack = useCallback(() => {
    setActiveSession(null);
    setMessages([]);
  }, [setActiveSession, setMessages]);

  if (activeSession) {
    return (
      <>
        <TherapistChat
          onBack={handleBack}
          onViewProposal={() => setShowProposal(true)}
        />
        <AnimatePresence>
          {showProposal && (
            <PlanProposalModal
              onClose={() => setShowProposal(false)}
              onAccept={() => {
                setShowProposal(false);
                // Return to sessions list so they can easily start the newly provisioned Phase 1 Session 1
                handleBack();
              }}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[#2C2A26]">Sessions</h2>
        <button
          onClick={handleStartSession}
          disabled={starting}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-[#6B8F71] text-white text-sm font-medium rounded-xl hover:bg-[#5A7D60] disabled:opacity-50 transition-colors"
        >
          <Plus size={14} />
          New Session
        </button>
      </div>

      {/* Active (non-completed) sessions */}
      {sessions
        .filter((s) => s.session_state !== 'completed')
        .map((session) => (
          <motion.button
            key={session.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => handleResumeSession(session)}
            className="w-full bg-[#6B8F71]/5 border border-[#6B8F71]/20 rounded-2xl p-4 text-left hover:border-[#6B8F71]/40 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-[#6B8F71] animate-pulse" />
              <span className="text-xs font-medium text-[#6B8F71] uppercase">In Progress</span>
            </div>
            <p className="text-sm font-medium text-[#2C2A26]">
              {session.dynamic_theme ?? `Session ${session.session_number}`}
            </p>
            <p className="text-xs text-[#2C2A26]/40 mt-1">
              {session.message_count} messages · Phase {session.phase_number}
            </p>
          </motion.button>
        ))}

      {/* Completed sessions */}
      {completedSessions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[#2C2A26]/40 uppercase tracking-wide">
            Past Sessions
          </p>
          {completedSessions.map((session, i) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-white rounded-2xl p-4 border border-[#E8E4DE]"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#F5F0EB] flex items-center justify-center shrink-0">
                  <MessageCircle size={16} className="text-[#2C2A26]/40" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#2C2A26] truncate">
                    {session.dynamic_theme ?? `Session ${session.session_number}`}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock size={11} className="text-[#2C2A26]/30" />
                    <span className="text-xs text-[#2C2A26]/40">
                      {new Date(session.started_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="text-xs text-[#2C2A26]/30">·</span>
                    <span className="text-xs text-[#2C2A26]/40">
                      Phase {session.phase_number}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {sessions.length === 0 && (
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-full bg-[#F5F0EB] flex items-center justify-center mx-auto mb-3">
            <MessageCircle size={24} className="text-[#2C2A26]/25" />
          </div>
          <p className="text-sm text-[#2C2A26]/50">No sessions yet</p>
          <p className="text-xs text-[#2C2A26]/30 mt-1">Start your first session to begin your journey</p>
        </div>
      )}
    </div>
  );
};
