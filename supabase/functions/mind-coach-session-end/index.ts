import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { session_id, profile_id } = await req.json();

    if (!session_id || !profile_id) {
      return new Response(
        JSON.stringify({ error: 'Missing session_id or profile_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Fetch session + messages
    const [sessionRes, messagesRes, journeyRes, profileRes] = await Promise.all([
      supabaseAdmin
        .from('mind_coach_sessions')
        .select('*')
        .eq('id', session_id)
        .single(),
      supabaseAdmin
        .from('mind_coach_messages')
        .select('role,content,created_at')
        .eq('session_id', session_id)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('mind_coach_journeys')
        .select('*')
        .eq('profile_id', profile_id)
        .eq('active', true)
        .single(),
      supabaseAdmin
        .from('mind_coach_profiles')
        .select('name,therapist_id,concerns')
        .eq('id', profile_id)
        .single(),
    ]);

    const session = sessionRes.data;
    const messages = messagesRes.data || [];
    const journey = journeyRes.data;
    const profile = profileRes.data;

    if (!session || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Session not found or empty' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    const transcript = messages
      .map((m: any) => `[${m.role.toUpperCase()}]: ${m.content}`)
      .join('\n');

    const currentPhase = journey?.phases?.[journey?.current_phase_index ?? 0];

    // 2. Generate Case Notes + Summary via GPT-4o-mini
    const systemPrompt = `You are a clinical supervisor generating structured post-session documentation for an AI therapy session.

Session context:
- Client name: ${profile?.name || 'User'}
- Pathway: ${session.pathway || 'exploratory_validation'}
- Dynamic theme: ${session.dynamic_theme || 'Not yet identified'}
- Session number: ${session.session_number || 1}
- Current phase: ${currentPhase?.name || 'Phase 1'}
- Phase goal: ${currentPhase?.goal || 'Establish therapeutic rapport'}

Generate TWO outputs:

1. CASE_NOTES: Structured clinical documentation (JSON)
2. SESSION_SUMMARY: Client-facing session summary (JSON)

Return ONLY valid JSON.`;

    const userPrompt = `Analyze this therapy transcript and generate documentation.

TRANSCRIPT:
${transcript}

Return JSON with this schema:
{
  "case_notes": {
    "presenting_concern": "string - what the client brought to this session",
    "dynamic_theme": "string - the underlying theme identified",
    "interventions_used": ["array of therapeutic techniques applied"],
    "client_engagement": "low | moderate | high",
    "emotional_arc": "string - how the client's emotional state shifted",
    "key_insights": ["array of breakthrough moments or realizations"],
    "resistance_patterns": ["array of avoidance or resistance observed"],
    "homework_suggested": "string or null",
    "risk_flags": ["array of concerning statements, empty if none"],
    "phase_progress": "string - progress toward current phase goal",
    "readiness_for_next_phase": "not_ready | approaching | ready"
  },
  "session_summary": {
    "title": "string - warm, non-clinical title for the session",
    "opening_reflection": "string - 2-3 sentences acknowledging the session",
    "key_themes": ["3-4 themes explored"],
    "growth_moments": ["2-3 positive observations"],
    "gentle_challenge": "string - one area to reflect on before next session",
    "therapist_note": "string - warm closing from the therapist persona",
    "mood_shift": { "start": "string emotion", "end": "string emotion" },
    "phase_specific": {
      "phase_name": "string",
      "phase_goal": "string",
      "progress_summary": "string - how this session contributed to the phase goal"
    }
  },
  "extracted_memories": [
    {
      "memory_text": "string - specific fact or preference to remember long-term",
      "memory_type": "fact | preference | trigger | coping_strategy | relationship | goal"
    }
  ]
}`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 2000,
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      console.error('OpenAI error:', errText);
      return new Response(
        JSON.stringify({ error: 'Failed to generate session summary', details: errText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
    }

    const aiResult = await openaiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response', raw: content }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const { case_notes, session_summary, extracted_memories } = parsed;

    // 3. Update session as completed
    await supabaseAdmin
      .from('mind_coach_sessions')
      .update({
        session_state: 'completed',
        ended_at: new Date().toISOString(),
        case_notes,
        summary_data: session_summary,
        dynamic_theme: case_notes?.dynamic_theme || session.dynamic_theme,
        pathway: session.pathway,
      })
      .eq('id', session_id);

    // 4. Store extracted memories
    if (extracted_memories?.length > 0) {
      const memoryRows = extracted_memories.map((m: any) => ({
        profile_id,
        session_id,
        memory_text: m.memory_text,
        memory_type: m.memory_type || 'fact',
      }));
      await supabaseAdmin.from('mind_coach_memories').insert(memoryRows);
    }

    // 5. Update journey progress
    if (journey) {
      const newSessionCount = (journey.sessions_completed || 0) + 1;
      const journeyUpdate: Record<string, any> = {
        sessions_completed: newSessionCount,
      };

      if (case_notes?.readiness_for_next_phase === 'ready' && journey.current_phase_index < (journey.phases?.length || 0) - 1) {
        journeyUpdate.current_phase_index = journey.current_phase_index + 1;
      }

      await supabaseAdmin
        .from('mind_coach_journeys')
        .update(journeyUpdate)
        .eq('id', journey.id);
    }

    return new Response(
      JSON.stringify({
        case_notes,
        session_summary,
        memories_stored: extracted_memories?.length || 0,
        session_id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('mind-coach-session-end error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
