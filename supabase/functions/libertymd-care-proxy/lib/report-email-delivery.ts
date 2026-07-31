/**
 * P2-08 — report email delivery helpers.
 *
 * Pure-ish: token mint/hash, non-clinical subject/preview contract, link-only
 * body builder, thin Resend HTTP adapter. No clinical table writes.
 *
 * Live provider send requires Edge secrets — tests inject `__setReportEmailSenderForTests`.
 */
import { sha256 } from './utils.ts'

/** Spec allow-list subject — never condition / diagnosis / triage names. */
export const REPORT_DELIVERY_EMAIL_SUBJECT = 'Your LibertyMD report is ready'

/** Spec allow-list preview/preheader — non-clinical boilerplate only. */
export const REPORT_DELIVERY_EMAIL_PREHEADER =
  'Open your private LibertyMD report link. This link expires in 24 hours.'

/** S1 — 24 hours from mint. */
export const REPORT_DELIVERY_TTL_MS = 24 * 60 * 60 * 1000

export const REPORT_DELIVERY_TTL_SECONDS = 24 * 60 * 60

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidDeliveryEmail(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 254) return false
  return EMAIL_RE.test(trimmed)
}

export function normalizeDeliveryEmail(value: string): string {
  return value.trim().toLowerCase()
}

export async function mintReportDeliveryToken(): Promise<{ rawToken: string; tokenHash: string }> {
  const rawToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`
  const tokenHash = await sha256(rawToken)
  return { rawToken, tokenHash }
}

export function reportDeliveryExpiresAt(nowMs = Date.now()): string {
  return new Date(nowMs + REPORT_DELIVERY_TTL_MS).toISOString()
}

export function buildReportDeliveryRedeemUrl(origin: string, rawToken: string): string {
  const base = origin.replace(/\/$/, '')
  return `${base}/liberty-md/report?t=${encodeURIComponent(rawToken)}`
}

export interface ReportDeliveryEmailContent {
  subject: string
  preheader: string
  text: string
  html: string
}

/**
 * Link-only email body. Never include report_data / diagnosis / PDF attachment.
 */
export function buildReportDeliveryEmail(redeemUrl: string): ReportDeliveryEmailContent {
  const subject = REPORT_DELIVERY_EMAIL_SUBJECT
  const preheader = REPORT_DELIVERY_EMAIL_PREHEADER
  const text = [
    preheader,
    '',
    'Open your report:',
    redeemUrl,
    '',
    'This private link expires in 24 hours. It does not include your clinical report text.',
  ].join('\n')
  const html = [
    `<p style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</p>`,
    `<p>${escapeHtml(preheader)}</p>`,
    `<p><a href="${escapeHtmlAttr(redeemUrl)}">Open your LibertyMD report</a></p>`,
    `<p>This private link expires in 24 hours. It does not include your clinical report text.</p>`,
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

/** Assert builder never leaked clinical payload fields into subject/preview/body. */
export function assertEmailContainsNoClinicalLeak(
  content: ReportDeliveryEmailContent,
  clinicalMarkers: string[],
): void {
  const haystack = `${content.subject}\n${content.preheader}\n${content.text}\n${content.html}`.toLowerCase()
  for (const marker of clinicalMarkers) {
    const needle = marker.trim().toLowerCase()
    if (!needle) continue
    if (haystack.includes(needle)) {
      throw new Error(`clinical marker leaked into email content: ${marker}`)
    }
  }
  if (/\.pdf\b/i.test(haystack) || /application\/pdf/i.test(haystack)) {
    throw new Error('PDF attachment markers must not appear in delivery email')
  }
}

export interface ReportEmailSendArgs {
  to: string
  subject: string
  text: string
  html: string
}

export type ReportEmailSendResult =
  | { ok: true }
  | { ok: false; error: string }

export type ReportEmailSender = (args: ReportEmailSendArgs) => Promise<ReportEmailSendResult>

let senderOverride: ReportEmailSender | null = null

/** Test-only inject; production uses Resend HTTP when secrets present. */
export function __setReportEmailSenderForTests(sender: ReportEmailSender | null): void {
  senderOverride = sender
}

function envOrEmpty(read: () => string | undefined): string {
  try {
    return read() || ''
  } catch {
    return ''
  }
}

export function resolvePublicAppOrigin(): string {
  const fromEnv = envOrEmpty(() => Deno.env.get('LIBERTYMD_PUBLIC_APP_ORIGIN')).replace(/\/$/, '')
  if (fromEnv) return fromEnv
  return 'https://www.saksham-experiments.com'
}

/**
 * Thin Resend adapter. No PDF / no report body in provider payload.
 * Missing secrets → sync failure (technical); live send CANNOT RUN without secrets.
 */
export async function sendReportDeliveryEmail(args: ReportEmailSendArgs): Promise<ReportEmailSendResult> {
  if (senderOverride) return senderOverride(args)

  const apiKey = envOrEmpty(() => Deno.env.get('LIBERTYMD_RESEND_API_KEY'))
  const from = envOrEmpty(() => Deno.env.get('LIBERTYMD_RESEND_FROM'))
  if (!apiKey || !from) {
    return { ok: false, error: 'email_provider_unconfigured' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.subject,
        text: args.text,
        html: args.html,
      }),
    })
    if (!response.ok) {
      return { ok: false, error: 'email_provider_rejected' }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'email_provider_unreachable' }
  }
}
