import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';
import { buildContinuityPack } from '../_shared/mindCoachContext.ts';
import { normalizeJourneyPhases } from '../_shared/mindCoachSessionGoals.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const {
      session_id,
      profile_id,
      message_text,
      profile,
      journey_context,
      session_state,
      dynamic_theme,
      pathway,
      is_system_greeting,
      messages,
      memories,
      recent_case_notes,
      recent_tasks_assigned,
      assessments,
      coach_prompt,
      phase_prompt,
      message_count,
      client_managed_persistence,
      session_number,
    } = payload;

    if (!session_id || !profile_id || (!message_text && !is_system_greeting)) {
      return new Response(
        JSON.stringify({ error: 'Missing required: session_id, profile_id, message_text' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const n8nWebhookUrl = Deno.env.get('MC_N8N_CHAT_WEBHOOK_URL') || 'https://n8n.saksham-experiments.com/webhook/mind-coach-chat';
    const n8nSecret = Deno.env.get('MC_N8N_WEBHOOK_SECRET') || 'placeholder-secret';

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const clientManaged = client_managed_persistence === true;

    // 1. Persist user message
    let userMessageId = null;
    if (!clientManaged && !is_system_greeting) {
      userMessageId = crypto.randomUUID();
      await supabaseAdmin.from('mind_coach_messages').insert({
        id: userMessageId,
        session_id,
        role: 'user',
        content: message_text,
      });
    }

    // 2. Update session message count
    const { data: sessionData } = await supabaseAdmin
      .from('mind_coach_sessions')
      .select('message_count,journey_id,pathway_confidence')
      .eq('id', session_id)
      .single();

    const newCount = clientManaged
      ? (typeof message_count === 'number' ? message_count : (sessionData?.message_count ?? 0))
      : (sessionData?.message_count ?? 0) + (is_system_greeting ? 0 : 1);
    if (!clientManaged) {
      await supabaseAdmin
        .from('mind_coach_sessions')
        .update({ message_count: newCount })
        .eq('id', session_id);
    }

    // 3. Fetch context for the n8n workflow
    let messagesData: any[] = [];
    let memoriesData: any[] = [];
    let caseNotesData: any[] = [];
    let activeTasksData: any[] = [];
    let assessmentsData: any[] = [];
    let resolvedCoachPrompt = coach_prompt || "You are an empathetic, non-judgmental mental health coach.";
    let resolvedPhasePrompt = phase_prompt || "Focus on gathering context and building therapeutic rapport.";
    let resolvedProfile = profile || null;

    if (clientManaged) {
      messagesData = Array.isArray(messages) ? messages : [];
      memoriesData = Array.isArray(memories) ? memories : [];
      caseNotesData = Array.isArray(recent_case_notes) ? recent_case_notes : [];
      activeTasksData = Array.isArray(recent_tasks_assigned) ? recent_tasks_assigned : [];
      assessmentsData = Array.isArray(assessments) ? assessments : [];
    } else {
      const [messagesRes, memoriesRes, caseNotesRes, activeTasksRes, assessmentsRes, personaPromptRes, phasePromptRes, authenticProfileRes] = await Promise.all([
        supabaseAdmin
          .from('mind_coach_messages')
          .select('role,content')
          .eq('session_id', session_id)
          .order('created_at', { ascending: true })
          .limit(50),
        supabaseAdmin
          .from('mind_coach_memories')
          .select('memory_text,memory_type')
          .eq('profile_id', profile_id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabaseAdmin
          .from('mind_coach_sessions')
          .select('case_notes,dynamic_theme,pathway,summary_data')
          .eq('profile_id', profile_id)
          .eq('session_state', 'completed')
          .order('ended_at', { ascending: false })
          .limit(5),
        supabaseAdmin
          .from('mind_coach_user_tasks')
          .select('*')
          .eq('profile_id', profile_id)
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
        supabaseAdmin
          .from('mind_coach_assessments')
          .select('assessment_type,score,created_at')
          .eq('profile_id', profile_id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabaseAdmin
          .from('mind_coach_personas')
          .select('base_prompt')
          .eq('id', profile?.therapist_persona || 'maya')
          .maybeSingle(),
        supabaseAdmin
          .from('mind_coach_pathway_phases')
          .select('dynamic_prompt')
          .eq('id', `${pathway || 'engagement_rapport_and_assessment'}_phase${journey_context?.current_phase || 1}`)
          .maybeSingle(),
        supabaseAdmin
          .from('mind_coach_profiles')
          .select('name,age,gender,concerns,therapist_persona')
          .eq('id', profile_id)
          .single(),
      ]);

      messagesData = messagesRes.data || [];
      memoriesData = memoriesRes.data || [];
      caseNotesData = caseNotesRes.data || [];
      activeTasksData = activeTasksRes.data || [];
      assessmentsData = assessmentsRes.data || [];
      resolvedCoachPrompt = personaPromptRes.data?.base_prompt || resolvedCoachPrompt;
      resolvedPhasePrompt = phasePromptRes.data?.dynamic_prompt || resolvedPhasePrompt;
      resolvedProfile = authenticProfileRes.data || resolvedProfile;
    }

    // 4. Build server-authoritative continuity pack
    const configuredTranscriptLimit = Number.parseInt(
      Deno.env.get('MC_CHAT_TRANSCRIPT_LIMIT') || '20',
      10,
    );
    const transcriptLimit = Number.isFinite(configuredTranscriptLimit)
      ? Math.max(8, Math.min(30, configuredTranscriptLimit))
      : 20;

    let continuityPack: any = null;
    try {
      continuityPack = await buildContinuityPack(supabaseAdmin, profile_id, session_id, {
        transcriptLimit,
      });
    } catch (cpErr: any) {
      console.error('continuity pack build failed (non-fatal):', cpErr.message);
    }

    let serverJourneyContext: Record<string, unknown> | null = null;
    if (sessionData?.journey_id) {
      const { data: journeyRow } = await supabaseAdmin
        .from('mind_coach_journeys')
        .select('id,title,description,current_phase,current_phase_index,phases,sessions_completed')
        .eq('id', sessionData.journey_id)
        .maybeSingle();
      if (journeyRow) {
        serverJourneyContext = {
          id: journeyRow.id,
          title: journeyRow.title,
          description: journeyRow.description ?? null,
          current_phase: journeyRow.current_phase,
          current_phase_index: journeyRow.current_phase_index ?? Math.max(0, (journeyRow.current_phase || 1) - 1),
          phases: normalizeJourneyPhases(journeyRow.phases),
          sessions_completed: journeyRow.sessions_completed ?? 0,
        };
      }
    }
    const sessionGoalContext =
      continuityPack?.session_goal_context &&
      typeof continuityPack.session_goal_context === 'object'
        ? continuityPack.session_goal_context
        : null;
    const effectivePhasePrompt =
      sessionGoalContext?.session_objective
        ? `${resolvedPhasePrompt}\n\n[SESSION GOAL CONTEXT]\nSession objective: ${sessionGoalContext.session_objective}\nSuccess signal: ${sessionGoalContext.session_success_signal || 'Show measurable progress on this session objective.'}`
        : resolvedPhasePrompt;

    // Canonical prompt contract values (legacy fields kept for compatibility)
    const canonicalMessages =
      Array.isArray(continuityPack?.last_20_conversations) && continuityPack.last_20_conversations.length > 0
        ? continuityPack.last_20_conversations
        : messagesData;
    const canonicalTasks =
      Array.isArray(continuityPack?.active_tasks_context) && continuityPack.active_tasks_context.length > 0
        ? continuityPack.active_tasks_context
        : activeTasksData;
    const canonicalCaseNotesContext =
      Array.isArray(continuityPack?.recent_case_notes_context)
        ? continuityPack.recent_case_notes_context
        : [];
    const legacyCaseNotes = canonicalCaseNotesContext
      .map((row: any) => row?.case_notes || row)
      .filter(Boolean);

    // 5. Forward to n8n (server context is authoritative; client hints fill gaps)
    const configuredN8nTimeout = Number.parseInt(
      Deno.env.get('MC_N8N_CHAT_TIMEOUT_MS') || '20000',
      10,
    );
    const n8nTimeoutMs = Number.isFinite(configuredN8nTimeout)
      ? Math.max(5000, Math.min(180000, configuredN8nTimeout))
      : 20000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), n8nTimeoutMs);

    let n8nResponse;
    try {
      n8nResponse = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-n8n-secret': n8nSecret,
        },
        body: JSON.stringify({
          session_id,
          profile_id,
          message_text,
          user_message_id: userMessageId,
          profile: resolvedProfile,
          journey_context: serverJourneyContext ?? journey_context ?? null,
          session_state: session_state || 'intake',
          dynamic_theme,
          pathway,
          messages: canonicalMessages,
          memories: (memoriesData || []).map((m: any) => ({
            text: m.memory_text || m.text,
            type: m.memory_type || m.type,
          })),
          assessments: assessmentsData || [],
          coach_prompt: resolvedCoachPrompt,
          phase_prompt: effectivePhasePrompt,
          message_count: newCount,
          session_number:
            Number.isFinite(session_number)
              ? session_number
              : Number.isFinite(serverJourneyContext?.sessions_completed as number)
                ? (Number(serverJourneyContext?.sessions_completed) + 1)
                : 1,
          is_system_greeting,
          // Canonical server context fields
          last_20_conversations: continuityPack?.last_20_conversations ?? [],
          active_tasks_context: continuityPack?.active_tasks_context ?? [],
          recent_case_notes_context: canonicalCaseNotesContext,
          continuity_phase_context: continuityPack?.phase_context ?? null,
          session_goal_context: sessionGoalContext,
          session_stage: continuityPack?.phase_context?.session_stage ?? continuityPack?.session_stage ?? 'early',
          transcript_limit: transcriptLimit,
          // Legacy compatibility fields (deprecate downstream)
          recent_case_notes: legacyCaseNotes,
          recent_tasks_assigned: canonicalTasks,
        }),
        signal: controller.signal,
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({ error: `Agent took too long to respond (>${Math.round(n8nTimeoutMs / 1000)}s).` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 504 }
        );
      }
      throw fetchError;
    }
    clearTimeout(timeoutId);

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error(`n8n error (${n8nResponse.status}):`, errorText);
      return new Response(
        JSON.stringify({ error: 'Agent pipeline failed', details: errorText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
    }

    // 6. Parse n8n response
    let parsed = await n8nResponse.json();
    const result = Array.isArray(parsed) ? parsed[0] : parsed;

    let assistantReply = result.reply || result.assistant_reply || result.output || '';
    if (typeof assistantReply === 'string') {
      const trimmed = assistantReply.trim();
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try { assistantReply = JSON.parse(trimmed); } catch { /* keep as-is */ }
      }
    }

    // --- SECONDARY LLM EVALUATION FOR DYNAMIC DISCOVERY ---
    // This is now purely delegated to the n8n workflow. 
    // n8n is expected to return pathway_confidence, dynamic_theme, and suggested_pathway in its JSON response.
    let updatedTheme = result.dynamic_theme || dynamic_theme;
    let updatedPathway = result.pathway || pathway || result.suggested_pathway;
    let pathwayConfidence = sessionData?.pathway_confidence || 0;
    
    if (typeof result.pathway_confidence === 'number') {
      pathwayConfidence = result.pathway_confidence;
    }

    const updatedSessionState = result.session_state || session_state;
    const guardrailStatus = result.guardrail_status || 'passed';
    const crisisDetected = result.crisis_detected || false;
    const dynamicContent = result.dynamic_content || null;
    const isSessionClose = result.is_session_close || false;
    const suggestedPathway = result.suggested_pathway || null;
    const rawQualityMeta = result.quality_meta && typeof result.quality_meta === 'object'
      ? result.quality_meta
      : {};
    const qualityMeta = {
      ...rawQualityMeta,
      context_used:
        typeof rawQualityMeta.context_used === 'boolean'
          ? rawQualityMeta.context_used
          : (Array.isArray(continuityPack?.last_20_conversations) && continuityPack.last_20_conversations.length > 0),
      task_followup_used:
        typeof rawQualityMeta.task_followup_used === 'boolean'
          ? rawQualityMeta.task_followup_used
          : (Array.isArray(continuityPack?.active_tasks_context) && continuityPack.active_tasks_context.length > 0),
      phase_goal_touched:
        typeof rawQualityMeta.phase_goal_touched === 'boolean'
          ? rawQualityMeta.phase_goal_touched
          : Boolean(continuityPack?.phase_context?.phase_goal),
      session_goal_touched:
        typeof rawQualityMeta.session_goal_touched === 'boolean'
          ? rawQualityMeta.session_goal_touched
          : Boolean(sessionGoalContext?.session_objective),
      session_stage:
        rawQualityMeta.session_stage ||
        continuityPack?.phase_context?.session_stage ||
        continuityPack?.session_stage ||
        'early',
      transcript_limit: transcriptLimit,
    };

    if (
      suggestedPathway &&
      suggestedPathway !== 'engagement_rapport_and_assessment'
    ) {
      const proposalInsert = {
        profile_id,
        session_id,
        proposed_pathway: suggestedPathway,
        confidence: typeof pathwayConfidence === 'number' ? pathwayConfidence : null,
        source: 'chat',
        metadata: {
          dynamic_theme: updatedTheme || null,
          message_count: newCount,
        },
      };
      const { error: proposalErr } = await supabaseAdmin
        .from('mind_coach_pathway_proposals')
        .insert(proposalInsert);
      if (proposalErr) {
        console.error('pathway proposal insert failed:', proposalErr.message);
      }
    }

    // 7. Persist assistant reply
    if (!clientManaged && assistantReply) {
      await supabaseAdmin.from('mind_coach_messages').insert({
        session_id,
        role: 'assistant',
        content: assistantReply,
        guardrail_status: guardrailStatus,
        dynamic_content: dynamicContent,
      });
    }

    // 8. Update session state if changed
    if (!clientManaged) {
      const finalCount = newCount + (assistantReply ? 1 : 0);
      const sessionUpdate: Record<string, any> = {
        message_count: finalCount,
      };
      if (updatedSessionState !== session_state) sessionUpdate.session_state = updatedSessionState;
      if (updatedTheme) sessionUpdate.dynamic_theme = updatedTheme;
      if (updatedPathway) sessionUpdate.pathway = updatedPathway;
      if (pathwayConfidence !== undefined) sessionUpdate.pathway_confidence = pathwayConfidence;

      await supabaseAdmin
        .from('mind_coach_sessions')
        .update(sessionUpdate)
        .eq('id', session_id);
    }

    // 9. Log guardrail results if provided
    if (!clientManaged && result.guardrail_log) {
      for (const log of Array.isArray(result.guardrail_log) ? result.guardrail_log : [result.guardrail_log]) {
        await supabaseAdmin.from('mind_coach_guardrail_log').insert({
          session_id,
          message_id: userMessageId,
          check_type: log.check_type || 'crisis_pre_chat',
          result: log.result || 'passed',
          risk_type: log.risk_type || null,
          risk_level: log.risk_level || null,
          violations: log.violations || null,
          details: log.details || null,
        });
      }
    }

    return new Response(
      JSON.stringify({
        reply: assistantReply,
        session_id,
        session_state: updatedSessionState,
        is_session_close: isSessionClose,
        dynamic_theme: updatedTheme,
        pathway: updatedPathway,
        pathway_confidence: pathwayConfidence,
        suggested_pathway: suggestedPathway,
        guardrail_status: guardrailStatus,
        crisis_detected: crisisDetected,
        dynamic_content: dynamicContent,
        quality_meta: qualityMeta,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('mind-coach-chat error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
