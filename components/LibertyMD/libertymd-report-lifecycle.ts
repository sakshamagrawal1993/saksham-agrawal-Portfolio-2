/**
 * P2-13 · Report lifecycle states (pure helpers).
 *
 * Spec six states: generating · ready · partial · generation_failed ·
 * guest_expired · not_yet_eligible. Client derives from phase + proxy
 * retention/omit signals + wait mode — no durable DB lifecycle column.
 *
 * Fences: soft gate stays fully visible for ready; Spec partial ≠ P1-09
 * partial_outcome; PDF export busy ≠ generating; no new telemetry invent.
 */

import { shouldRunDiagnosisGate, type WaitMode, GENERATING_WAIT_TIMEOUT_MS as WAITING_GENERATING_MS } from './libertymd-waiting'

/** Spec AC1 — exact six names (underscore form for generation_failed). */
export const REPORT_LIFECYCLE_STATES = [
  'generating',
  'ready',
  'partial',
  'generation_failed',
  'guest_expired',
  'not_yet_eligible',
] as const

export type ReportLifecycleState = (typeof REPORT_LIFECYCLE_STATES)[number]

/** Proxy omit hint (L6) — categorical only. */
export type ReportOmittedReason = 'retention_expired'

/**
 * Client generating wait ceiling: proxy diagnosis budget (55s default) + buffer.
 * Documented in CARE (AC5/AC6 / L2). Must stay ≥ 55_000.
 * Canonical value lives in `libertymd-waiting.ts`.
 */
export const GENERATING_WAIT_TIMEOUT_MS = WAITING_GENERATING_MS

export type ReportLifecycleInput = {
  /** Chat/App consult phase. */
  phase: string
  /** True while send/diagnosis invoke is in flight. */
  isBusy?: boolean
  /** P1-07 wait mode for the in-flight turn. */
  waitMode?: WaitMode
  /** Normalized report body present on client. */
  hasReportBody?: boolean
  /** Proxy `report_omitted_reason`. */
  reportOmittedReason?: ReportOmittedReason | string | null
  /** Proxy `retention_expires_at` ISO (or null). */
  retentionExpiresAt?: string | null
  /** Client flag: technical generation failure after reviewing / timeout. */
  generationFailed?: boolean
  /** Last-known turn/evidence for not-yet-eligible (L7). */
  lastTurnCount?: number
  evidenceScore?: number
  readyForReport?: boolean
  /** Clock for expiry math (tests). */
  nowMs?: number
}

/** True when ISO retention is non-null and strictly in the past. */
export function isRetentionExpired(
  retentionExpiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (retentionExpiresAt == null || String(retentionExpiresAt) === '') return false
  const ms = Date.parse(String(retentionExpiresAt))
  if (Number.isNaN(ms)) return false
  return ms < nowMs
}

/** True when ISO retention is non-null and still in the future. */
export function isRetentionStillValid(
  retentionExpiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (retentionExpiresAt == null || String(retentionExpiresAt) === '') return false
  const ms = Date.parse(String(retentionExpiresAt))
  if (Number.isNaN(ms)) return false
  return ms >= nowMs
}

/**
 * Pre-lapse warning (L4): guest/withheld/released body visible AND retention
 * still valid. Drive off server ISO — never hardcode 7d.
 */
export function shouldShowGuestRetentionWarning(input: {
  hasReportBody?: boolean
  saved?: boolean
  retentionExpiresAt?: string | null
  nowMs?: number
}): boolean {
  if (!input.hasReportBody) return false
  if (input.saved) return false
  return isRetentionStillValid(input.retentionExpiresAt, input.nowMs)
}

/** Relative remaining label for pre-lapse warning (cheap; no i18n deps). */
export function formatRetentionRemaining(
  retentionExpiresAt: string,
  nowMs: number = Date.now(),
): string {
  const ms = Date.parse(retentionExpiresAt) - nowMs
  if (!Number.isFinite(ms) || ms <= 0) return 'soon'
  const hours = Math.ceil(ms / (60 * 60 * 1000))
  if (hours < 48) {
    return hours <= 1 ? 'about 1 hour' : `about ${hours} hours`
  }
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
  return days === 1 ? 'about 1 day' : `about ${days} days`
}

/** Non-ready states hide delivery / feedback / doctor CTA (L10). */
export function showReadyOnlyChrome(state: ReportLifecycleState | null): boolean {
  return state === 'ready'
}

/**
 * Derive Spec lifecycle state. Priority:
 * guest_expired → generating → ready → generation_failed → partial → not_yet_eligible.
 * Ready wins over generation_failed when a serve-eligible body exists (L3 insert-once).
 * Returns null when no Spec lifecycle chrome applies (e.g. emergency, loading).
 */
export function deriveReportLifecycleState(
  input: ReportLifecycleInput,
): ReportLifecycleState | null {
  const nowMs = input.nowMs ?? Date.now()
  const phase = String(input.phase || '')
  const omitted = input.reportOmittedReason === 'retention_expired'
    || (
      (phase === 'report_gate' || phase === 'report_ready')
      && !input.hasReportBody
      && isRetentionExpired(input.retentionExpiresAt, nowMs)
    )

  if (omitted) return 'guest_expired'

  if (input.isBusy && input.waitMode === 'reviewing') return 'generating'

  if (
    input.hasReportBody
    && (phase === 'report_gate' || phase === 'report_ready')
  ) {
    return 'ready'
  }

  if (input.generationFailed) return 'generation_failed'

  if (phase === 'clinical_review_needed') return 'partial'

  if (phase === 'intake') {
    const eligible = shouldRunDiagnosisGate({
      turnCount: Number(input.lastTurnCount) || 0,
      evidenceScore: Number(input.evidenceScore) || 0,
      readyForReport: Boolean(input.readyForReport),
    })
    if (!eligible) return 'not_yet_eligible'
  }

  return null
}

/** Blame-adjacent phrases banned on generation-failed / technical paths (AC2). */
export const GENERATION_FAILED_BLAME_BANS = [
  'your answers were insufficient',
  "weren't good enough",
  'were not good enough',
  "couldn't continue from these answers",
  'from these answers',
] as const

export function copyLooksLikeUserBlame(text: string): boolean {
  const lower = String(text || '').toLowerCase()
  return GENERATION_FAILED_BLAME_BANS.some((ban) => lower.includes(ban))
}

/**
 * Hydrate helper (L5): clear stale report when report-ready/gate phase has no
 * body and omit/expiry signal is present.
 */
export function shouldClearStaleReportOnHydrate(input: {
  phase: string
  hasIncomingReport: boolean
  reportOmittedReason?: string | null
  retentionExpiresAt?: string | null
  nowMs?: number
}): boolean {
  if (input.hasIncomingReport) return false
  const phase = String(input.phase || '')
  if (phase !== 'report_gate' && phase !== 'report_ready') return false
  if (input.reportOmittedReason === 'retention_expired') return true
  return isRetentionExpired(input.retentionExpiresAt, input.nowMs)
}

/** False-restore phrases banned on guest-expired CTA (L5 / AC3). */
export const GUEST_EXPIRED_RESTORE_BANS = [
  'sign in restores this guest report',
  'sign in to restore this guest report',
  'signing in restores',
  'restore a deleted guest report',
] as const

export function copyPromisesFalseGuestRestore(text: string): boolean {
  const lower = String(text || '').toLowerCase()
  // redeem unavailableBody intentionally says "cannot restore" — allow negation.
  if (/cannot restore|can't restore|cannot restore a deleted/i.test(lower)) return false
  return GUEST_EXPIRED_RESTORE_BANS.some((ban) => lower.includes(ban))
}
