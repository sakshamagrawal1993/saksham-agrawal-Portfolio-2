import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { session_id, profile_id } = await req.json();

    if (!session_id || !profile_id) {
       return new Response(JSON.stringify({ error: 'Missing required IDs' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const n8nWebhookUrl = Deno.env.get('MC_N8N_SESSION_END_WEBHOOK_URL') || 'https://your-n8n-instance.com/webhook/mind-coach-session-end';
    const n8nSecret = Deno.env.get('MC_N8N_WEBHOOK_SECRET') || 'placeholder-secret';

    const [sessionRes, messagesRes, profileRes] = await Promise.all([
        supabaseAdmin.from('mind_coach_sessions').select('*').eq('id', session_id).single(),
        supabaseAdmin.from('mind_coach_messages').select('role, content').eq('session_id', session_id).order('created_at', { ascending: true }),
        supabaseAdmin.from('mind_coach_profiles').select('*').eq('id', profile_id).single()
    ]);

    const session = sessionRes.data;
    const messages = messagesRes.data || [];
    const profile = profileRes.data;

    if (!session || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Session not found or empty' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    let transcript = messages.map(m => `${m.role === 'user' ? 'Client' : 'Therapist'}: ${m.content}`).join('\n');

    let currentPhase = null;
    let title = session.pathway;
    let journey: any = null;
    if (session.journey_id) {
        const { data: journeyData } = await supabaseAdmin.from('mind_coach_journeys').select('*').eq('id', session.journey_id).single();
        journey = journeyData;
        if (journey && journey.phases) {
            currentPhase = journey.phases[journey.current_phase_index || 0];
            title = journey.title;
        }
    }

    // 1. Send the data to the new n8n Summarizer Webhook
    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-n8n-secret': n8nSecret,
      },
      body: JSON.stringify({
        session_id,
        profile_id,
        transcript,
        profile,
        session: {
          pathway: title,
          dynamic_theme: session.dynamic_theme,
          session_number: (journey?.sessions_completed || 0) + 1
        },
        currentPhase
      }),
    });

    if (!n8nResponse.ok) {
      const errText = await n8nResponse.text();
      console.error('n8n error:', errText);
      return new Response(
        JSON.stringify({ error: 'Failed to generate session summary', details: errText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
    }

    let parsed = await n8nResponse.json();
    parsed = Array.isArray(parsed) ? parsed[0] : parsed;

    const { case_notes, session_summary, extracted_memories, extracted_tasks } = parsed;

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

    // 4.5. Store extracted tasks (Hybrid model: LLM picks type + writes content,
    //      backend calculates exact dates deterministically)
    if (extracted_tasks?.length > 0) {
      const now = new Date();
      const taskRows = extracted_tasks.map((t: any) => {
        const startDate = new Date(now);
        const durationDays = typeof t.suggested_duration_days === 'number' && t.suggested_duration_days > 0
          ? t.suggested_duration_days
          : 7; // sensible default
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + durationDays);

        return {
          profile_id,
          session_id,
          // Structured template category chosen by LLM
          task_type: t.task_type || 'general',
          // Personalised content written by LLM
          dynamic_title: t.dynamic_title || t.task_name || 'Session Task',
          dynamic_description: t.dynamic_description || t.task_description || '',
          // Legacy column kept for backward-compat
          task_name: t.dynamic_title || t.task_name || 'Session Task',
          task_description: t.dynamic_description || t.task_description || '',
          task_frequency: t.frequency || t.task_frequency || 'daily',
          // Backend-calculated dates — never trust LLM timestamps
          task_start_date: startDate.toISOString(),
          task_end_date: endDate.toISOString(),
          status: 'active',
        };
      });
      await supabaseAdmin.from('mind_coach_user_tasks').insert(taskRows);
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
        tasks_stored: extracted_tasks?.length || 0,
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
