/**
 * P4-01 — 72-hour feeling check-in helpers.
 *
 * Pure eligibility/clock/caps + non-clinical email builder. Reuses P2-08 Resend
 * HTTP via sendReportDeliveryEmail. Never snapshots clinical blobs.
 */
import {
  assertEmailContainsNoClinicalLeak,
  normalizeDeliveryEmail,
  resolvePublicAppOrigin,
  sendReportDeliveryEmail,
  type ReportDeliveryEmailContent,
  type ReportEmailSendResult,
} from './report-email-delivery.ts'
import { sha256 } from './utils.ts'

/** Spec: ~72h after report-ready. */
export const FOLLOWUP_CHECKIN_DELAY_MS = 72 * 60 * 60 * 1000

/** Open send tail after due_at (Q1). */
export const FOLLOWUP_CHECKIN_OPEN_TAIL_MS = 7 * 24 * 60 * 60 * 1000

/** Global frequency cap window (email / user_id). */
export const FOLLOWUP_CHECKIN_CAP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** Respond / unsub link TTL from send. */
export const FOLLOWUP_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000

export const FOLLOWUP_CHECKIN_EMAIL_SUBJECT = 'How are you feeling?'

export const FOLLOWUP_CHECKIN_EMAIL_PREHEADER =
  'A quick check-in from LibertyMD. Better, same, or worse — one tap.'

export const FOLLOWUP_ANSWERS = ['better', 'same', 'worse'] as const
export type FollowupAnswer = (typeof FOLLOWUP_ANSWERS)[number]

export const REPORT_READY_STATUSES = ['completed', 'report_pending_auth'] as const

export function isFollowupAnswer(value: unknown): value is FollowupAnswer {
  return typeof value === 'string' && (FOLLOWUP_ANSWERS as readonly string[]).includes(value)
}

export function isReportReadyStatus(status: unknown): boolean {
  return typeof status === 'string' &&
    (REPORT_READY_STATUSES as readonly string[]).includes(status)
}

export function isEmergencyStopped(status: unknown): boolean {
  return status === 'emergency_stopped'
}

/**
 * Story Open Q1 coalesce — anon report_pending_auth leaves completed_at null.
 * Prefer completed_at → report.created_at → consultation.updated_at at report-ready.
 */
export function coalesceReportReadyAt(args: {
  completedAt?: string | null
  reportCreatedAt?: string | null
  consultationUpdatedAt?: string | null
}): number | null {
  for (const raw of [args.completedAt, args.reportCreatedAt, args.consultationUpdatedAt]) {
    if (!raw || typeof raw !== 'string') continue
    const ms = Date.parse(raw)
    if (Number.isFinite(ms)) return ms
  }
  return null
}

export function computeDueAt(reportReadyAtMs: number): number {
  return reportReadyAtMs + FOLLOWUP_CHECKIN_DELAY_MS
}

export function computeOpenUntil(dueAtMs: number): number {
  return dueAtMs + FOLLOWUP_CHECKIN_OPEN_TAIL_MS
}

export type CheckinEligibilityVerdict =
  | { ok: true; dueAtMs: number; openUntilMs: number }
  | { ok: false; reason: string }

/**
 * Pure eligibility gate for a single consult candidate (before address / caps).
 */
export function evaluateCheckinClock(args: {
  status: string
  reportReadyAtMs: number | null
  nowMs?: number
}): CheckinEligibilityVerdict {
  const now = args.nowMs ?? Date.now()
  if (isEmergencyStopped(args.status)) {
    return { ok: false, reason: 'emergency_stopped' }
  }
  if (!isReportReadyStatus(args.status)) {
    return { ok: false, reason: 'not_report_ready' }
  }
  if (args.reportReadyAtMs == null || !Number.isFinite(args.reportReadyAtMs)) {
    return { ok: false, reason: 'missing_report_ready_clock' }
  }
  const dueAtMs = computeDueAt(args.reportReadyAtMs)
  const openUntilMs = computeOpenUntil(dueAtMs)
  if (now < dueAtMs) return { ok: false, reason: 'before_due' }
  if (now > openUntilMs) return { ok: false, reason: 'past_open_tail' }
  return { ok: true, dueAtMs, openUntilMs }
}

