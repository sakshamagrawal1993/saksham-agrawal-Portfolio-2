/**
 * Consultation, message and diagnostic-run persistence.
 *
 * Moved verbatim from the index.ts request closure in L0-5 (pure structural
 * refactor).
 *
 * The proxy is the sole clinical writer (CONTEXT.md §3.2). Every read here is
 * scoped to `ctx.user.id`; every write is service-role and decided here, not by
 * n8n and not by the client.
 */
import { MAX_TURNS } from './config.ts'
import { normalizeObject, type DiagnosisResult } from './n8n-client.ts'
import { patientDisplayLabelsByIds } from './profiles.ts'
import { cleanMessage, limitConsultationMessage } from './utils.ts'
import type { ProxyContext } from './context.ts'
import type { ConsultationRow, JsonObject } from './types.ts'

// ---------------------------------------------------------------------------
// P0-13 · hard invariants, enforced server-side
// ---------------------------------------------------------------------------

/**
 * F3's invariants were trusted to prompts and convention. CONTEXT.md §4 is
 * explicit that anything which must *never* happen belongs in code, so each one
 * below is a function that throws, and each one has a test that attempts the
 * violation and asserts the rejection (P0-13 AC5).
 *
 * These throw rather than returning a result because there is no sensible
 * degraded behaviour for any of them. A caller that tries to write to someone
 * else's consultation, or to invent a seventh `message_type`, has a bug; the
 * only safe outcome is to refuse and leave a warn-level trail.
 */
export class InvariantViolation extends Error {
  readonly invariant: string
  readonly httpStatus: number
  constructor(invariant: string, message: string, httpStatus = 409) {
    super(message)
    this.name = 'InvariantViolation'
    this.invariant = invariant
    this.httpStatus = httpStatus
  }
}

export const isInvariantViolation = (error: unknown): error is InvariantViolation =>
  error instanceof InvariantViolation

/**
 * P0-13 AC3 — the closed `message_type` enum.
 *
 * This is the exact CHECK constraint on `public.libertymd_messages`
 * (`supabase/migrations/20260718080000_libertymd_care_schema.sql:59`). It is
 * mirrored here because a CHECK violation surfaces as an opaque Postgres error
 * from whichever handler happened to write the row, which is how
 * `message_type: 'question'` survived in `send_message` (see the ticket notes):
 * the value is not in the enum, so that insert could only ever have failed.
 *
 * `addMessage` is the sole writer to `libertymd_messages` in this function, so
 * validating here covers every path including the ones outside this ticket's
 * manifest. Keep this list and the migration in lockstep; changing one without
 * the other is the failure mode this guard exists to make loud.
 */
export const MESSAGE_TYPES = ['normal', 'demographics', 'safety', 'report_gate', 'report', 'system'] as const

export type MessageType = typeof MESSAGE_TYPES[number]

export const isMessageType = (value: unknown): value is MessageType =>
  typeof value === 'string' && (MESSAGE_TYPES as readonly string[]).includes(value)

/**
 * P0-13 AC4 — identity comes from the JWT (CONTEXT.md §3.4), and the proxy holds
 * the service-role key, so RLS is *not* the backstop here. Every consultation
 * row reaching a write must have been fetched through `getOwnedConsultation`;
 * this asserts that property instead of assuming it.
 *
 * Cheap by design (a field comparison, no round trip) so there is no excuse to
 * skip it on a hot path.
 */
export function assertConsultationOwned(ctx: ProxyContext, consultation: { id: string; user_id: string }) {
  if (consultation.user_id === ctx.user.id) return
  console.warn('LibertyMD invariant violation: write attempted on a consultation the caller does not own', {
    invariant: 'consultation_ownership',
    consultation_id: consultation.id,
    jwt_subject: ctx.user.id,
  })
  throw new InvariantViolation('consultation_ownership', 'Consultation not found', 404)
}

/**
 * P0-13 AC1 — the turn cap is a hard invariant, not a prompt instruction.
 *
 * Turn 16 must be structurally impossible. `decideReportOutcome` already
 * terminates every turn-15 consult (verified: at `turnCount >= 15` it can only
 * return `complete` or `review`, never `continue`), so today's happy path never
 * reaches this. That is precisely why it is worth asserting — the cap currently
 * *emerges* from a scoring function three modules away, and would disappear
 * silently the moment that function is retuned.
 */
