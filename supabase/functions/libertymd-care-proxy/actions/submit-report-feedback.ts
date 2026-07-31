/**
 * P2-10 — `submit_report_feedback`.
 *
 * JWT ownership of consult; persist helpful + optional comment into
 * `libertymd_report_feedback`. Never UPDATE `libertymd_reports` clinical columns.
 * Never emit Postgres product_events (client Mixpanel owns T1).
 * UNIQUE (consultation_id) conflict → 409.
 */
import { getOwnedConsultation } from '../lib/consultations.ts'
import { jsonResponse } from '../lib/errors.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { RequestPayload } from '../lib/types.ts'

export const REPORT_FEEDBACK_COMMENT_MAX = 500

function normalizeComment(raw: unknown): { ok: true; comment: string | null } | { ok: false; response: Response } {
  if (raw === undefined || raw === null) return { ok: true, comment: null }
  if (typeof raw !== 'string') {
    return {
      ok: false,
      response: jsonResponse({ error: 'Invalid comment', code: 'invalid_comment', severity: 'technical' }, 400),
    }
  }
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, comment: null }
  if (trimmed.length > REPORT_FEEDBACK_COMMENT_MAX) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: 'Comment is too long',
          code: 'comment_too_long',
          severity: 'technical',
        },
        400,
      ),
    }
  }
  return { ok: true, comment: trimmed }
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  return code === '23505'
}

export async function handleSubmitReportFeedback(ctx: ProxyContext, payload: RequestPayload) {
  if (!payload.consultation_id) {
    return jsonResponse({ error: 'Missing consultation id' }, 400)
  }
  if (typeof payload.helpful !== 'boolean') {
    return jsonResponse({ error: 'Missing helpful', code: 'invalid_helpful', severity: 'technical' }, 400)
  }

  const commentResult = normalizeComment(payload.comment)
  if (!commentResult.ok) return commentResult.response

  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)

  const { error: insertError } = await ctx.db.from('libertymd_report_feedback').insert({
    consultation_id: consultation.id,
    user_id: ctx.user.id,
    helpful: payload.helpful,
    comment: commentResult.comment,
  })

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      return jsonResponse(
        {
          error: 'Feedback already submitted',
          code: 'feedback_already_submitted',
          severity: 'technical',
        },
        409,
      )
    }
    throw insertError
  }

  // Never touch libertymd_reports clinical columns (P2-07 insert-once).
  return jsonResponse({
    ok: true,
    consultation_id: consultation.id,
    helpful: payload.helpful,
    has_comment: Boolean(commentResult.comment),
  })
}
