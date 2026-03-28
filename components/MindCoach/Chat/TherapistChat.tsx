import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { ArrowLeft, Send, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../../../lib/supabaseClient';
import Analytics from '../../../services/analytics';
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
import { PhaseProgressStepper } from './PhaseProgressStepper';
import { PATHWAY_LABELS } from '../shared/pathwayLabels';

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

function sanitizeAssistantMarkdownReply(raw: unknown): string {
  const input = typeof raw === 'string' ? raw : '';
  if (!input.trim()) return '';

  let value = input.trim();
  const fencedBlock = /^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/;

  // Some model outputs wrap the full reply in one or more code fences.
  for (let i = 0; i < 2; i += 1) {
    const match = value.match(fencedBlock);
    if (!match) break;
    value = match[1].trim();
  }

  return value;
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

const NEXT_FOCUS_STORAGE_KEY_PREFIX = 'mind_coach_next_focus_intent';

function getNextFocusStorageKey(profileId: string) {
  return `${NEXT_FOCUS_STORAGE_KEY_PREFIX}:${profileId}`;
}

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeLabel(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

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
  const setSessions = useMindCoachStore((s) => s.setSessions);
  const setJourney = useMindCoachStore((s) => s.setJourney);
  const sessions = useMindCoachStore((s) => s.sessions);
  const setCrisisDetected = useMindCoachStore((s) => s.setCrisisDetected);
  const setIsSessionClose = useMindCoachStore((s) => s.setIsSessionClose);
  const isCrisisDetected = useMindCoachStore((s) => s.isCrisisDetected);
  const memories = useMindCoachStore((s) => s.memories);
  const activeTasks = useMindCoachStore((s) => s.activeTasks);
  const setActiveTasks = useMindCoachStore((s) => s.setActiveTasks);
  const recentCaseNotes = useMindCoachStore((s) => s.recentCaseNotes);

  const [input, setInput] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [greetingRetryToken, setGreetingRetryToken] = useState(0);
  const [showSafeExitToast, setShowSafeExitToast] = useState(() => {
    if (!profile?.id) return false;
    return !localStorage.getItem(`mc_safe_exit_seen_${profile.id}`);
  });
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
      client_managed_persistence: true,
    };

    const { data: chatData, error: chatErr } = await supabase.functions.invoke('mind-coach-chat', {
      body: n8nPayload,
    });
    if (chatErr) throw new Error(`Coach service unreachable. ${chatErr.message || 'Try again.'}`);
    const data = normalizeN8nChatPayload(chatData);

    if (!data?.reply) throw new Error('No reply from coach. Try again.');

    const assistantMsg: ChatMessageType = {
      id: crypto.randomUUID(),
      session_id: sess.id,
      role: 'assistant',
      content: sanitizeAssistantMarkdownReply(data.reply),
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
        client_managed_persistence: true,
      };

      const { data: chatData, error: chatErr } = await supabase.functions.invoke('mind-coach-chat', {
        body: n8nPayload,
      });

      if (chatErr) {
        sendRetryModeRef.current = 'n8n_only';
        throw new Error(`Coach unreachable. ${chatErr.message || 'Tap Retry to fetch a reply.'}`);
      }
      const data = normalizeN8nChatPayload(chatData);
      if (!data?.reply) {
        sendRetryModeRef.current = 'n8n_only';
        throw new Error('No reply from coach. Tap Retry.');
      }

      const assistantMsg: ChatMessageType = {
        id: crypto.randomUUID(),
        session_id: activeSession.id,
        role: 'assistant',
        content: sanitizeAssistantMarkdownReply(data.reply),
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
          client_managed_persistence: true,
        };

        const { data: chatData, error: chatErr } = await supabase.functions.invoke('mind-coach-chat', {
          body: n8nPayload,
        });
        if (chatErr) {
          throw new Error(`Coach unreachable. ${chatErr.message || 'Try again.'}`);
        }
        const data = normalizeN8nChatPayload(chatData);
        if (!data?.reply) throw new Error('No reply from coach. Try again.');

        const assistantMsg: ChatMessageType = {
          id: crypto.randomUUID(),
          session_id: sess.id,
          role: 'assistant',
          content: sanitizeAssistantMarkdownReply(data.reply),
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
  const [selectedNextFocus, setSelectedNextFocus] = useState<string | null>(null);
  const [showPathwayPhases, setShowPathwayPhases] = useState(false);
  const [activePathwayPhase, setActivePathwayPhase] = useState(0);
  const [completedTaskKeys, setCompletedTaskKeys] = useState<Record<string, boolean>>({});
  const prefillAppliedForSessionRef = useRef<Set<string>>(new Set());
  const trackedPathwayCardViewsRef = useRef<Set<string>>(new Set());

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

    const buildSummaryView = (
      baseSummary: Record<string, unknown>,
      payload: Record<string, unknown> | null,
    ): Record<string, unknown> => {
      const extractedTasks = Array.isArray(payload?.extracted_tasks)
        ? (payload?.extracted_tasks as unknown[])
        : [];
      const sessionTakeaways = Array.isArray(payload?.session_takeaways)
        ? (payload?.session_takeaways as unknown[])
        : [];
      const nextFocusOptions = Array.isArray(payload?.next_focus_options)
        ? (payload?.next_focus_options as unknown[])
        : [];
      const phaseTransition = payload?.phase_transition_result ?? null;
      const suggestedPathway = payload?.suggested_pathway ?? null;
      const pathwayDetails =
        payload?.pathway_details && typeof payload.pathway_details === 'object'
          ? payload.pathway_details
          : null;
      const out: Record<string, unknown> = { ...baseSummary };
      if (out.extracted_tasks == null && extractedTasks.length > 0) {
        out.extracted_tasks = extractedTasks;
      }
      if (out.session_takeaways == null && sessionTakeaways.length > 0) {
        out.session_takeaways = sessionTakeaways;
      }
      if (out.next_focus_options == null && nextFocusOptions.length > 0) {
        out.next_focus_options = nextFocusOptions;
      }
      if (phaseTransition && out.phase_transition_result == null) {
        out.phase_transition_result = phaseTransition;
      }
      if (suggestedPathway && out.suggested_pathway == null) {
        out.suggested_pathway = suggestedPathway;
      }
      if (pathwayDetails && out.pathway_details == null) {
        out.pathway_details = pathwayDetails;
      }
      if (out.case_notes == null && payload?.case_notes && typeof payload.case_notes === 'object') {
        out.case_notes = payload.case_notes;
      }
      return out;
    };

    try {
      const { data, error } = await supabase.functions.invoke('mind-coach-session-end', {
        body: {
          session_id: activeSession.id,
          profile_id: profile.id,
        },
      });
      const basePayload =
        Array.isArray(data) && data[0] && typeof data[0] === 'object'
          ? (data[0] as Record<string, unknown>)
          : (data as Record<string, unknown> | null);
      let payload = basePayload;
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
        const baseSummary = serverSummary ?? fallbackSessionSummary(activeSession, journey);
        const summary = buildSummaryView(baseSummary, payload);
        finalizeLocal(summary, payload?.case_notes ?? null);
        if (profile?.id) {
          const { data: latestTasks } = await supabase
            .from('mind_coach_user_tasks')
            .select('*')
            .eq('profile_id', profile.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(20);
          if (latestTasks) setActiveTasks(latestTasks as any);
        }
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
    setSelectedNextFocus(null);
    setShowPathwayPhases(false);
    setActivePathwayPhase(0);
    setCompletedTaskKeys({});
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

  useEffect(() => {
    if (!profile?.id || !activeSession) return;
    if (showSummary) return;
    if (messages.length !== 0 || (activeSession.message_count ?? 0) > 0) return;
    if (input.trim()) return;
    if (prefillAppliedForSessionRef.current.has(activeSession.id)) return;
    const storedFocus = localStorage.getItem(getNextFocusStorageKey(profile.id));
    if (!storedFocus) return;
    prefillAppliedForSessionRef.current.add(activeSession.id);
    setInput(`I'd like to focus on ${storedFocus.toLowerCase()} today.`);
  }, [
    profile?.id,
    activeSession?.id,
    activeSession?.message_count,
    input,
    messages.length,
    showSummary,
  ]);

  useEffect(() => {
    if (!showSummary || !activeSession?.id) return;
    if (trackedPathwayCardViewsRef.current.has(activeSession.id)) return;
    const summaryForTrack = sessionSummary ?? fallbackSessionSummary(activeSession, journey);
    const suggestedPathway = summaryForTrack.suggested_pathway || activeSession?.pathway;
    const pathwayDetailsRaw =
      summaryForTrack.pathway_details && typeof summaryForTrack.pathway_details === 'object'
        ? (summaryForTrack.pathway_details as Record<string, any>)
        : null;
    const pathwayPhases = Array.isArray(pathwayDetailsRaw?.phases)
      ? (pathwayDetailsRaw?.phases as Record<string, any>[]).slice(0, 4)
      : [];
    const isNewPathway =
      typeof suggestedPathway === 'string' && suggestedPathway !== 'engagement_rapport_and_assessment';
    const isPathwayUnselected =
      (activeSession?.pathway == null || activeSession?.pathway === 'engagement_rapport_and_assessment') &&
      (journey?.pathway == null || journey?.pathway === 'engagement_rapport_and_assessment');
    const shouldShowPathwayPreview = isPathwayUnselected && isNewPathway && pathwayPhases.length > 0;
    if (!shouldShowPathwayPreview) return;

    trackedPathwayCardViewsRef.current.add(activeSession.id);
    Analytics.track('pathway_card_viewed', {
      session_id: activeSession.id,
      profile_id: profile?.id || null,
      suggested_pathway: suggestedPathway || null,
      phase_count: pathwayPhases.length,
    });
  }, [
    showSummary,
    sessionSummary,
    activeSession?.id,
    activeSession?.pathway,
    journey?.id,
    journey?.pathway,
    profile?.id,
    activeSession,
    journey,
  ]);

  if (showSummary) {
    const summaryView = sessionSummary ?? fallbackSessionSummary(activeSession, journey);
    const caseNotes = (summaryView.case_notes ??
      activeSession?.case_notes ??
      null) as Record<string, any> | null;
    const phaseTransitionResult = (summaryView.phase_transition_result ??
      null) as
      | {
          advanced?: boolean;
          new_phase_index?: number;
          completed_in_phase?: number;
          min_sessions_required?: number;
        }
      | null;
    const tasks: Record<string, any>[] = Array.isArray(summaryView.extracted_tasks)
      ? (summaryView.extracted_tasks as Record<string, any>[])
      : summaryView.takeaway_task
        ? [{ dynamic_title: 'Your Takeaway', dynamic_description: summaryView.takeaway_task, task_type: 'general' }]
        : [];
    const tasksWithUi: (Record<string, any> & { _ui_key: string })[] = tasks.map((task, index) => {
      const key = `${task.id ?? task.dynamic_title ?? task.task_name ?? task.task_type ?? 'task'}:${index}`;
      return { ...task, _ui_key: key };
    });
    const takeaways = Array.isArray(summaryView.session_takeaways)
      ? (summaryView.session_takeaways as string[]).filter(Boolean).slice(0, 3)
      : [
          summaryView.opening_reflection
            ? 'What you noticed today'
            : null,
          caseNotes?.dynamic_theme ? `Theme surfaced: ${caseNotes.dynamic_theme}` : null,
          tasks[0]?.dynamic_title ? `One thing to practice: ${tasks[0].dynamic_title}` : null,
        ].filter(Boolean) as string[];
    const nextFocusOptions = Array.isArray(summaryView.next_focus_options)
      ? (summaryView.next_focus_options as string[]).filter(Boolean).slice(0, 3)
      : [
          caseNotes?.dynamic_theme ? `Work on ${String(caseNotes.dynamic_theme).toLowerCase()}` : null,
          'Build a wind-down ritual',
          'Strengthen self-talk before stress moments',
        ].filter(Boolean) as string[];
    const completedInPhase = safeNumber(phaseTransitionResult?.completed_in_phase);
    const minInPhase = safeNumber(phaseTransitionResult?.min_sessions_required);
    const phaseProgressPercent =
      completedInPhase != null && minInPhase && minInPhase > 0
        ? Math.min(100, Math.round((completedInPhase / minInPhase) * 100))
        : null;
    const riskLevel = String(caseNotes?.risk_level ?? '').toLowerCase();
    const isRiskVariant =
      riskLevel === 'high' || caseNotes?.requires_escalation === true || caseNotes?.crisis_detected === true;
    const therapistSupportLine =
      persona === 'maya'
        ? 'Gentle reflection first, then one step forward.'
        : persona === 'sophie'
          ? 'We keep this practical: one insight, one action.'
          : persona === 'marcus'
            ? 'Grounded progress: reinforce what worked, repeat it this week.'
            : 'You made progress today. Let us convert it into a repeatable step.';

    const suggestedPathway = summaryView.suggested_pathway || activeSession?.pathway;
    const isNewPathway = suggestedPathway && suggestedPathway !== 'engagement_rapport_and_assessment';
    const pathwayDetailsRaw =
      summaryView.pathway_details && typeof summaryView.pathway_details === 'object'
        ? (summaryView.pathway_details as Record<string, any>)
        : null;
    const pathwayPhases = Array.isArray(pathwayDetailsRaw?.phases)
      ? (pathwayDetailsRaw?.phases as Record<string, any>[]).slice(0, 4)
      : [];
    const pathwayPreview = pathwayDetailsRaw
      ? {
          title:
            String(pathwayDetailsRaw.pathway_title || '').trim() ||
            (typeof suggestedPathway === 'string'
              ? (PATHWAY_LABELS[suggestedPathway] ?? suggestedPathway.replace(/_/g, ' '))
              : 'Your Recommended Pathway'),
          description:
            String(pathwayDetailsRaw.pathway_description || '').trim() ||
            'A structured four-phase pathway to guide your next sessions.',
          imageUrl: String(pathwayDetailsRaw.image_url || '').trim() || null,
        }
      : null;
    const isPathwayUnselected =
      (activeSession?.pathway == null || activeSession?.pathway === 'engagement_rapport_and_assessment') &&
      (journey?.pathway == null || journey?.pathway === 'engagement_rapport_and_assessment');
    const shouldShowPathwayPreview = isPathwayUnselected && isNewPathway && pathwayPreview && pathwayPhases.length > 0;
    const followPathwayFromSummary = (source: 'pathway_card' | 'phase_modal') => {
      Analytics.track('pathway_follow_clicked', {
        source,
        session_id: activeSession?.id || null,
        profile_id: profile?.id || null,
        suggested_pathway: suggestedPathway || null,
      });
      setShowPathwayPhases(false);
      if (onViewProposal) {
        onViewProposal();
      }
    };

    const [showTier2, setShowTier2] = React.useState(false);
    const [showTier3, setShowTier3] = React.useState(false);

    const hasTier2Content = phaseTransitionResult || shouldShowPathwayPreview || nextFocusOptions.length > 0 || isNewPathway;
    const hasTier3Content = tasksWithUi.length > 0 || summaryView.energy_shift || summaryView.psychological_flexibility || summaryView.self_compassion_score !== undefined || (caseNotes?.presenting_concern || caseNotes?.dynamic_theme);

    return (
      <div className="flex flex-col h-full bg-[#F9F6F2] relative">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[#E8E4DE] bg-white/80 backdrop-blur-sm shrink-0">
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
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">

          {/* ── TIER 1: Warm reflection + takeaway + next step + Done ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-5 bg-[#F0EDE8] border border-[#E8E4DE]"
          >
            <h3 className="text-base font-semibold text-[#2C2A26] mb-2">
              {summaryView.title || 'Session Summary'}
            </h3>
            <p className="text-xs text-[#2C2A26]/60 mb-3">{therapistSupportLine}</p>
            {summaryView.opening_reflection && (
              <p className="text-sm text-[#2C2A26]/80 leading-relaxed mb-3">
                {summaryView.opening_reflection}
              </p>
            )}
            {summaryView.quote_of_the_day && (
              <p className="text-xs italic text-[#2C2A26]/50 border-l-2 border-[#E8E4DE] pl-3 mb-3">
                "{summaryView.quote_of_the_day}"
              </p>
            )}
            {takeaways.length > 0 && (
              <div className="space-y-1.5">
                {takeaways.map((item, index) => (
                  <p key={index} className="text-xs text-[#2C2A26]/75 flex items-start gap-2">
                    <span className="mt-0.5 text-[#6B8F71]">•</span>
                    <span>{item}</span>
                  </p>
                ))}
              </div>
            )}
          </motion.div>

          {/* Primary task — simplified */}
          {tasksWithUi.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 }}
              className="bg-white rounded-2xl p-5 border border-[#E8E4DE]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-3">Try this week</p>
              {tasksWithUi.slice(0, 2).map((task, i) => {
                const taskTitle = task.dynamic_title || task.task_name || normalizeLabel(task.task_type || `Task ${i + 1}`);
                const taskDesc = task.dynamic_description || task.task_description || 'Practice this between sessions.';
                const taskKey = task._ui_key as string;
                const done = completedTaskKeys[taskKey] === true;
                return (
                  <div key={taskKey} className={`flex items-start gap-3 ${i > 0 ? 'mt-3 pt-3 border-t border-[#F0EDEA]' : ''}`}>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !done;
                        setCompletedTaskKeys((prev) => ({ ...prev, [taskKey]: next }));
                        if (next && task.id && profile?.id) {
                          void supabase
                            .from('mind_coach_user_tasks')
                            .update({ status: 'completed', completed_at: new Date().toISOString() })
                            .eq('id', task.id)
                            .eq('profile_id', profile.id);
                        }
                      }}
                      className="mt-0.5 shrink-0"
                    >
                      <CheckCircle2 size={18} className={done ? 'text-[#6B8F71]' : 'text-[#E8E4DE]'} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${done ? 'text-[#6B8F71] line-through' : 'text-[#2C2A26]'}`}>{taskTitle}</p>
                      <p className="text-xs text-[#2C2A26]/50 mt-0.5 line-clamp-1">{taskDesc}</p>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}

          {/* Done button */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <button
              type="button"
              onClick={handleCloseSummary}
              className="w-full py-3 rounded-xl bg-[#6B8F71] text-white text-sm font-semibold hover:bg-[#5A7D60] active:scale-[0.98] transition-all"
            >
              Done
            </button>
            <button
              type="button"
              onClick={() => setInput('I want to quickly journal what I learned in today\'s session.')}
              className="w-full mt-2 py-2 text-xs font-medium text-[#2C2A26]/50 hover:text-[#2C2A26] transition-colors"
            >
              Or journal for 2 minutes
            </button>
          </motion.div>

          {/* ── TIER 2: Expandable — progress, pathway, next focus ── */}
          {hasTier2Content && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.12 }}
              className="bg-white rounded-2xl border border-[#E8E4DE] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setShowTier2((s) => !s)}
                className="w-full px-5 py-4 flex items-center justify-between text-left"
              >
                <p className="text-sm font-medium text-[#2C2A26]">See more</p>
                {showTier2 ? <ChevronUp size={16} className="text-[#2C2A26]/40" /> : <ChevronDown size={16} className="text-[#2C2A26]/40" />}
              </button>
              {showTier2 && (
                <div className="px-5 pb-5 space-y-4 border-t border-[#F0EDEA]">
                  {/* Your progress */}
                  {phaseTransitionResult && (
                    <div className="pt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-2">Your progress</p>
                      <p className="text-sm text-[#2C2A26]/75 mb-2">
                        {phaseTransitionResult.advanced
                          ? `You unlocked Phase ${(phaseTransitionResult.new_phase_index ?? 0) + 1}. Keep momentum with one small action tonight.`
                          : `You're progressing in this phase (${phaseTransitionResult.completed_in_phase ?? 0}/${phaseTransitionResult.min_sessions_required ?? 0} sessions).`}
                      </p>
                      {phaseProgressPercent != null && (
                        <div className="h-1.5 w-full bg-[#E8E4DE] rounded-full overflow-hidden">
                          <div className="h-full bg-[#6B8F71] rounded-full" style={{ width: `${phaseProgressPercent}%` }} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pathway suggestion */}
                  {shouldShowPathwayPreview && (
                    <div className="pt-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-2">Recommended pathway</p>
                      <button
                        type="button"
                        onClick={() => {
                          Analytics.track('pathway_preview_opened', {
                            source: 'pathway_card',
                            session_id: activeSession?.id || null,
                            profile_id: profile?.id || null,
                            suggested_pathway: suggestedPathway || null,
                          });
                          setShowPathwayPhases(true);
                          setActivePathwayPhase(0);
                        }}
                        className="w-full text-left rounded-xl border border-[#E8E4DE] bg-[#FAF7F3] overflow-hidden hover:bg-[#F6F1EA] transition-colors"
                      >
                        {pathwayPreview?.imageUrl && (
                          <img src={pathwayPreview.imageUrl} alt="" className="w-full h-24 object-cover border-b border-[#E8E4DE]" />
                        )}
                        <div className="p-3">
                          <p className="text-sm font-semibold text-[#2C2A26]">{pathwayPreview?.title}</p>
                          <p className="text-xs text-[#2C2A26]/60 mt-1 leading-relaxed">{pathwayPreview?.description}</p>
                          <p className="text-xs text-[#6B8F71] font-medium mt-2">Tap to preview all 4 phases</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => followPathwayFromSummary('pathway_card')}
                        className="w-full mt-2 py-2.5 rounded-xl bg-[#6B8F71] text-white text-sm font-semibold hover:bg-[#5A7D60] transition-colors"
                      >
                        Follow this pathway
                      </button>
                    </div>
                  )}

                  {isNewPathway && !shouldShowPathwayPreview && (
                    <div className="pt-2">
                      <p className="text-xs text-[#2C2A26]/60">
                        Recommended pathway: {PATHWAY_LABELS[suggestedPathway] ?? String(suggestedPathway).replace(/_/g, ' ')}
                      </p>
                    </div>
                  )}

                  {/* Next focus chooser */}
                  {nextFocusOptions.length > 0 && (
                    <div className="pt-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-1">Next focus</p>
                      <p className="text-xs text-[#2C2A26]/55 mb-2">Choose one intention for next time.</p>
                      <div className="flex flex-wrap gap-2">
                        {nextFocusOptions.map((option, idx) => {
                          const selected = selectedNextFocus === option;
                          return (
                            <button
                              key={`${option}-${idx}`}
                              type="button"
                              onClick={() => {
                                setSelectedNextFocus(option);
                                if (profile?.id) {
                                  localStorage.setItem(getNextFocusStorageKey(profile.id), option);
                                }
                              }}
                              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                                selected
                                  ? 'bg-[#2C2A26] text-white border-[#2C2A26]'
                                  : 'bg-[#F5F0EB] text-[#2C2A26]/70 border-[#E8E4DE] hover:bg-[#E8E4DE]'
                              }`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                      {selectedNextFocus && (
                        <p className="text-[11px] text-[#2C2A26]/50 mt-2">
                          Saved. Next time, we will start with: "{selectedNextFocus}".
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* ── TIER 3: Expandable — detailed insights, full tasks, notes ── */}
          {hasTier3Content && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="bg-white rounded-2xl border border-[#E8E4DE] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setShowTier3((s) => !s)}
                className="w-full px-5 py-4 flex items-center justify-between text-left"
              >
                <div>
                  <p className="text-sm font-medium text-[#2C2A26]">Detailed view</p>
                  <p className="text-xs text-[#2C2A26]/45 mt-0.5">For the curious — metrics and notes</p>
                </div>
                {showTier3 ? <ChevronUp size={16} className="text-[#2C2A26]/40" /> : <ChevronDown size={16} className="text-[#2C2A26]/40" />}
              </button>
              {showTier3 && (
                <div className="px-5 pb-5 space-y-4 border-t border-[#F0EDEA]">
                  {/* What stood out */}
                  {(caseNotes?.presenting_concern || caseNotes?.dynamic_theme || caseNotes?.phase_progress) && (
                    <div className={`pt-4 rounded-xl p-4 -mx-1 ${isRiskVariant ? 'bg-[#FFF9F8] border border-[#F3D0CB]' : ''}`}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-2">What stood out</p>
                      <div className="space-y-1.5 text-sm text-[#2C2A26]/75">
                        {caseNotes?.presenting_concern && <p><span className="font-medium text-[#2C2A26]">What we explored:</span> {caseNotes.presenting_concern}</p>}
                        {caseNotes?.dynamic_theme && <p><span className="font-medium text-[#2C2A26]">What resonated:</span> {caseNotes.dynamic_theme}</p>}
                        {caseNotes?.phase_progress && <p><span className="font-medium text-[#2C2A26]">Still on your mind:</span> {caseNotes.phase_progress}</p>}
                      </div>
                      {isRiskVariant && (
                        <p className="text-xs text-[#A0493A] mt-2">
                          We noticed elevated distress. Grounding and support come first.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Full task list */}
                  {tasksWithUi.length > 2 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-2">All tasks</p>
                      {tasksWithUi.slice(2).map((task, i) => {
                        const taskTitle = task.dynamic_title || task.task_name || normalizeLabel(task.task_type || `Task ${i + 3}`);
                        const taskDesc = task.dynamic_description || task.task_description || '';
                        const taskKey = task._ui_key as string;
                        const done = completedTaskKeys[taskKey] === true;
                        return (
                          <div key={taskKey} className={`flex items-start gap-3 ${i > 0 ? 'mt-2.5 pt-2.5 border-t border-[#F0EDEA]' : ''}`}>
                            <button
                              type="button"
                              onClick={() => {
                                const next = !done;
                                setCompletedTaskKeys((prev) => ({ ...prev, [taskKey]: next }));
                                if (next && task.id && profile?.id) {
                                  void supabase
                                    .from('mind_coach_user_tasks')
                                    .update({ status: 'completed', completed_at: new Date().toISOString() })
                                    .eq('id', task.id)
                                    .eq('profile_id', profile.id);
                                }
                              }}
                              className="mt-0.5 shrink-0"
                            >
                              <CheckCircle2 size={16} className={done ? 'text-[#6B8F71]' : 'text-[#E8E4DE]'} />
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${done ? 'text-[#6B8F71] line-through' : 'text-[#2C2A26]'}`}>{taskTitle}</p>
                              {taskDesc && <p className="text-xs text-[#2C2A26]/50 mt-0.5 line-clamp-1">{taskDesc}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Energy shift */}
                  {summaryView.energy_shift && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-1">Energy shift</p>
                      <p className="text-xs text-[#2C2A26]/65">From {String(summaryView.energy_shift.start)} to {String(summaryView.energy_shift.end)}</p>
                    </div>
                  )}

                  {/* Flexibility — trends, not scores */}
                  {summaryView.psychological_flexibility && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-2">Flexibility snapshot</p>
                      <div className="space-y-2">
                        {[
                          { label: 'Self-Awareness', value: summaryView.psychological_flexibility.self_awareness },
                          { label: 'Observation', value: summaryView.psychological_flexibility.observation },
                          { label: 'Physical Awareness', value: summaryView.psychological_flexibility.physical_awareness },
                          { label: 'Values', value: summaryView.psychological_flexibility.core_values },
                          { label: 'Relationships', value: summaryView.psychological_flexibility.relationships },
                        ].filter((s) => s.value !== undefined).map((stat, i) => (
                          <div key={i}>
                            <div className="flex justify-between text-[11px] mb-1">
                              <span className="text-[#2C2A26]/60">{stat.label}</span>
                              <span className="text-[#2C2A26]/60">{String(stat.value)}%</span>
                            </div>
                            <div className="h-1 w-full bg-[#E8E4DE] rounded-full overflow-hidden">
                              <motion.div
                                className="h-full bg-[#D4A574] rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${stat.value}%` }}
                                transition={{ delay: 0.2 + i * 0.06, duration: 0.5, ease: 'easeOut' }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-[#2C2A26]/40 mt-2">Treat these as trends, not grades.</p>
                    </div>
                  )}

                  {summaryView.self_compassion_score !== undefined && (
                    <div className="rounded-xl bg-[#FAF9F7] p-3 border border-[#E8E4DE]">
                      <p className="text-base font-semibold text-[#2C2A26]/70">{String(summaryView.self_compassion_score)}</p>
                      <p className="text-[11px] text-[#2C2A26]/45">Self-compassion — a trend, not a grade.</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </div>
        {showPathwayPhases && shouldShowPathwayPreview && (
          <div className="absolute inset-0 z-20 bg-[#2C2A26]/40 backdrop-blur-[2px] flex items-end sm:items-center sm:justify-center p-2 sm:p-4">
            <div className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-[#FBF8F4] border border-[#E8E4DE] shadow-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-[#2C2A26]">
                  {pathwayPreview?.title}
                </p>
                <button
                  type="button"
                  onClick={() => setShowPathwayPhases(false)}
                  className="text-[#2C2A26]/50 hover:text-[#2C2A26] text-sm"
                >
                  Close
                </button>
              </div>
              <div className="flex items-center justify-center gap-2 mb-4">
                {pathwayPhases.map((_, index) => {
                  const isDone = index < activePathwayPhase;
                  const isCurrent = index === activePathwayPhase;
                  return (
                    <React.Fragment key={index}>
                      <button
                        type="button"
                        onClick={() => setActivePathwayPhase(index)}
                        className={`w-7 h-7 rounded-full text-[11px] font-semibold border ${
                          isCurrent
                            ? 'bg-[#6B8F71] text-white border-[#6B8F71]'
                            : isDone
                              ? 'bg-[#6B8F71]/15 text-[#44614A] border-[#6B8F71]/30'
                              : 'bg-white text-[#2C2A26]/60 border-[#D9D3CB]'
                        }`}
                      >
                        {isDone ? '✓' : index + 1}
                      </button>
                      {index < pathwayPhases.length - 1 && <div className="w-8 h-[2px] bg-[#D9D3CB]" />}
                    </React.Fragment>
                  );
                })}
              </div>
              {pathwayPhases[activePathwayPhase] && (
                <div className="bg-white rounded-2xl border border-[#E8E4DE] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#2C2A26]/45 mb-1">
                    Step {activePathwayPhase + 1} of {pathwayPhases.length}
                  </p>
                  <h4 className="text-lg font-semibold text-[#2C2A26] mb-2">
                    {String(pathwayPhases[activePathwayPhase].phase_name || 'Phase')}
                  </h4>
                  <p className="text-sm text-[#2C2A26]/75 leading-relaxed mb-3">
                    {String(pathwayPhases[activePathwayPhase].phase_description || '')}
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#2C2A26]/45 mb-2">
                    What we will explore together
                  </p>
                  <div className="space-y-1.5">
                    {pathwayPhases.map((phase, idx) => (
                      <p key={idx} className="text-xs text-[#2C2A26]/70 flex items-start gap-1.5">
                        <span className="mt-0.5 text-[#6B8F71]">•</span>
                        <span>{String(phase.phase_name || `Phase ${idx + 1}`)}</span>
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={activePathwayPhase === 0}
                  onClick={() => setActivePathwayPhase((p) => Math.max(0, p - 1))}
                  className="py-2.5 rounded-xl border border-[#E8E4DE] text-sm text-[#2C2A26]/70 disabled:opacity-40"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (activePathwayPhase >= pathwayPhases.length - 1) {
                      setShowPathwayPhases(false);
                      return;
                    }
                    setActivePathwayPhase((p) => Math.min(pathwayPhases.length - 1, p + 1));
                  }}
                  className="py-2.5 rounded-xl bg-[#2C2A26] text-white text-sm font-semibold"
                >
                  {activePathwayPhase >= pathwayPhases.length - 1 ? 'Done' : 'Next'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => followPathwayFromSummary('phase_modal')}
                className="w-full mt-2 py-2.5 rounded-xl bg-[#6B8F71] text-white text-sm font-semibold hover:bg-[#5A7D60] transition-colors"
              >
                Follow this pathway
              </button>
            </div>
          </div>
        )}
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

      {!isEngagementDiscovery && journey && (
        <PhaseProgressStepper journey={journey} sessions={sessions} />
      )}

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
        {showSafeExitToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-[280px] bg-white border border-[#E8E4DE] rounded-xl px-4 py-2.5 text-center shadow-sm cursor-pointer"
            onClick={() => {
              setShowSafeExitToast(false);
              if (profile?.id) localStorage.setItem(`mc_safe_exit_seen_${profile.id}`, '1');
            }}
          >
            <p className="text-xs text-[#2C2A26]/60">You can close anytime. Your progress is saved.</p>
          </motion.div>
        )}
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
              className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden text-white text-xs font-semibold shrink-0"
              style={{ backgroundColor: meta.color }}
            >
              {meta.avatarUrl ? (
                <img src={meta.avatarUrl} alt={meta.name[0]} className="w-full h-full object-cover" />
              ) : (
                meta.name[0]
              )}
            </div>
            <div className="bg-white border border-[#E8E4DE] rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-[#2C2A26]/20 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-[#2C2A26]/20 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-[#2C2A26]/20 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
