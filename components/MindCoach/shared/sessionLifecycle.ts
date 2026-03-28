import { supabase } from '../../../lib/supabaseClient';
import type { ChatMessage, MindCoachJourney, MindCoachProfile, MindCoachSession } from '../../../store/mindCoachStore';

type OpenOrCreateArgs = {
  profile: MindCoachProfile;
  journey: MindCoachJourney | null;
  currentPhase: number;
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
  currentPhase,
  sessions,
}: OpenOrCreateArgs): Promise<OpenOrCreateResult> {
  const { data: existingRows } = await supabase
    .from('mind_coach_sessions')
    .select('*')
    .eq('profile_id', profile.id)
    .in('session_state', [...IN_PROGRESS_STATES])
    .order('created_at', { ascending: false })
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

  const completedInPhase = sessions.filter(
    (s) => s.session_state === 'completed' && s.phase_number === currentPhase,
  ).length;

  const newSession: Partial<MindCoachSession> = {
    profile_id: profile.id,
    journey_id: journey?.id ?? null,
    phase_number: currentPhase,
    session_number: completedInPhase + 1,
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

  const previousSessionIds = sessions.map((s) => s.id).filter(Boolean);
  const historicalMessages = await fetchHistoricalMessages(previousSessionIds);

  return {
    session: createdSession as MindCoachSession,
    initialMessages: historicalMessages,
    reusedExisting: false,
  };
}
