/**
 * P2-08 — `request_report_email` + `redeem_report_link`.
 *
 * Mint: JWT ownership of consult + existing insert-once report row (incl. withheld).
 * Redeem: bearer token-hash via service-role; session JWT is transport only.
 * Never rewrite clinical report columns. Never trust client-supplied user_id.
 */
import { getOwnedConsultation } from '../lib/consultations.ts'
import { jsonResponse } from '../lib/errors.ts'
import {
  buildReportDeliveryEmail,
  buildReportDeliveryRedeemUrl,
  isValidDeliveryEmail,
  mintReportDeliveryToken,
  normalizeDeliveryEmail,
  REPORT_DELIVERY_TTL_SECONDS,
  reportDeliveryExpiresAt,
  resolvePublicAppOrigin,
  sendReportDeliveryEmail,
} from '../lib/report-email-delivery.ts'
import { sha256 } from '../lib/utils.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { RequestPayload } from '../lib/types.ts'

const SEND_FAILED_MESSAGE =
  'We could not send the email right now. Your report is still available on this screen — try again in a moment.'

export async function handleRequestReportEmail(ctx: ProxyContext, payload: RequestPayload) {
  if (!payload.consultation_id) {
    return jsonResponse({ error: 'Missing consultation id' }, 400)
  }
  if (!isValidDeliveryEmail(payload.contact_email)) {
    return jsonResponse({ error: 'Enter a valid email address.', code: 'invalid_email' }, 400)
  }

  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)
  if (
    consultation.status !== 'report_pending_auth'
    && consultation.status !== 'completed'
  ) {
    return jsonResponse({ error: 'Report is not ready', code: 'report_not_ready' }, 409)
  }

  const { data: report, error: reportError } = await ctx.db
    .from('libertymd_reports')
    .select('id,consultation_id,access_status')
    .eq('consultation_id', consultation.id)
    .eq('user_id', ctx.user.id)
    .maybeSingle()
  if (reportError) throw reportError
  if (!report?.id) {
    return jsonResponse({ error: 'Report is not ready', code: 'report_not_ready' }, 409)
  }

  const contactEmail = normalizeDeliveryEmail(payload.contact_email!)
  const { rawToken, tokenHash } = await mintReportDeliveryToken()
  const expiresAt = reportDeliveryExpiresAt()

  const { error: insertError } = await ctx.db.from('libertymd_report_delivery_tokens').insert({
    token_hash: tokenHash,
    consultation_id: consultation.id,
    report_id: report.id,
    contact_email: contactEmail,
    expires_at: expiresAt,
  })
  if (insertError) throw insertError

  const redeemUrl = buildReportDeliveryRedeemUrl(resolvePublicAppOrigin(), rawToken)
  const email = buildReportDeliveryEmail(redeemUrl)
  const sendResult = await sendReportDeliveryEmail({
    to: contactEmail,
    subject: email.subject,
    text: email.text,
    html: email.html,
  })

  if (!sendResult.ok) {
    return jsonResponse({
      error: SEND_FAILED_MESSAGE,
      severity: 'technical',
      code: 'email_send_failed',
      retryable: true,
    }, 502)
  }

  const now = new Date().toISOString()
  await ctx.db
    .from('libertymd_report_delivery_tokens')
    .update({ sent_at: now })
    .eq('token_hash', tokenHash)

  return jsonResponse({
    ok: true,
    expires_at: expiresAt,
    expires_in_seconds: REPORT_DELIVERY_TTL_SECONDS,
  })
}

export async function handleRedeemReportLink(ctx: ProxyContext, payload: RequestPayload) {
  const rawToken = typeof payload.delivery_token === 'string' ? payload.delivery_token.trim() : ''
  if (!rawToken) {
    return jsonResponse({ status: 'expired', error: 'This link has expired.' }, 410)
  }

  const tokenHash = await sha256(rawToken)

  const { data: tokenRow, error: tokenError } = await ctx.db
    .from('libertymd_report_delivery_tokens')
    .select('id,consultation_id,report_id,expires_at,contact_email')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (tokenError) throw tokenError

  if (!tokenRow) {
    return jsonResponse({
      status: 'expired',
      error: 'This link has expired or is not valid.',
    }, 410)
  }

  const expiresAt = Date.parse(String(tokenRow.expires_at || ''))
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return jsonResponse({
      status: 'expired',
      error: 'This link has expired.',
    }, 410)
  }

  // Bearer redeem: service-role lookup by report_id — do NOT require JWT ownership.
  const { data: report, error: reportError } = await ctx.db
    .from('libertymd_reports')
    .select('id,consultation_id,report_data,confidence_score,access_status')
    .eq('id', tokenRow.report_id)
    .maybeSingle()
  if (reportError) throw reportError

  if (!report?.report_data) {
    return jsonResponse({
      status: 'unavailable',
      error:
        'This report is no longer available. Guest reports are removed after their retention window — signing in cannot restore a deleted guest report.',
    }, 410)
  }

  return jsonResponse({
    status: 'ok',
    consultation_id: report.consultation_id,
    report: report.report_data,
    confidence_score: report.confidence_score,
    access_status: report.access_status,
  })
}
