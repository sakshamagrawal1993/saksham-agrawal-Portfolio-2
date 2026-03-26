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

    // 1. Get user profile and active journey
    const [profileRes, journeyRes] = await Promise.all([
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

    // 2. Determine session context from journey
    const currentPhaseIndex = journey?.current_phase_index ?? 0;
    const sessionsCompleted = journey?.sessions_completed ?? 0;
    const pathway = journey?.pathway || 'engagement_rapport_and_assessment';

    // 3. Create new session
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('mind_coach_sessions')
      .insert({
        profile_id,
        journey_id: journey?.id ?? null,
        phase_number: currentPhaseIndex + 1,
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
