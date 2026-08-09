/**
 * P2-07 — insert-once clinical report persistence.
 *
 * Clinical body (`report_data`, `confidence_score`, `final_diagnostic_run_id`,
 * `model_metadata`) is written at most once per consultation. Retries and
 * races select the existing row; they never upsert/clobber. Access / retention /
 * ownership updates stay on `actions/report.ts` and identity RPCs.
 *
 * Residual honesty: insert then consult-status update is still non-transactional.
 * Orphan recovery short-circuits from the stored row without a second
 * `report_ready` — not full AC4 atomicity.
 */
import { addMessage, updateOwnedConsultation } from './consultations.ts'
import { jsonResponse } from './errors.ts'
import type { ProxyContext } from './context.ts'
import type { ConsultationRow, JsonObject } from './types.ts'

export type StoredReportRow = {
  id?: string
  consultation_id?: string
  user_id?: string
  report_data: JsonObject
  confidence_score: number
  final_diagnostic_run_id?: string | null
  access_status?: string
  model_metadata?: JsonObject
  retention_expires_at?: string | null
  released_at?: string | null
}

export type ReportInsertPayload = {
  consultationId: string
  userId: string
  reportData: JsonObject
  confidenceScore: number
  finalDiagnosticRunId: string | null
  accessStatus: string
  releasedAt: string | null
  retentionExpiresAt: string | null
  modelMetadata: JsonObject
}

const REPORT_SELECT =
  'id,consultation_id,user_id,report_data,confidence_score,final_diagnostic_run_id,access_status,model_metadata,retention_expires_at,released_at'

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String((error as { code?: unknown }).code || '') : ''
  if (code === '23505') return true
  const message = 'message' in error ? String((error as { message?: unknown }).message || '') : ''
  return /duplicate key|unique constraint/i.test(message)
}

/** Owned report row for a consultation, or null. */
export async function findOwnedReport(
  ctx: ProxyContext,
  consultationId: string,
): Promise<StoredReportRow | null> {
  const { data, error } = await ctx.db
    .from('libertymd_reports')
    .select(REPORT_SELECT)
    .eq('consultation_id', consultationId)
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as StoredReportRow | null) ?? null
}

export function isServeEligibleStoredReport(report: StoredReportRow | null | undefined): boolean {
  return Boolean(report) && Boolean(report?.report_data)
}

/** Prefer detect-or-skip so orphan recovery does not spam report_gate messages. */
export async function hasReportGateMessage(
  ctx: ProxyContext,
  consultationId: string,
): Promise<boolean> {
  const { data, error } = await ctx.db
    .from('libertymd_messages')
    .select('id')
    .eq('consultation_id', consultationId)
    .eq('message_type', 'report_gate')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

/**
 * Insert clinical body once. On unique conflict, re-select the existing row
 * and return `inserted: false` — never rewrite clinical columns.
 */
export async function ensureReportInserted(
  ctx: ProxyContext,
  input: ReportInsertPayload,
): Promise<{ report: StoredReportRow; inserted: boolean }> {
  const payload = {
    consultation_id: input.consultationId,
    user_id: input.userId,
    report_data: input.reportData,
    confidence_score: input.confidenceScore,
    final_diagnostic_run_id: input.finalDiagnosticRunId,
    access_status: input.accessStatus,
    released_at: input.releasedAt,
    retention_expires_at: input.retentionExpiresAt,
    model_metadata: input.modelMetadata,
  }

  const { data, error } = await ctx.db
    .from('libertymd_reports')
    .insert(payload)
    .select(REPORT_SELECT)
    .single()

  if (!error && data) {
    return { report: data as StoredReportRow, inserted: true }
  }

  if (!isUniqueViolation(error)) throw error

  const existing = await findOwnedReport(ctx, input.consultationId)
  if (!existing) throw error || new Error('Report insert conflict without existing row')
  return { report: existing, inserted: false }
}

/**
 * Orphan / idempotent recovery: advance consult to terminal report status and
 * return soft-gate JSON from the **stored** row. Does not rewrite clinical
 * columns, does not emit `report_ready` / `report_gate_reached`, and skips a
 * duplicate report_gate assistant message when one already exists.
 */
export async function finalizeFromExistingReport(
  ctx: ProxyContext,
  consultation: ConsultationRow,
  report: StoredReportRow,
  opts: {
    turnCount: number
    currentVersion: number
    evidenceScore?: number
    diagnosisRan?: boolean
    resolutionReason?: 'turn_limit_report' | 'comprehension_confirmed' | 'high_confidence' | 'workflow_ready'
  },
): Promise<Response> {
  const { isAnonymous } = ctx
  const now = new Date().toISOString()
  const status = isAnonymous ? 'report_pending_auth' : 'completed'

  if (!(await hasReportGateMessage(ctx, consultation.id))) {
    await addMessage(ctx, consultation, 'assistant', isAnonymous
      ? 'Your LibertyMD report is ready. Link Google to save it and revisit this consult, or continue without saving.'
      : 'Your LibertyMD report is ready and has been saved to your history.', {
      message_type: 'report_gate',
    })
  }

  await updateOwnedConsultation(ctx, consultation, {
    status,
    report_gate: isAnonymous ? 'withheld' : 'google_linked',
    turn_count: opts.turnCount,
    ...(opts.resolutionReason ? { resolution_reason: opts.resolutionReason } : {}),
    completed_at: isAnonymous ? null : now,
    last_activity_at: now,
  })

  return jsonResponse({
    consultation_id: consultation.id,
    state: status,
    report_ready: true,
    auth_required: isAnonymous,
    report: report.report_data,
    confidence_score: Number(report.confidence_score || 0),
    evidence_score: opts.evidenceScore ?? consultation.clinical_evidence_score,
    turn_count: opts.turnCount,
    diagnosis_ran: Boolean(opts.diagnosisRan),
    version: opts.currentVersion,
  })
}
