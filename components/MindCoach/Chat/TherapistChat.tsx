import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { ArrowLeft, Send, AlertTriangle } from 'lucide-react';
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
import { SessionSummaryView } from '../Summary/SessionSummaryView';
import { getCountryNameFromCode, resolveCountryCodeFromClient, toTelHref } from '../shared/locationCountry';
import '../Atmosphere/MindCoachZen.css';

function normalizeN8nChatPayload(raw: unknown): Record<string, any> {
  const base = (Array.isArray(raw) ? raw[0] : raw) as Record<string, any> | null;
  if (!base || typeof base !== 'object') return {};
  const merged: Record<string, any> = { ...base };
  let inner: Record<string, any> | null = null;
  if (typeof base.output === 'string') {
    try {
      const parsed = JSON.parse(base.output);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        inner = parsed as Record<string, any>;
      }
    } catch {
      inner = null;
    }
  } else if (base.output && typeof base.output === 'object') {
    inner = base.output as Record<string, any>;
  }
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
      'crisis_type',
      'quality_meta',
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

interface CrisisHelplineRow {
  id: string;
  country_code: string;
  country_name: string;
  primary_service_name: string;
  primary_contact: string;
  primary_contact_type: string | null;
  emergency_number: string | null;
  chat_url: string | null;
  notes: string | null;
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
const CHAT_RESPONSE_TIMEOUT_MS = 20_000;

function getNextFocusStorageKey(profileId: string) {
  return `${NEXT_FOCUS_STORAGE_KEY_PREFIX}:${profileId}`;
}

async function invokeMindCoachChatWithTimeout(payload: Record<string, unknown>) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      supabase.functions.invoke('mind-coach-chat', {
        body: payload,
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Coach is taking longer than expected (>20s). Please tap Retry.'));
        }, CHAT_RESPONSE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
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
  const moodEntries = useMindCoachStore((s) => s.moodEntries);

  const [input, setInput] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [showCrisisSupport, setShowCrisisSupport] = useState(false);
  const [crisisHelplines, setCrisisHelplines] = useState<CrisisHelplineRow[]>([]);
  const [crisisSupportLoading, setCrisisSupportLoading] = useState(false);
  const [resolvedCountryCode, setResolvedCountryCode] = useState<string | null>(null);
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
  const sessionCrisisFlag = useMemo(() => {
    const summary = activeSession?.summary_data;
    if (activeSession?.crisis_detected === true) return true;
    if (!summary || typeof summary !== 'object') return isCrisisDetected;
    const crisisFlags =
      summary.crisis_flags && typeof summary.crisis_flags === 'object'
        ? (summary.crisis_flags as Record<string, unknown>)
        : null;
    return (
      crisisFlags?.detected === true ||
      summary.crisis_detected === true ||
      isCrisisDetected
    );
  }, [activeSession?.summary_data, isCrisisDetected]);

  useEffect(() => {
    let cancelled = false;
    if (!showCrisisSupport || !sessionCrisisFlag) return;

    const loadHelplines = async () => {
      setCrisisSupportLoading(true);
      const country = resolveCountryCodeFromClient();
      if (!cancelled) setResolvedCountryCode(country);

      const baseQuery = supabase
        .from('mind_coach_crisis_helplines')
        .select('id,country_code,country_name,primary_service_name,primary_contact,primary_contact_type,emergency_number,chat_url,notes')
        .eq('active', true);

      let rows: CrisisHelplineRow[] = [];
      if (country) {
        const { data } = await baseQuery.eq('country_code', country);
        rows = (data ?? []) as CrisisHelplineRow[];
      }

      if (rows.length === 0) {
        const { data: globalRows } = await supabase
          .from('mind_coach_crisis_helplines')
          .select('id,country_code,country_name,primary_service_name,primary_contact,primary_contact_type,emergency_number,chat_url,notes')
          .eq('active', true)
          .eq('country_code', 'INTL');
        rows = (globalRows ?? []) as CrisisHelplineRow[];
      }

      if (!cancelled) {
        setCrisisHelplines(rows);
        setCrisisSupportLoading(false);
      }
    };

    void loadHelplines();
    return () => {
      cancelled = true;
    };
  }, [showCrisisSupport, sessionCrisisFlag]);

  const markSessionCrisisDetected = useCallback((source: string) => {
    if (!activeSession) return;
    setCrisisDetected(true);
    const priorTopLevelCount =
      typeof activeSession.crisis_detection_count === 'number'
        ? activeSession.crisis_detection_count
        : 0;
    const summary = activeSession.summary_data && typeof activeSession.summary_data === 'object'
      ? (activeSession.summary_data as Record<string, unknown>)
      : {};
    const priorFlags =
      summary.crisis_flags && typeof summary.crisis_flags === 'object'
        ? (summary.crisis_flags as Record<string, unknown>)
        : {};
    const priorCount =
      typeof priorFlags.detection_count === 'number'
        ? Number(priorFlags.detection_count)
        : 0;
    const nextSummary = {
      ...summary,
      crisis_detected: true,
      crisis_flags: {
        ...priorFlags,
        detected: true,
        detection_count: Math.max(priorCount + 1, priorTopLevelCount + 1),
        last_detected_at: new Date().toISOString(),
        source,
      },
    };
    updateActiveSession({
      crisis_detected: true,
      crisis_detection_count: priorTopLevelCount + 1,
      crisis_last_detected_at: new Date().toISOString(),
      summary_data: nextSummary,
    });
  }, [activeSession, setCrisisDetected, updateActiveSession]);

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

  useEffect(() => {
    if (!activeSession) return;
    setShowCrisisSupport(false);
    if (activeSession.crisis_detected === true) {
      setCrisisDetected(true);
      return;
    }
    const summary = activeSession.summary_data;
    if (!summary || typeof summary !== 'object') {
      setCrisisDetected(false);
      return;
    }
    const crisisFlags =
      summary.crisis_flags && typeof summary.crisis_flags === 'object'
        ? (summary.crisis_flags as Record<string, unknown>)
        : null;
    setCrisisDetected(Boolean(crisisFlags?.detected === true || summary.crisis_detected === true));
  }, [activeSession?.id, activeSession?.summary_data, activeSession?.crisis_detected, setCrisisDetected]);

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

    const phaseIndex = j?.current_phase_index ?? Math.max(0, (j?.current_phase || 1) - 1);
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
            current_phase_index: phaseIndex,
            phases: j.phases,
            sessions_completed: j.sessions_completed,
          }
        : null,
      session_state: sess.session_state,
      dynamic_theme: sess.dynamic_theme,
      pathway: sess.pathway,
      session_number: (j?.sessions_completed ?? 0) + 1,
      messages: st.messages,
      memories: st.memories.map((m) => ({ text: m.memory_text, type: m.memory_type })),
      recent_tasks_assigned: st.activeTasks,
      recent_case_notes: st.recentCaseNotes.map((n) => n.key_insight).filter(Boolean),
      coach_prompt: coachPrompt,
      phase_prompt: phasePrompt,
      message_count: sess.message_count,
      client_managed_persistence: true,
    };

    const { data: chatData, error: chatErr } = await invokeMindCoachChatWithTimeout(n8nPayload);
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

    if (data.crisis_detected) markSessionCrisisDetected('initial_greeting');
    if (data.is_session_close) st.setIsSessionClose(true);
    // Exercise stays on the teaser card until the user taps Start Activity (DynamicExerciseTrigger).
  }, [markSessionCrisisDetected]);

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
      const sendPhaseIndex = journey?.current_phase_index ?? Math.max(0, (journey?.current_phase || 1) - 1);
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
              current_phase_index: sendPhaseIndex,
              phases: journey.phases,
              sessions_completed: journey.sessions_completed,
            }
          : null,
        session_state: activeSession.session_state,
        dynamic_theme: activeSession.dynamic_theme,
        pathway: activeSession.pathway,
        session_number: (journey?.sessions_completed ?? 0) + 1,
        messages: history,
        memories: memories.map((m) => ({ text: m.memory_text, type: m.memory_type })),
        recent_tasks_assigned: activeTasks,
        recent_case_notes: recentCaseNotes.map((n) => n.key_insight).filter(Boolean),
        coach_prompt: coachPrompt,
        phase_prompt: phasePrompt,
        message_count: newCount,
        client_managed_persistence: true,
      };

      const { data: chatData, error: chatErr } = await invokeMindCoachChatWithTimeout(n8nPayload);

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

      if (data.crisis_detected) markSessionCrisisDetected('chat_reply');
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
        if (n8nData.crisis_detected) markSessionCrisisDetected('retry_assistant_save');
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

        const { data: chatData, error: chatErr } = await invokeMindCoachChatWithTimeout(n8nPayload);
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
        if (data.crisis_detected) markSessionCrisisDetected('retry_n8n');
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
  const prefillAppliedForSessionRef = useRef<Set<string>>(new Set());
  const trackedPathwayCardViewsRef = useRef<Set<string>>(new Set());

  const handleEndSession = async () => {
    if (endingSession) return;
    setEndingSession(true);

    let effectiveSession: MindCoachSession | null = activeSession ?? null;
    try {
      if (!effectiveSession) {
        const latestMessageSessionId = [...messages].reverse().find((m) => !!m.session_id)?.session_id;
        if (latestMessageSessionId) {
          const { data: recoveredSession } = await supabase
            .from('mind_coach_sessions')
            .select('*')
            .eq('id', latestMessageSessionId)
            .maybeSingle();
          if (recoveredSession) {
            effectiveSession = recoveredSession as MindCoachSession;
            updateActiveSession(effectiveSession);
          }
        }
      }
      if (!effectiveSession) {
        const fallbackInProgress = [...sessions]
          .filter((s) => s.session_state !== 'completed')
          .sort((a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime())[0];
        if (fallbackInProgress) {
          effectiveSession = fallbackInProgress;
          updateActiveSession(effectiveSession);
        }
      }
      if (!effectiveSession) throw new Error('missing_session');

      const effectiveProfileId = profile?.id || effectiveSession.profile_id;
      if (!effectiveProfileId) throw new Error('missing_profile');
      const endedAt = new Date().toISOString();

      const finalizeLocal = (
        summary: Record<string, unknown>,
        caseNotes: any,
      ) => {
        const updated: any = {
          ...effectiveSession,
          session_state: 'completed' as const,
          ended_at: endedAt,
          case_notes: caseNotes ?? null,
          summary_data: summary,
        };
        setSessions(sessions.map((s) => (s.id === updated.id ? updated : s)));
        updateActiveSession(updated as any);
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

      const messagesPayload = messages.map((m) => ({
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      }));
      const transcript = messagesPayload
        .map((m) => `${m.role === 'user' ? 'Client' : 'Therapist'}: ${m.content ?? ''}`)
        .join('\n');

      const { data, error } = await supabase.functions.invoke('mind-coach-session-end', {
        body: {
          session_id: effectiveSession.id,
          profile_id: effectiveProfileId,
          messages: messagesPayload,
          transcript,
          profile: profile
            ? {
                id: profile.id,
                name: profile.name,
                age: profile.age,
                gender: profile.gender,
                concerns: profile.concerns,
                therapist_persona: profile.therapist_persona,
              }
            : null,
          session: {
            pathway: effectiveSession.pathway,
            dynamic_theme: effectiveSession.dynamic_theme,
            session_number: effectiveSession.session_number,
          },
          currentPhase:
            journey && Array.isArray(journey.phases)
              ? journey.phases[journey.current_phase_index ?? Math.max(0, (journey.current_phase || 1) - 1)] ?? null
              : null,
          phase_context: journey
            ? {
                current_phase_index: journey.current_phase_index ?? Math.max(0, (journey.current_phase || 1) - 1),
                total_phases: Array.isArray(journey.phases) ? journey.phases.length : 0,
                current_phase: journey.phases?.[journey.current_phase_index ?? 0] ?? null,
                next_phase: journey.phases?.[(journey.current_phase_index ?? 0) + 1] ?? null,
              }
            : null,
          memories: memories.map((m) => ({
            memory_text: m.memory_text,
            memory_type: m.memory_type,
            created_at: m.created_at,
          })),
          current_memory: memories[0]
            ? {
                memory_text: memories[0].memory_text,
                memory_type: memories[0].memory_type,
                created_at: memories[0].created_at,
              }
            : null,
          recent_case_notes: recentCaseNotes.map((n) => n.key_insight).filter(Boolean),
          active_tasks: activeTasks,
          mood_entries: moodEntries.map((m) => ({
            score: m.score,
            notes: m.notes,
            created_at: m.created_at,
          })),
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
          .eq('id', effectiveSession.id);
        finalizeLocal(summary, null);
      }
    } catch (err) {
      console.error('Session end failed:', err);
      const errCode = err instanceof Error ? err.message : '';
      if (errCode === 'missing_session') {
        setChatError('We could not find the current session to end. Please refresh and try again.');
      } else if (errCode === 'missing_profile') {
        setChatError('We could not identify your profile for session wrap-up. Please refresh and try again.');
      } else if (effectiveSession) {
        const endedAt = new Date().toISOString();
        const summary = fallbackSessionSummary(activeSession, journey);
        await supabase
          .from('mind_coach_sessions')
          .update({
            session_state: 'completed',
            ended_at: endedAt,
            summary_data: summary,
          })
          .eq('id', effectiveSession.id);
        // Supabase update is thenable, but we don't need a catch here if we're in a try/catch
        const updated: any = {
          ...effectiveSession,
          session_state: 'completed' as const,
          ended_at: endedAt,
          case_notes: null,
          summary_data: summary,
        };
        setSessions(sessions.map((s) => (s.id === updated.id ? updated : s)));
        updateActiveSession(updated);
        setSessionSummary(summary);
        setShowSummary(true);
      }
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
    return (
      <SessionSummaryView
        summaryData={summaryView}
        activeSession={activeSession}
        journey={journey}
        profile={profile}
        persona={persona}
        onClose={handleCloseSummary}
        onViewProposal={onViewProposal}
        onJournal={(text) => setInput(text)}
      />
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
  if (showCrisisSupport && sessionCrisisFlag) {
    return (
    <div className="flex flex-col h-full bg-[#fdfaf7] relative overflow-hidden">
      {/* Zen Atmospheric Aura — subtle overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.4] z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[120%] h-[40%] bg-gradient-to-b from-[#E8F3E9] to-transparent blur-[80px]" />
      </div>

      {/* Header — Zen Glass */}
      <header className="zen-glass sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b border-white/40 shrink-0">
        <button onClick={() => setShowCrisisSupport(false)} className="text-[#2C2A26]/60 hover:text-[#2C2A26]">
          <ArrowLeft size={20} />
        </button>
        <p className="text-sm font-semibold text-red-600">Crisis Support</p>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5 relative z-10 overflow-y-auto">
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
            {resolvedCountryCode
              ? `Showing support options for ${getCountryNameFromCode(resolvedCountryCode) || resolvedCountryCode}.`
              : 'Showing verified crisis support options near your region.'}
          </p>
          {crisisSupportLoading ? (
            <p className="text-xs text-[#2C2A26]/45">Finding local helplines…</p>
          ) : (
            <div className="w-full space-y-3">
              {crisisHelplines.map((line, idx) => {
                const telHref = toTelHref(line.primary_contact);
                return (
                  <motion.div
                    key={line.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.14 + idx * 0.05 }}
                    className="w-full rounded-2xl border border-red-200/80 bg-white/85 p-4 text-left"
                  >
                    <p className="text-sm font-semibold text-[#2C2A26]">{line.primary_service_name}</p>
                    <p className="mt-0.5 text-xs text-[#2C2A26]/55">{line.country_name}</p>
                    {line.notes && <p className="mt-2 text-xs text-[#2C2A26]/60 leading-relaxed">{line.notes}</p>}
                    <div className="mt-3 flex flex-col gap-2">
                      {telHref && (
                        <a
                          href={telHref}
                          className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-center transition-colors"
                        >
                          📞 {line.primary_contact}
                        </a>
                      )}
                      {line.chat_url && (
                        <a
                          href={line.chat_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-2.5 border border-red-200 text-red-600 text-sm font-medium rounded-xl text-center hover:bg-red-50 transition-colors"
                        >
                          💬 Open chat support
                        </a>
                      )}
                      {line.emergency_number && (
                        <a
                          href={`tel:${line.emergency_number}`}
                          className="w-full py-2.5 border border-amber-200 text-amber-700 text-sm font-medium rounded-xl text-center hover:bg-amber-50 transition-colors"
                        >
                          🚨 Emergency: {line.emergency_number}
                        </a>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
          <motion.a
            href="https://findahelpline.com/"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24 }}
            className="w-full py-3 border border-red-200 text-red-600 text-sm font-medium rounded-2xl text-center hover:bg-red-50 transition-colors"
          >
            🌍 Find helplines by country
          </motion.a>
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            onClick={() => setShowCrisisSupport(false)}
            className="text-xs text-[#2C2A26]/30 underline"
          >
            Go back to session
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#fdfaf7] relative overflow-hidden">
      {/* Zen Atmospheric Aura */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.4] z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[120%] h-[40%] bg-gradient-to-b from-[#E8F3E9] to-transparent blur-[80px]" />
      </div>

      {/* Header — Zen Glass */}
      <div className="zen-glass sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b border-white/40 backdrop-blur-md shrink-0">
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
        {sessionCrisisFlag && (
          <button
            type="button"
            onClick={() => setShowCrisisSupport(true)}
            className="relative shrink-0 h-9 w-9 rounded-full border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors flex items-center justify-center"
            aria-label="Open crisis support"
            title="Crisis support"
          >
            <AlertTriangle size={16} />
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500" />
          </button>
        )}
        <button
          type="button"
          onClick={handleEndSession}
          disabled={endingSession}
          className="relative z-10 shrink-0 text-xs font-semibold text-[#2C2A26]/60 hover:text-[#2C2A26] disabled:opacity-50 py-2 px-3 rounded-lg hover:bg-[#F5F0EB] transition-colors"
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

      {/* Message List */}
      <div 
        ref={scrollRef} 
        className="flex-1 overflow-y-auto px-4 py-6 space-y-6 relative z-10"
      >
        <div className="max-w-2xl mx-auto space-y-6">
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
          {messages.map((m, idx) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ 
                duration: 0.8, 
                delay: idx === messages.length - 1 ? 0 : idx * 0.05,
                ease: [0.2, 0, 0.2, 1]
              }}
              className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'} zen-stagger-entry`}
            >
              <div className={`${m.role === 'assistant' ? 'animate-zen-float' : ''} w-full`}>
                <ChatMessage 
                  message={m} 
                  therapistColor={meta.color}
                  therapistInitial={meta.name[0]}
                  avatarUrl={meta.avatarUrl}
                />
              </div>
            </motion.div>
          ))}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start zen-stagger-entry"
            >
              <div className="animate-zen-float">
                <div className="zen-glass px-4 py-3 rounded-2xl flex items-center gap-1.5 border border-white/60">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#6B8F71] animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-[#6B8F71] animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-[#6B8F71] animate-bounce" />
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Footer / Input — Zen Glass */}
      <footer className="p-4 pb-8 zen-glass-heavy border-t border-white/50 relative z-30">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <input
            type="text"
            className="flex-1 bg-white/50 border border-white/80 rounded-2xl px-5 h-12 text-sm focus:outline-none focus:ring-2 focus:ring-[#6B8F71]/30 placeholder-[#2C2A26]/30 transition-all zen-card-shadow"
            placeholder={`Message ${meta.name}...`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!isLoading && !endingSession) {
                  handleSend();
                }
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || endingSession}
            className="w-12 h-12 rounded-2xl bg-[#6B8F71] text-white flex items-center justify-center hover:bg-[#5A7D60] active:scale-[0.95] disabled:opacity-30 transition-all shadow-lg shadow-[#6B8F71]/20"
          >
            <Send size={18} />
          </button>
        </div>
      </footer>
    </div>
  );
};
