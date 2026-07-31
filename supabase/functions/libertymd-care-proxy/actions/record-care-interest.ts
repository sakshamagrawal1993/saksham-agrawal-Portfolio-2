/**
 * P2-12 — `record_care_interest`.
 *
 * JWT ownership of consult; upsert waitlist demand into `libertymd_care_interest`.
 * Null email OK. Server-derived `triage_tier` from `libertymd_reports` — reject if
 * report/tier absent. Never UPDATE profiles.email, delivery tokens, or report
 * clinical columns. No Mixpanel / product_events invent (P2-11 owns waitlist telemetry).
 */
import { getOwnedConsultation } from '../lib/consultations.ts'
import { jsonResponse } from '../lib/errors.ts'
import {
  isValidDeliveryEmail,
  normalizeDeliveryEmail,
} from '../lib/report-email-delivery.ts'
import { addDays } from '../lib/utils.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { RequestPayload } from '../lib/types.ts'

function normalizeOptionalContactEmail(
  raw: unknown,
): { ok: true; email: string | null } | { ok: false; response: Response } {
  if (raw === undefined || raw === null) return { ok: true, email: null }
  if (typeof raw !== 'string') {
    return {
      ok: false,
      response: jsonResponse(
        { error: 'Enter a valid email address.', code: 'invalid_email', severity: 'technical' },
        400,
      ),
    }
  }
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, email: null }
  if (!isValidDeliveryEmail(trimmed)) {
    return {
      ok: false,
      response: jsonResponse(
        { error: 'Enter a valid email address.', code: 'invalid_email', severity: 'technical' },
        400,
      ),
    }
  }
  return { ok: true, email: normalizeDeliveryEmail(trimmed) }
}

export async function handleRecordCareInterest(ctx: ProxyContext, payload: RequestPayload) {
  if (!payload.consultation_id) {
    return jsonResponse({ error: 'Missing consultation id' }, 400)
  }

  const emailResult = normalizeOptionalContactEmail(payload.contact_email)
  if (!emailResult.ok) return emailResult.response

  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)

  const { data: report, error: reportError } = await ctx.db
    .from('libertymd_reports')
    .select('id,consultation_id,triage_tier')
    .eq('consultation_id', consultation.id)
    .eq('user_id', ctx.user.id)
    .maybeSingle()
  if (reportError) throw reportError

  const triageTier =
    typeof report?.triage_tier === 'string' ? report.triage_tier.trim() : ''
  if (!report?.id || !triageTier) {
    return jsonResponse(
      {
        error: 'Report is not ready',
        code: 'report_not_ready',
        severity: 'technical',
      },
      409,
    )
  }

  const retentionExpiresAt = addDays(30)
  const row = {
    consultation_id: consultation.id,
    user_id: ctx.user.id,
    contact_email: emailResult.email,
    triage_tier: triageTier,
    retention_expires_at: retentionExpiresAt,
  }

  const { data: upserted, error: upsertError } = await ctx.db
    .from('libertymd_care_interest')
    .upsert(row, { onConflict: 'consultation_id' })
    .select('id,consultation_id,contact_email,triage_tier,retention_expires_at,created_at')
    .maybeSingle()

  if (upsertError) throw upsertError

  // Never touch libertymd_profiles.email, delivery tokens, or report clinical columns.
  return jsonResponse({
    ok: true,
    updated: true,
    consultation_id: consultation.id,
    triage_tier: triageTier,
    has_contact_email: Boolean(emailResult.email),
    care_interest_id: upserted?.id ?? null,
  })
}
