import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../../../lib/supabaseClient';
import {
  useMindCoachStore,
  type ChatMessage as ChatMessageType,
  type MindCoachSession,
  type MindCoachJourney,
} from '../../../store/mindCoachStore';
import { ChatMessage } from './ChatMessage';
import {
  MIND_COACH_DUMMY_SESSION_SUMMARY,
  THERAPIST_CONFIG,
  THERAPY_PROPOSAL_CONFIDENCE_READY,
  THERAPY_PROPOSAL_MIN_MESSAGE_COUNT,
} from '../MindCoachConstants';

function normalizeN8nChatPayload(raw: unknown): Record<string, any> {
  const base = (Array.isArray(raw) ? raw[0] : raw) as Record<string, any> | null;
  if (!base || typeof base !== 'object') return {};
  const merged: Record<string, any> = { ...base };
  const inner = base.output && typeof base.output === 'object' ? (base.output as Record<string, any>) : null;
  if (inner) {
    for (const key of [
      'suggested_pathway',
      'pathway',
      'pathway_confidence',
      'dynamic_theme',
      'session_state',
      'reply',
      'guardrail_status',
      'crisis_detected',
      'is_session_close',
      'dynamic_content',
      'dynamic_in_chat_exercise',
    ]) {
      if (merged[key] == null && inner[key] != null) merged[key] = inner[key];
    }
  }
  return merged;
}

function applyN8nSessionFields(data: Record<string, any>, patch: Record<string, any>) {
  if (data.session_state) patch.session_state = data.session_state;
  if (data.dynamic_theme) patch.dynamic_theme = data.dynamic_theme;
  if (data.pathway) patch.pathway = data.pathway;
  else if (data.suggested_pathway) patch.pathway = data.suggested_pathway;
  if (typeof data.pathway_confidence === 'number') patch.pathway_confidence = data.pathway_confidence;
}

async function syncDiscoveryFromN8n(data: Record<string, any>) {
  if (data.suggested_pathway == null || typeof data.pathway_confidence !== 'number') return;
  const j = useMindCoachStore.getState().journey;
  if (!j) return;
  const discovery_state = {
    suggested_pathway: data.suggested_pathway,
    confidence: data.pathway_confidence,
  };
  useMindCoachStore.getState().setJourney({ ...j, discovery_state });
  const { error } = await supabase
    .from('mind_coach_journeys')
    .update({ discovery_state })
    .eq('id', j.id);
  if (error) console.error('Persist discovery_state failed:', error);
}

/** Prevents duplicate n8n greeting on React strict remount / effect re-entry for the same session. */
const greetingAttemptedForSession = new Set<string>();

function fallbackSessionSummary(
  activeSession: MindCoachSession | null,
  journey: MindCoachJourney | null,
): Record<string, unknown> {
  const summary = { ...MIND_COACH_DUMMY_SESSION_SUMMARY };
  const fromSession =
    activeSession?.pathway && activeSession.pathway !== 'engagement_rapport_and_assessment'
      ? activeSession.pathway
      : null;
  const fromDiscovery = journey?.discovery_state?.suggested_pathway ?? null;
  summary.suggested_pathway = fromSession || fromDiscovery;
  return summary;
}

/** Edge / n8n may return session_summary as object or JSON string. */
function normalizeServerSessionSummary(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return null;
    try {
      const p = JSON.parse(t) as unknown;
      if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      return null;
    }
    return null;
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return null;
}

/**
 * Progress 0–100% toward surfacing the therapy plan. Linear to 100% by message N; if confidence
 * is still below ready at N, snap to 90% then +2% every 5 messages until 100%.
 */
