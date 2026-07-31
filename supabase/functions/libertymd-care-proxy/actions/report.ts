/**
 * `release_report`, plus the shared `releaseReport` write used by the identity
 * actions once a Google account is linked.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 *
 * Guest release keeps a 7-day retention window; a linked account saves
 * indefinitely. The proxy decides both — the client only names the mode.
 *
 * P2-07: this module updates access / retention metadata only
 * (`access_status`, `released_at`, `retention_expires_at`). Clinical body
 * columns are insert-once immutable (BEFORE UPDATE trigger +
 * `lib/report-persistence.ts`); never rewrite `report_data` /
 * `confidence_score` / `final_diagnostic_run_id` / clinical `model_metadata` here.
 */
import { getOwnedConsultation } from '../lib/consultations.ts'
import { jsonResponse } from '../lib/errors.ts'
import { addProductEvent } from '../lib/telemetry.ts'
import { addDays } from '../lib/utils.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { RequestPayload } from '../lib/types.ts'

export async function releaseReport(ctx: ProxyContext, consultationId: string, mode: 'skip' | 'google') {
  const { db, user, isAnonymous } = ctx
  const consultation = await getOwnedConsultation(ctx, consultationId)
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
  await addProductEvent(
    ctx,
    mode === 'skip' ? 'report_released_guest' : 'report_saved_google',
    consultationId,
    {
      access_status: accessStatus,
      method: mode === 'skip' ? 'guest' : 'google',
    },
  )

  return report
}

export async function handleReleaseReport(ctx: ProxyContext, payload: RequestPayload) {
  if (!payload.consultation_id || !payload.mode) return jsonResponse({ error: 'Missing report release details' }, 400)
  const report = await releaseReport(ctx, payload.consultation_id, payload.mode)
  return jsonResponse({ consultation_id: payload.consultation_id, state: 'completed', report: report.report_data, confidence_score: report.confidence_score, access_status: report.access_status })
}
