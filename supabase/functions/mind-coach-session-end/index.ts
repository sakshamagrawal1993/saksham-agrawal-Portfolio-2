import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

const DEFAULT_MIN_SESSIONS_PER_PHASE = 3;
const DEFAULT_MAX_SESSIONS_PER_PHASE = 5;
const MAX_ACTIVE_TASKS_PER_PROFILE = 12;
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

function clampScore(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', '1'].includes(normalized)) return true;
    if (['false', 'no', '0'].includes(normalized)) return false;
  }
  return null;
}

function normalizeRiskLevel(caseNotes: any, sessionSummary: any): string {
  const raw = String(caseNotes?.risk_level ?? caseNotes?.risk ?? sessionSummary?.risk_level ?? '').toLowerCase();
  if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'critical') return raw;
  return hasMajorRiskSignals(caseNotes, sessionSummary) ? 'high' : 'low';
}

function getLatestAttemptRowsByOrder(rows: any[]): any[] {
  const byOrder = new Map<number, any>();
  for (const row of rows) {
    const order = Number(row?.session_order);
    if (!Number.isFinite(order) || order < 1) continue;
    const prev = byOrder.get(order);
    if (!prev || Number(row?.attempt_count ?? 1) > Number(prev?.attempt_count ?? 1)) {
      byOrder.set(order, row);
    }
  }
  return [...byOrder.values()].sort((a, b) => Number(a.session_order) - Number(b.session_order));
}