function planRevealProgressPercent(
  messageCount: number,
  pathwayConfidence: number | undefined,
  discoveryConfidence: number | undefined,
): number {
  const N = THERAPY_PROPOSAL_MIN_MESSAGE_COUNT;
  const conf =
    pathwayConfidence !== undefined
      ? pathwayConfidence
      : discoveryConfidence;
  const highConf = conf !== undefined && conf >= THERAPY_PROPOSAL_CONFIDENCE_READY;

  if (messageCount < N) {
    return Math.min(100, (messageCount / N) * 100);
  }
  if (highConf) {
    return 100;
  }
  const beyond = Math.max(0, messageCount - N);
  const steps = Math.floor(beyond / 5);
  return Math.min(100, 90 + steps * 2);
}

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
  const removeMessageById = useMindCoachStore((s) => s.removeMessageById);
  const setIsLoading = useMindCoachStore((s) => s.setIsLoading);
  const updateActiveSession = useMindCoachStore((s) => s.updateActiveSession);
  const setActiveSession = useMindCoachStore((s) => s.setActiveSession);
  const setSessions = useMindCoachStore((s) => s.setSessions);
  const setJourney = useMindCoachStore((s) => s.setJourney);
  const sessions = useMindCoachStore((s) => s.sessions);
  const setCrisisDetected = useMindCoachStore((s) => s.setCrisisDetected);
  const setIsSessionClose = useMindCoachStore((s) => s.setIsSessionClose);
  const isCrisisDetected = useMindCoachStore((s) => s.isCrisisDetected);
  const memories = useMindCoachStore((s) => s.memories);
  const activeTasks = useMindCoachStore((s) => s.activeTasks);
  const recentCaseNotes = useMindCoachStore((s) => s.recentCaseNotes);

  const [input, setInput] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [greetingRetryToken, setGreetingRetryToken] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** When n8n succeeded but assistant row failed — retry uses this bundle. */
  const pendingAfterN8nRef = useRef<{
    assistantMsg: ChatMessageType;
    sessionUpdate: Record<string, unknown>;
    n8nData: Record<string, any>;
  } | null>(null);
  const sendRetryModeRef = useRef<'none' | 'n8n_only' | 'assistant_only'>('none');

  const persona = profile?.therapist_persona ?? 'maya';
  const meta = THERAPIST_CONFIG[persona];

  const isEngagementDiscovery = activeSession?.pathway === 'engagement_rapport_and_assessment';

  const planRevealProgress = useMemo(() => {
    if (!isEngagementDiscovery || !activeSession) return 0;
    const mc = Math.max(activeSession.message_count ?? 0, messages.length);
    return planRevealProgressPercent(
      mc,
      activeSession.pathway_confidence,
      journey?.discovery_state?.confidence,
    );
  }, [
    isEngagementDiscovery,
    activeSession?.id,
    activeSession?.message_count,
    activeSession?.pathway_confidence,
    messages.length,
    journey?.discovery_state?.confidence,
  ]);

  /** Show proposal only after workflow returns pathway details (same contract as syncDiscoveryFromN8n). */
  const canViewTherapyProposal = useMemo(() => {
    const ds = journey?.discovery_state;
    return (
      !!ds &&
      typeof ds.suggested_pathway === 'string' &&
      ds.suggested_pathway !== 'engagement_rapport_and_assessment' &&
      typeof ds.confidence === 'number'
    );
  }, [journey?.discovery_state?.suggested_pathway, journey?.discovery_state?.confidence]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const runInitialGreeting = useCallback(async () => {
    const st = useMindCoachStore.getState();
    const sess = st.activeSession;
    const prof = st.profile;
    const j = st.journey;
    if (!sess) return;

    const [personaRes, phaseRes] = await Promise.all([
      supabase
        .from('mind_coach_personas')
        .select('base_prompt')
        .eq('id', prof?.therapist_persona || 'maya')
        .maybeSingle(),
      supabase
        .from('mind_coach_pathway_phases')
        .select('dynamic_prompt')
        .eq(
          'id',
          `${sess.pathway || 'engagement_rapport_and_assessment'}_phase${j?.current_phase || 1}`,
        )
        .maybeSingle(),
    ]);

    const coachPrompt =
      personaRes.data?.base_prompt || 'You are an empathetic, non-judgmental mental health coach.';
    const phasePrompt = phaseRes.data?.dynamic_prompt || 'Focus on building therapeutic rapport.';

    const n8nPayload = {
      profile_id: prof?.id,
      session_id: sess.id,
      message_text: `System Alert: We are beginning the session. Introduce yourself and softly greet the user by name (${prof?.name || 'User'}) based on their context to kick off the session.`,
      is_system_greeting: true,
      profile: prof
        ? {
            name: prof.name,
            age: prof.age,
            gender: prof.gender,
            concerns: prof.concerns,
            therapist_persona: prof.therapist_persona,
          }
        : null,
      journey_context: j
        ? {
            id: j.id,
            title: j.title,
            current_phase: j.current_phase,
            phases: j.phases,
          }
        : null,
      session_state: sess.session_state,
      dynamic_theme: sess.dynamic_theme,
      pathway: sess.pathway,
      messages: st.messages,
      memories: st.memories.map((m) => ({ text: m.memory_text, type: m.memory_type })),
      recent_tasks_assigned: st.activeTasks,
      recent_case_notes: st.recentCaseNotes.map((n) => n.key_insight).filter(Boolean),
      coach_prompt: coachPrompt,
      phase_prompt: phasePrompt,
      message_count: sess.message_count,
    };

    const response = await fetch('https://n8n.saksham-experiments.com/webhook/mind-coach-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(n8nPayload),
    });

    if (!response.ok) throw new Error(`Coach service unreachable (${response.status}). Try again.`);
    const data = normalizeN8nChatPayload(await response.json());

    if (!data?.reply) throw new Error('No reply from coach. Try again.');

    const assistantMsg: ChatMessageType = {
      id: crypto.randomUUID(),
      session_id: sess.id,
      role: 'assistant',
      content: data.reply,
      guardrail_status: data.guardrail_status ?? 'passed',
      dynamic_content: data.dynamic_content,
      created_at: new Date().toISOString(),
    };

    const { error: greetSaveErr } = await supabase.from('mind_coach_messages').insert({
      id: assistantMsg.id,
      session_id: assistantMsg.session_id,
      role: assistantMsg.role,
      content: assistantMsg.content,
      guardrail_status: assistantMsg.guardrail_status,
      dynamic_content: assistantMsg.dynamic_content,
    });
    if (greetSaveErr) throw new Error('Could not save the greeting. Check your connection and try again.');

    st.addMessage(assistantMsg);

    const sessionUpdate: Record<string, unknown> = { message_count: 1 };
    applyN8nSessionFields(data, sessionUpdate);
    await syncDiscoveryFromN8n(data);

    await supabase.from('mind_coach_sessions').update(sessionUpdate).eq('id', sess.id);
    st.updateActiveSession(sessionUpdate);

    if (data.crisis_detected) st.setCrisisDetected(true);
    if (data.is_session_close) st.setIsSessionClose(true);
    // Exercise stays on the teaser card until the user taps Start Activity (DynamicExerciseTrigger).
  }, []);

  useEffect(() => {
    if (!activeSession || messages.length !== 0 || (activeSession.message_count ?? 0) > 0) {
      return;
    }
    if (greetingAttemptedForSession.has(activeSession.id)) return;
    greetingAttemptedForSession.add(activeSession.id);

    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setChatError(null);
      try {
        await runInitialGreeting();
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to trigger initial greeting:', err);
        setChatError(
          err instanceof Error
            ? err.message
            : 'Could not start your session. Check your connection and tap Retry.',
        );
      } finally {
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [messages.length, activeSession?.id, activeSession?.message_count, greetingRetryToken, runInitialGreeting, setIsLoading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !activeSession || isLoading) return;

    setInput('');
    setChatError(null);
    pendingAfterN8nRef.current = null;
    sendRetryModeRef.current = 'none';

    const userMsgId = crypto.randomUUID();
    const userMsg: ChatMessageType = {
      id: userMsgId,
      session_id: activeSession.id,
      role: 'user',
      content: text,
      guardrail_status: null,
      created_at: new Date().toISOString(),
    };

    addMessage(userMsg);
    setIsLoading(true);

    try {
      const { error: userInsertErr } = await supabase.from('mind_coach_messages').insert({
        id: userMsg.id,
        session_id: userMsg.session_id,
        role: userMsg.role,
        content: userMsg.content,
      });
      if (userInsertErr) {
        removeMessageById(userMsgId);
        throw new Error('We could not save your message. Check your connection and try again.');
      }

      const newCount = (activeSession.message_count ?? 0) + 1;
      const { error: sessionErr } = await supabase
        .from('mind_coach_sessions')
        .update({ message_count: newCount })
        .eq('id', activeSession.id);
      if (sessionErr) {
        await supabase.from('mind_coach_messages').delete().eq('id', userMsgId);
        removeMessageById(userMsgId);
        throw new Error('We could not update your session. Please try sending again.');
      }
      updateActiveSession({ message_count: newCount });

      const [personaRes, phaseRes] = await Promise.all([
        supabase
          .from('mind_coach_personas')
          .select('base_prompt')
          .eq('id', profile?.therapist_persona || 'maya')
          .maybeSingle(),
        supabase
          .from('mind_coach_pathway_phases')
          .select('dynamic_prompt')
          .eq(
            'id',
            `${activeSession.pathway || 'engagement_rapport_and_assessment'}_phase${journey?.current_phase || 1}`,
          )
          .maybeSingle(),
      ]);

      const coachPrompt =
        personaRes.data?.base_prompt || 'You are an empathetic, non-judgmental mental health coach.';
      const phasePrompt = phaseRes.data?.dynamic_prompt || 'Focus on building therapeutic rapport.';

      const history = [...useMindCoachStore.getState().messages];
      const n8nPayload = {
        profile_id: profile?.id,
        session_id: activeSession.id,
        message_text: text,
        profile: profile
          ? {
              name: profile.name,
              age: profile.age,
              gender: profile.gender,
              concerns: profile.concerns,
              therapist_persona: profile.therapist_persona,
            }
          : null,
        journey_context: journey
          ? {
              id: journey.id,
              title: journey.title,
              current_phase: journey.current_phase,
              phases: journey.phases,
            }
          : null,
        session_state: activeSession.session_state,
        dynamic_theme: activeSession.dynamic_theme,
        pathway: activeSession.pathway,
        messages: history,
        memories: memories.map((m) => ({ text: m.memory_text, type: m.memory_type })),
        recent_tasks_assigned: activeTasks,
        recent_case_notes: recentCaseNotes.map((n) => n.key_insight).filter(Boolean),
        coach_prompt: coachPrompt,
        phase_prompt: phasePrompt,
        message_count: newCount,
      };

      const response = await fetch('https://n8n.saksham-experiments.com/webhook/mind-coach-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(n8nPayload),
      });

      if (!response.ok) {
        sendRetryModeRef.current = 'n8n_only';
        throw new Error(`Coach unreachable (${response.status}). Tap Retry to fetch a reply.`);
      }
      const data = normalizeN8nChatPayload(await response.json());
      if (!data?.reply) {
        sendRetryModeRef.current = 'n8n_only';
        throw new Error('No reply from coach. Tap Retry.');
      }

      const assistantMsg: ChatMessageType = {
        id: crypto.randomUUID(),
        session_id: activeSession.id,
        role: 'assistant',
        content: data.reply,
        guardrail_status: data.guardrail_status ?? 'passed',
        dynamic_content: data.dynamic_content,
        created_at: new Date().toISOString(),
      };

      const finalCount = newCount + 1;
      const sessionUpdate: Record<string, unknown> = { message_count: finalCount };
      applyN8nSessionFields(data, sessionUpdate);

      const { error: assistantSaveErr } = await supabase.from('mind_coach_messages').insert({
        id: assistantMsg.id,
        session_id: assistantMsg.session_id,
        role: assistantMsg.role,
        content: assistantMsg.content,
        guardrail_status: assistantMsg.guardrail_status,
        dynamic_content: assistantMsg.dynamic_content,
      });
      if (assistantSaveErr) {
        pendingAfterN8nRef.current = { assistantMsg, sessionUpdate, n8nData: data };
        sendRetryModeRef.current = 'assistant_only';
        throw new Error('Reply received but could not be saved. Tap Retry.');
      }

      addMessage(assistantMsg);
      await syncDiscoveryFromN8n(data);

      await supabase.from('mind_coach_sessions').update(sessionUpdate).eq('id', activeSession.id);
      updateActiveSession(sessionUpdate);

      if (data.crisis_detected) setCrisisDetected(true);
      if (data.is_session_close) setIsSessionClose(true);

      sendRetryModeRef.current = 'none';
    } catch (err) {
      console.error('Chat error:', err);
      setChatError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetrySend = async () => {
    if (!activeSession || isLoading) return;
    setChatError(null);
    setIsLoading(true);
    try {
      if (sendRetryModeRef.current === 'assistant_only' && pendingAfterN8nRef.current) {
        const { assistantMsg, sessionUpdate, n8nData } = pendingAfterN8nRef.current;
        const { error: assistantSaveErr } = await supabase.from('mind_coach_messages').insert({
          id: assistantMsg.id,
          session_id: assistantMsg.session_id,
          role: assistantMsg.role,
          content: assistantMsg.content,
          guardrail_status: assistantMsg.guardrail_status,
          dynamic_content: assistantMsg.dynamic_content,
        });
        if (assistantSaveErr) {
          throw new Error('Still could not save the reply. Try again.');
        }
        addMessage(assistantMsg);
        await syncDiscoveryFromN8n(n8nData);
        await supabase.from('mind_coach_sessions').update(sessionUpdate).eq('id', activeSession.id);
        updateActiveSession(sessionUpdate);
        if (n8nData.crisis_detected) setCrisisDetected(true);
        if (n8nData.is_session_close) setIsSessionClose(true);
        pendingAfterN8nRef.current = null;
        sendRetryModeRef.current = 'none';
        return;
      }

      if (sendRetryModeRef.current === 'n8n_only') {
        const st = useMindCoachStore.getState();
        const sess = st.activeSession;
        const prof = st.profile;
        const j = st.journey;
        const msgs = st.messages;
        if (!sess) return;

        const [personaRes, phaseRes] = await Promise.all([
          supabase
            .from('mind_coach_personas')
            .select('base_prompt')
            .eq('id', prof?.therapist_persona || 'maya')
            .maybeSingle(),
          supabase
            .from('mind_coach_pathway_phases')
            .select('dynamic_prompt')
            .eq(
              'id',
              `${sess.pathway || 'engagement_rapport_and_assessment'}_phase${j?.current_phase || 1}`,
            )
            .maybeSingle(),
        ]);

        const coachPrompt =
          personaRes.data?.base_prompt || 'You are an empathetic, non-judgmental mental health coach.';
        const phasePrompt = phaseRes.data?.dynamic_prompt || 'Focus on building therapeutic rapport.';

        const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
        const messageText = lastUser?.content ?? '';
        const messageCount = sess.message_count ?? 0;

        const n8nPayload = {
          profile_id: prof?.id,
          session_id: sess.id,
          message_text: messageText,
          profile: prof
            ? {
                name: prof.name,
                age: prof.age,
                gender: prof.gender,
                concerns: prof.concerns,
                therapist_persona: prof.therapist_persona,
              }
            : null,
          journey_context: j
            ? {
                id: j.id,
                title: j.title,
                current_phase: j.current_phase,
                phases: j.phases,
              }
            : null,
          session_state: sess.session_state,
          dynamic_theme: sess.dynamic_theme,
          pathway: sess.pathway,
          messages: msgs,
          memories: st.memories.map((m) => ({ text: m.memory_text, type: m.memory_type })),
          recent_tasks_assigned: st.activeTasks,
          recent_case_notes: st.recentCaseNotes.map((n) => n.key_insight).filter(Boolean),
          coach_prompt: coachPrompt,
          phase_prompt: phasePrompt,
          message_count: messageCount,
        };

        const response = await fetch('https://n8n.saksham-experiments.com/webhook/mind-coach-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(n8nPayload),
        });

        if (!response.ok) {
          throw new Error(`Coach unreachable (${response.status}). Try again.`);
        }
        const data = normalizeN8nChatPayload(await response.json());
        if (!data?.reply) throw new Error('No reply from coach. Try again.');

        const assistantMsg: ChatMessageType = {
          id: crypto.randomUUID(),
          session_id: sess.id,
          role: 'assistant',
          content: data.reply,
          guardrail_status: data.guardrail_status ?? 'passed',
          dynamic_content: data.dynamic_content,
          created_at: new Date().toISOString(),
        };

        const newCount = messageCount;
        const finalCount = newCount + 1;
        const sessionUpdate: Record<string, unknown> = { message_count: finalCount };
        applyN8nSessionFields(data, sessionUpdate);

        const { error: assistantSaveErr } = await supabase.from('mind_coach_messages').insert({
          id: assistantMsg.id,
          session_id: assistantMsg.session_id,
          role: assistantMsg.role,
          content: assistantMsg.content,
          guardrail_status: assistantMsg.guardrail_status,
          dynamic_content: assistantMsg.dynamic_content,
        });
        if (assistantSaveErr) {
          pendingAfterN8nRef.current = { assistantMsg, sessionUpdate, n8nData: data };
          sendRetryModeRef.current = 'assistant_only';
          throw new Error('Reply received but could not be saved. Tap Retry.');
        }

        addMessage(assistantMsg);
        await syncDiscoveryFromN8n(data);
        await supabase.from('mind_coach_sessions').update(sessionUpdate).eq('id', sess.id);
        updateActiveSession(sessionUpdate);
        if (data.crisis_detected) setCrisisDetected(true);
        if (data.is_session_close) setIsSessionClose(true);
        sendRetryModeRef.current = 'none';
      }
    } catch (err) {
      console.error('Retry chat error:', err);
      setChatError(err instanceof Error ? err.message : 'Retry failed.');
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
    const endedAt = new Date().toISOString();

    const finalizeLocal = (
      summary: Record<string, unknown>,
      caseNotes: unknown,
    ) => {
      const updated = {
        ...activeSession,
        session_state: 'completed' as const,
        ended_at: endedAt,
        case_notes: caseNotes ?? null,
        summary_data: summary,
      };
      setSessions(sessions.map((s) => (s.id === updated.id ? updated : s)));
      updateActiveSession(updated);
      setSessionSummary(summary);
      setShowSummary(true);
    };

    try {
      const { data, error } = await supabase.functions.invoke('mind-coach-session-end', {
        body: {
          session_id: activeSession.id,
          profile_id: profile.id,
        },
      });
      let payload = data as Record<string, unknown> | null;
      const inner =
        payload?.output && typeof payload.output === 'object' && !Array.isArray(payload.output)
          ? (payload.output as Record<string, unknown>)
          : null;
      if (inner && payload?.session_summary == null && inner.session_summary != null) {
        payload = { ...payload, session_summary: inner.session_summary };
      }

      const serverError =
        error ||
        (payload &&
          typeof payload === 'object' &&
          'error' in payload &&
          payload.error != null);

      const serverSummary = normalizeServerSessionSummary(payload?.session_summary);

      if (!serverError) {
        const summary = serverSummary ?? fallbackSessionSummary(activeSession, journey);
        finalizeLocal(summary, payload?.case_notes ?? null);
      } else {
        const summary = fallbackSessionSummary(activeSession, journey);
        await supabase
          .from('mind_coach_sessions')
          .update({
            session_state: 'completed',
            ended_at: endedAt,
            summary_data: summary,
          })
          .eq('id', activeSession.id);
        finalizeLocal(summary, null);
      }
    } catch (err) {
      console.error('Session end failed:', err);
      const summary = fallbackSessionSummary(activeSession, journey);
      await supabase
        .from('mind_coach_sessions')
        .update({
          session_state: 'completed',
          ended_at: endedAt,
          summary_data: summary,
        })
        .eq('id', activeSession.id)
        .catch(() => {});
      finalizeLocal(summary, null);
    } finally {
      setEndingSession(false);
    }
  };

  const handleCloseSummary = async () => {
    setShowSummary(false);
    setSessionSummary(null);
    if (profile?.id) {
      const { data } = await supabase
        .from('mind_coach_journeys')
        .select('*')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setJourney(data);
    }
    if (onReturnHome) {
      onReturnHome();
    } else {
      onBack();
    }
  };

  if (showSummary) {
    const summaryView = sessionSummary ?? fallbackSessionSummary(activeSession, journey);
    const tasks: any[] = Array.isArray(summaryView.extracted_tasks)
      ? summaryView.extracted_tasks
      : summaryView.takeaway_task
        ? [{ dynamic_title: 'Your Takeaway', dynamic_description: summaryView.takeaway_task, task_type: 'general' }]
        : [];

    const suggestedPathway = summaryView.suggested_pathway || activeSession?.pathway;
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
              {summaryView.title || 'Session Summary'}
            </h3>
            {summaryView.opening_reflection && (
              <p className="text-sm text-[#2C2A26]/70 leading-relaxed">
                {summaryView.opening_reflection}
              </p>
            )}
          </motion.div>

          {/* Quote */}
          {summaryView.quote_of_the_day && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl p-4 border border-[#E8E4DE]">
              <p className="text-sm text-[#2C2A26]/80 italic text-center">"{summaryView.quote_of_the_day}"</p>
            </motion.div>
          )}

          {/* Energy Shift */}
          {summaryView.energy_shift && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-2xl p-4 border border-[#E8E4DE] flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-[#2C2A26]/50 uppercase mb-1">Start of Session</p>
                <p className="text-sm font-medium text-[#2C2A26] line-through decoration-[#B4A7D6]">{summaryView.energy_shift.start}</p>
              </div>
              <div className="text-[#B4A7D6]">&rarr;</div>
              <div className="text-right">
                <p className="text-[10px] font-medium text-[#2C2A26]/50 uppercase mb-1">End of Session</p>
                <p className="text-sm font-medium text-[#6B8F71]">{summaryView.energy_shift.end}</p>
              </div>
            </motion.div>
          )}

          {/* Psych Flexibility */}
          {summaryView.psychological_flexibility && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-2xl p-4 border border-[#E8E4DE]">
              <p className="text-xs font-medium text-[#2C2A26]/50 uppercase mb-3">Psychological Flexibility Profile</p>
              <div className="space-y-3">
                {[
                  { label: 'Self-Awareness', value: summaryView.psychological_flexibility.self_awareness },
                  { label: 'Somatic Observation', value: summaryView.psychological_flexibility.observation },
                  { label: 'Physical Integration', value: summaryView.psychological_flexibility.physical_awareness },
                  { label: 'Values Alignment', value: summaryView.psychological_flexibility.core_values },
                  { label: 'Relationships', value: summaryView.psychological_flexibility.relationships },
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
          {summaryView.self_compassion_score !== undefined && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-[#FAF9F7] rounded-2xl p-4 text-center">
              <p className="text-3xl font-bold text-[#6B8F71] mb-1">{summaryView.self_compassion_score}</p>
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

  // ── End session: full-screen loader while edge / n8n runs ───────────────
  if (endingSession) {
    return (
      <div className="flex flex-col h-full bg-[#F9F6F2] items-center justify-center px-8">
        <div className="w-11 h-11 border-2 border-[#6B8F71] border-t-transparent rounded-full animate-spin" />
        <p className="mt-5 text-sm font-medium text-[#2C2A26]/70 text-center">Wrapping up your session…</p>
        <p className="mt-2 text-xs text-[#2C2A26]/45 text-center">Generating your summary…</p>
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
          <p className="text-[11px] text-[#2C2A26]/45 leading-relaxed max-w-sm">
            If you are in the US or Canada, you can call or text{' '}
            <a href="tel:988" className="font-semibold text-red-600 underline-offset-2 hover:underline">
              988
            </a>{' '}
            (Suicide & Crisis Lifeline). In India, iCall is below.
          </p>
          <motion.a
            href="tel:988"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-2xl text-center transition-colors flex flex-col items-center gap-0.5"
          >
            <span className="text-base">📞 Call or text 988</span>
            <span className="text-xs font-normal opacity-90">US & Canada · 24/7</span>
          </motion.a>
          <motion.a
            href="tel:9152987821"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="w-full py-4 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-2xl text-center transition-colors flex flex-col items-center gap-0.5"
          >
            <span className="text-base">📞 Call iCall (India)</span>
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
          <p
            className={`text-xs ${isLoading ? 'text-[#6B8F71]/90 italic' : 'text-[#6B8F71]'}`}
            aria-live="polite"
          >
            {isLoading ? 'Writing a reply…' : 'Online'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleEndSession}
          disabled={endingSession}
          className="shrink-0 text-xs font-medium text-[#2C2A26]/45 hover:text-[#2C2A26] disabled:opacity-50 py-1.5 px-2 rounded-lg hover:bg-[#F5F0EB] transition-colors"
        >
          {endingSession ? 'Ending…' : 'End session'}
        </button>
      </div>

      {chatError && (
        <div
          role="alert"
          className="shrink-0 px-3 py-2.5 bg-amber-50 border-b border-amber-100/80 flex flex-wrap items-center gap-2"
        >
          <p className="flex-1 min-w-[200px] text-xs text-amber-950/90 leading-relaxed">{chatError}</p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (messages.length === 0 && (activeSession?.message_count ?? 0) === 0) {
                  if (activeSession) greetingAttemptedForSession.delete(activeSession.id);
                  setGreetingRetryToken((t) => t + 1);
                } else if (sendRetryModeRef.current !== 'none') {
                  void handleRetrySend();
                }
                setChatError(null);
              }}
              className="text-xs font-semibold text-amber-900 underline-offset-2 hover:underline"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => setChatError(null)}
              className="text-xs font-medium text-amber-800/70 hover:text-amber-900"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {isEngagementDiscovery && (
        <div className="shrink-0 w-full border-b border-[#E8E4DE] bg-white/80">
          <div
            className="px-4 pt-2"
            role="progressbar"
            aria-valuenow={Math.round(planRevealProgress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-labelledby="mind-coach-plan-unlock-label"
          >
            <div className="h-1 w-full bg-[#E8E4DE]/90 overflow-hidden rounded-full">
              <motion.div
                className="h-full bg-[#6B8F71] rounded-full"
                initial={false}
                animate={{ width: `${planRevealProgress}%` }}
                transition={{ type: 'spring', stiffness: 140, damping: 22 }}
              />
            </div>
          </div>
          <p
            id="mind-coach-plan-unlock-label"
            className="px-4 py-1 text-[9px] uppercase tracking-[0.14em] text-[#2C2A26]/40 font-semibold"
          >
            Your plan unlocks with the conversation
          </p>
        </div>
      )}

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
                  activeSession.pathway_confidence < THERAPY_PROPOSAL_CONFIDENCE_READY ? 'Connecting' :
                    'Formulating'}
              </span>
            )}
          </div>

          <div className="text-sm text-[#2C2A26] mb-2">
            <span className="text-[#2C2A26]/50">Exploring: </span>
            <span className="font-medium">{activeSession.dynamic_theme || 'Understanding your story...'}</span>
          </div>

          {canViewTherapyProposal ? (
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

      {/* Input */}
      <div className="px-3 py-3 border-t border-[#E8E4DE] bg-white shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.shiftKey) return;
              e.preventDefault();
              if (!isLoading) handleSend();
            }}
            placeholder="Type a message…"
            className="flex-1 px-4 py-2.5 text-sm bg-[#F5F0EB] rounded-full outline-none placeholder:text-[#2C2A26]/30 text-[#2C2A26]"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-[#6B8F71] text-white disabled:opacity-40 transition-opacity shrink-0"
            aria-busy={isLoading}
            title={isLoading ? 'Wait for reply…' : 'Send'}
          >
            <Send size={16} />
          </button>
        </div>
      </div>

    </div>
  );
};
