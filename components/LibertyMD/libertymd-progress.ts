/**
 * P1-06 · Honest mid-interview progress (pure helper).
 *
 * Derives display from `missing_slots` vs core-slot denominator (length 6).
 * High-water never regresses within a mounted session. Ceiling copy uses
 * shared `MAX_INTERVIEW_TURNS` from interview-expectations — never restates
 * expected-8, never claims exact remaining questions, never equates 6=8=15.
 *
 * Rollback: set `LIBERTYMD_PROGRESS_INDICATOR_ENABLED` to false.
 */
import { MAX_INTERVIEW_TURNS } from './libertymd-interview-expectations'

/** Mirror of proxy CORE_SLOTS — do not import Deno proxy into Vite. */
export const PROGRESS_CORE_SLOTS = [
  'onset',
  'duration',
  'severity',
  'associated_symptoms',
  'red_flag_negatives',
  'relevant_history',
] as const

export const PROGRESS_CORE_SLOT_COUNT = PROGRESS_CORE_SLOTS.length

/** One-flag rollback — hide indicator without touching clinical proxy. */
export const LIBERTYMD_PROGRESS_INDICATOR_ENABLED = true

export type ProgressBand = 'starting' | 'early' | 'midway' | 'wrapping'

export type ProgressView = {
  ratio: number
  band: ProgressBand
  label: string
  ceiling: string
}

const CORE_SET = new Set<string>(PROGRESS_CORE_SLOTS)

/** Active interview on the client is `intake` only (Q6). */
export function shouldShowInterviewProgress(phase: string): boolean {
  return LIBERTYMD_PROGRESS_INDICATOR_ENABLED && phase === 'intake'
}

export function normalizeMissingSlots(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.map(String)
}

/**
 * Filled approx = CORE length − missing core names present in the list.
 * Unknown / non-core names are ignored so length stays honest to the 6-slot bar.
 */
export function ratioFromMissingSlots(missingSlots: string[]): number {
  const missingCore = missingSlots.filter((slot) => CORE_SET.has(slot))
  const filled = Math.max(
    0,
    Math.min(PROGRESS_CORE_SLOT_COUNT, PROGRESS_CORE_SLOT_COUNT - missingCore.length),
  )
  return filled / PROGRESS_CORE_SLOT_COUNT
}

/** Never regress within a mounted session (AC2). */
export function applyHighWater(previous: number | null, next: number): number {
  if (previous === null || Number.isNaN(previous)) return clampRatio(next)
  return Math.max(previous, clampRatio(next))
}

export function nextHighWater(
  previous: number | null,
  missingSlots: string[] | null | undefined,
): number {
  if (missingSlots == null) return previous ?? 0
  return applyHighWater(previous, ratioFromMissingSlots(missingSlots))
}

export function bandFromRatio(ratio: number): ProgressBand {
  const r = clampRatio(ratio)
  if (r <= 0) return 'starting'
  if (r < 1 / 3) return 'early'
  if (r < 2 / 3) return 'midway'
  return 'wrapping'
}

/** Qualitative / ranged — never “N remaining” / “N of 15” / “about 8”. */
export function labelForBand(band: ProgressBand): string {
  switch (band) {
    case 'starting':
      return 'Getting started'
    case 'early':
      return 'A few more questions'
    case 'midway':
      return 'Making progress'
    case 'wrapping':
      return 'Wrapping up'
  }
}

/** Hedged ceiling from shared MAX_INTERVIEW_TURNS (Q2A). */
export function formatInterviewCeilingCopy(
  maxTurns: number = MAX_INTERVIEW_TURNS,
): string {
  return `Up to ${maxTurns} questions`
}

export function buildProgressView(input: {
  missingSlots: string[] | null | undefined
  highWaterRatio: number | null
}): ProgressView {
  const observed =
    input.missingSlots == null ? 0 : ratioFromMissingSlots(input.missingSlots)
  const ratio = applyHighWater(input.highWaterRatio, observed)
  const band = bandFromRatio(ratio)
  return {
    ratio,
    band,
    label: labelForBand(band),
    ceiling: formatInterviewCeilingCopy(),
  }
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}
