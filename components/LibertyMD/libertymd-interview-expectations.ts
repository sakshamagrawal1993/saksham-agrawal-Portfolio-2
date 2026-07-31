/**
 * Expected interview length — single source of truth for landing / unified-entry
 * time promise (P1-02) and future mid-interview progress (P1-06).
 *
 * Seed basis: Doctronic mundane median ≈ 8 turns; product diagnosis floor is
 * turn 6; proxy hard ceiling is MAX_TURNS = 15 (mirrored here as
 * MAX_INTERVIEW_TURNS — do not rewrite the proxy value from this module).
 *
 * This is a **hedged expected interview length**, not a client counter and not
 * CORE_SLOTS (6). Copy must stay “About / roughly.” Do not surface exact
 * “question N of 8” UI math against these constants.
 *
 * **Revisit when LibertyMD (or measured) median turn-count / duration data
 * exists** — update EXPECTED_INTERVIEW_TURNS and EXPECTED_INTERVIEW_MINUTES
 * once; landing, entry, and P1-06 progress must import this module and must
 * not redefine `= 8` / `= 3` elsewhere.
 *
 * Doctor-network “30 minutes” is a different commercial promise — never mix.
 */

/** Hedged expected interview turns (Doctronic mundane median seed). */
export const EXPECTED_INTERVIEW_TURNS = 8

/** Alias — same number as turns; useful where copy says “questions”. */
export const EXPECTED_INTERVIEW_QUESTIONS = EXPECTED_INTERVIEW_TURNS

/** Hedged expected duration in minutes (Journey/spec seed phrase). */
export const EXPECTED_INTERVIEW_MINUTES = 3

/**
 * Client-readable mirror of proxy `MAX_TURNS` (ceiling ≠ expected length).
 * P1-06 may communicate the ceiling; do not treat this as the time promise.
 */
export const MAX_INTERVIEW_TURNS = 15

/** Locale key for the shared time-promise sentence (numbers from this module). */
export const INTERVIEW_TIME_PROMISE_I18N_KEY = 'hero.timePromise'

export type InterviewTimePromiseTranslator = (
  key: string,
  vars?: Record<string, string | number>,
) => string

/**
 * Identical full sentence for landing + unified entry.
 * Numbers always come from this module — never hardcode 8/3 in UI files.
 */
export function formatInterviewTimePromise(
  t: InterviewTimePromiseTranslator,
): string {
  return t(INTERVIEW_TIME_PROMISE_I18N_KEY, {
    count: EXPECTED_INTERVIEW_TURNS,
    minutes: EXPECTED_INTERVIEW_MINUTES,
  })
}
