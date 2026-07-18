import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  assessClinicalEvidence,
  classifyResponseRelevance,
  decideReportOutcome,
  detectDeterministicEmergency,
  type ResponseRelevance,
} from './clinical-policy.ts'

const N8N_BASE = 'https://n8n.saksham-experiments.com/webhook'
const GUARDRAIL_WEBHOOK = Deno.env.get('LIBERTYMD_GUARDRAIL_WEBHOOK') || `${N8N_BASE}/libertymd-guardrail`
const INTERVIEW_WEBHOOK = Deno.env.get('LIBERTYMD_INTERVIEW_WEBHOOK') || `${N8N_BASE}/libertymd-interview`
const DIAGNOSIS_WEBHOOK = Deno.env.get('LIBERTYMD_DIAGNOSIS_WEBHOOK') || `${N8N_BASE}/libertymd-diagnosis`
const WEBHOOK_SECRET = Deno.env.get('LIBERTYMD_N8N_WEBHOOK_SECRET') || ''
const CONSENT_VERSION = 'libertymd-ai-care-v1'
const MAX_TURNS = 15

const CLINICAL_SLOTS = [
  'chief_complaint',
  'onset',
  'duration',
  'severity',
  'location',
  'character',
  'associated_symptoms',
  'red_flag_negatives',
  'functional_impact',
  'relevant_history',
  'medications',
  'allergies',
  'pregnancy_status',
] as const

const CORE_SLOTS = [
  'onset',
  'duration',
  'severity',
  'associated_symptoms',
  'red_flag_negatives',
  'relevant_history',
]

type JsonObject = Record<string, unknown>
type ConsultationStatus =
  | 'awaiting_demographics'
  | 'interviewing'
  | 'high_risk'
  | 'report_pending_auth'
  | 'completed'
  | 'emergency_stopped'
  | 'clinical_review_needed'
  | 'abandoned'

interface RequestPayload {
  action:
    | 'bootstrap'
    | 'start_consultation'
    | 'save_demographics'
    | 'send_message'
    | 'release_report'
    | 'sync_identity'
    | 'get_history'
    | 'get_consultation'
  consultation_id?: string
  message?: string
  age?: number | string
  sex_at_birth?: string
  region?: 'US' | 'EU'
  mode?: 'skip' | 'google'
  client_message_id?: string
  expected_version?: number
}

interface ConsultationRow {
  id: string
  user_id: string
  status: ConsultationStatus
  chief_complaint: string | null
  turn_count: number
  filled_slots: JsonObject
  missing_slots: string[]
  target_slot: string | null
  intermediate_diagnoses: unknown[]
  safety_state: JsonObject
  report_gate: string
  non_clinical_response_count: number
  consecutive_non_clinical_response_count: number
  clinical_evidence_score: number
  resolution_reason: string | null
  version: number
  active_request_id: string | null
  active_request_started_at: string | null
}

interface GuardrailResult {
  status: 'pass' | 'high_risk_continue' | 'force_end'
  risk_level: 'low' | 'medium' | 'high' | 'emergency'
  crisis_type: string
  force_end: boolean
  is_emergency: boolean
  care_setting: string
  message: string
  red_flags: string[]
  source: string
  raw: JsonObject
}

interface InterviewResult {
  next_question: string
  options: string[]
  ready_for_report: boolean
  target_slot: string
  slot_updates: JsonObject
  missing_slots: string[]
  input_relevance: ResponseRelevance
  input_relevance_reason: string
  source: string
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

function addDays(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

function cleanMessage(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 4000)
}

function firstName(user: User) {
  const metadata = user.user_metadata || {}
  const name = String(metadata.full_name || metadata.name || '').trim()
  return name ? name.split(/\s+/)[0] : ''
}

function displayName(user: User) {
  const metadata = user.user_metadata || {}
  return String(metadata.full_name || metadata.name || '').trim() || null
}

function avatarUrl(user: User) {
  const metadata = user.user_metadata || {}
  return String(metadata.avatar_url || metadata.picture || '').trim() || null
}

function n8nHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(WEBHOOK_SECRET ? { 'x-libertymd-secret': WEBHOOK_SECRET } : {}),
  }
}