export function assertTurnWithinCap(consultationId: string, nextTurnCount: number) {
  if (nextTurnCount <= MAX_TURNS) return
  console.warn('LibertyMD invariant violation: turn count would exceed the cap', {
    invariant: 'max_turns',
    consultation_id: consultationId,
    attempted_turn_count: nextTurnCount,
    max_turns: MAX_TURNS,
  })
  throw new InvariantViolation('max_turns', `Consultation has reached its ${MAX_TURNS}-turn limit`)
}

/**
 * The only sanctioned way to write `libertymd_consultations`. P0-13 AC4.
 *
 * Before this, every update in `send_message` was `.eq('id', consultation.id)`
 * with no `user_id` filter — correct in practice because the row had been read
 * through `getOwnedConsultation` first, but a service-role write whose
 * ownership lives in a different statement several dozen lines earlier. The
 * filter is now attached to the write itself, and a zero-row result is treated
 * as a violation rather than as success.
 */
export async function updateOwnedConsultation(
  ctx: ProxyContext,
  consultation: ConsultationRow,
  values: JsonObject,
) {
  assertConsultationOwned(ctx, consultation)
  const { data, error } = await ctx.db
    .from('libertymd_consultations')
    .update(values)
    .eq('id', consultation.id)
    .eq('user_id', ctx.user.id)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) {
    console.warn('LibertyMD invariant violation: consultation update matched no owned row', {
      invariant: 'consultation_ownership',
      consultation_id: consultation.id,
    })
    throw new InvariantViolation('consultation_ownership', 'Consultation not found', 404)
  }
}

