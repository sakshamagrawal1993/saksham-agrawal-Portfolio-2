/**
 * `abandon_consultation` and `resume_consultation`.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 *
 * The user's input is sacred: resuming restores the status the consultation was
 * abandoned from (or infers it from persisted state), so nothing typed is lost.
 * Both writes are compare-and-set on `status` plus a version bump.
 */
import { getOwnedConsultation } from '../lib/consultations.ts'
import { jsonResponse } from '../lib/errors.ts'
import { generatePartialOutcome } from '../lib/partial-outcome.ts'
import {
  isLibertyMDResumableStatus,
  resolveLibertyMDResumeStatus,
} from '../session-recovery.ts'
import { addProductEvent } from '../lib/telemetry.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { RequestPayload } from '../lib/types.ts'

export async function handleAbandonConsultation(ctx: ProxyContext, payload: RequestPayload) {
  if (!payload.consultation_id) return jsonResponse({ error: 'Missing consultation id' }, 400)
  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)
  if (consultation.status === 'abandoned') {
    return jsonResponse({ consultation_id: consultation.id, state: 'abandoned', version: consultation.version })
  }
  if (!isLibertyMDResumableStatus(consultation.status)) {
    return jsonResponse({ error: `Consultation cannot be abandoned in ${consultation.status}` }, 409)
  }

  const requestStartedAt = consultation.active_request_started_at
    ? new Date(consultation.active_request_started_at).getTime()
    : 0
  if (consultation.active_request_id && requestStartedAt > Date.now() - 2 * 60_000) {
    return jsonResponse({ error: 'Please wait for the current response before starting over' }, 409)
  }

  const priorStatus = consultation.status
  const now = new Date().toISOString()
  const { data: abandoned, error: abandonError } = await ctx.db
    .from('libertymd_consultations')
    .update({
      status: 'abandoned',
      abandoned_from_status: consultation.status,
      abandoned_at: now,
      active_request_id: null,
      active_request_started_at: null,
      last_activity_at: now,
      version: consultation.version + 1,
    })
    .eq('id', consultation.id)
    .eq('user_id', ctx.user.id)
    .eq('status', consultation.status)
    .select('id,status,version')
    .maybeSingle()
  if (abandonError) throw abandonError
  if (!abandoned) return jsonResponse({ error: 'Consultation state changed. Please refresh and try again.' }, 409)

  // P1-09 Q5A — partial_outcome_shown iff eligible payload attached (not intermediate_diagnoses).
  // Vanish-without-API residual remains (P1-15). Soft leave never reaches this emit.
  const partialOutcome = generatePartialOutcome({
    turn_count: Number(consultation.turn_count) || 0,
    status: priorStatus,
    filled_slots: consultation.filled_slots,
  })
  await addProductEvent(ctx, 'consult_abandoned', consultation.id, {
    abandoned_from_status: priorStatus,
    last_status: priorStatus,
    turn_index: Number(consultation.turn_count) || 0,
    partial_outcome_shown: partialOutcome !== null,
  })

  return jsonResponse({
    consultation_id: abandoned.id,
    state: abandoned.status,
    version: abandoned.version,
    partial_outcome: partialOutcome,
  })
}

export async function handleResumeConsultation(ctx: ProxyContext, payload: RequestPayload) {
  if (!payload.consultation_id) return jsonResponse({ error: 'Missing consultation id' }, 400)
  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)
  if (isLibertyMDResumableStatus(consultation.status)) {
    return jsonResponse({ consultation_id: consultation.id, state: consultation.status, version: consultation.version })
  }
  if (consultation.status !== 'abandoned') {
    return jsonResponse({ error: `Consultation cannot be resumed in ${consultation.status}` }, 409)
  }

  const resumeStatus = resolveLibertyMDResumeStatus(consultation)
  const now = new Date().toISOString()
  const { data: resumed, error: resumeError } = await ctx.db
    .from('libertymd_consultations')
    .update({
      status: resumeStatus,
      abandoned_from_status: null,
      abandoned_at: null,
      last_activity_at: now,
      version: consultation.version + 1,
    })
    .eq('id', consultation.id)
    .eq('user_id', ctx.user.id)
    .eq('status', 'abandoned')
    .select('id,status,version')
    .maybeSingle()
  if (resumeError) throw resumeError
  if (!resumed) return jsonResponse({ error: 'Consultation state changed. Please refresh and try again.' }, 409)

  return jsonResponse({ consultation_id: resumed.id, state: resumed.status, version: resumed.version })
}
