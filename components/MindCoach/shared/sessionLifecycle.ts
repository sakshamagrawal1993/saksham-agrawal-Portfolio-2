import { supabase } from '../../../lib/supabaseClient';
import type { ChatMessage, MindCoachJourney, MindCoachProfile, MindCoachSession } from '../../../store/mindCoachStore';

type OpenOrCreateArgs = {
  profile: MindCoachProfile;
  journey: MindCoachJourney | null;
  sessions: MindCoachSession[];
};

type OpenOrCreateResult = {
  session: MindCoachSession;
  initialMessages: ChatMessage[];
  reusedExisting: boolean;
};

const IN_PROGRESS_STATES = ['intake', 'active', 'wrapping_up'] as const;

async function fetchSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from('mind_coach_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  return (data as ChatMessage[]) ?? [];
}

async function fetchHistoricalMessages(sessionIds: string[]): Promise<ChatMessage[]> {
  if (sessionIds.length === 0) return [];
  const { data } = await supabase
    .from('mind_coach_messages')
    .select('*')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: true });
  return (data as ChatMessage[]) ?? [];
}

export async function openOrCreateInProgressSession({
  profile,
  journey,
  sessions,
}: OpenOrCreateArgs): Promise<OpenOrCreateResult> {
  // Prefer server-authoritative bootstrap so continuation/reopen logic is
  // consistent with backend policy (and not blocked by client-side RLS).
  const { data: startPayload, error: startErr } = await supabase.functions.invoke('mind-coach-session-start', {
    body: { profile_id: profile.id },
  });
  const startedSession =
    startPayload &&
    typeof startPayload === 'object' &&
    startPayload.session &&
    typeof startPayload.session === 'object'
      ? (startPayload.session as MindCoachSession)
      : null;
  const startStatusCode =
    startErr && typeof startErr === 'object' && 'context' in (startErr as Record<string, unknown>)
      ? Number(((startErr as any).context as any)?.status ?? 0)
      : 0;
  const startErrorCode =
    startPayload &&
    typeof startPayload === 'object' &&
    typeof (startPayload as Record<string, unknown>).error_code === 'string'
      ? String((startPayload as Record<string, unknown>).error_code)
      : null;
  if (!startErr && startedSession) {
    const reusedExisting = Boolean(
      startPayload &&
      typeof startPayload === 'object' &&
      'reused_existing' in startPayload &&
      startPayload.reused_existing,
    );
    const initialMessages = reusedExisting
      ? await fetchSessionMessages(startedSession.id)
      : await fetchHistoricalMessages(
          sessions
            .filter((s) => s.journey_id === (journey?.id ?? null))
            .map((s) => s.id)
            .filter(Boolean),
        );
    return {
      session: startedSession,
      initialMessages,
      reusedExisting,
    };
  }
  if (startErrorCode === 'JOURNEY_COMPLETED') {
    throw new Error('journey_completed');
  }
  if (startErrorCode === 'NO_ACTIVE_JOURNEY') {
    throw new Error('no_active_journey');
  }
  if (startStatusCode === 409) {
    throw new Error('no_active_journey');
  }

  let existingQuery = supabase
    .from('mind_coach_sessions')
    .select('*')
    .eq('profile_id', profile.id)
    .in('session_state', [...IN_PROGRESS_STATES]);

  if (journey?.id) {
    existingQuery = existingQuery.eq('journey_id', journey.id);
  }

  const { data: existingRows } = await existingQuery
    .order('started_at', { ascending: false })
    .limit(5);

  const existing = Array.isArray(existingRows) && existingRows.length > 0
    ? (existingRows[0] as MindCoachSession)
    : null;

  if (existing) {
    const sessionMessages = await fetchSessionMessages(existing.id);
    return {
      session: existing,
      initialMessages: sessionMessages,
      reusedExisting: true,
    };
  }

  // If the last session ended without meeting objective, continue the same session thread
  // instead of spawning a new one. This keeps remediation clinically coherent.
  if (journey?.id) {
    const { data: latestCompleted } = await supabase
      .from('mind_coach_sessions')
      .select('*')
      .eq('profile_id', profile.id)
      .eq('journey_id', journey.id)
      .eq('session_state', 'completed')
      .order('ended_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const latestSummary =
      latestCompleted?.summary_data && typeof latestCompleted.summary_data === 'object'
        ? (latestCompleted.summary_data as Record<string, any>)
        : null;
    const transition =
      latestSummary?.phase_transition_result && typeof latestSummary.phase_transition_result === 'object'
        ? latestSummary.phase_transition_result
        : null;
    const unresolvedGoal =
      transition?.session_transition_status === 'revisit' ||
      transition?.session_transition_status === 'blocked' ||
      transition?.recommended_next_action === 'revisit' ||
      transition?.recommended_next_action === 'stabilize' ||
      transition?.recommended_next_action === 'escalate';
    const fallbackSummaryNeedsContinuation =
      transition == null &&
      (
        String(latestSummary?.title ?? '').toLowerCase().includes('session wrap-up') ||
        String(latestSummary?.opening_reflection ?? '').toLowerCase().includes('placeholder summary') ||
        latestSummary?.takeaway_task != null
      );
    if (latestCompleted && (unresolvedGoal || fallbackSummaryNeedsContinuation)) {
      const { data: reopened, error: reopenErr } = await supabase
        .from('mind_coach_sessions')
        .update({
          session_state: 'active',
          ended_at: null,
        })
        .eq('id', latestCompleted.id)
        .select('*')
        .single();
      if (!reopenErr && reopened) {
        const sessionMessages = await fetchSessionMessages(reopened.id);
        return {
          session: reopened as MindCoachSession,
          initialMessages: sessionMessages,
          reusedExisting: true,
        };
      }
    }
  }

  let resolvedPhaseNumber = Math.max(1, Number(journey?.current_phase ?? 1));
  if (journey?.id) {
    const { data: plannedRows } = await supabase
      .from('mind_coach_journey_sessions')
      .select('phase_number,session_order,status,attempt_count')
      .eq('journey_id', journey.id)
      .order('phase_number', { ascending: true })
      .order('session_order', { ascending: true })
      .order('attempt_count', { ascending: false });
    if (Array.isArray(plannedRows) && plannedRows.length > 0) {
      const byPhaseOrder = new Map<string, any>();
      for (const row of plannedRows) {
        const key = `${Number(row.phase_number)}:${Number(row.session_order)}`;
        const prev = byPhaseOrder.get(key);
        if (!prev || Number(row.attempt_count ?? 1) > Number(prev.attempt_count ?? 1)) {
          byPhaseOrder.set(key, row);
        }
      }
      const latestRows = [...byPhaseOrder.values()].sort(
        (a, b) => Number(a.phase_number) - Number(b.phase_number) || Number(a.session_order) - Number(b.session_order),
      );
      const activeRow =
        latestRows.find((r) => r.status === 'in_progress') ||
        latestRows.find((r) => r.status === 'revisit') ||
        latestRows.find((r) => r.status === 'blocked') ||
        latestRows.find((r) => r.status === 'planned') ||
        null;
      if (activeRow && Number.isFinite(Number(activeRow.phase_number))) {
        resolvedPhaseNumber = Math.max(1, Number(activeRow.phase_number));
      }
    }
  }

  const newSession: Partial<MindCoachSession> = {
    profile_id: profile.id,
    journey_id: journey?.id ?? null,
    phase_number: resolvedPhaseNumber,
    session_number: (journey?.sessions_completed ?? sessions.filter((s) => s.journey_id === (journey?.id ?? null) && s.session_state === 'completed').length) + 1,
    session_state: 'active',
    message_count: 0,
    pathway: journey?.pathway ?? null,
    dynamic_theme: null,
  };

  const { data: createdSession, error: createErr } = await supabase
    .from('mind_coach_sessions')
    .insert(newSession)
    .select('*')
    .single();

  if (createErr || !createdSession) {
    throw new Error(createErr?.message || 'Could not start a new session.');
  }

  const previousSessionIds = sessions
    .filter((s) => s.journey_id === (journey?.id ?? null))
    .map((s) => s.id)
    .filter(Boolean);
  const historicalMessages = await fetchHistoricalMessages(previousSessionIds);

  return {
    session: createdSession as MindCoachSession,
    initialMessages: historicalMessages,
    reusedExisting: false,
  };
}