export async function getOwnedConsultation(ctx: ProxyContext, id: string) {
  const { data, error } = await ctx.db
    .from('libertymd_consultations')
    .select('*')
    .eq('id', id)
    .eq('user_id', ctx.user.id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Consultation not found')
  return data as ConsultationRow
}

export async function getHistory(ctx: ProxyContext, consultationId: string) {
  // P1-12 Q6A — include id + client_message_id (PHI-free UUIDs) so Chat can
  // reconcile durable pending outbound against server history. Select-list only.
  const { data, error } = await ctx.db
    .from('libertymd_messages')
    .select('id,client_message_id,role,content,message_type,options,target_slot,created_at')
    .eq('consultation_id', consultationId)
    .order('sequence', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * The sole writer to `libertymd_messages`, and therefore where P0-13 AC3 is
 * enforced: every row leaves here with exactly one `message_type` drawn from
 * `MESSAGE_TYPES`.
 *
 * `target` accepts either a consultation row or a bare id. Passing the row also
 * gets the AC4 ownership assertion for free; the id form is retained so the
 * call sites outside this ticket's manifest keep compiling unchanged, and
 * should be migrated to the row form as those files are next touched.
 */
export async function addMessage(
  ctx: ProxyContext,
  target: ConsultationRow | string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  extras: JsonObject = {},
) {
  const consultationId = typeof target === 'string' ? target : target.id
  if (typeof target !== 'string') assertConsultationOwned(ctx, target)

  // Exactly one message_type, always, from the closed enum. Absent means the
  // column default, which is 'normal' — made explicit here so a row can never
  // be written whose type depends on which of two schemas is deployed.
  const suppliedType = extras.message_type
  if (suppliedType !== undefined && !isMessageType(suppliedType)) {
    console.warn('LibertyMD invariant violation: message_type outside the closed enum', {
      invariant: 'message_type_enum',
      consultation_id: consultationId,
      supplied: String(suppliedType),
      allowed: MESSAGE_TYPES,
    })
    throw new InvariantViolation('message_type_enum', 'Unsupported message type', 500)
  }
  const messageType: MessageType = isMessageType(suppliedType) ? suppliedType : 'normal'

  const { error } = await ctx.db.from('libertymd_messages').insert({
    consultation_id: consultationId,
    role,
    content: role === 'assistant' ? limitConsultationMessage(content) : content,
    ...extras,
    message_type: messageType,
  })
  if (error) throw error
}

/**
 * P2-06 AC7 — omit report body when retention has closed.
 * NULL retention → never omit (saved / linked). Invalid timestamps → never omit.
 */
export function reportDataIfNotExpired(
  report: {
    report_data?: unknown
    retention_expires_at?: string | null
  } | null | undefined,
): unknown {
  if (!report) return null
  const expiresAt = report.retention_expires_at
  if (expiresAt != null && String(expiresAt) !== '') {
    const ms = Date.parse(String(expiresAt))
    if (!Number.isNaN(ms) && ms < Date.now()) return null
  }
  return report.report_data ?? null
}

/** P2-13 L6 — omit reason + retention ISO for client lifecycle derivation. */
export type ReportReadLifecycleMeta = {
  report: unknown
  retention_expires_at: string | null
  report_omitted_reason: 'retention_expired' | null
}

export function reportReadLifecycleMeta(
  report: {
    report_data?: unknown
    retention_expires_at?: string | null
  } | null | undefined,
  nowMs: number = Date.now(),
): ReportReadLifecycleMeta {
  if (!report) {
    return {
      report: null,
      retention_expires_at: null,
      report_omitted_reason: null,
    }
  }
  const expiresRaw = report.retention_expires_at
  const retentionExpiresAt =
    expiresRaw != null && String(expiresRaw) !== '' ? String(expiresRaw) : null
  const body = reportDataIfNotExpired(report)
  let omitted: 'retention_expired' | null = null
  if (body == null && retentionExpiresAt != null) {
    const ms = Date.parse(retentionExpiresAt)
    if (!Number.isNaN(ms) && ms < nowMs) omitted = 'retention_expired'
  }
  return {
    report: body,
    retention_expires_at: retentionExpiresAt,
    report_omitted_reason: omitted,
  }
}

/**
 * Idempotent replay of the last completed turn, used when the request-lease RPC
 * reports the client is retrying an already-processed message.
 */
export async function replayCompletedTurn(ctx: ProxyContext, consultation: ConsultationRow) {
  assertConsultationOwned(ctx, consultation)
  const { db, user } = ctx
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
  // P2-02 Q3: return report_data while withheld / report_pending_auth (soft gate).
  // P2-06 AC7: omit when reports.retention_expires_at is past (NULL never omits).
  if (reportReady) {
    const { data, error } = await db
      .from('libertymd_reports')
      .select('report_data,confidence_score,access_status,retention_expires_at')
      .eq('consultation_id', consultation.id)
      .eq('user_id', user.id)
      .in('access_status', ['saved', 'guest_released', 'withheld'])
      .maybeSingle()
    if (error) throw error
    report = data
  }

  const lifecycle = reportReadLifecycleMeta(report)

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
    report: lifecycle.report ?? undefined,
    confidence_score: lifecycle.report != null ? (report?.confidence_score || undefined) : undefined,
    // P2-13 L6 — retention + omit hint for client lifecycle (never leak body after expiry).
    retention_expires_at: lifecycle.retention_expires_at,
    report_omitted_reason: lifecycle.report_omitted_reason,
    version: consultation.version,
  }
}

export type SaveDiagnosticRunOptions = {
  /** P1-08 — true only for detached pre-warm inserts. */
  isSpeculative?: boolean
  /**
   * Snapshot target_slot for material equality. Prefer the value just persisted
   * on the interview continue path; defaults to `consultation.target_slot`.
   */
  targetSlot?: string | null
}

export async function saveDiagnosticRun(
  ctx: ProxyContext,
  consultation: ConsultationRow,
  diagnosis: DiagnosisResult,
  slots: JsonObject,
  missingSlots: string[],
  evidenceScore: number,
  turnCount: number,
  options: SaveDiagnosticRunOptions = {},
) {
  assertConsultationOwned(ctx, consultation)
  const clinicalContext = normalizeObject(diagnosis.raw.clinical_context)
  const summary = normalizeObject(clinicalContext.incremental_summary)
  const reasoning = normalizeObject(clinicalContext.clinical_reasoning_state)
  const rationale = diagnosis.differentials.map((item) => {
    const row = normalizeObject(item)
    return {
      rank: row.rank,
      diagnosis: row.full_name || row.common_name,
      reason: row.reason,
      supporting_evidence: row.supporting_evidence,
      conflicting_evidence: row.conflicting_evidence,
    }
  })
  const validationReason = cleanMessage(
    diagnosis.raw.validation_reason || diagnosis.raw.error || (diagnosis.valid ? 'validated' : 'workflow_invalid'),
  )
  const workflowMetadata = {
    ...normalizeObject(diagnosis.raw.model_metadata),
    workflow_versions: consultation.workflow_versions || {},
    source: 'libertymd-diagnosis',
  }
  const targetSlot = options.targetSlot !== undefined ? options.targetSlot : consultation.target_slot
  const { data, error } = await ctx.db.from('libertymd_diagnostic_runs').insert({
    consultation_id: consultation.id,
    user_id: ctx.user.id,
    patient_id: consultation.patient_id,
    turn_count: turnCount,
    run_status: diagnosis.valid ? 'validated' : diagnosis.raw.error ? 'error' : 'withheld',
    clinical_summary: Object.keys(summary).length
      ? summary
      : { patient_summary: diagnosis.raw.patient_summary || null },
    clinical_reasoning: Object.keys(reasoning).length
      ? reasoning
      : { differential_rationale: rationale },
    differential_diagnosis: diagnosis.differentials,
    input_snapshot: {
      patient: consultation.patient_snapshot || {},
      filled_slots: slots,
      missing_slots: missingSlots,
      target_slot: targetSlot,
    },
    confidence_score: diagnosis.confidence,
    evidence_score: evidenceScore,
    validation_reason: validationReason || null,
    workflow_metadata: workflowMetadata,
    is_speculative: Boolean(options.isSpeculative),
  }).select('id').single()
  if (error) throw error
  return String(data.id)
}

export type DiagnosticRunRow = {
  id: string
  turn_count: number
  run_status: string
  is_speculative: boolean
  input_snapshot: JsonObject
  differential_diagnosis: unknown[]
  confidence_score: number
  clinical_summary: JsonObject
  clinical_reasoning: JsonObject
  validation_reason: string | null
  workflow_metadata: JsonObject
}

/**
 * P1-08 — latest speculative pre-warm row for a consult (proxy sole reader).
 * Missing / in-flight → null (caller runs fresh Diagnosis).
 */
export async function findLatestSpeculativeDiagnosticRun(
  ctx: ProxyContext,
  consultation: ConsultationRow,
): Promise<DiagnosticRunRow | null> {
  assertConsultationOwned(ctx, consultation)
  const { data, error } = await ctx.db
    .from('libertymd_diagnostic_runs')
    .select(
      'id, turn_count, run_status, is_speculative, input_snapshot, differential_diagnosis, confidence_score, clinical_summary, clinical_reasoning, validation_reason, workflow_metadata',
    )
    .eq('consultation_id', consultation.id)
    .eq('user_id', ctx.user.id)
    .eq('is_speculative', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  return {
    id: String(row.id),
    turn_count: Number(row.turn_count) || 0,
    run_status: String(row.run_status || ''),
    is_speculative: Boolean(row.is_speculative),
    input_snapshot: normalizeObject(row.input_snapshot),
    differential_diagnosis: Array.isArray(row.differential_diagnosis) ? row.differential_diagnosis : [],
    confidence_score: Number(row.confidence_score) || 0,
    clinical_summary: normalizeObject(row.clinical_summary),
    clinical_reasoning: normalizeObject(row.clinical_reasoning),
    validation_reason: row.validation_reason == null ? null : String(row.validation_reason),
    workflow_metadata: normalizeObject(row.workflow_metadata),
  }
}

/**
 * Hydrate a DiagnosisResult from a stored speculative row for report-decision
 * reuse without a second Diagnosis webhook (P1-08 R1 — no copy-row insert).
 */
export function diagnosisResultFromDiagnosticRun(row: DiagnosticRunRow): DiagnosisResult {
  const differentials = Array.isArray(row.differential_diagnosis) ? row.differential_diagnosis : []
  const raw: JsonObject = {
    valid_report: row.run_status === 'validated',
    confidence_score: row.confidence_score,
    differential_diagnosis: differentials,
    validation_reason: row.validation_reason,
    model_metadata: row.workflow_metadata,
    clinical_context: {
      incremental_summary: row.clinical_summary,
      clinical_reasoning_state: row.clinical_reasoning,
    },
    patient_summary: row.clinical_summary.patient_summary ?? null,
  }
  return {
    raw,
    differentials,
    confidence: row.confidence_score,
    valid: row.run_status === 'validated' && differentials.length > 0 && row.confidence_score > 0,
    unavailable: false,
    failure: null,
  }
}

/** P4-03 S2 — scalar headline from report_data; never invent clinical prose. */
export function headlineScalarFromReportData(reportData: unknown): string | null {
  if (!reportData || typeof reportData !== 'object' || Array.isArray(reportData)) return null
  const root = reportData as Record<string, unknown>
  const nested = root.report || root.output
  const sources: unknown[] = [root.headline]
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    sources.push((nested as Record<string, unknown>).headline)
  }
  for (const candidate of sources) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim().replace(/\s+/g, ' ')
    if (trimmed) return trimmed.slice(0, 200)
  }
  return null
}

/** Truncate chief_complaint for history headline fallback (matches client resume pattern). */
function truncatedComplaintHeadline(raw: string | null | undefined, maxChars = 72): string | null {
  const text = String(raw || '').trim().replace(/\s+/g, ' ')
  if (!text) return null
  if (text.length <= maxChars) return text
  const slice = text.slice(0, maxChars)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > Math.floor(maxChars * 0.6) ? slice.slice(0, lastSpace) : slice
  return `${cut.trimEnd()}…`
}

function isRetentionPast(expiresAt: string | null | undefined, nowMs: number): boolean {
  if (expiresAt == null || String(expiresAt) === '') return false
  const ms = Date.parse(String(expiresAt))
  return !Number.isNaN(ms) && ms < nowMs
}

/**
 * P4-03 — enriched linked history. Anonymous → [].
 * Omits withheld + retention-past report rows (Q1A/S1). Never embeds report_data.
 */
export async function historySummary(ctx: ProxyContext, nowMs: number = Date.now()) {
  if (ctx.isAnonymous) return []
  const { data, error } = await ctx.db
    .from('libertymd_consultations')
    .select(
      'id,status,chief_complaint,turn_count,report_gate,created_at,updated_at,completed_at,patient_id',
    )
    .eq('user_id', ctx.user.id)
    .order('last_activity_at', { ascending: false })
    .limit(50)
  if (error) throw error
  const consults = Array.isArray(data) ? data : data ? [data] : []
  if (consults.length === 0) return []

  const consultIds = consults
    .map((row) => (typeof row?.id === 'string' ? row.id : ''))
    .filter(Boolean)

  const { data: reportRows, error: reportError } = await ctx.db
    .from('libertymd_reports')
    .select('consultation_id,access_status,retention_expires_at,triage_tier,report_data')
    .eq('user_id', ctx.user.id)
    .in('consultation_id', consultIds)
  if (reportError) throw reportError
  const reports = Array.isArray(reportRows) ? reportRows : reportRows ? [reportRows] : []
  const reportByConsult = new Map<string, Record<string, unknown>>()
  for (const row of reports) {
    const cid = typeof row?.consultation_id === 'string' ? row.consultation_id : ''
    if (cid) reportByConsult.set(cid, row as Record<string, unknown>)
  }

  const kept = consults.filter((row) => {
    const id = typeof row?.id === 'string' ? row.id : ''
    if (!id) return false
    const report = reportByConsult.get(id)
    if (!report) return true
    const access = typeof report.access_status === 'string' ? report.access_status : ''
    if (access === 'withheld') return false
    if (isRetentionPast(report.retention_expires_at as string | null, nowMs)) return false
    return true
  })

  const patientIds = kept
    .map((row) => (typeof row?.patient_id === 'string' ? row.patient_id : ''))
    .filter(Boolean)
  const labels = await patientDisplayLabelsByIds(ctx, patientIds)

  return kept.map((row) => {
    const id = String(row.id)
    const report = reportByConsult.get(id)
    const chief = typeof row.chief_complaint === 'string' ? row.chief_complaint : null
    let headline: string | null = null
    let triageTier: string | null = null
    let retentionExpiresAt: string | null = null
    if (report) {
      headline = headlineScalarFromReportData(report.report_data)
      const tierRaw = typeof report.triage_tier === 'string' ? report.triage_tier.trim() : ''
      triageTier = tierRaw || null
      const expiresRaw = report.retention_expires_at
      retentionExpiresAt =
        expiresRaw != null && String(expiresRaw) !== '' ? String(expiresRaw) : null
    }
    if (!headline) headline = truncatedComplaintHeadline(chief)

    const patientId = typeof row.patient_id === 'string' ? row.patient_id : null
    const patientLabel = patientId
      ? (labels.get(patientId) ?? null)
      : null

    // Strip report_data from outbound shape — scalars only.
    return {
      id,
      status: String(row.status || ''),
      chief_complaint: chief,
      turn_count: typeof row.turn_count === 'number' ? row.turn_count : null,
      report_gate: typeof row.report_gate === 'string' ? row.report_gate : null,
      created_at: String(row.created_at || ''),
      updated_at: row.updated_at != null ? String(row.updated_at) : null,
      completed_at: row.completed_at != null ? String(row.completed_at) : null,
      patient_id: patientId,
      patient_display_label: patientLabel,
      headline,
      triage_tier: triageTier,
      retention_expires_at: retentionExpiresAt,
    }
  })
}
