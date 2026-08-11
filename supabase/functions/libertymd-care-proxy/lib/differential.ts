/**
 * P5-DDX — orchestration for the async mini-differential.
 *
 * The workflow computes; this module decides what is written and what is
 * trusted. Three rules live here rather than in n8n, because a model cannot be
 * relied on to enforce them:
 *
 *   1. **Ordering.** A result is written only when its `computed_at_turn`
 *      exceeds the stored one. Runs are detached and can land out of order; a
 *      slow turn-7 run returning after turn-9's must not regress the case view.
 *   2. **Staleness.** A differential more than N turns behind stops steering
 *      questions and stops satisfying the stop rule. Aiming questions with a
 *      four-turn-old view of the case is worse than not aiming them.
 *   3. **The stop rule.** Four independent conditions, all evaluated from
 *      stored state. Neither the interview nor the differential workflow gets a
 *      vote.
 */
import {
  getDifferentialMaxStaleTurns,
  getDifferentialStartTurn,
  getDifferentialStopConfidence,
  isAsyncDifferentialEnabled,
  MAX_TURNS,
} from './config.ts'
import type { ConsultationRow, DifferentialResult, JsonObject } from './types.ts'

/** The differential as read back off the consultation row. */
export interface StoredDifferential {
  entries: JsonObject[]
  topConfidence: number | null
  redFlagsOutstanding: string[]
  computedAtTurn: number | null
}

export function readStoredDifferential(consultation: ConsultationRow): StoredDifferential {
  const row = consultation as unknown as Record<string, unknown>
  const entries = Array.isArray(row.working_differential) ? row.working_differential as JsonObject[] : []
  const top = row.differential_top_confidence
  const turn = row.differential_computed_at_turn
  return {
    entries,
    topConfidence: typeof top === 'number' ? top : null,
    redFlagsOutstanding: Array.isArray(row.differential_red_flags_outstanding)
      ? (row.differential_red_flags_outstanding as unknown[]).map(String)
      : [],
    computedAtTurn: typeof turn === 'number' ? turn : null,
  }
}

/** Turns between the stored differential and the current turn. */
export function stalenessTurns(stored: StoredDifferential, currentTurn: number): number | null {
  if (stored.computedAtTurn === null) return null
  return Math.max(0, currentTurn - stored.computedAtTurn)
}

export function isDifferentialFresh(stored: StoredDifferential, currentTurn: number): boolean {
  const stale = stalenessTurns(stored, currentTurn)
  if (stale === null) return false
  return stale <= getDifferentialMaxStaleTurns()
}

/**
 * Rule 1. Detached runs can land in any order; the turn index is the only
 * ordering we have, because wall-clock arrival says nothing about which view of
 * the case is newer.
 */
export function shouldAcceptDifferentialWrite(
  stored: StoredDifferential,
  incoming: DifferentialResult,
): boolean {
  if (stored.computedAtTurn === null) return true
  return incoming.computed_at_turn > stored.computedAtTurn
}

/** Whether a differential run should be scheduled after this turn. */
export function shouldScheduleDifferential(turnCount: number): boolean {
  if (!isAsyncDifferentialEnabled()) return false
  return turnCount >= getDifferentialStartTurn()
}

export type DifferentialStopDecision =
  | { stop: false; reason: 'flag_off' | 'below_turn_floor' | 'no_differential' | 'stale' | 'below_confidence' | 'red_flags_outstanding' }
  | { stop: true; reason: 'confidence_met' }

/**
 * Rule 3 — the stop rule (spec §4.3).
 *
 * All four conditions must hold. `red_flags_outstanding` is not decoration:
 * confidence alone measures diagnostic certainty, not information sufficiency,
 * and a model can be certain of viral pharyngitis after three questions while
 * never having asked whether the patient can swallow. Requiring both is what
 * stops a confident early differential ending a consult before the safety
 * questions are covered.
 *
 * The 15-turn cap is handled by the caller and is deliberately NOT here: at the
 * cap the consult ends regardless of what the differential says.
 */
export function decideDifferentialStop(
  stored: StoredDifferential,
  turnCount: number,
): DifferentialStopDecision {
  if (!isAsyncDifferentialEnabled()) return { stop: false, reason: 'flag_off' }
  if (turnCount < getDifferentialStartTurn()) return { stop: false, reason: 'below_turn_floor' }
  if (stored.topConfidence === null || stored.entries.length !== 3) {
    return { stop: false, reason: 'no_differential' }
  }
  if (!isDifferentialFresh(stored, turnCount)) return { stop: false, reason: 'stale' }
  if (stored.topConfidence < getDifferentialStopConfidence()) {
    return { stop: false, reason: 'below_confidence' }
  }
  if (stored.redFlagsOutstanding.length > 0) {
    return { stop: false, reason: 'red_flags_outstanding' }
  }
  return { stop: true, reason: 'confidence_met' }
}

/**
 * The hint handed to the question generator. Withheld entirely when stale —
 * §4.2. Returning null is a normal outcome, not an error.
 */
export function buildDifferentialHint(
  stored: StoredDifferential,
  turnCount: number,
): JsonObject | null {
  if (!isAsyncDifferentialEnabled()) return null
  if (stored.entries.length !== 3) return null
  if (!isDifferentialFresh(stored, turnCount)) return null
  const first = (stored.entries[0] || {}) as Record<string, unknown>
  return {
    entries: stored.entries,
    top_confidence: stored.topConfidence,
    discriminator: typeof first.discriminator === 'string' ? first.discriminator : '',
    red_flags_outstanding: stored.redFlagsOutstanding,
    computed_at_turn: stored.computedAtTurn,
    staleness_turns: stalenessTurns(stored, turnCount),
  }
}

/** Column patch for an accepted differential write. */
export function differentialUpdatePatch(result: DifferentialResult): JsonObject {
  return {
    working_differential: result.entries as unknown as JsonObject[],
    differential_top_confidence: Math.max(0, Math.min(100, Math.round(result.top_confidence))),
    differential_red_flags_outstanding: result.red_flags_outstanding,
    differential_computed_at_turn: Math.max(0, Math.min(MAX_TURNS, Math.round(result.computed_at_turn))),
    differential_updated_at: new Date().toISOString(),
  }
}