function pathwayDisplayName(pathwayName: string): string {
  return pathwayName
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function toTaskSemanticKey(taskType: unknown, title: unknown): string {
  const typePart = typeof taskType === 'string' && taskType.trim().length > 0
    ? taskType.trim().toLowerCase()
    : 'general';
  const titlePart = typeof title === 'string'
    ? title.trim().toLowerCase().replace(/\s+/g, ' ')
    : 'session task';
  return `${typePart}:${titlePart}`;
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

    const existingSummary =
      session.summary_data && typeof session.summary_data === 'object'
        ? session.summary_data as Record<string, any>
        : null;
    const previousMeta =
      existingSummary?.__session_end_meta && typeof existingSummary.__session_end_meta === 'object'
        ? existingSummary.__session_end_meta
        : null;
    if (
      session.session_state === 'completed' &&
      previousMeta?.idempotency_key === session_id
    ) {
      return new Response(
        JSON.stringify({
          case_notes: existingSummary?.case_notes ?? session.case_notes ?? null,
          session_summary: existingSummary?.session_summary ?? null,
          extracted_tasks: Array.isArray(existingSummary?.extracted_tasks) ? existingSummary.extracted_tasks : [],
          extracted_memories: Array.isArray(existingSummary?.extracted_memories) ? existingSummary.extracted_memories : [],
          agent_meta: existingSummary?.agent_meta ?? null,
          suggested_pathway: existingSummary?.suggested_pathway ?? null,
          pathway_details: existingSummary?.pathway_details ?? null,
          memories_stored: 0,
          tasks_stored: 0,
          session_id,
          phase_transition_result: existingSummary?.phase_transition_result ?? null,
          idempotent_replay: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
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
    const journey_completion_message =
      parsed?.journey_completion_message &&
      typeof parsed.journey_completion_message === 'object' &&
      typeof parsed.journey_completion_message.Heading === 'string' &&
      typeof parsed.journey_completion_message.Description === 'string'
        ? {
            Heading: String(parsed.journey_completion_message.Heading).trim(),
            Description: String(parsed.journey_completion_message.Description).trim(),
          }
        : null;
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

    let summaryDataForStorage =
      session_summary && typeof session_summary === 'object'
        ? {
            // Backward compatibility: keep canonical summary fields at top-level.
            ...session_summary,
            // Persist the complete workflow payload so detailed views can read everything.
            session_summary,
            case_notes,
            extracted_tasks,
            extracted_memories,
            agent_meta,
            journey_completion_message,
            suggested_pathway: suggestedPathwayCandidate,
            pathway_details: pathwayDetails,
            __session_end_meta: {
              idempotency_key: session_id,
              processed_at: new Date().toISOString(),
            },
          }
        : {
            session_summary,
            case_notes,
            extracted_tasks,
            extracted_memories,
            agent_meta,
            journey_completion_message,
            suggested_pathway: suggestedPathwayCandidate,
            pathway_details: pathwayDetails,
            __session_end_meta: {
              idempotency_key: session_id,
              processed_at: new Date().toISOString(),
            },
          };

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
      const { data: existingActiveTasks } = await supabaseAdmin
        .from('mind_coach_user_tasks')
        .select('id,task_type,dynamic_title,task_name,created_at,task_semantic_key')
        .eq('profile_id', profile_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(200);
      const existingKeys = new Set<string>(
        (Array.isArray(existingActiveTasks) ? existingActiveTasks : [])
          .map((row: any) => {
            const keyFromRow =
              typeof row?.task_semantic_key === 'string'
                ? row.task_semantic_key.trim().toLowerCase()
                : '';
            if (keyFromRow) return keyFromRow;
            return toTaskSemanticKey(row?.task_type, row?.dynamic_title || row?.task_name);
          })
          .filter((key: string) => key.length > 0),
      );
      const seenInBatch = new Set<string>();
      const taskRows = extracted_tasks.flatMap((t: any) => {
        const startDate = new Date(now);
        const durationDays = typeof t.suggested_duration_days === 'number' && t.suggested_duration_days > 0
          ? t.suggested_duration_days
          : 7; // sensible default
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + durationDays);
        const resolvedTitle = t.dynamic_title || t.task_name || 'Session Task';
        const semanticKey = toTaskSemanticKey(t.task_type || 'general', resolvedTitle);
        if (existingKeys.has(semanticKey) || seenInBatch.has(semanticKey)) {
          return [];
        }
        seenInBatch.add(semanticKey);

        return [{
          profile_id,
          session_id,
          // Structured template category chosen by LLM
          task_type: t.task_type || 'general',
          // Personalised content written by LLM
          dynamic_title: resolvedTitle,
          dynamic_description: t.dynamic_description || t.task_description || '',
          task_semantic_key: semanticKey,
          // Legacy column kept for backward-compat
          task_name: resolvedTitle,
          task_description: t.dynamic_description || t.task_description || '',
          task_frequency: t.frequency || t.task_frequency || 'daily',
          // Backend-calculated dates — never trust LLM timestamps
          task_start_date: startDate.toISOString(),
          task_end_date: endDate.toISOString(),
          status: 'active',
        }];
      });
      if (taskRows.length > 0) {
        await supabaseAdmin.from('mind_coach_user_tasks').insert(taskRows);
      }

      const { data: activeTasksAfterInsert } = await supabaseAdmin
        .from('mind_coach_user_tasks')
        .select('id')
        .eq('profile_id', profile_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      const overflowRows = (Array.isArray(activeTasksAfterInsert) ? activeTasksAfterInsert : [])
        .slice(MAX_ACTIVE_TASKS_PER_PROFILE);
      if (overflowRows.length > 0) {
        await supabaseAdmin
          .from('mind_coach_user_tasks')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .in('id', overflowRows.map((row: any) => row.id));
      }
    }

    // 5. Update journey/session progression (template-aware + strict policy)
    let phaseTransitionResult: Record<string, unknown> | null = null;
    const policyConflicts: string[] = [];
    if (journey) {
      const phases = Array.isArray(journey.phases) ? journey.phases : [];
      const currentPhaseIndexFromJourney = Number.isFinite(journey.current_phase_index)
        ? journey.current_phase_index
        : Math.max(0, (journey.current_phase || 1) - 1);
      const sessionPhaseNumber = Number(session.phase_number);
      const currentPhaseNumber =
        Number.isFinite(sessionPhaseNumber) && sessionPhaseNumber > 0
          ? sessionPhaseNumber
          : currentPhaseIndexFromJourney + 1;
      const currentPhaseIndex = Math.max(0, currentPhaseNumber - 1);
      const phaseCount = phases.length;
      const progressionEnabled = (journey.pathway || session.pathway) !== 'engagement_rapport_and_assessment';
      const currentPhase = phases[currentPhaseIndex] ?? null;

      const majorRisk = hasMajorRiskSignals(case_notes, session_summary);
      const riskLevel = normalizeRiskLevel(case_notes, session_summary);
      const requiresEscalation = Boolean(case_notes?.requires_escalation || session_summary?.requires_escalation);
      const readinessLabel = String(case_notes?.readiness_for_next_phase ?? '').toLowerCase();
      const readinessState =
        readinessLabel === 'ready'
          ? 'ready'
          : readinessLabel === 'approaching'
            ? 'approaching'
            : 'continue';
      const readinessSignal = readinessState === 'ready' || readinessState === 'approaching';

      const incomingSessionTransition = parsed?.session_transition && typeof parsed.session_transition === 'object'
        ? parsed.session_transition
        : null;
      const incomingPhaseTransition = parsed?.phase_transition && typeof parsed.phase_transition === 'object'
        ? parsed.phase_transition
        : null;
      const incomingObjectiveSignal = parseBoolean(
        parsed?.objective_met ??
        incomingSessionTransition?.objective_met ??
        incomingSessionTransition?.session_transition,
      );
      const incomingPhaseAdvanceSignal = parseBoolean(
        incomingPhaseTransition?.phase_transition ??
        incomingPhaseTransition?.should_advance ??
        parsed?.phase_transition,
      );
      const incomingCompletionScore = parsed?.completion_score ?? session_summary?.completion_score;

      const activePathway = normalizePathwayCandidate(journey.pathway || session.pathway) || 'engagement_rapport_and_assessment';
      const { data: phaseTemplatesRaw } = await supabaseAdmin
        .from('mind_coach_session_templates')
        .select('id,session_order,min_completion_score,title,goal,description,fallback_strategy')
        .eq('pathway_name', activePathway)
        .eq('phase_number', currentPhaseNumber)
        .eq('is_active', true)
        .order('session_order', { ascending: true });
      const phaseTemplates = Array.isArray(phaseTemplatesRaw) ? phaseTemplatesRaw : [];

      const { data: runtimePhaseRowsRaw } = await supabaseAdmin
        .from('mind_coach_journey_sessions')
        .select('id,session_template_id,linked_session_id,session_order,status,attempt_count,generated_title,generated_goal,generated_description')
        .eq('journey_id', journey.id)
        .eq('phase_number', currentPhaseNumber)
        .order('session_order', { ascending: true })
        .order('attempt_count', { ascending: false });
      let runtimePhaseRows = Array.isArray(runtimePhaseRowsRaw) ? runtimePhaseRowsRaw : [];

      // Normalize race leftovers: only one in-progress per phase.
      const inProgressRows = runtimePhaseRows.filter((row: any) => row.status === 'in_progress');
      if (inProgressRows.length > 1) {
        const keep = inProgressRows
          .slice()
          .sort((a: any, b: any) => Number(a.session_order) - Number(b.session_order) || Number(b.attempt_count ?? 1) - Number(a.attempt_count ?? 1))[0];
        const demoteIds = inProgressRows
          .filter((row: any) => row.id !== keep.id)
          .map((row: any) => row.id);
        if (demoteIds.length > 0) {
          await supabaseAdmin
            .from('mind_coach_journey_sessions')
            .update({ status: 'planned' })
            .in('id', demoteIds);
          runtimePhaseRows = runtimePhaseRows.map((row: any) =>
            demoteIds.includes(row.id) ? { ...row, status: 'planned' } : row,
          );
        }
      }

      const latestRows = getLatestAttemptRowsByOrder(runtimePhaseRows);
      let activeJourneySession =
        latestRows.find((r: any) => r.status === 'in_progress') ||
        latestRows.find((r: any) => r.status === 'revisit') ||
        latestRows.find((r: any) => r.status === 'blocked') ||
        latestRows.find((r: any) => r.status === 'planned') ||
        null;

      if (!activeJourneySession) {
        const templateFirst = phaseTemplates[0] || null;
        const fallbackOrder = templateFirst?.session_order ?? Math.max(1, latestRows.length + 1);
        const fallbackAttempt = 1;
        const { data: insertedManual } = await supabaseAdmin
          .from('mind_coach_journey_sessions')
          .upsert({
            journey_id: journey.id,
            profile_id,
            pathway_name: activePathway,
            session_template_id: templateFirst?.id ?? null,
            linked_session_id: session_id,
            phase_number: currentPhaseNumber,
            session_order: fallbackOrder,
            status: 'in_progress',
            attempt_count: fallbackAttempt,
            source: templateFirst ? 'template' : 'manual',
            generated_title: templateFirst?.title ?? `Session ${fallbackOrder}`,
            generated_goal: templateFirst?.goal ?? (currentPhase?.goal || 'Continue progress in this phase.'),
            generated_description: templateFirst?.description ?? (currentPhase?.goal || 'Continue progress in this phase.'),
            activated_at: new Date().toISOString(),
          }, { onConflict: 'journey_id,phase_number,session_order,attempt_count' })
          .select('id,session_template_id,linked_session_id,session_order,status,attempt_count,generated_title,generated_goal,generated_description')
          .single();
        activeJourneySession = insertedManual;
      }

      if (!activeJourneySession) {
        throw new Error('Unable to resolve active journey session for transition processing.');
      }

      const activeTemplate = phaseTemplates.find((t: any) => t.id === activeJourneySession.session_template_id) || null;
      const minCompletionScore = clampScore(activeTemplate?.min_completion_score ?? 0.7, 0.7);
      const completionScore = clampScore(
        incomingCompletionScore ?? (readinessSignal ? 0.8 : 0.45),
        readinessSignal ? 0.8 : 0.45,
      );
      let objectiveMet = incomingObjectiveSignal ?? (!majorRisk && completionScore >= minCompletionScore);
      if (majorRisk && objectiveMet) {
        policyConflicts.push('risk_overrode_objective_true');
        objectiveMet = false;
      }

      const recommendedNextAction = majorRisk
        ? (requiresEscalation ? 'escalate' : 'stabilize')
        : objectiveMet
          ? (readinessSignal ? 'advance' : 'continue_in_phase')
          : 'revisit';
      const completionStatus = objectiveMet ? 'completed' : (majorRisk ? 'blocked' : 'revisit');

      if (incomingPhaseAdvanceSignal === true && !objectiveMet) {
        policyConflicts.push('phase_advance_signal_ignored_objective_false');
      }

      if (activeJourneySession.status !== 'in_progress') {
        await supabaseAdmin
          .from('mind_coach_journey_sessions')
          .update({ linked_session_id: session_id, status: 'in_progress' })
          .eq('id', activeJourneySession.id);
      }

      await supabaseAdmin
        .from('mind_coach_journey_sessions')
        .update({
          status: completionStatus,
          completion_score: completionScore,
          completion_reason: objectiveMet
            ? 'objective_met'
            : (majorRisk ? 'risk_stabilization_required' : 'objective_not_met'),
          linked_session_id: session_id,
          completed_at: objectiveMet ? new Date().toISOString() : null,
        })
        .eq('id', activeJourneySession.id);

      const { data: existingEvaluation } = await supabaseAdmin
        .from('mind_coach_session_evaluations')
        .select('id')
        .eq('journey_session_id', activeJourneySession.id)
        .eq('session_id', session_id)
        .limit(1)
        .maybeSingle();

      if (!existingEvaluation?.id) {
        await supabaseAdmin
          .from('mind_coach_session_evaluations')
          .insert({
            journey_session_id: activeJourneySession.id,
            journey_id: journey.id,
            profile_id,
            session_id,
            objective_met: objectiveMet,
            objective_confidence: clampScore(parsed?.objective_confidence ?? completionScore, completionScore),
            completion_score: completionScore,
            risk_level: riskLevel,
            requires_escalation: requiresEscalation,
            unresolved_items: Array.isArray(parsed?.unresolved_items) ? parsed.unresolved_items : [],
            strengths_observed: Array.isArray(parsed?.strengths_observed) ? parsed.strengths_observed : [],
            recommended_next_action: recommendedNextAction,
            recommended_adjustments: parsed?.recommended_adjustments && typeof parsed.recommended_adjustments === 'object'
              ? parsed.recommended_adjustments
              : {},
            evaluator_meta: {
              readiness_signal: readinessState,
              major_risk: majorRisk,
              policy: 'strictReady',
              conflicts: policyConflicts,
            },
          });
      }

      if (!objectiveMet) {
        const nextAttempt = Number(activeJourneySession.attempt_count ?? 1) + 1;
        await supabaseAdmin
          .from('mind_coach_journey_sessions')
          .upsert({
            journey_id: journey.id,
            profile_id,
            pathway_name: activePathway,
            session_template_id: activeJourneySession.session_template_id ?? null,
            phase_number: currentPhaseNumber,
            session_order: activeJourneySession.session_order,
            status: 'in_progress',
            attempt_count: nextAttempt,
            source: 'adapted',
            adaptation_reason: majorRisk ? 'risk_stabilization' : 'objective_not_met',
            generated_title: activeJourneySession.generated_title ?? `Session ${activeJourneySession.session_order}`,
            generated_goal: activeJourneySession.generated_goal ?? (currentPhase?.goal || 'Continue progress in this phase.'),
            generated_description: activeJourneySession.generated_description ?? (currentPhase?.goal || 'Continue progress in this phase.'),
            activated_at: new Date().toISOString(),
          }, { onConflict: 'journey_id,phase_number,session_order,attempt_count' });
      } else {
        const nextInPhase = latestRows.find((row: any) => Number(row.session_order) > Number(activeJourneySession.session_order));
        if (nextInPhase && nextInPhase.status === 'planned') {
          await supabaseAdmin
            .from('mind_coach_journey_sessions')
            .update({ status: 'in_progress', activated_at: new Date().toISOString() })
            .eq('id', nextInPhase.id);
        }
      }

      const { data: latestRuntimeRowsRaw } = await supabaseAdmin
        .from('mind_coach_journey_sessions')
        .select('id,session_template_id,session_order,status,attempt_count')
        .eq('journey_id', journey.id)
        .eq('phase_number', currentPhaseNumber)
        .order('session_order', { ascending: true })
        .order('attempt_count', { ascending: false });
      const latestRuntimeRows = getLatestAttemptRowsByOrder(Array.isArray(latestRuntimeRowsRaw) ? latestRuntimeRowsRaw : []);
      const completedLatestRows = latestRuntimeRows.filter((row: any) => row.status === 'completed');
      const completedTemplateRows = completedLatestRows.filter((row: any) => Boolean(row.session_template_id));
      const completedInCurrentPhase = completedLatestRows.length;
      let detectedMaxPhaseNumber = phaseCount > 0 ? phaseCount : currentPhaseNumber;
      const { data: maxJourneyPhaseRow } = await supabaseAdmin
        .from('mind_coach_journey_sessions')
        .select('phase_number')
        .eq('journey_id', journey.id)
        .order('phase_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (Number.isFinite(Number((maxJourneyPhaseRow as any)?.phase_number))) {
        detectedMaxPhaseNumber = Math.max(
          detectedMaxPhaseNumber,
          Number((maxJourneyPhaseRow as any).phase_number),
        );
      }
      const hasNextPhase = currentPhaseNumber < detectedMaxPhaseNumber;
      const templateSessionOrderSet = new Set<number>(
        phaseTemplates
          .map((t: any) => Number(t.session_order))
          .filter((n: number) => Number.isFinite(n) && n > 0),
      );
      const requiredTemplateCount = templateSessionOrderSet.size > 0
        ? templateSessionOrderSet.size
        : Math.max(1, getRequiredSessionsForPhase(currentPhase));
      const minSessionsForPhase = Math.max(1, getRequiredSessionsForPhase(currentPhase));
      const maxSessionsForPhase = Math.max(minSessionsForPhase, DEFAULT_MAX_SESSIONS_PER_PHASE);
      const phaseObjectivesMet = completedTemplateRows.length >= requiredTemplateCount;
      const phaseMinimumReached = completedInCurrentPhase >= minSessionsForPhase;
      const maxSessionsFallbackPassed = completedInCurrentPhase >= maxSessionsForPhase;
      const phaseCompletionReached = phaseObjectivesMet || phaseMinimumReached || maxSessionsFallbackPassed;
      // Canonical policy with practical fallback:
      // If readiness lags but phase template minimum is met, allow progression to prevent hard stalls.
      const readinessOrPhaseFallback = readinessSignal || (
        !majorRisk &&
        objectiveMet &&
        completedInCurrentPhase >= minSessionsForPhase
      );
      const shouldAdvance = progressionEnabled &&
        hasNextPhase &&
        !majorRisk &&
        objectiveMet &&
        readinessOrPhaseFallback &&
        phaseCompletionReached;
      const finalPhaseCompleted = progressionEnabled &&
        !hasNextPhase &&
        !majorRisk &&
        objectiveMet &&
        phaseCompletionReached;
      const normalizedNextAction = finalPhaseCompleted ? 'complete_journey' : recommendedNextAction;

      if (incomingPhaseAdvanceSignal === true && !shouldAdvance) {
        policyConflicts.push('incoming_phase_advance_overridden_by_policy');
      }

      const { count: completedInJourney } = await supabaseAdmin
        .from('mind_coach_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('journey_id', journey.id)
        .eq('session_state', 'completed');
      const newSessionCount = completedInJourney ?? ((journey.sessions_completed || 0) + 1);

      const journeyUpdate: Record<string, any> = {
        sessions_completed: newSessionCount,
        journey_state: 'active',
      };
      if (finalPhaseCompleted) {
        journeyUpdate.journey_state = 'completed';
        journeyUpdate.completed_at = new Date().toISOString();
      } else {
        journeyUpdate.completed_at = null;
      }

      if (shouldAdvance) {
        journeyUpdate.current_phase_index = currentPhaseIndex + 1;
        journeyUpdate.current_phase = currentPhaseIndex + 2;
        const { data: nextPhaseRowsRaw } = await supabaseAdmin
          .from('mind_coach_journey_sessions')
          .select('id,status,session_order,attempt_count')
          .eq('journey_id', journey.id)
          .eq('phase_number', currentPhaseNumber + 1)
          .order('session_order', { ascending: true })
          .order('attempt_count', { ascending: false });
        const nextPhaseRows = getLatestAttemptRowsByOrder(Array.isArray(nextPhaseRowsRaw) ? nextPhaseRowsRaw : []);
        const firstNext = nextPhaseRows.find((row: any) => row.status !== 'completed');
        if (firstNext && firstNext.status === 'planned') {
          await supabaseAdmin
            .from('mind_coach_journey_sessions')
            .update({ status: 'in_progress', activated_at: new Date().toISOString() })
            .eq('id', firstNext.id);
        }
      }

      phaseTransitionResult = {
        advanced: shouldAdvance,
        previous_phase_index: currentPhaseIndex,
        new_phase_index: shouldAdvance ? currentPhaseIndex + 1 : currentPhaseIndex,
        completed_in_phase: completedInCurrentPhase,
        min_sessions_required: minSessionsForPhase,
        max_sessions_fallback: maxSessionsForPhase,
        readiness_signal: readinessOrPhaseFallback ? readinessState : 'continue',
        blocked_by_risk: majorRisk,
        progression_enabled: progressionEnabled,
        objective_met: objectiveMet,
        completion_score: completionScore,
        objective_confidence: clampScore(parsed?.objective_confidence ?? completionScore, completionScore),
        recommended_next_action: normalizedNextAction,
        session_transition_status: completionStatus,
        phase_objectives_met: phaseObjectivesMet,
        required_template_sessions: requiredTemplateCount,
        completed_template_sessions: completedTemplateRows.length,
        phase_policy: 'strictReady',
        phase_gate_reason: shouldAdvance
          ? 'objective_ready_and_phase_requirements_met'
          : finalPhaseCompleted
            ? 'journey_completed'
          : majorRisk
            ? 'blocked_by_risk'
            : !objectiveMet
              ? 'objective_not_met'
              : !readinessOrPhaseFallback
                ? 'readiness_not_ready'
                : !hasNextPhase
                  ? 'final_phase'
                  : 'phase_requirements_not_met',
        conflicts_normalized: policyConflicts,
        evaluated_at: new Date().toISOString(),
      };
      journeyUpdate.phase_transition_result = phaseTransitionResult;

      await supabaseAdmin
        .from('mind_coach_journeys')
        .update(journeyUpdate)
        .eq('id', journey.id);
    }

    if (phaseTransitionResult) {
      summaryDataForStorage = {
        ...summaryDataForStorage,
        phase_transition_result: phaseTransitionResult,
      };
      await supabaseAdmin
        .from('mind_coach_sessions')
        .update({
          summary_data: summaryDataForStorage,
        })
        .eq('id', session_id);
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
        journey_completion_message,
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
