import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

const DEFAULT_MIN_SESSIONS_PER_PHASE = 3;
const DEFAULT_MAX_SESSIONS_PER_PHASE = 5;
const DEFAULT_PATHWAY_PREVIEW_IMAGE_URL =
  'https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/mind%20coach/Generated_image.jpg';

function getRequiredSessionsForPhase(phase: any): number {
  if (!phase || !Array.isArray(phase.sessions)) return DEFAULT_MIN_SESSIONS_PER_PHASE;
  return Math.max(1, phase.sessions.length || DEFAULT_MIN_SESSIONS_PER_PHASE);
}

function hasMajorRiskSignals(caseNotes: any, sessionSummary: any): boolean {
  const riskLevel = String(caseNotes?.risk_level ?? caseNotes?.risk ?? '').toLowerCase();
  if (riskLevel === 'high' || riskLevel === 'critical') return true;
  if (caseNotes?.crisis_detected === true || caseNotes?.requires_escalation === true) return true;
  if (sessionSummary?.crisis_detected === true || sessionSummary?.requires_escalation === true) return true;
  return false;
}

function normalizePathwayCandidate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function pathwayDisplayName(pathwayName: string): string {
  return pathwayName
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { session_id, profile_id } = body;

    if (!session_id || !profile_id) {
       return new Response(JSON.stringify({ error: 'Missing required IDs' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const n8nWebhookUrl = Deno.env.get('MC_N8N_SESSION_END_WEBHOOK_URL') || 'https://your-n8n-instance.com/webhook/mind-coach-session-end';
    const n8nSecret = Deno.env.get('MC_N8N_WEBHOOK_SECRET') || 'placeholder-secret';

    const [sessionRes, messagesRes, profileRes, memoriesRes, caseNotesRes, tasksRes, assessmentsRes, moodRes] = await Promise.all([
        supabaseAdmin.from('mind_coach_sessions').select('*').eq('id', session_id).single(),
        supabaseAdmin.from('mind_coach_messages').select('role, content, created_at').eq('session_id', session_id).order('created_at', { ascending: true }),
        supabaseAdmin.from('mind_coach_profiles').select('*').eq('id', profile_id).single(),
        supabaseAdmin
          .from('mind_coach_memories')
          .select('memory_text, memory_type, created_at')
          .eq('profile_id', profile_id)
          .order('created_at', { ascending: false })
          .limit(1),
        supabaseAdmin
          .from('mind_coach_sessions')
          .select('case_notes, ended_at')
          .eq('profile_id', profile_id)
          .eq('session_state', 'completed')
          .order('ended_at', { ascending: false })
          .limit(2),
        supabaseAdmin
          .from('mind_coach_user_tasks')
          .select('task_type,dynamic_title,dynamic_description,status,task_end_date')
          .eq('profile_id', profile_id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(10),
        supabaseAdmin
          .from('mind_coach_assessment_scores')
          .select('assessment_type,total_score,severity,created_at')
          .eq('profile_id', profile_id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabaseAdmin
          .from('mind_coach_mood_entries')
          .select('score,notes,created_at')
          .eq('profile_id', profile_id)
          .order('created_at', { ascending: false })
          .limit(14),
    ]);

    const session = sessionRes.data;
    const incomingMessages = Array.isArray(body?.messages) ? body.messages : [];
    const messages = incomingMessages.length > 0 ? incomingMessages : (messagesRes.data || []);
    const profile =
      body?.profile && typeof body.profile === 'object'
        ? body.profile
        : profileRes.data;

    if (!session || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Session not found or empty' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    const messagesPayload = messages.map((m: any) => ({
      role: m.role,
      content: m.content,
      created_at: m.created_at,
    }));
    let transcript =
      typeof body?.transcript === 'string' && body.transcript.trim().length > 0
        ? body.transcript
        : messagesPayload
            .map((m: any) => `${m.role === 'user' ? 'Client' : 'Therapist'}: ${m.content}`)
            .join('\n');

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

    const currentPhaseIndex = journey?.current_phase_index ?? Math.max(0, (journey?.current_phase || 1) - 1);
    const phases = Array.isArray(journey?.phases) ? journey.phases : [];
    const currentPhaseContext =
      (body?.currentPhase && typeof body.currentPhase === 'object' ? body.currentPhase : null) ??
      phases[currentPhaseIndex] ??
      currentPhase ??
      null;
    const nextPhaseContext =
      (body?.phase_context && typeof body.phase_context === 'object' && body.phase_context.next_phase)
        ? body.phase_context.next_phase
        : currentPhaseIndex + 1 < phases.length
          ? phases[currentPhaseIndex + 1]
          : null;
    const completedInCurrentPhase =
      journey?.id
        ? ((await supabaseAdmin
            .from('mind_coach_sessions')
            .select('id', { count: 'exact', head: true })
            .eq('journey_id', journey.id)
            .eq('phase_number', currentPhaseIndex + 1)
            .eq('session_state', 'completed')).count ?? 0)
        : 0;
    const targetInCurrentPhase = getRequiredSessionsForPhase(currentPhaseContext);

    const n8nPayload = {
      session_id,
      profile_id,
      transcript,
      messages: messagesPayload,
      profile,
      session: {
        pathway: body?.session?.pathway || title,
        pathway_slug: session.pathway,
        discovery_state: journey?.discovery_state ?? null,
        dynamic_theme: body?.session?.dynamic_theme || session.dynamic_theme,
        session_number: body?.session?.session_number || (journey?.sessions_completed || 0) + 1
      },
      currentPhase: currentPhaseContext,
      phase_context: {
        current_phase_index:
          (body?.phase_context && Number.isFinite(body.phase_context.current_phase_index))
            ? body.phase_context.current_phase_index
            : currentPhaseIndex,
        total_phases:
          (body?.phase_context && Number.isFinite(body.phase_context.total_phases))
            ? body.phase_context.total_phases
            : phases.length,
        current_phase: currentPhaseContext,
        next_phase: nextPhaseContext,
        completed_in_current_phase:
          (body?.phase_context && Number.isFinite(body.phase_context.completed_in_current_phase))
            ? body.phase_context.completed_in_current_phase
            : completedInCurrentPhase,
        target_sessions_in_current_phase:
          (body?.phase_context && Number.isFinite(body.phase_context.target_sessions_in_current_phase))
            ? body.phase_context.target_sessions_in_current_phase
            : targetInCurrentPhase,
      },
      memories: Array.isArray(body?.memories) ? body.memories : (memoriesRes.data || []),
      current_memory: body?.current_memory ?? memoriesRes.data?.[0] ?? null,
      recent_case_notes: Array.isArray(body?.recent_case_notes)
        ? body.recent_case_notes
        : (caseNotesRes.data || []).map((r: any) => r.case_notes).filter(Boolean),
      active_tasks: Array.isArray(body?.active_tasks) ? body.active_tasks : (tasksRes.data || []),
      assessments: assessmentsRes.data || [],
      mood_entries: Array.isArray(body?.mood_entries) ? body.mood_entries : (moodRes.data || []),
    };

    // 1. Send the data to the unified n8n session-end orchestrator webhook.
    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-n8n-secret': n8nSecret,
      },
      body: JSON.stringify(n8nPayload),
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

    const case_notes = parsed?.case_notes ?? null;
    const session_summary = parsed?.session_summary ?? null;
    const extracted_memories = Array.isArray(parsed?.extracted_memories) ? parsed.extracted_memories : [];
    const extracted_tasks = Array.isArray(parsed?.extracted_tasks) ? parsed.extracted_tasks : [];
    const agent_meta = parsed?.agent_meta && typeof parsed.agent_meta === 'object' ? parsed.agent_meta : null;
    const suggestedPathwayCandidate =
      normalizePathwayCandidate(parsed?.suggested_pathway) ??
      normalizePathwayCandidate(session_summary?.suggested_pathway) ??
      normalizePathwayCandidate(case_notes?.pathway_used) ??
      normalizePathwayCandidate(journey?.discovery_state?.suggested_pathway) ??
      null;

    if (
      suggestedPathwayCandidate &&
      suggestedPathwayCandidate !== 'engagement_rapport_and_assessment'
    ) {
      const confidenceCandidate = parsed?.pathway_confidence ?? session?.pathway_confidence ?? null;
      const { error: proposalErr } = await supabaseAdmin
        .from('mind_coach_pathway_proposals')
        .insert({
          profile_id,
          session_id,
          proposed_pathway: suggestedPathwayCandidate,
          confidence: typeof confidenceCandidate === 'number' ? confidenceCandidate : null,
          source: 'session_end',
          metadata: {
            dynamic_theme: case_notes?.dynamic_theme ?? session?.dynamic_theme ?? null,
          },
        });
      if (proposalErr) {
        console.error('pathway proposal insert failed:', proposalErr.message);
      }
    }

    const shouldAttachPathwayDetails =
      (session.pathway === 'engagement_rapport_and_assessment' || !session.pathway) &&
      suggestedPathwayCandidate &&
      suggestedPathwayCandidate !== 'engagement_rapport_and_assessment';

    let pathwayDetails: Record<string, unknown> | null = null;
    if (shouldAttachPathwayDetails) {
      const { data: phaseRows } = await supabaseAdmin
        .from('mind_coach_pathway_phases')
        .select('pathway_name,pathway_description,phase_number,phase_name,phase_description')
        .eq('pathway_name', suggestedPathwayCandidate)
        .order('phase_number', { ascending: true })
        .limit(4);

      const phases = Array.isArray(phaseRows)
        ? phaseRows.map((row: any) => ({
            phase_number: row.phase_number,
            phase_name: row.phase_name,
            phase_description: row.phase_description,
          }))
        : [];
      const pathwayDescription =
        phaseRows?.[0]?.pathway_description ||
        `A structured 4-phase pathway tailored for ${pathwayDisplayName(suggestedPathwayCandidate)}.`;

      pathwayDetails = {
        pathway_name: suggestedPathwayCandidate,
        pathway_title: pathwayDisplayName(suggestedPathwayCandidate),
        pathway_description: pathwayDescription,
        image_url: Deno.env.get('MC_PATHWAY_PREVIEW_IMAGE_URL') || DEFAULT_PATHWAY_PREVIEW_IMAGE_URL,
        phases,
      };
    }

    const summaryDataForStorage =
      session_summary && typeof session_summary === 'object'
        ? {
            ...session_summary,
            ...(suggestedPathwayCandidate ? { suggested_pathway: suggestedPathwayCandidate } : {}),
            ...(pathwayDetails ? { pathway_details: pathwayDetails } : {}),
          }
        : session_summary;

    // 3. Update session as completed
    await supabaseAdmin
      .from('mind_coach_sessions')
      .update({
        session_state: 'completed',
        ended_at: new Date().toISOString(),
        case_notes,
        summary_data: summaryDataForStorage,
        dynamic_theme: case_notes?.dynamic_theme || session.dynamic_theme,
        pathway: session.pathway,
      })
      .eq('id', session_id);

    // 4. Consolidate memory into a single per-profile blob (upsert on profile_id)
    let memoriesStored = 0;
    if (Array.isArray(extracted_memories) && extracted_memories.length > 0) {
      const candidate = extracted_memories.find(
        (m: any) => m && typeof m.memory_text === 'string' && m.memory_text.trim().length > 0,
      );
      if (candidate) {
        const { error: memoryErr } = await supabaseAdmin
          .from('mind_coach_memories')
          .upsert(
            {
              profile_id,
              session_id,
              memory_text: String(candidate.memory_text).trim(),
              // Consolidated memory architecture uses one long-term context block.
              memory_type: 'life_context',
            },
            { onConflict: 'profile_id' },
          );
        if (!memoryErr) memoriesStored = 1;
      }
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

    // 5. Update journey progress (pathway progression only; discovery flow remains unchanged)
    let phaseTransitionResult: Record<string, unknown> | null = null;
    if (journey) {
      const currentPhaseIndex = Number.isFinite(journey.current_phase_index)
        ? journey.current_phase_index
        : Math.max(0, (journey.current_phase || 1) - 1);
      const phases = Array.isArray(journey.phases) ? journey.phases : [];
      const phaseCount = phases.length;
      const hasNextPhase = currentPhaseIndex < phaseCount - 1;
      const progressionEnabled = (journey.pathway || session.pathway) !== 'engagement_rapport_and_assessment';
      const currentPhaseNumber = currentPhaseIndex + 1;
      const currentPhase = phases[currentPhaseIndex] ?? null;

      const { count: completedInPhase } = await supabaseAdmin
        .from('mind_coach_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('journey_id', journey.id)
        .eq('phase_number', currentPhaseNumber)
        .eq('session_state', 'completed');

      const { count: completedInJourney } = await supabaseAdmin
        .from('mind_coach_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('journey_id', journey.id)
        .eq('session_state', 'completed');

      const completedInCurrentPhase = completedInPhase ?? 0;
      const newSessionCount = completedInJourney ?? ((journey.sessions_completed || 0) + 1);
      const minSessionsForPhase = getRequiredSessionsForPhase(currentPhase);
      const maxSessionsForPhase = Math.max(minSessionsForPhase, DEFAULT_MAX_SESSIONS_PER_PHASE);
      const readinessSignal = String(case_notes?.readiness_for_next_phase ?? '').toLowerCase() === 'ready';
      const majorRisk = hasMajorRiskSignals(case_notes, session_summary);
      const readyGatePassed = readinessSignal && completedInCurrentPhase >= minSessionsForPhase;
      const maxSessionsFallbackPassed = completedInCurrentPhase >= maxSessionsForPhase && !majorRisk;
      const shouldAdvance = progressionEnabled && hasNextPhase && (readyGatePassed || maxSessionsFallbackPassed);

      const journeyUpdate: Record<string, any> = {
        sessions_completed: newSessionCount,
      };

      if (shouldAdvance) {
        journeyUpdate.current_phase_index = currentPhaseIndex + 1;
        // Keep legacy compatibility where UI reads current_phase.
        journeyUpdate.current_phase = currentPhaseIndex + 2;
      }
      phaseTransitionResult = {
        advanced: shouldAdvance,
        previous_phase_index: currentPhaseIndex,
        new_phase_index: shouldAdvance ? currentPhaseIndex + 1 : currentPhaseIndex,
        completed_in_phase: completedInCurrentPhase,
        min_sessions_required: minSessionsForPhase,
        max_sessions_fallback: maxSessionsForPhase,
        readiness_signal: readinessSignal ? 'ready' : 'continue',
        used_max_sessions_fallback: !readyGatePassed && maxSessionsFallbackPassed,
        blocked_by_risk: majorRisk && completedInCurrentPhase >= maxSessionsForPhase,
        progression_enabled: progressionEnabled,
        evaluated_at: new Date().toISOString(),
      };
      journeyUpdate.phase_transition_result = phaseTransitionResult;

      await supabaseAdmin
        .from('mind_coach_journeys')
        .update(journeyUpdate)
        .eq('id', journey.id);
    }

    return new Response(
      JSON.stringify({
        case_notes,
        session_summary,
        extracted_tasks,
        extracted_memories,
        agent_meta,
        suggested_pathway: suggestedPathwayCandidate,
        pathway_details: pathwayDetails,
        memories_stored: memoriesStored,
        tasks_stored: extracted_tasks?.length || 0,
        session_id,
        phase_transition_result: phaseTransitionResult,
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