async function postJson(url: string, body: unknown, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: n8nHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Workflow HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

function normalizeObject(raw: unknown): JsonObject {
  if (Array.isArray(raw)) return normalizeObject(raw[0])
  if (!raw || typeof raw !== 'object') return {}
  const record = raw as JsonObject
  if (record.output && typeof record.output === 'object') return normalizeObject(record.output)
  return record
}

async function runGuardrail(message: string, history: unknown[], patient: JsonObject, slots: JsonObject) {
  const local = detectDeterministicEmergency(message)
  if (local) {
    return {
      status: 'force_end',
      risk_level: 'emergency',
      crisis_type: local.crisisType,
      force_end: true,
      is_emergency: true,
      care_setting: 'call_911',
      message: local.message,
      red_flags: [local.crisisType],
      source: 'edge_deterministic',
      raw: {},
    } satisfies GuardrailResult
  }

  try {
    const raw = normalizeObject(await postJson(GUARDRAIL_WEBHOOK, { message, history, patient, filled_slots: slots }, 10_000))
    const forceEnd = Boolean(raw.force_end || raw.is_emergency || raw.status === 'force_end')
    const status: GuardrailResult['status'] = forceEnd
      ? 'force_end'
      : raw.status === 'high_risk_continue'
        ? 'high_risk_continue'
        : 'pass'
    return {
      status,
      risk_level: String(raw.risk_level || (forceEnd ? 'emergency' : status === 'high_risk_continue' ? 'high' : 'low')) as GuardrailResult['risk_level'],
      crisis_type: String(raw.crisis_type || 'none'),
      force_end: forceEnd,
      is_emergency: forceEnd,
      care_setting: String(raw.care_setting || (forceEnd ? 'call_911' : 'home')),
      message: String(raw.message || (forceEnd ? 'Please seek emergency care now.' : 'No emergency detected.')),
      red_flags: Array.isArray(raw.red_flags) ? raw.red_flags.map(String).slice(0, 12) : [],
      source: String(raw.source || 'n8n'),
      raw,
    } satisfies GuardrailResult
  } catch (error) {
    console.error('LibertyMD guardrail unavailable', error)
    return {
      status: 'high_risk_continue',
      risk_level: 'medium',
      crisis_type: 'guardrail_unavailable',
      force_end: false,
      is_emergency: false,
      care_setting: 'telehealth',
      message: 'The extended safety screen was unavailable. Seek urgent care if symptoms feel severe or dangerous.',
      red_flags: [],
      source: 'error_fail_cautious',
      raw: {},
    } satisfies GuardrailResult
  }
}

function sanitizeSlotUpdates(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const source = value as JsonObject
  const output: JsonObject = {}
  for (const slot of CLINICAL_SLOTS) {
    const item = source[slot]
    if (item === undefined || item === null || item === '') continue
    if (typeof item === 'string') output[slot] = item.slice(0, 1000)
    else if (typeof item === 'number' || typeof item === 'boolean') output[slot] = item
    else if (Array.isArray(item)) output[slot] = item.map(String).filter(Boolean).slice(0, 20)
  }
  return output
}

function calculateMissingSlots(slots: JsonObject) {
  return CORE_SLOTS.filter((slot) => {
    const value = slots[slot]
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
  })
}

async function runInterview(
  history: unknown[],
  patient: JsonObject,
  slots: JsonObject,
  missingSlots: string[],
  targetSlot: string | null,
  turnCount: number,
): Promise<InterviewResult> {
  try {
    const raw = normalizeObject(await postJson(INTERVIEW_WEBHOOK, {
      history,
      patient,
      filled_slots: slots,
      missing_slots: missingSlots,
      target_slot: targetSlot,
      turn_count: turnCount,
    }, 25_000))
    const ready = Boolean(raw.ready_for_report)
    const question = cleanMessage(raw.next_question || raw.question)
    const options = Array.isArray(raw.options) ? raw.options.map(String).filter(Boolean).slice(0, 4) : []
    const relevance = ['clinical', 'unclear', 'off_topic'].includes(String(raw.input_relevance))
      ? String(raw.input_relevance) as ResponseRelevance
      : 'clinical'
    return {
      next_question: question || (ready ? '' : 'Could you tell me what has changed since the symptom began?'),
      options: ready ? [] : options,
      ready_for_report: ready,
      target_slot: String(raw.target_slot || 'none'),
      slot_updates: sanitizeSlotUpdates(raw.slot_updates),
      missing_slots: Array.isArray(raw.missing_slots) ? raw.missing_slots.map(String).filter((slot) => CORE_SLOTS.includes(slot)) : [],
      input_relevance: relevance,
      input_relevance_reason: cleanMessage(raw.input_relevance_reason),
      source: 'n8n',
    }
  } catch (error) {
    console.error('LibertyMD interview unavailable', error)
    return {
      next_question: 'Could you briefly tell me when this started and whether it is getting better, worse, or staying the same?',
      options: ['Started today', 'A few days ago', 'More than a week ago', 'I will type the details'],
      ready_for_report: false,
      target_slot: 'onset',
      slot_updates: {},
      missing_slots: missingSlots,
      input_relevance: 'unclear',
      input_relevance_reason: 'Interview workflow unavailable',
      source: 'fallback',
    }
  }
}

function parseConfidence(value: unknown) {
  if (typeof value === 'number') return Math.max(0, Math.min(100, value))
  const match = String(value || '').match(/(\d{1,3}(?:\.\d+)?)/)
  return match ? Math.max(0, Math.min(100, Number(match[1]))) : 0
}

function parseDiagnosis(rawValue: unknown) {
  const raw = normalizeObject(rawValue)
  const differentials = Array.isArray(raw.differential_diagnosis)
    ? raw.differential_diagnosis
    : Array.isArray(raw.diagnoses)
      ? raw.diagnoses
      : []
  const top = differentials[0] && typeof differentials[0] === 'object' ? differentials[0] as JsonObject : {}
  const confidence = parseConfidence(raw.confidence_score || top.confidence || top.confidence_score)
  const workflowValid = typeof raw.valid_report === 'boolean' ? raw.valid_report : true
  return {
    raw,
    differentials,
    confidence,
    valid: workflowValid && differentials.length > 0 && confidence > 0 && raw.error !== 'Failed to parse differential JSON',
  }
}

async function runDiagnosis(history: unknown[], patient: JsonObject, consultation: ConsultationRow, slots: JsonObject) {
  try {
    return parseDiagnosis(await postJson(DIAGNOSIS_WEBHOOK, {
      history,
      patient,
      filled_slots: slots,
      missing_slots: calculateMissingSlots(slots),
      intermediate_diagnoses: consultation.intermediate_diagnoses || [],
      turn_count: consultation.turn_count,
    }, 55_000))
  } catch (error) {
    console.error('LibertyMD diagnosis unavailable', error)
    return { raw: {}, differentials: [], confidence: 0, valid: false }
  }
}

function patientPayload(profile: JsonObject | null) {
  if (!profile) return {}
  return {
    name: profile.display_name || undefined,
    age: profile.age || undefined,
    sex: profile.sex_at_birth || undefined,
  }
}

function acknowledgement(symptom: string, risk: GuardrailResult) {
  const shortened = symptom.length > 150 ? `${symptom.slice(0, 147)}...` : symptom
  const caution = risk.status === 'high_risk_continue'
    ? ' I also noticed details that deserve extra caution, so I will keep checking for urgent warning signs.'
    : ''
  return `I’m sorry you’re dealing with this: “${shortened}”${caution} First, what is the patient’s age and sex assigned at birth?`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const payload = await req.json() as RequestPayload
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) return jsonResponse({ error: 'Authentication required' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse({ error: 'LibertyMD backend is not configured' }, 503)

    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return jsonResponse({ error: 'Invalid session' }, 401)

    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const isAnonymous = !user.email

    const ensureProfile = async () => {
      const { data: existing, error } = await db
        .from('libertymd_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) throw error
      if (existing) {
        if (!isAnonymous) {
          const { data: updated, error: updateError } = await db
            .from('libertymd_profiles')
            .update({
              display_name: displayName(user) || existing.display_name,
              email: user.email,
              avatar_url: avatarUrl(user) || existing.avatar_url,
              identity_provider: String(user.app_metadata?.provider || 'google'),
              is_anonymous: false,
            })
            .eq('user_id', user.id)
            .select('*')
            .single()
          if (updateError) throw updateError
          return updated
        }
        return existing
      }

      const { data: created, error: upsertError } = await db
        .from('libertymd_profiles')
        .upsert({
          user_id: user.id,
          display_name: displayName(user),
          email: user.email || null,
          avatar_url: avatarUrl(user),
          identity_provider: isAnonymous ? 'anonymous' : String(user.app_metadata?.provider || 'google'),
          is_anonymous: isAnonymous,
        }, { onConflict: 'user_id' })
        .select('*')
        .single()
      if (upsertError) throw upsertError
      return created
    }

    const getOwnedConsultation = async (id: string) => {
      const { data, error } = await db
        .from('libertymd_consultations')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Consultation not found')
      return data as ConsultationRow
    }

    const getHistory = async (consultationId: string) => {
      const { data, error } = await db
        .from('libertymd_messages')
        .select('role,content,message_type,options,target_slot,created_at')
        .eq('consultation_id', consultationId)
        .order('sequence', { ascending: true })
      if (error) throw error
      return data || []
    }

    const addMessage = async (
      consultationId: string,
      role: 'user' | 'assistant' | 'system',
      content: string,
      extras: JsonObject = {},
    ) => {
      const { error } = await db.from('libertymd_messages').insert({
        consultation_id: consultationId,
        role,
        content,
        ...extras,
      })
      if (error) throw error
    }

    const replayCompletedTurn = async (consultation: ConsultationRow) => {
      const { data: latestMessage, error: messageError } = await db
        .from('libertymd_messages')
        .select('content,message_type,options,target_slot')
        .eq('consultation_id', consultation.id)
        .in('role', ['assistant', 'system'])
        .order('sequence', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (messageError) throw messageError

      const reportReady = ['report_pending_auth', 'completed'].includes(consultation.status)
      let report = null
      if (consultation.status === 'completed') {
        const { data, error } = await db
          .from('libertymd_reports')
          .select('report_data,confidence_score,access_status')
          .eq('consultation_id', consultation.id)
          .eq('user_id', user.id)
          .in('access_status', ['saved', 'guest_released'])
          .maybeSingle()
        if (error) throw error
        report = data
      }

      return {
        consultation_id: consultation.id,
        state: consultation.status,
        replayed: true,
        emergency: consultation.status === 'emergency_stopped',
        clinical_review_needed: consultation.status === 'clinical_review_needed',
        report_ready: reportReady,
        auth_required: consultation.status === 'report_pending_auth',
        message: latestMessage?.content || null,
        next_question: ['interviewing', 'high_risk'].includes(consultation.status) ? latestMessage?.content || null : null,
        options: Array.isArray(latestMessage?.options) ? latestMessage.options : [],
        target_slot: latestMessage?.target_slot || consultation.target_slot,
        report: report?.report_data || undefined,
        confidence_score: report?.confidence_score || undefined,
        version: consultation.version,
      }
    }

    const saveSafetyEvent = async (consultation: ConsultationRow, result: GuardrailResult, turnCount: number) => {
      const { error } = await db.from('libertymd_safety_events').insert({
        consultation_id: consultation.id,
        user_id: user.id,
        turn_count: turnCount,
        status: result.status,
        risk_level: result.risk_level,
        crisis_type: result.crisis_type,
        care_setting: result.care_setting,
        force_end: result.force_end,
        message: result.message,
        red_flags: result.red_flags,
        source: result.source,
        raw_result: result.raw,
      })
      if (error) throw error
    }

    const historySummary = async () => {
      if (isAnonymous) return []
      const { data, error } = await db
        .from('libertymd_consultations')
        .select('id,status,chief_complaint,turn_count,report_gate,created_at,updated_at,completed_at')
        .eq('user_id', user.id)
        .order('last_activity_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data || []
    }

    const releaseReport = async (consultationId: string, mode: 'skip' | 'google') => {
      const consultation = await getOwnedConsultation(consultationId)
      if (consultation.status !== 'report_pending_auth' && consultation.status !== 'completed') {
        throw new Error('Report is not ready')
      }
      if (mode === 'google' && isAnonymous) throw new Error('Google account is not linked yet')

      const retention = mode === 'skip' ? addDays(7) : null
      const accessStatus = mode === 'skip' ? 'guest_released' : 'saved'
      const gate = mode === 'skip' ? 'guest_released' : 'google_linked'
      const now = new Date().toISOString()

      const { data: report, error: reportError } = await db
        .from('libertymd_reports')
        .update({
          access_status: accessStatus,
          released_at: now,
          retention_expires_at: retention,
        })
        .eq('consultation_id', consultationId)
        .eq('user_id', user.id)
        .select('report_data,confidence_score,access_status')
        .single()
      if (reportError) throw reportError

      const { error: consultationError } = await db
        .from('libertymd_consultations')
        .update({
          status: 'completed',
          report_gate: gate,
          completed_at: now,
          retention_expires_at: retention,
          last_activity_at: now,
        })
        .eq('id', consultationId)
        .eq('user_id', user.id)
      if (consultationError) throw consultationError

      return report
    }

    if (payload.action === 'bootstrap') {
      const profile = await ensureProfile()
      return jsonResponse({
        user_id: user.id,
        is_anonymous: isAnonymous,
        greeting_name: firstName(user) || null,
        profile,
        history: await historySummary(),
      })
    }

    if (payload.action === 'start_consultation') {
      const message = cleanMessage(payload.message)
      if (!message) return jsonResponse({ error: 'Please describe the symptom' }, 400)
      const profile = await ensureProfile()
      const slots = { chief_complaint: message }
      const { data: consultation, error } = await db
        .from('libertymd_consultations')
        .insert({
          user_id: user.id,
          status: 'awaiting_demographics',
          region: payload.region === 'EU' ? 'EU' : 'US',
          chief_complaint: message,
          turn_count: 1,
          filled_slots: slots,
          missing_slots: CORE_SLOTS,
          retention_expires_at: isAnonymous ? addDays(30) : null,
          workflow_versions: { guardrail: 'libertymd-v1', interview: 'libertymd-v1', diagnosis: 'libertymd-v1' },
        })
        .select('*')
        .single()
      if (error) throw error

      await addMessage(consultation.id, 'user', message, {
        slot_updates: slots,
        target_slot: 'chief_complaint',
      })
      const history = await getHistory(consultation.id)
      const guardrail = await runGuardrail(message, history, patientPayload(profile), slots)
      await saveSafetyEvent(consultation, guardrail, 1)

      if (guardrail.force_end) {
        await addMessage(consultation.id, 'assistant', guardrail.message, { message_type: 'safety' })
        await db.from('libertymd_consultations').update({
          status: 'emergency_stopped',
          safety_state: guardrail.raw,
          last_activity_at: new Date().toISOString(),
        }).eq('id', consultation.id)
        return jsonResponse({ consultation_id: consultation.id, emergency: true, safety: guardrail, message: guardrail.message })
      }

      const prompt = acknowledgement(message, guardrail)
      await addMessage(consultation.id, 'assistant', prompt, {
        message_type: 'demographics',
        metadata: { safety_status: guardrail.status },
      })
      await db.from('libertymd_consultations').update({
        safety_state: { ...guardrail.raw, status: guardrail.status, risk_level: guardrail.risk_level },
        last_activity_at: new Date().toISOString(),
      }).eq('id', consultation.id)

      return jsonResponse({
        consultation_id: consultation.id,
        state: 'awaiting_demographics',
        acknowledgement: prompt,
        safety: guardrail.status === 'high_risk_continue' ? guardrail : null,
      })
    }

    if (payload.action === 'save_demographics') {
      if (!payload.consultation_id) return jsonResponse({ error: 'Missing consultation id' }, 400)
      const consultation = await getOwnedConsultation(payload.consultation_id)
      if (consultation.status !== 'awaiting_demographics') return jsonResponse({ error: 'Demographics were already submitted' }, 409)
      const age = Number(payload.age)
      const sex = String(payload.sex_at_birth || '')
      if (!Number.isInteger(age) || age < 18 || age > 120) return jsonResponse({ error: 'Enter an age from 18 to 120' }, 400)
      if (!['female', 'male', 'intersex', 'prefer_not_to_say'].includes(sex)) return jsonResponse({ error: 'Choose a valid sex option' }, 400)

      const now = new Date().toISOString()
      const { data: profile, error: profileError } = await db
        .from('libertymd_profiles')
        .update({ age, sex_at_birth: sex, consent_version: CONSENT_VERSION, consented_at: now })
        .eq('user_id', user.id)
        .select('*')
        .single()
      if (profileError) throw profileError

      const slots = { ...(consultation.filled_slots || {}), age, sex_at_birth: sex }
      await addMessage(consultation.id, 'user', `Age ${age}; sex assigned at birth: ${sex.replaceAll('_', ' ')}`, {
        message_type: 'demographics',
        slot_updates: { age, sex_at_birth: sex },
      })
      const history = await getHistory(consultation.id)
      const interview = await runInterview(history, patientPayload(profile), slots, consultation.missing_slots, consultation.target_slot, consultation.turn_count)
      const mergedSlots = { ...slots, ...interview.slot_updates }
      const missingSlots = interview.missing_slots.length ? interview.missing_slots : calculateMissingSlots(mergedSlots)
      const evidence = assessClinicalEvidence(mergedSlots)
      const nextStatus = consultation.safety_state?.status === 'high_risk_continue' ? 'high_risk' : 'interviewing'

      await addMessage(consultation.id, 'assistant', interview.next_question, {
        options: interview.options,
        target_slot: interview.target_slot,
        slot_updates: interview.slot_updates,
        metadata: { workflow_source: interview.source },
      })
      await db.from('libertymd_consultations').update({
        status: nextStatus,
        filled_slots: mergedSlots,
        missing_slots: missingSlots,
        target_slot: interview.target_slot,
        clinical_evidence_score: evidence.score,
        last_activity_at: now,
      }).eq('id', consultation.id)

      return jsonResponse({
        consultation_id: consultation.id,
        state: nextStatus,
        next_question: interview.next_question,
        options: interview.options,
        target_slot: interview.target_slot,
        missing_slots: missingSlots,
        evidence_score: evidence.score,
      })
    }

    if (payload.action === 'send_message') {
      if (!payload.consultation_id) return jsonResponse({ error: 'Missing consultation id' }, 400)
      const message = cleanMessage(payload.message)
      if (!message) return jsonResponse({ error: 'Message cannot be empty' }, 400)
      const consultation = await getOwnedConsultation(payload.consultation_id)
      if (!['interviewing', 'high_risk'].includes(consultation.status)) {
        return jsonResponse({ error: `Consultation cannot accept answers in ${consultation.status}` }, 409)
      }
      const suppliedRequestId = String(payload.client_message_id || '').trim()
      const requestId = suppliedRequestId || crypto.randomUUID()
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        return jsonResponse({ error: 'Invalid client message id' }, 400)
      }
      const expectedVersion = Number.isInteger(payload.expected_version) ? Number(payload.expected_version) : null
      const { data: claims, error: claimError } = await db.rpc('libertymd_claim_consultation_request', {
        p_consultation_id: consultation.id,
        p_user_id: user.id,
        p_request_id: requestId,
        p_expected_version: expectedVersion,
      })
      if (claimError) throw claimError
      const claim = Array.isArray(claims) ? claims[0] : claims
      if (!claim?.accepted) {
        if (claim?.replayed) return jsonResponse(await replayCompletedTurn(await getOwnedConsultation(consultation.id)))
        return jsonResponse({
          error: 'Another answer is already being processed',
          retryable: true,
          current_version: claim?.current_version || consultation.version,
        }, 409)
      }

      try {
      const profile = await ensureProfile()
      const turnCount = consultation.turn_count + 1
      const { data: existingRequestMessage, error: existingRequestError } = await db
        .from('libertymd_messages')
        .select('id')
        .eq('consultation_id', consultation.id)
        .eq('client_message_id', requestId)
        .maybeSingle()
      if (existingRequestError) throw existingRequestError
      if (!existingRequestMessage) {
        await addMessage(consultation.id, 'user', message, {
          target_slot: consultation.target_slot,
          client_message_id: requestId,
        })
      }
      let history = await getHistory(consultation.id)
      const guardrail = await runGuardrail(message, history, patientPayload(profile), consultation.filled_slots)
      await saveSafetyEvent(consultation, guardrail, turnCount)

      if (guardrail.force_end) {
        await addMessage(consultation.id, 'assistant', guardrail.message, { message_type: 'safety' })
        await db.from('libertymd_consultations').update({
          status: 'emergency_stopped',
          turn_count: turnCount,
          safety_state: guardrail.raw,
          last_activity_at: new Date().toISOString(),
        }).eq('id', consultation.id)
        return jsonResponse({ consultation_id: consultation.id, emergency: true, safety: guardrail, message: guardrail.message })
      }

      const interview = await runInterview(
        history,
        patientPayload(profile),
        consultation.filled_slots,
        consultation.missing_slots,
        consultation.target_slot,
        turnCount,
      )
      const deterministicRelevance = classifyResponseRelevance(message)
      const isNonClinical = deterministicRelevance === 'off_topic' || interview.input_relevance === 'off_topic'
      const nonClinicalResponseCount = (consultation.non_clinical_response_count || 0) + (isNonClinical ? 1 : 0)
      const consecutiveNonClinicalResponseCount = isNonClinical
        ? (consultation.consecutive_non_clinical_response_count || 0) + 1
        : 0

      if (isNonClinical) {
        const previousPrompt = [...history].reverse().find((item) => {
          const row = item as JsonObject
          return row.role === 'assistant' && row.message_type !== 'safety'
        }) as JsonObject | undefined
        const shouldStop = turnCount >= MAX_TURNS || consecutiveNonClinicalResponseCount >= 3 || nonClinicalResponseCount >= 5
        const messageText = shouldStop
          ? 'I do not have enough relevant health information to produce a responsible differential diagnosis. Please restart with the symptom details or continue with a licensed clinician.'
          : `I need a health-related answer to continue safely. ${cleanMessage(previousPrompt?.content) || interview.next_question}`

        await addMessage(consultation.id, 'assistant', messageText, {
          message_type: shouldStop ? 'safety' : 'question',
          options: shouldStop ? [] : (Array.isArray(previousPrompt?.options) ? previousPrompt.options : interview.options),
          target_slot: consultation.target_slot,
          metadata: {
            response_relevance: 'off_topic',
            deterministic_relevance: deterministicRelevance,
            workflow_relevance: interview.input_relevance,
            relevance_reason: interview.input_relevance_reason,
          },
        })
        await db.from('libertymd_consultations').update({
          status: shouldStop ? 'clinical_review_needed' : consultation.status,
          turn_count: turnCount,
          non_clinical_response_count: nonClinicalResponseCount,
          consecutive_non_clinical_response_count: consecutiveNonClinicalResponseCount,
          resolution_reason: shouldStop ? 'insufficient_clinical_information' : null,
          last_activity_at: new Date().toISOString(),
        }).eq('id', consultation.id)

        return jsonResponse({
          consultation_id: consultation.id,
          state: shouldStop ? 'clinical_review_needed' : consultation.status,
          clinical_review_needed: shouldStop,
          non_clinical_response: true,
          message: messageText,
          next_question: shouldStop ? null : messageText,
          options: shouldStop ? [] : (Array.isArray(previousPrompt?.options) ? previousPrompt.options : interview.options),
        })
      }

      const slots = { ...consultation.filled_slots, ...interview.slot_updates }
      const missingSlots = interview.missing_slots.length ? interview.missing_slots : calculateMissingSlots(slots)
      const evidence = assessClinicalEvidence(slots)
      const shouldRunDiagnosis = evidence.score >= 50 && turnCount >= 6 && (turnCount % 2 === 0 || interview.ready_for_report || turnCount >= MAX_TURNS)
      let diagnosis: Awaited<ReturnType<typeof runDiagnosis>> | null = null

      if (shouldRunDiagnosis) {
        const diagnosisInput = { ...consultation, turn_count: turnCount }
        diagnosis = await runDiagnosis(history, patientPayload(profile), diagnosisInput, slots)
      }

      const reportDecision = decideReportOutcome({
        diagnosisValid: Boolean(diagnosis?.valid),
        confidence: diagnosis?.confidence || 0,
        turnCount,
        readyForReport: interview.ready_for_report,
        evidence,
        nonClinicalResponseCount,
      })

      if (reportDecision.outcome === 'complete' && diagnosis) {
        const now = new Date().toISOString()
        const accessStatus = isAnonymous ? 'withheld' : 'saved'
        const { error: reportError } = await db.from('libertymd_reports').upsert({
          consultation_id: consultation.id,
          user_id: user.id,
          report_data: diagnosis.raw,
          confidence_score: diagnosis.confidence,
          access_status: accessStatus,
          released_at: isAnonymous ? null : now,
          retention_expires_at: isAnonymous ? addDays(30) : null,
          model_metadata: { source: 'libertymd-diagnosis', turn_count: turnCount },
        }, { onConflict: 'consultation_id' })
        if (reportError) throw reportError

        await addMessage(consultation.id, 'assistant', isAnonymous
          ? 'Your LibertyMD report is ready. Link Google to save it and revisit this consult, or continue without saving.'
          : 'Your LibertyMD report is ready and has been saved to your history.', {
          message_type: 'report_gate',
        })
        await db.from('libertymd_consultations').update({
          status: isAnonymous ? 'report_pending_auth' : 'completed',
          report_gate: isAnonymous ? 'withheld' : 'google_linked',
          turn_count: turnCount,
          filled_slots: slots,
          missing_slots: missingSlots,
          intermediate_diagnoses: diagnosis.differentials,
          safety_state: guardrail.raw,
          non_clinical_response_count: nonClinicalResponseCount,
          consecutive_non_clinical_response_count: 0,
          clinical_evidence_score: evidence.score,
          resolution_reason: reportDecision.reason,
          completed_at: isAnonymous ? null : now,
          last_activity_at: now,
        }).eq('id', consultation.id)

        return jsonResponse({
          consultation_id: consultation.id,
          state: isAnonymous ? 'report_pending_auth' : 'completed',
          report_ready: true,
          auth_required: isAnonymous,
          report: isAnonymous ? undefined : diagnosis.raw,
          confidence_score: diagnosis.confidence,
          evidence_score: evidence.score,
        })
      }

      if (reportDecision.outcome === 'review') {
        const messageText = reportDecision.reason === 'insufficient_clinical_information'
          ? 'I do not have enough relevant clinical information to produce a responsible differential diagnosis. Please restart with clearer symptom details or continue with a licensed clinician.'
          : 'I could not reach a sufficiently confident differential diagnosis from this intake. Please continue with a licensed clinician for review.'
        await addMessage(consultation.id, 'assistant', messageText, { message_type: 'safety' })
        await db.from('libertymd_consultations').update({
          status: 'clinical_review_needed',
          turn_count: turnCount,
          filled_slots: slots,
          missing_slots: missingSlots,
          intermediate_diagnoses: diagnosis?.valid ? diagnosis.differentials : consultation.intermediate_diagnoses,
          safety_state: guardrail.raw,
          non_clinical_response_count: nonClinicalResponseCount,
          consecutive_non_clinical_response_count: 0,
          clinical_evidence_score: evidence.score,
          resolution_reason: reportDecision.reason,
          last_activity_at: new Date().toISOString(),
        }).eq('id', consultation.id)
        return jsonResponse({
          consultation_id: consultation.id,
          state: 'clinical_review_needed',
          clinical_review_needed: true,
          reason: reportDecision.reason,
          evidence_score: evidence.score,
          message: messageText,
        })
      }

      const nextQuestion = interview.next_question || 'Before I prepare the report, is there anything else about the symptom or your medical history that may be important?'
      const nextStatus = guardrail.status === 'high_risk_continue' ? 'high_risk' : 'interviewing'
      await addMessage(consultation.id, 'assistant', nextQuestion, {
        options: interview.options,
        target_slot: interview.target_slot,
        slot_updates: interview.slot_updates,
        metadata: { workflow_source: interview.source, safety_status: guardrail.status },
      })
      await db.from('libertymd_consultations').update({
        status: nextStatus,
        turn_count: turnCount,
        filled_slots: slots,
        missing_slots: missingSlots,
        target_slot: interview.target_slot,
        intermediate_diagnoses: diagnosis?.valid ? diagnosis.differentials : consultation.intermediate_diagnoses,
        safety_state: { ...guardrail.raw, status: guardrail.status, risk_level: guardrail.risk_level },
        non_clinical_response_count: nonClinicalResponseCount,
        consecutive_non_clinical_response_count: 0,
        clinical_evidence_score: evidence.score,
        resolution_reason: null,
        last_activity_at: new Date().toISOString(),
      }).eq('id', consultation.id)

      return jsonResponse({
        consultation_id: consultation.id,
        state: nextStatus,
        next_question: nextQuestion,
        options: interview.options,
        target_slot: interview.target_slot,
        missing_slots: missingSlots,
        evidence_score: evidence.score,
        safety: guardrail.status === 'high_risk_continue' ? guardrail : null,
      })
      } finally {
        const { error: finishError } = await db.rpc('libertymd_finish_consultation_request', {
          p_consultation_id: consultation.id,
          p_user_id: user.id,
          p_request_id: requestId,
        })
        if (finishError) console.error('Unable to clear LibertyMD request lease', finishError)
      }
    }

    if (payload.action === 'release_report') {
      if (!payload.consultation_id || !payload.mode) return jsonResponse({ error: 'Missing report release details' }, 400)
      const report = await releaseReport(payload.consultation_id, payload.mode)
      return jsonResponse({ consultation_id: payload.consultation_id, state: 'completed', report: report.report_data, confidence_score: report.confidence_score, access_status: report.access_status })
    }

    if (payload.action === 'sync_identity') {
      const profile = await ensureProfile()
      let released = null
      if (payload.consultation_id && !isAnonymous) released = await releaseReport(payload.consultation_id, 'google')
      return jsonResponse({
        is_anonymous: isAnonymous,
        greeting_name: firstName(user) || null,
        profile,
        history: await historySummary(),
        report: released?.report_data || null,
        confidence_score: released?.confidence_score || null,
      })
    }

    if (payload.action === 'get_history') {
      await ensureProfile()
      return jsonResponse({ account_required: isAnonymous, history: await historySummary() })
    }

    if (payload.action === 'get_consultation') {
      if (!payload.consultation_id) return jsonResponse({ error: 'Missing consultation id' }, 400)
      const consultation = await getOwnedConsultation(payload.consultation_id)
      const messages = await getHistory(consultation.id)
      const { data: report } = await db
        .from('libertymd_reports')
        .select('report_data,confidence_score,access_status')
        .eq('consultation_id', consultation.id)
        .eq('user_id', user.id)
        .in('access_status', ['saved', 'guest_released'])
        .maybeSingle()
      return jsonResponse({ consultation, messages, report: report?.report_data || null, confidence_score: report?.confidence_score || null })
    }

    return jsonResponse({ error: 'Invalid action' }, 400)
  } catch (error) {
    console.error('LibertyMD care proxy error', error)
    const message = error instanceof Error ? error.message : String(error)
    const status = message === 'Consultation not found' ? 404 : 500
    return jsonResponse({ error: message }, status)
  }
})
