import {
  type SessionGoalContext,
  resolveSessionGoalContext,
} from './mindCoachSessionGoals.ts';

/**
 * Shared context builder for Mind Coach edge functions.
 *
 * Provides a single "continuity pack" consumed by both the chat and
 * session-end edge functions so that every therapist turn — greeting
 * or mid-session — has consistent, server-authoritative context.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface ConversationTurn {
  role: string;
  content: string;
  created_at?: string;
  session_id?: string;
}

export interface TaskContextItem {
  task_type: string;
  dynamic_title: string;
  dynamic_description: string;
  status: string;
  task_end_date?: string;
}

export interface CaseNoteItem {
  case_notes: Record<string, unknown> | null;
  ended_at?: string;
  summary_data?: Record<string, unknown> | null;
}

export type SessionStage = 'early' | 'middle' | 'late';

export interface PhaseContextPack {
  current_phase_index: number;
  total_phases: number;
  current_phase: Record<string, unknown> | null;
  next_phase: Record<string, unknown> | null;
  completed_in_current_phase: number;
  target_sessions_in_current_phase: number;
  session_stage: SessionStage;
  phase_goal: string | null;
  sessions_remaining_in_phase: number;
  session_goal_context: SessionGoalContext | null;
}

export interface ContinuityPack {
  last_20_conversations: ConversationTurn[];
  active_tasks_context: TaskContextItem[];
  recent_case_notes_context: CaseNoteItem[];
  phase_context: PhaseContextPack | null;
  session_stage: SessionStage;
  session_goal_context: SessionGoalContext | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

const DEFAULT_MIN_SESSIONS_PER_PHASE = 3;

function getRequiredSessionsForPhase(phase: any): number {
  if (!phase || !Array.isArray(phase.sessions)) return DEFAULT_MIN_SESSIONS_PER_PHASE;
  return Math.max(1, phase.sessions.length || DEFAULT_MIN_SESSIONS_PER_PHASE);
}

function deriveSessionStage(completed: number, target: number): SessionStage {
  if (target <= 0) return 'early';
  const ratio = completed / target;
  if (ratio < 0.4) return 'early';
  if (ratio < 0.75) return 'middle';
  return 'late';
}

// ── Builders ─────────────────────────────────────────────────────────

/**
 * Fetch the most recent `limit` messages across the profile's completed
 * sessions *plus* the current session, ordered chronologically.
 */
export async function buildConversationWindow(
  supabaseAdmin: any,
  profileId: string,
  currentSessionId: string,
  limit = 20,
): Promise<ConversationTurn[]> {
  const { data: recentSessions } = await supabaseAdmin
    .from('mind_coach_sessions')
    .select('id')
    .eq('profile_id', profileId)
    .in('session_state', ['active', 'completed'])
    .order('started_at', { ascending: false })
    .limit(5);

  const sessionIds: string[] = [];
  if (recentSessions) {
    for (const s of recentSessions) {
      if (!sessionIds.includes(s.id)) sessionIds.push(s.id);
    }
  }
  if (!sessionIds.includes(currentSessionId)) {
    sessionIds.push(currentSessionId);
  }

  const { data: msgs } = await supabaseAdmin
    .from('mind_coach_messages')
    .select('role, content, created_at, session_id')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  const all: ConversationTurn[] = (msgs || [])
    .map((m: any) => ({
      role: m.role,
      content: m.content,
      created_at: m.created_at,
      session_id: m.session_id,
    }))
    .reverse();

  return all;
}

export async function buildTaskContext(
  supabaseAdmin: any,
  profileId: string,
): Promise<TaskContextItem[]> {
  const { data } = await supabaseAdmin
    .from('mind_coach_user_tasks')
    .select('task_type, dynamic_title, dynamic_description, status, task_end_date')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(10);

  return (data || []).map((t: any) => ({
    task_type: t.task_type,
    dynamic_title: t.dynamic_title,
    dynamic_description: t.dynamic_description,
    status: t.status,
    task_end_date: t.task_end_date,
  }));
}

