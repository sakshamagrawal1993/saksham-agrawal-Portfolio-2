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
  const { data, error } = await ctx.db
    .from('libertymd_messages')
    .select('role,content,message_type,options,target_slot,created_at')
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

export async function saveDiagnosticRun(
  ctx: ProxyContext,
  consultation: ConsultationRow,
  diagnosis: DiagnosisResult,
  slots: JsonObject,
  missingSlots: string[],
  evidenceScore: number,
  turnCount: number,
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
      target_slot: consultation.target_slot,
    },
    confidence_score: diagnosis.confidence,
    evidence_score: evidenceScore,
    validation_reason: validationReason || null,
    workflow_metadata: workflowMetadata,
  }).select('id').single()
  if (error) throw error
  return String(data.id)
}

export async function historySummary(ctx: ProxyContext) {
  if (ctx.isAnonymous) return []
  const { data, error } = await ctx.db
    .from('libertymd_consultations')
    .select('id,status,chief_complaint,turn_count,report_gate,created_at,updated_at,completed_at')
    .eq('user_id', ctx.user.id)
    .order('last_activity_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data || []
}
