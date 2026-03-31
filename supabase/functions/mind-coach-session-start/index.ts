import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { profile_id } = await req.json();

    if (!profile_id) {
      return new Response(
        JSON.stringify({ error: 'profile_id is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Get user profile, active journey, and latest journey snapshot.
    const [profileRes, journeyRes, latestJourneyRes] = await Promise.all([
      supabaseAdmin
        .from('mind_coach_profiles')
        .select('*')
        .eq('id', profile_id)
        .single(),
      supabaseAdmin
        .from('mind_coach_journeys')
        .select('*')
        .eq('profile_id', profile_id)
        .eq('active', true)
        .or('journey_state.is.null,journey_state.eq.active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('mind_coach_journeys')
        .select('*')
        .eq('profile_id', profile_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (profileRes.error || !profileRes.data) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    const profile = profileRes.data;
    const journey = journeyRes.data;
    const latestJourney = latestJourneyRes.data;

    const latestJourneyCompleted =
      latestJourney?.journey_state === 'completed' ||
      latestJourney?.phase_transition_result?.phase_gate_reason === 'journey_completed' ||
      latestJourney?.phase_transition_result?.recommended_next_action === 'complete_journey' ||
      Boolean(latestJourney?.completed_at);

    // Hard stop: do not create/reopen sessions for a completed journey lifecycle.
    if (!journey && latestJourneyCompleted) {
      return new Response(
        JSON.stringify({
          error: 'Journey already completed',
          error_code: 'JOURNEY_COMPLETED',
          journey_context: {
            id: latestJourney?.id ?? null,
            title: latestJourney?.title ?? null,
            journey_state: latestJourney?.journey_state ?? 'completed',
            completed_at: latestJourney?.completed_at ?? null,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      );
    }

    if (!journey) {
      return new Response(
        JSON.stringify({
          error: 'No active journey found',
          error_code: 'NO_ACTIVE_JOURNEY',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      );
    }

    // 2. Reuse unfinished session if one already exists.
    const { data: existingSession } = await supabaseAdmin
      .from('mind_coach_sessions')
      .select('*')
      .eq('profile_id', profile_id)
      .eq('journey_id', journey.id)
      .in('session_state', ['intake', 'active', 'wrapping_up'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingSession) {
      return new Response(
        JSON.stringify({
          session: existingSession,
          reused_existing: true,
          journey_context: journey ? {
            id: journey.id,
            title: journey.title,
            current_phase: (journey.current_phase_index ?? 0) + 1,
            phases: journey.phases,
          } : null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // 2.5 Reopen latest completed session when summary indicates unresolved/remedial continuation.
    const { data: latestCompletedSession } = await supabaseAdmin
      .from('mind_coach_sessions')
      .select('id,summary_data,ended_at')
      .eq('profile_id', profile_id)
      .eq('journey_id', journey?.id ?? '')
      .eq('session_state', 'completed')
      .order('ended_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestCompletedSession) {
      const summary =
        latestCompletedSession.summary_data && typeof latestCompletedSession.summary_data === 'object'
          ? (latestCompletedSession.summary_data as Record<string, unknown>)
          : null;
      const phaseTransition =
        summary?.phase_transition_result && typeof summary.phase_transition_result === 'object'
          ? (summary.phase_transition_result as Record<string, unknown>)
          : null;
      const status = String(phaseTransition?.session_transition_status ?? '').toLowerCase();
      const action = String(phaseTransition?.recommended_next_action ?? '').toLowerCase();
      const unresolvedGoal =
        status === 'revisit' ||
        status === 'blocked' ||
        action === 'revisit' ||
        action === 'stabilize' ||
        action === 'escalate';
      const title = String(summary?.title ?? '').toLowerCase();
      const openingReflection = String(summary?.opening_reflection ?? '').toLowerCase();
      const fallbackSummaryNeedsContinuation =
        phaseTransition == null &&
        (
          title.includes('session wrap-up') ||
          openingReflection.includes('placeholder summary') ||
          summary?.takeaway_task != null
        );
      if (unresolvedGoal || fallbackSummaryNeedsContinuation) {
        const { data: reopenedSession } = await supabaseAdmin
          .from('mind_coach_sessions')
          .update({
            session_state: 'active',
            ended_at: null,
          })
          .eq('id', latestCompletedSession.id)
          .select('*')
          .single();
        if (reopenedSession) {
          return new Response(
            JSON.stringify({
              session: reopenedSession,
              reused_existing: true,
              journey_context: journey ? {
                id: journey.id,
                title: journey.title,
                current_phase: (journey.current_phase_index ?? 0) + 1,
                phases: journey.phases,
              } : null,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        }
      }
    }

    // 3. Determine session context from journey
    const currentPhaseIndex = journey?.current_phase_index ?? 0;
    const sessionsCompleted = journey?.sessions_completed ?? 0;
    const pathway = journey?.pathway || 'engagement_rapport_and_assessment';
    let resolvedPhaseNumber = currentPhaseIndex + 1;
    if (journey?.id) {
      const { data: journeySessionRows } = await supabaseAdmin
        .from('mind_coach_journey_sessions')
        .select('phase_number,session_order,status,attempt_count')
        .eq('journey_id', journey.id)
        .order('phase_number', { ascending: true })
        .order('session_order', { ascending: true })
        .order('attempt_count', { ascending: false });
      if (Array.isArray(journeySessionRows) && journeySessionRows.length > 0) {
        const byKey = new Map<string, any>();
        for (const row of journeySessionRows) {
          const key = `${Number(row.phase_number)}:${Number(row.session_order)}`;
          const prev = byKey.get(key);
          if (!prev || Number(row.attempt_count ?? 1) > Number(prev.attempt_count ?? 1)) {
            byKey.set(key, row);
          }
        }
        const latestRows = [...byKey.values()].sort(
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

    // 4. Create new session
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('mind_coach_sessions')
      .insert({
        profile_id,
        journey_id: journey?.id ?? null,
        phase_number: resolvedPhaseNumber,
        session_number: sessionsCompleted + 1,
        session_state: 'intake',
        message_count: 0,
        pathway,
        dynamic_theme: null,
      })
      .select()
      .single();

    if (sessionErr || !session) {
      console.error('Session creation error:', sessionErr);
      return new Response(
        JSON.stringify({ error: 'Failed to create session', details: sessionErr?.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        session,
        journey_context: journey ? {
          id: journey.id,
          title: journey.title,
          current_phase: currentPhaseIndex + 1,
          phases: journey.phases,
        } : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('mind-coach-session-start error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
