import React, { useRef, useEffect, useState } from 'react';
import { ArrowLeft, Send, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../../lib/supabaseClient';
import {
  useMindCoachStore,
  type ChatMessage as ChatMessageType,
} from '../../../store/mindCoachStore';
import { ChatMessage } from './ChatMessage';
import { THERAPIST_CONFIG } from '../MindCoachConstants';

const MOCK_REPLY =
  "I hear you. That sounds really important. Can you tell me more about how that makes you feel?";

interface TherapistChatProps {
  onBack: () => void;
  onViewProposal?: () => void;
  onReturnHome?: () => void;
}

const PATHWAY_LABELS: Record<string, string> = {
  anxiety_and_stress_management: 'Anxiety & Stress Management',
  depression_and_behavioral_activation: 'Depression & Motivation',
  sleep_and_insomnia: 'Sleep & Insomnia',
  trauma_processing_and_ptsd: 'Trauma Processing',
  grief_and_loss_processing: 'Grief & Loss',
  relationship_conflict_and_interpersonal: 'Relationship Conflict',
  self_worth_and_self_esteem: 'Self-Worth & Esteem',
  social_anxiety_and_isolation: 'Social Anxiety',
  panic_and_physical_anxiety_symptoms: 'Panic & Physical Anxiety',
  emotion_regulation_and_distress_tolerance: 'Emotion Regulation',
  overthinking_rumination_and_cognitive_restructuring: 'Overthinking & Rumination',
  family_conflict_and_dynamics: 'Family Conflict',
  anger_management: 'Anger Management',
  boundary_setting_and_assertiveness: 'Boundary Setting',
  life_transition_and_adjustment: 'Life Transitions',
  identity_and_self_concept: 'Identity & Self-Concept',
  abuse_and_safety: 'Abuse & Safety',
  health_anxiety_and_somatic_symptoms: 'Health Anxiety',
  crisis_intervention_and_suicide_prevention: 'Crisis Support',
  engagement_rapport_and_assessment: 'Continued Exploration',
};

export const TherapistChat: React.FC<TherapistChatProps> = ({ onBack, onViewProposal, onReturnHome }) => {
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
  const isSessionClose = useMindCoachStore((s) => s.isSessionClose);
  const setIsSessionClose = useMindCoachStore((s) => s.setIsSessionClose);
  const isCrisisDetected = useMindCoachStore((s) => s.isCrisisDetected);
  const setActiveExercise = useMindCoachStore((s) => s.setActiveExercise);
  const setActiveExerciseMessageId = useMindCoachStore((s) => s.setActiveExerciseMessageId);
  const memories = useMindCoachStore((s) => s.memories);
  const activeTasks = useMindCoachStore((s) => s.activeTasks);
  const recentCaseNotes = useMindCoachStore((s) => s.recentCaseNotes);

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const persona = profile?.therapist_persona ?? 'maya';
  const meta = THERAPIST_CONFIG[persona];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    // Only trigger if session is brand new
    if (activeSession && messages.length === 0 && activeSession.message_count === 0 && !isLoading) {
      const sendInitialGreeting = async () => {
        setIsLoading(true);
        try {
          // 1. Fetch Prompts (Coach + Phase)
          const [personaRes, phaseRes] = await Promise.all([
            supabase
              .from('mind_coach_personas')
              .select('base_prompt')
              .eq('id', profile?.therapist_persona || 'maya')
              .maybeSingle(),
            supabase
              .from('mind_coach_pathway_phases')
              .select('dynamic_prompt')
              .eq('id', `${activeSession.pathway || 'engagement_rapport_and_assessment'}_phase${journey?.current_phase || 1}`)
              .maybeSingle(),
          ]);

          const coachPrompt = personaRes.data?.base_prompt || "You are an empathetic, non-judgmental mental health coach.";
          const phasePrompt = phaseRes.data?.dynamic_prompt || "Focus on building therapeutic rapport.";

          // 2. Call n8n directly
          const n8nPayload = {
            profile_id: profile?.id,
            session_id: activeSession.id,
            message_text: `System Alert: We are beginning the session. Introduce yourself and softly greet the user by name (${profile?.name || 'User'}) based on their context to kick off the session.`,
            is_system_greeting: true,
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
            messages: messages, // History
            memories: memories.map(m => ({ text: m.memory_text, type: m.memory_type })),
            recent_tasks_assigned: activeTasks,
            recent_case_notes: recentCaseNotes.map(n => n.key_insight).filter(Boolean),
            coach_prompt: coachPrompt,
            phase_prompt: phasePrompt,
            message_count: activeSession.message_count,
          };

          const response = await fetch('https://n8n.saksham-experiments.com/webhook/mind-coach-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(n8nPayload),
          });

          if (!response.ok) throw new Error(`n8n failed with ${response.status}`);
          const data = await response.json();

          if (!data?.reply) throw new Error('No reply from n8n');

          // 3. Persist assistant reply
          const assistantMsg: ChatMessageType = {
            id: crypto.randomUUID(),
            session_id: activeSession.id,
            role: 'assistant',
            content: data.reply,
            guardrail_status: data.guardrail_status ?? 'passed',
            dynamic_content: data.dynamic_content,
            created_at: new Date().toISOString(),
          };

          await supabase.from('mind_coach_messages').insert({
            id: assistantMsg.id,
            session_id: assistantMsg.session_id,
            role: assistantMsg.role,
            content: assistantMsg.content,
            dynamic_content: assistantMsg.dynamic_content,
          });

          addMessage(assistantMsg);
          
          // 4. Update session
          const sessionUpdate: any = { message_count: 1 };
          if (data.session_state) sessionUpdate.session_state = data.session_state;
          if (data.dynamic_theme) sessionUpdate.dynamic_theme = data.dynamic_theme;
          if (data.pathway) sessionUpdate.pathway = data.pathway;
          if (typeof data.pathway_confidence === 'number') sessionUpdate.pathway_confidence = data.pathway_confidence;

          await supabase.from('mind_coach_sessions').update(sessionUpdate).eq('id', activeSession.id);
          updateActiveSession(sessionUpdate);

          if (data.crisis_detected) setCrisisDetected(true);
          if (data.is_session_close) setIsSessionClose(true);

          // Handle dynamic content (structured or legacy slug)
          const exerciseSlug = data.dynamic_content?.payload || data.dynamic_in_chat_exercise;
          if (exerciseSlug) {
            const allExercises = useMindCoachStore.getState().exercises;
            const exercise = allExercises.find(e => 
              e.id === exerciseSlug || 
              e.title.toLowerCase().replace(/ /g, '_') === exerciseSlug.toLowerCase() ||
              e.title.toLowerCase().replace(/-/g, '_') === exerciseSlug.toLowerCase()
            );
            if (exercise) {
              setActiveExercise(exercise);
              setActiveExerciseMessageId(assistantMsg.id);
            }
          }
        } catch (err) {
          console.error('Failed to trigger initial greeting:', err);
        } finally {
          setIsLoading(false);
        }
      };

      sendInitialGreeting();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, activeSession?.id]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !activeSession || isLoading) return;

    setInput('');

    const userMsgId = crypto.randomUUID();
    const userMsg: ChatMessageType = {
      id: userMsgId,
      session_id: activeSession.id,
      role: 'user',
      content: text,
      guardrail_status: null,
      created_at: new Date().toISOString(),
    };
    
    // 1. Instantly update UI
    addMessage(userMsg);
    setIsLoading(true);

    try {
      // 2. Persist user message + increment count
      const newCount = activeSession.message_count + 1;
      await Promise.all([
        supabase.from('mind_coach_messages').insert({
          id: userMsg.id,
          session_id: userMsg.session_id,
          role: userMsg.role,
          content: userMsg.content,
        }),
        supabase.from('mind_coach_sessions').update({ message_count: newCount }).eq('id', activeSession.id),
      ]);
      updateActiveSession({ message_count: newCount });

      // 3. Fetch Prompts (Coach + Phase)
      const [personaRes, phaseRes] = await Promise.all([
        supabase
          .from('mind_coach_personas')
          .select('base_prompt')
          .eq('id', profile?.therapist_persona || 'maya')
          .maybeSingle(),
        supabase
          .from('mind_coach_pathway_phases')
          .select('dynamic_prompt')
          .eq('id', `${activeSession.pathway || 'engagement_rapport_and_assessment'}_phase${journey?.current_phase || 1}`)
          .maybeSingle(),
      ]);

      const coachPrompt = personaRes.data?.base_prompt || "You are an empathetic, non-judgmental mental health coach.";
      const phasePrompt = phaseRes.data?.dynamic_prompt || "Focus on building therapeutic rapport.";

      // 4. Call n8n directly
      const n8nPayload = {
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
        messages: [...messages, userMsg], // History + current
        memories: memories.map(m => ({ text: m.memory_text, type: m.memory_type })),
        recent_tasks_assigned: activeTasks,
        recent_case_notes: recentCaseNotes.map(n => n.key_insight).filter(Boolean),
        coach_prompt: coachPrompt,
        phase_prompt: phasePrompt,
        message_count: newCount,
      };

      const response = await fetch('https://n8n.saksham-experiments.com/webhook/mind-coach-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(n8nPayload),
      });

      if (!response.ok) throw new Error(`n8n failed with ${response.status}`);
      const data = await response.json();
      if (!data?.reply) throw new Error('No reply from n8n');

      // 5. Persist assistant reply
      const assistantMsg: ChatMessageType = {
        id: crypto.randomUUID(),
        session_id: activeSession.id,
        role: 'assistant',
        content: data.reply,
        guardrail_status: data.guardrail_status ?? 'passed',
        dynamic_content: data.dynamic_content,
        created_at: new Date().toISOString(),
      };
      
      await supabase.from('mind_coach_messages').insert({
        id: assistantMsg.id,
        session_id: assistantMsg.session_id,
        content: assistantMsg.content,
        guardrail_status: assistantMsg.guardrail_status,
        dynamic_content: assistantMsg.dynamic_content,
      });
      addMessage(assistantMsg);

      // 6. Update session count + result state
      const finalCount = newCount + 1;
      const sessionUpdate: any = { message_count: finalCount };
      if (data.session_state) sessionUpdate.session_state = data.session_state;
      if (data.dynamic_theme) sessionUpdate.dynamic_theme = data.dynamic_theme;
      if (data.pathway) sessionUpdate.pathway = data.pathway;
      if (typeof data.pathway_confidence === 'number') sessionUpdate.pathway_confidence = data.pathway_confidence;

      await supabase.from('mind_coach_sessions').update(sessionUpdate).eq('id', activeSession.id);
      updateActiveSession(sessionUpdate);

      if (data.crisis_detected) setCrisisDetected(true);
      if (data.is_session_close) setIsSessionClose(true);

      // Handle dynamic content (structured or legacy slug)
      const exerciseSlug = data.dynamic_content?.payload || data.dynamic_in_chat_exercise;
      if (exerciseSlug) {
        const allExercises = useMindCoachStore.getState().exercises;
        const exercise = allExercises.find(e => 
          e.id === exerciseSlug || 
          e.title.toLowerCase().replace(/ /g, '_') === exerciseSlug.toLowerCase() ||
          e.title.toLowerCase().replace(/-/g, '_') === exerciseSlug.toLowerCase()
        );
        if (exercise) {
          setActiveExercise(exercise);
          setActiveExerciseMessageId(assistantMsg.id);
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      const fallbackMsg: ChatMessageType = {
        id: crypto.randomUUID(),
        session_id: activeSession.id,
        role: 'assistant',
        content: MOCK_REPLY,
        guardrail_status: null,
        created_at: new Date().toISOString(),
      };
      addMessage(fallbackMsg);
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
    if (onReturnHome) {
      onReturnHome();
    } else {
      onBack();
    }
  };

  const showEndSession = activeSession && (
    isSessionClose ||
    (activeSession.message_count >= 10 && activeSession.pathway !== 'engagement_rapport_and_assessment')
  );

  if (showSummary && sessionSummary) {
    const tasks: any[] = Array.isArray(sessionSummary.extracted_tasks)
      ? sessionSummary.extracted_tasks
      : sessionSummary.takeaway_task
        ? [{ dynamic_title: 'Your Takeaway', dynamic_description: sessionSummary.takeaway_task, task_type: 'general' }]
        : [];

    const suggestedPathway = sessionSummary.suggested_pathway || activeSession?.pathway;
    const isNewPathway = suggestedPathway && suggestedPathway !== 'engagement_rapport_and_assessment';

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
          {/* Title + Reflection */}
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

          {/* Quote */}
          {sessionSummary.quote_of_the_day && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl p-4 border border-[#E8E4DE]">
              <p className="text-sm text-[#2C2A26]/80 italic text-center">"{sessionSummary.quote_of_the_day}"</p>
            </motion.div>
          )}

          {/* Energy Shift */}
          {sessionSummary.energy_shift && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-2xl p-4 border border-[#E8E4DE] flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-[#2C2A26]/50 uppercase mb-1">Start of Session</p>
                <p className="text-sm font-medium text-[#2C2A26] line-through decoration-[#B4A7D6]">{sessionSummary.energy_shift.start}</p>
              </div>
              <div className="text-[#B4A7D6]">&rarr;</div>
              <div className="text-right">
                <p className="text-[10px] font-medium text-[#2C2A26]/50 uppercase mb-1">End of Session</p>
                <p className="text-sm font-medium text-[#6B8F71]">{sessionSummary.energy_shift.end}</p>
              </div>
            </motion.div>
          )}

          {/* Psych Flexibility */}
          {sessionSummary.psychological_flexibility && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-2xl p-4 border border-[#E8E4DE]">
              <p className="text-xs font-medium text-[#2C2A26]/50 uppercase mb-3">Psychological Flexibility Profile</p>
              <div className="space-y-3">
                {[
                  { label: 'Self-Awareness', value: sessionSummary.psychological_flexibility.self_awareness },
                  { label: 'Somatic Observation', value: sessionSummary.psychological_flexibility.observation },
                  { label: 'Physical Integration', value: sessionSummary.psychological_flexibility.physical_awareness },
                  { label: 'Values Alignment', value: sessionSummary.psychological_flexibility.core_values },
                  { label: 'Relationships', value: sessionSummary.psychological_flexibility.relationships },
                ].filter(s => s.value !== undefined).map((stat, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#2C2A26]/80">{stat.label}</span>
                      <span className="font-medium text-[#2C2A26]">{stat.value}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[#E8E4DE] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-[#D4A574]"
                        initial={{ width: 0 }}
                        animate={{ width: `${stat.value}%` }}
                        transition={{ delay: 0.5 + i * 0.1, duration: 0.8, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Self-Compassion */}
          {sessionSummary.self_compassion_score !== undefined && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-[#FAF9F7] rounded-2xl p-4 text-center">
              <p className="text-3xl font-bold text-[#6B8F71] mb-1">{sessionSummary.self_compassion_score}</p>
              <p className="text-xs font-medium text-[#2C2A26]/50 uppercase">Self-Compassion Score</p>
            </motion.div>
          )}

          {/* Homework Tasks — full extracted_tasks[] */}
          {tasks.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
              <p className="text-xs font-semibold text-[#2C2A26]/50 uppercase tracking-wide mb-2">Your Homework</p>
              <div className="space-y-2">
                {tasks.map((t: any, i: number) => (
                  <div key={i} className="bg-[#6B8F71]/8 rounded-2xl p-4 border border-[#6B8F71]/20">
                    <div className="flex items-start gap-2">
                      <span className="text-lg mt-0.5">{t.task_type === 'journaling' ? '✍️' : t.task_type === 'somatic_exercise' ? '🌬️' : t.task_type === 'cognitive_reframing' ? '🧠' : t.task_type === 'behavioral_exposure' ? '🚶' : '🎯'}</span>
                      <div>
                        <p className="text-sm font-semibold text-[#2C2A26]">{t.dynamic_title || t.task_name}</p>
                        <p className="text-xs text-[#2C2A26]/60 mt-0.5 leading-relaxed">{t.dynamic_description || t.task_description}</p>
                        {t.frequency && (
                          <span className="inline-block mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#6B8F71]/15 text-[#6B8F71]">
                            {t.frequency}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Pathway Recommendation Card */}
          {isNewPathway && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-gradient-to-br from-[#2C2A26] to-[#3D3A34] rounded-2xl p-5 text-white"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">✨</span>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Recommended Path</p>
              </div>
              <p className="text-base font-semibold mb-1">
                {PATHWAY_LABELS[suggestedPathway] ?? suggestedPathway.replace(/_/g, ' ')}
              </p>
              <p className="text-xs text-white/60 mb-4 leading-relaxed">
                Based on our conversation, this pathway looks like a strong fit for what you're working through.
              </p>
              <button
                onClick={() => {
                  handleCloseSummary();
                }}
                className="w-full py-2.5 bg-white text-[#2C2A26] text-sm font-semibold rounded-xl hover:bg-white/90 transition-colors"
              >
                Start My Journey →
              </button>
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  // ── Crisis overlay ──────────────────────────────────────────────────────
  if (isCrisisDetected) {
    return (
      <div className="flex flex-col h-full bg-[#FFF5F5]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-red-100 bg-white shrink-0">
          <button onClick={onBack} className="text-[#2C2A26]/60 hover:text-[#2C2A26]">
            <ArrowLeft size={20} />
          </button>
          <p className="text-sm font-semibold text-red-600">Crisis Support</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center text-4xl"
          >
            💙
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h2 className="text-xl font-semibold text-[#2C2A26] mb-2">You're not alone</h2>
            <p className="text-sm text-[#2C2A26]/60 leading-relaxed">
              I hear how much pain you're in right now. Your safety is the most important thing.
              Please reach out to a trained crisis counsellor who can support you through this.
            </p>
          </motion.div>
          <motion.a
            href="tel:9152987821"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="w-full py-4 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-2xl text-center transition-colors flex flex-col items-center gap-0.5"
          >
            <span className="text-base">📞 Call iCall</span>
            <span className="text-xs font-normal opacity-80">9152987821 · Free · Confidential</span>
          </motion.a>
          <motion.a
            href="https://icallhelpline.org"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="w-full py-3 border border-red-200 text-red-600 text-sm font-medium rounded-2xl text-center hover:bg-red-50 transition-colors"
          >
            💬 Chat with iCall Online
          </motion.a>
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            onClick={onBack}
            className="text-xs text-[#2C2A26]/30 underline"
          >
            Go back
          </motion.button>
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
          className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden shrink-0"
          style={{ backgroundColor: meta.color }}
        >
          {meta.avatarUrl ? (
            <img src={meta.avatarUrl} alt={meta.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-white text-sm font-semibold">{meta.name[0]}</span>
          )}
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
            avatarUrl={meta.avatarUrl}
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
              {endingSession ? 'Wrapping up...' : isSessionClose ? '✨ View Session Summary' : 'End Session'}
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