export async function buildCaseNotesContext(
  supabaseAdmin: any,
  profileId: string,
  limit = 3,
): Promise<CaseNoteItem[]> {
  const { data } = await supabaseAdmin
    .from('mind_coach_sessions')
    .select('case_notes, ended_at, summary_data')
    .eq('profile_id', profileId)
    .eq('session_state', 'completed')
    .order('ended_at', { ascending: false })
    .limit(limit);

  return (data || []).map((r: any) => ({
    case_notes: r.case_notes,
    ended_at: r.ended_at,
    summary_data: r.summary_data,
  }));
}

export async function buildPhaseContext(
  supabaseAdmin: any,
  profileId: string,
  sessionId: string,
): Promise<PhaseContextPack | null> {
  const { data: sessionRow } = await supabaseAdmin
    .from('mind_coach_sessions')
    .select('journey_id, pathway')
    .eq('id', sessionId)
    .single();

  if (!sessionRow?.journey_id) return null;

  const { data: journey } = await supabaseAdmin
    .from('mind_coach_journeys')
    .select('*')
    .eq('id', sessionRow.journey_id)
    .single();

  if (!journey) return null;

  const phases = Array.isArray(journey.phases) ? journey.phases : [];
  const currentPhaseIndex = Number.isFinite(journey.current_phase_index)
    ? journey.current_phase_index
    : Math.max(0, (journey.current_phase || 1) - 1);
  const currentPhase = phases[currentPhaseIndex] ?? null;
  const nextPhase = currentPhaseIndex + 1 < phases.length ? phases[currentPhaseIndex + 1] : null;
  const target = getRequiredSessionsForPhase(currentPhase);

  const { count } = await supabaseAdmin
    .from('mind_coach_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('journey_id', journey.id)
    .eq('phase_number', currentPhaseIndex + 1)
    .eq('session_state', 'completed');

  const completed = count ?? 0;
  const stage = deriveSessionStage(completed, target);
  const phaseGoal: string | null =
    typeof currentPhase?.goal === 'string' ? currentPhase.goal : null;
  const sessionGoalContext = resolveSessionGoalContext(currentPhase, completed, DEFAULT_MIN_SESSIONS_PER_PHASE);

  return {
    current_phase_index: currentPhaseIndex,
    total_phases: phases.length,
    current_phase: currentPhase,
    next_phase: nextPhase,
    completed_in_current_phase: completed,
    target_sessions_in_current_phase: target,
    session_stage: stage,
    phase_goal: phaseGoal,
    sessions_remaining_in_phase: Math.max(0, target - completed),
    session_goal_context: sessionGoalContext,
  };
}

/**
 * One-call aggregator that builds the full continuity pack.
 */
export async function buildContinuityPack(
  supabaseAdmin: any,
  profileId: string,
  sessionId: string,
  options?: { transcriptLimit?: number },
): Promise<ContinuityPack> {
  const transcriptLimit = Number.isFinite(options?.transcriptLimit)
    ? Math.max(8, Math.min(30, Number(options?.transcriptLimit)))
    : 20;
  const [conversations, tasks, caseNotes, phaseCtx] = await Promise.all([
    buildConversationWindow(supabaseAdmin, profileId, sessionId, transcriptLimit),
    buildTaskContext(supabaseAdmin, profileId),
    buildCaseNotesContext(supabaseAdmin, profileId, 3),
    buildPhaseContext(supabaseAdmin, profileId, sessionId),
  ]);

  return {
    last_20_conversations: conversations,
    active_tasks_context: tasks,
    recent_case_notes_context: caseNotes,
    phase_context: phaseCtx,
    session_stage: phaseCtx?.session_stage ?? 'early',
    session_goal_context: phaseCtx?.session_goal_context ?? null,
  };
}
