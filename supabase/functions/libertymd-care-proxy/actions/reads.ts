/**
 * Read-only actions: `get_history`, `get_consultation`.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 * Both are scoped to the JWT user; a report is only returned once released.
 */
import { getHistory, getOwnedConsultation, historySummary } from '../lib/consultations.ts'
import { jsonResponse } from '../lib/errors.ts'
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
  const messages = await getHistory(ctx, consultation.id)
  const { data: report } = await ctx.db
    .from('libertymd_reports')
    .select('report_data,confidence_score,access_status')
    .eq('consultation_id', consultation.id)
    .eq('user_id', ctx.user.id)
    .in('access_status', ['saved', 'guest_released'])
    .maybeSingle()
  return jsonResponse({ consultation, messages, report: report?.report_data || null, confidence_score: report?.confidence_score || null })
}
