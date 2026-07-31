/**
 * Read-only actions: `get_history`, `get_consultation`, `get_partial_outcome`.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 * Both are scoped to the JWT user. P2-02 soft gate: `report_data` is returned for
 * `withheld` / anonymous complete reads as well as saved/guest_released.
 *
 * P0-17 / P3-08: `get_consultation` returns the latest terminal safety event's
 * `crisis_type` + `care_setting` plus resolved `emergency_copy` (heading /
 * standing / detail) so reopen never re-resolves from a client string map.
 *
 * P1-09: `get_partial_outcome` — soft-leave generate path (Q2A+S1). Same pure
 * helper as abandon; ephemeral JSON only; never writes clinical tables / never
 * abandons.
 */
import { getHistory, getOwnedConsultation, historySummary, reportReadLifecycleMeta } from '../lib/consultations.ts'
import { resolveEmergencyCopyForClient } from '../lib/emergency-copy.ts'
import { jsonResponse } from '../lib/errors.ts'
import { generatePartialOutcome } from '../lib/partial-outcome.ts'
import { ensureProfile, ensureSelfPatient } from '../lib/profiles.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { RequestPayload } from '../lib/types.ts'

export async function handleGetHistory(ctx: ProxyContext) {
  const profile = await ensureProfile(ctx)
  await ensureSelfPatient(ctx, profile)
  return jsonResponse({ account_required: ctx.isAnonymous, history: await historySummary(ctx) })
}

export async function handleGetConsultation(ctx: ProxyContext, payload: RequestPayload) {
  if (!payload.consultation_id) return jsonResponse({ error: 'Missing consultation id' }, 400)
  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)
  // P3-07 — Mixpanel / reopen use stored clinical language.
  ctx.clinicalLocale = String(consultation.language || 'en').trim().toLowerCase() === 'es' ? 'es' : 'en'
  const messages = await getHistory(ctx, consultation.id)
  // P2-02 Q3: include `withheld` so anonymous complete consults return report_data
  // under the soft gate. P2-06 AC7: omit body when retention_expires_at is past
  // (NULL retention never omits — saved/linked).
  const { data: report } = await ctx.db
    .from('libertymd_reports')
    .select('report_data,confidence_score,access_status,retention_expires_at')
    .eq('consultation_id', consultation.id)
    .eq('user_id', ctx.user.id)
    .in('access_status', ['saved', 'guest_released', 'withheld'])
    .maybeSingle()

  // Latest terminal safety classification (Q5): highest turn_count, then newest.
  // Omit fields when no force_end row exists — client uses generic medical fallback.
  const { data: terminalSafety } = await ctx.db
    .from('libertymd_safety_events')
    .select('crisis_type, care_setting, turn_count, created_at')
    .eq('consultation_id', consultation.id)
    .eq('force_end', true)
    .order('turn_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // P2-13 L6 — return retention ISO + omit hint; body still omitted after expiry.
  const lifecycle = reportReadLifecycleMeta(report)
  const response: Record<string, unknown> = {
    consultation,
    messages,
    report: lifecycle.report,
    confidence_score: lifecycle.report != null ? (report?.confidence_score || null) : null,
    retention_expires_at: lifecycle.retention_expires_at,
    report_omitted_reason: lifecycle.report_omitted_reason,
  }
  if (terminalSafety?.crisis_type) {
    response.crisis_type = terminalSafety.crisis_type
    response.care_setting = terminalSafety.care_setting ?? null
    // P3-08 Q1: reopen returns resolved strings, not crisis_type alone.
    response.emergency_copy = await resolveEmergencyCopyForClient(terminalSafety.crisis_type, {
      db: ctx.db,
      region: consultation.region ?? 'US',
      language: consultation.language ?? 'en',
      log: (event, props) => {
        console.warn(JSON.stringify({ scope: 'libertymd_i18n', event, ...props }))
      },
    })
  }
  return jsonResponse(response)
}

/** P1-09 soft-leave / exit sheet — generate-only; no status mutation. */
export async function handleGetPartialOutcome(ctx: ProxyContext, payload: RequestPayload) {
  if (!payload.consultation_id) return jsonResponse({ error: 'Missing consultation id' }, 400)
  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)
  const partialOutcome = generatePartialOutcome({
    turn_count: Number(consultation.turn_count) || 0,
    status: consultation.status,
    filled_slots: consultation.filled_slots,
  })
  return jsonResponse({
    consultation_id: consultation.id,
    partial_outcome: partialOutcome,
  })
}
