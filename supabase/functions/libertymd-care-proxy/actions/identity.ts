/**
 * Identity actions: `prepare_account_merge`, `complete_account_merge`,
 * `sync_identity`, `record_identity_event`.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 *
 * Identity always comes from the JWT (`ctx.user`). The transfer token is stored
 * only as a SHA-256 hash and expires in 10 minutes.
 */
import { getOwnedConsultation, historySummary } from '../lib/consultations.ts'
import { jsonResponse } from '../lib/errors.ts'
import { ensureProfile, ensureSelfPatient, getOwnedPatient } from '../lib/profiles.ts'
import { addIdentityEvent } from '../lib/telemetry.ts'
import { cleanMessage, firstName, sha256 } from '../lib/utils.ts'
import { releaseReport } from './report.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { RequestPayload } from '../lib/types.ts'

export async function handlePrepareAccountMerge(ctx: ProxyContext, payload: RequestPayload) {
  const { db, user, isAnonymous } = ctx
  if (!payload.consultation_id) return jsonResponse({ error: 'Missing consultation id' }, 400)
  if (!isAnonymous) return jsonResponse({ error: 'Account is already linked' }, 409)
  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)
  if (consultation.status !== 'report_pending_auth') return jsonResponse({ error: 'Report is not ready' }, 409)
  const transferToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`
  const transferTokenHash = await sha256(transferToken)
  const { error: mergeError } = await db.from('libertymd_account_merges').insert({
    source_user_id: user.id,
    consultation_id: consultation.id,
    transfer_token_hash: transferTokenHash,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    metadata: { purpose: 'google_identity_conflict_recovery' },
  })
  if (mergeError) throw mergeError
  await addIdentityEvent(ctx, 'account_merge_started', consultation.id, { expires_in_seconds: 600 })
  return jsonResponse({ transfer_token: transferToken, expires_in_seconds: 600 })
}

export async function handleCompleteAccountMerge(ctx: ProxyContext, payload: RequestPayload) {
  const { db, user, isAnonymous } = ctx
  if (!payload.consultation_id || !payload.transfer_token) return jsonResponse({ error: 'Missing account transfer details' }, 400)
  if (isAnonymous) return jsonResponse({ error: 'Sign in with Google before completing the transfer' }, 401)
  await ensureProfile(ctx)
  const transferTokenHash = await sha256(payload.transfer_token)
  const { error: mergeError } = await db.rpc('libertymd_complete_account_merge', {
    p_transfer_token_hash: transferTokenHash,
    p_target_user_id: user.id,
  })
  if (mergeError) {
    await addIdentityEvent(ctx, 'account_merge_failed', null, { reason: cleanMessage(mergeError.message) })
    throw mergeError
  }
  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)
  const profile = await ensureProfile(ctx)
  const patient = await getOwnedPatient(ctx, consultation.patient_id)
  const report = await releaseReport(ctx, consultation.id, 'google')
  return jsonResponse({
    consultation_id: consultation.id,
    state: 'completed',
    is_anonymous: false,
    greeting_name: firstName(user) || null,
    profile,
    patient,
    history: await historySummary(ctx),
    report: report.report_data,
    confidence_score: report.confidence_score,
  })
}

export async function handleSyncIdentity(ctx: ProxyContext, payload: RequestPayload) {
  const { db, user, isAnonymous } = ctx
  const profile = await ensureProfile(ctx)
  const patient = await ensureSelfPatient(ctx, profile)
  let released = null
  if (payload.consultation_id && !isAnonymous) {
    if (payload.transfer_token) {
      const transferTokenHash = await sha256(payload.transfer_token)
      const { error: finalizeError } = await db.rpc('libertymd_complete_account_merge', {
        p_transfer_token_hash: transferTokenHash,
        p_target_user_id: user.id,
      })
      if (finalizeError) console.error('Unable to finalize same-user identity transfer', finalizeError)
    }
    await addIdentityEvent(ctx, 'google_link_completed', payload.consultation_id, {
      email_verified: Boolean(user.email_confirmed_at),
    })
    released = await releaseReport(ctx, payload.consultation_id, 'google')
  }
  return jsonResponse({
    is_anonymous: isAnonymous,
    greeting_name: firstName(user) || null,
    profile,
    patient,
    history: await historySummary(ctx),
    report: released?.report_data || null,
    confidence_score: released?.confidence_score || null,
  })
}

export async function handleRecordIdentityEvent(ctx: ProxyContext, payload: RequestPayload) {
  if (!payload.identity_event) return jsonResponse({ error: 'Missing identity event' }, 400)
  if (payload.consultation_id) await getOwnedConsultation(ctx, payload.consultation_id)
  await addIdentityEvent(ctx, payload.identity_event, payload.consultation_id || null)
  return jsonResponse({ recorded: true })
}