/** Cap: ≤1 send per contact_email (and user_id when known) per rolling 7d. */
export function exceedsGlobalSendCap(args: {
  recentSendAts: Array<string | number | Date | null | undefined>
  nowMs?: number
  windowMs?: number
}): boolean {
  const now = args.nowMs ?? Date.now()
  const window = args.windowMs ?? FOLLOWUP_CHECKIN_CAP_WINDOW_MS
  for (const raw of args.recentSendAts) {
    if (raw == null) continue
    const ms = typeof raw === 'number'
      ? raw
      : raw instanceof Date
      ? raw.getTime()
      : Date.parse(String(raw))
    if (!Number.isFinite(ms)) continue
    if (now - ms < window) return true
  }
  return false
}

export async function mintFollowupToken(): Promise<{ rawToken: string; tokenHash: string }> {
  const rawToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`
  const tokenHash = await sha256(rawToken)
  return { rawToken, tokenHash }
}

export function followupTokenExpiresAt(nowMs = Date.now()): string {
  return new Date(nowMs + FOLLOWUP_TOKEN_TTL_MS).toISOString()
}

export function buildFollowupRespondUrl(
  origin: string,
  rawToken: string,
  answer: FollowupAnswer,
): string {
  const base = origin.replace(/\/$/, '')
  return `${base}/liberty-md/checkin?t=${encodeURIComponent(rawToken)}&a=${encodeURIComponent(answer)}`
}

export function buildFollowupUnsubscribeUrl(origin: string, rawToken: string): string {
  const base = origin.replace(/\/$/, '')
  return `${base}/liberty-md/checkin/unsubscribe?t=${encodeURIComponent(rawToken)}`
}

export interface FollowupCheckinEmailContent extends ReportDeliveryEmailContent {}

/**
 * Fixed non-clinical allow-list body + better/same/worse + unsub links only.
 * Never echo complaint / diagnosis / triage.
 */
export function buildFollowupCheckinEmail(args: {
  betterUrl: string
  sameUrl: string
  worseUrl: string
  unsubscribeUrl: string
}): FollowupCheckinEmailContent {
  const subject = FOLLOWUP_CHECKIN_EMAIL_SUBJECT
  const preheader = FOLLOWUP_CHECKIN_EMAIL_PREHEADER
  const text = [
    preheader,
    '',
    'How are you feeling compared with a few days ago?',
    '',
    `Better: ${args.betterUrl}`,
    `Same: ${args.sameUrl}`,
    `Worse: ${args.worseUrl}`,
    '',
    `Unsubscribe from check-in emails: ${args.unsubscribeUrl}`,
  ].join('\n')
  const html = [
    `<p style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</p>`,
    `<p>${escapeHtml(preheader)}</p>`,
    `<p>How are you feeling compared with a few days ago?</p>`,
    `<p><a href="${escapeHtmlAttr(args.betterUrl)}">Better</a> · ` +
      `<a href="${escapeHtmlAttr(args.sameUrl)}">Same</a> · ` +
      `<a href="${escapeHtmlAttr(args.worseUrl)}">Worse</a></p>`,
    `<p><a href="${escapeHtmlAttr(args.unsubscribeUrl)}">Unsubscribe from check-in emails</a></p>`,
  ].join('')
  return { subject, preheader, text, html }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;')
}

export { assertEmailContainsNoClinicalLeak, normalizeDeliveryEmail, resolvePublicAppOrigin }

export async function sendFollowupCheckinEmail(args: {
  to: string
  content: FollowupCheckinEmailContent
}): Promise<ReportEmailSendResult> {
  return sendReportDeliveryEmail({
    to: args.to,
    subject: args.content.subject,
    text: args.content.text,
    html: args.content.html,
  })
}
