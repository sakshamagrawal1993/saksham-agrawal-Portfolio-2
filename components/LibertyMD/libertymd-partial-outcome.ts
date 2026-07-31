/**
 * P1-09 — client helpers for partial-outcome exit sheet.
 *
 * Clinical strings always arrive from the proxy (`abandon_consultation` /
 * `get_partial_outcome`). This module never invents guidance and never writes
 * clinical tables.
 */

export interface LibertyMDPartialOutcome {
  incomplete_label: string
  general_guidance: string
  see_today_signs: string[]
  bucket: string
}

export type LibertyMDPartialOutcomeTrigger = 'abandon' | 'soft_leave'

export interface LibertyMDPartialOutcomeSheetState {
  outcome: LibertyMDPartialOutcome
  trigger: LibertyMDPartialOutcomeTrigger
}

/** Parse an untrusted proxy `partial_outcome` field. Fail closed → null. */
export function parsePartialOutcome(raw: unknown): LibertyMDPartialOutcome | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const incomplete =
    typeof record.incomplete_label === 'string' ? record.incomplete_label.trim() : ''
  const guidance =
    typeof record.general_guidance === 'string' ? record.general_guidance.trim() : ''
  if (!incomplete || !guidance) return null
  const signsRaw = record.see_today_signs
  if (!Array.isArray(signsRaw) || signsRaw.length === 0) return null
  const seeToday = signsRaw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
  if (seeToday.length === 0) return null
  const bucket = typeof record.bucket === 'string' && record.bucket.trim()
    ? record.bucket.trim()
    : 'generic'
  return {
    incomplete_label: incomplete,
    general_guidance: guidance,
    see_today_signs: seeToday,
    bucket,
  }
}
