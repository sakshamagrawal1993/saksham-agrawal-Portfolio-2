/**
 * Environment + fixed configuration for the LibertyMD care proxy.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 *
 * Separability rule (scripts/libertymd-separability-check.mjs): every webhook
 * env var read anywhere in this function must be LIBERTYMD_-prefixed, and no
 * hardcoded non-libertymd webhook URL may appear.
 */
const N8N_BASE = 'https://n8n.saksham-experiments.com/webhook'

/**
 * Permission-safe env read. P0-11.
 *
 * The Supabase edge runtime always grants env access, so in production this is
 * exactly `Deno.env.get(...) || fallback`. Under `deno test` without
 * `--allow-env` the read throws `NotCapable`, which made every module that
 * transitively imports this file un-importable from a test. P0-11 needs the
 * breaker and the invariant guards under test in the existing `:policy` /
 * `:recovery` gates, neither of which passes `--allow-env`, so the read is
 * defensive rather than the gates being loosened.
 *
 * The read is written as a literal `Deno.env.get('LIBERTYMD_…')` inside the
 * thunk **on purpose**: `scripts/libertymd-separability-check.mjs` check 3
 * greps for exactly that form and hard-fails if it finds zero webhook env vars
 * in this function. Do not refactor the literal away.
 */
function envOr(fallback: string, read: () => string | undefined): string {
  try {
    return read() || fallback
  } catch {
    return fallback
  }
}

/**
 * A bounded integer from env. P0-11 AC5 — budgets and thresholds are
 * changeable without a redeploy (set the secret, the isolate restarts).
 *
 * Out-of-range and non-numeric values are clamped or ignored rather than
 * trusted. `min` is a safety floor, not a formality: see the guardrail note
 * below.
 */
function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = envOr('', () => Deno.env.get(name))
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn('LibertyMD config ignored a non-numeric override', { name, fallback })
    return fallback
  }
  const clamped = Math.min(max, Math.max(min, Math.round(parsed)))
  if (clamped !== Math.round(parsed)) {
    console.warn('LibertyMD config clamped an out-of-range override', { name, requested: Math.round(parsed), applied: clamped, min, max })
  }
  return clamped
}

/**
 * Boolean env. P0-15a — only the literal strings `true` / `1` enable.
 * Everything else (including unset) is false. Read at call time so a secret
 * flip + isolate refresh disables without an app-code redeploy, and so tests
 * can toggle without re-importing this module.
 */
function envBool(name: string, fallback = false): boolean {
  const raw = envOr(fallback ? 'true' : 'false', () => Deno.env.get(name)).trim().toLowerCase()
  return raw === 'true' || raw === '1'
}

export const GUARDRAIL_WEBHOOK = envOr(`${N8N_BASE}/libertymd-guardrail`, () => Deno.env.get('LIBERTYMD_GUARDRAIL_WEBHOOK'))
export const INTERVIEW_WEBHOOK = envOr(`${N8N_BASE}/libertymd-interview`, () => Deno.env.get('LIBERTYMD_INTERVIEW_WEBHOOK'))
export const DIAGNOSIS_WEBHOOK = envOr(`${N8N_BASE}/libertymd-diagnosis`, () => Deno.env.get('LIBERTYMD_DIAGNOSIS_WEBHOOK'))
/** P5-DDX — async mini-differential. Off the critical path; never blocks a turn. */
export const DIFFERENTIAL_WEBHOOK = envOr(`${N8N_BASE}/libertymd-differential`, () => Deno.env.get('LIBERTYMD_DIFFERENTIAL_WEBHOOK'))
/** Zero-retention media analysis: bytes exist only for this request. */
export const PHOTO_ANALYSIS_WEBHOOK = envOr(`${N8N_BASE}/libertymd-photo-analysis`, () => Deno.env.get('LIBERTYMD_PHOTO_ANALYSIS_WEBHOOK'))
export const LAB_ANALYSIS_WEBHOOK = envOr(`${N8N_BASE}/libertymd-lab-analysis`, () => Deno.env.get('LIBERTYMD_LAB_ANALYSIS_WEBHOOK'))
export const WEBHOOK_SECRET = envOr('', () => Deno.env.get('LIBERTYMD_N8N_WEBHOOK_SECRET'))

export const CONSENT_VERSION = 'libertymd-ai-care-v1'
export const MAX_TURNS = 15

/**
 * P1-16 — Mixpanel super-prop `app_version`. Opaque build label until a real
 * version is wired; never invent a marketing version string.
 */
export const LIBERTYMD_APP_VERSION = 'unknown'

/** P1-16 — Mixpanel HTTP hard-cap (2–3 s). Soft-fail on timeout. */
export const MIXPANEL_FETCH_TIMEOUT_MS = 2_500

/**
 * n8n inference timeout budgets, in milliseconds. P0-14e.
 *
 * These were inline literals at four call sites. They are config now so the
 * safety budget is reviewable in one place, and so P0-11 (retries + breaker)
 * has somewhere to land.
 *
 * ## The guardrail budget is one number, used on every turn.
 *
 * Before P0-14e, `start_consultation` gave the guardrail **2 000 ms** while
 * `send_message` gave it **10 000 ms**. The tightest budget therefore sat on
 * turn 1 — the turn most likely to carry an untriaged emergency. Historically
 * that was also where a 2 s abort mattered most as an n8n backstop; the
 * deterministic **edge** screen itself is **not** turn-gated — it runs on every
 * free-text ingest path (start, demographics-with-text, every `send_message`
 * including at cap). A 2 s abort did not fail loudly: it fell through to
 * `error_fail_cautious`, i.e. a `high_risk_continue` verdict that never
 * actually screened the message via n8n.
 *
 * There is deliberately **no per-turn difference** (P0-14e AC1: turn 1's budget
 * must be >= every later turn's; equal satisfies it with nothing left to
 * justify). Safety asymmetry, CONTEXT.md §4: a slower first paint annoys a
 * user, a missed MI kills one.
 *
 * If a future ticket needs turn 1 to feel faster, the answer is a faster
 * guardrail, a streamed acknowledgement, or optimistic rendering — never a
 * tighter safety budget on turn 1 than on turn 4. Any change to
 * `guardrail` here requires a corpus run (`npm run test:libertymd:evaluation`,
 * `falseNegative` must stay 0).
 *
 * ## P0-11 AC1/AC5 — overridable, with a floor
 *
 * Each budget is now overridable by a `LIBERTYMD_N8N_TIMEOUT_*_MS` secret so it
 * can be tuned without a redeploy. The guardrail budget is clamped to
 * `GUARDRAIL_TIMEOUT_FLOOR_MS`: a misconfigured or well-meaning secret must not
 * be able to silently recreate the P0-14e defect, where a 2 s abort discarded a
 * guardrail that answered in 3 s and replaced it with a fabricated
 * medium-risk verdict. Config is a knob, not a hole.
 */
export const GUARDRAIL_TIMEOUT_FLOOR_MS = 5_000

export const N8N_TIMEOUT_MS = {
  /** Guardrail. Identical on turn 1, the demographics turn, and every interview turn. */
  guardrail: envInt('LIBERTYMD_N8N_TIMEOUT_GUARDRAIL_MS', 10_000, GUARDRAIL_TIMEOUT_FLOOR_MS, 60_000),
  interview: envInt('LIBERTYMD_N8N_TIMEOUT_INTERVIEW_MS', 25_000, 1_000, 60_000),
  diagnosis: envInt('LIBERTYMD_N8N_TIMEOUT_DIAGNOSIS_MS', 55_000, 1_000, 60_000),
  // P5-DDX — detached, so a slow run costs nothing user-visible. Bounded anyway
  // so a hung request cannot pin an isolate open behind the response.
  differential: envInt('LIBERTYMD_N8N_TIMEOUT_DIFFERENTIAL_MS', 20_000, 1_000, 60_000),
  photoAnalysis: envInt('LIBERTYMD_N8N_TIMEOUT_PHOTO_ANALYSIS_MS', 90_000, 5_000, 120_000),
  labAnalysis: envInt('LIBERTYMD_N8N_TIMEOUT_LAB_ANALYSIS_MS', 120_000, 5_000, 120_000),
} as const

/**
 * Circuit-breaker thresholds, per inference stage. P0-11 AC3/AC5.
 *
 * Item 17.4's outage scenario turns one n8n outage into a scary dialog per
 * turn. The breaker's whole purpose is to convert *N failures* into *one
 * holding state*: once a stage has failed `failureThreshold` times inside
 * `rollingWindowMs`, the stage is treated as down for `cooldownMs` and calls to
 * it are rejected instantly instead of each one spending its full budget and
 * failing on its own.
 *
 * "Rolling" and "consecutive" are both satisfied: failures are timestamped and
 * pruned outside the window, and **any** success clears the list. So the
 * trip condition is `failureThreshold` failures with no intervening success,
 * all inside one window.
 *
 * ## This does not weaken emergency detection — read lib/n8n-client.ts §breaker
 *
 * The breaker sits in `postJson`, i.e. strictly *below* the deterministic edge
 * screen in `clinical-policy.ts`, which `runGuardrail` consults before any
 * transport happens. An open guardrail breaker therefore cannot suppress a
 * deterministic force-end, and it fails **cautious** (`high_risk_continue` /
 * `error_fail_cautious`), never to a pass. See P0-14: the deterministic screen
 * is what makes a guardrail outage survivable.
 *
 * `failureThreshold` is deliberately low. A stage that has failed 4 times in
 * two minutes is down; continuing to spend a 55 s diagnosis budget per turn
 * against it buys nothing and costs the user their patience.
 */
export const N8N_BREAKER = {
  failureThreshold: envInt('LIBERTYMD_N8N_BREAKER_FAILURE_THRESHOLD', 4, 2, 100),
  rollingWindowMs: envInt('LIBERTYMD_N8N_BREAKER_WINDOW_MS', 120_000, 1_000, 3_600_000),
  cooldownMs: envInt('LIBERTYMD_N8N_BREAKER_COOLDOWN_MS', 60_000, 1_000, 3_600_000),
} as const

/**
 * P0-15a — observational LLM shadow after an edge_deterministic force_end.
 *
 * Default **off**. When on, `saveSafetyEvent` fire-and-forgets a same-webhook
 * call with `shadow_llm` / `skip_deterministic` so n8n reaches Crisis Screening
 * Agent; the acted-on path never awaits it. Disable by clearing the secret and
 * refreshing the isolate — no app redeploy.
 */
export function isGuardrailShadowLlmEnabled(): boolean {
  return envBool('LIBERTYMD_GUARDRAIL_SHADOW_LLM', false)
}

/** Shadow transport budget. Never awaited on the request critical path. */
export const GUARDRAIL_SHADOW_TIMEOUT_MS = envInt(
  'LIBERTYMD_GUARDRAIL_SHADOW_TIMEOUT_MS',
  10_000,
  1_000,
  60_000,
)

/**
 * P1-08 — speculative Diagnosis pre-warm (one gate-step ahead).
 *
 * Default **off**. When off: zero speculative webhook calls, no cache serve,
 * gate path always runs fresh Diagnosis (behavior matches today except latency).
 * Read at call time so a secret flip + isolate refresh disables without redeploy.
 */
export function isSpeculativeDiagnosisEnabled(): boolean {
  return envBool('LIBERTYMD_SPECULATIVE_DIAGNOSIS', false)
}

/**
 * P2-14 — Diagnosis eligibility knobs (acted-upon gate + one-turn predictor).
 *
 * Defaults match the post–even-turn-removal gate: turn floor **6**, evidence
 * eligibility floor **50**, even-turn parity **off**. Set
 * `LIBERTYMD_DIAGNOSIS_EVEN_TURN_REQUIRED=true` (+ floors) to restore legacy
 * `(even ∨ ready ∨ atCap)` without a code change. Read at call time so a
 * secret flip + isolate refresh rolls back without an app-code redeploy.
 *
 * Client Vite mirror lives in `components/LibertyMD/libertymd-waiting.ts`
 * (compile-time defaults; Vite cannot import this Deno module). Dual-surface
 * rollback is documented in CARE-ARCHITECTURE.
 */
export function getDiagnosisTurnFloor(): number {
  return envInt('LIBERTYMD_DIAGNOSIS_TURN_FLOOR', 6, 1, MAX_TURNS)
}

export function getDiagnosisEvidenceFloor(): number {
  return envInt('LIBERTYMD_DIAGNOSIS_EVIDENCE_FLOOR', 50, 1, 100)
}

/**
 * P5-DDX — master switch for the async mini-differential.
 *
 * Default **off**: with the flag down nothing schedules the differential, the
 * stop rule falls back to the pre-P5 behaviour, and the columns added by T1 sit
 * unread. Rollback is this flag, not a revert.
 */
export function isAsyncDifferentialEnabled(): boolean {
  return envBool('LIBERTYMD_ASYNC_DIFFERENTIAL', false)
}

/** P5-DDX — first turn the differential may run (BO 2026-08-01: 6). */
export function getDifferentialStartTurn(): number {
  return envInt('LIBERTYMD_DIFFERENTIAL_START_TURN', 6, 1, MAX_TURNS)
}

/** P5-DDX — top_confidence needed to stop early (BO 2026-08-03: 80). */
export function getDifferentialStopConfidence(): number {
  return envInt('LIBERTYMD_DIFFERENTIAL_STOP_CONFIDENCE', 80, 1, 100)
}

/**
 * P5-DDX — how many turns old a differential may be and still steer questions
 * or satisfy the stop rule. Beyond this the hint is withheld entirely: a
 * four-turn-old differential aiming questions is worse than none.
 */
export function getDifferentialMaxStaleTurns(): number {
  return envInt('LIBERTYMD_DIFFERENTIAL_MAX_STALE_TURNS', 3, 1, MAX_TURNS)
}

export function isDiagnosisEvenTurnRequired(): boolean {
  return envBool('LIBERTYMD_DIAGNOSIS_EVEN_TURN_REQUIRED', false)
}

/**
 * P4-06 — photo signed-URL TTL and product size/MIME gates.
 * Re-exported from lib/photo-upload.ts so config remains the discoverable home;
 * unit tests import the pure module directly (no Deno.env).
 */
export {
  PHOTO_ALLOWED_MIME,
  PHOTO_MAX_BYTES,
  PHOTO_SIGNED_URL_TTL_SECONDS,
} from './photo-upload.ts'

/**
 * P4-07 — lab signed-URL TTL and product size/MIME gates.
 * Pure module: lib/lab-upload.ts (no Deno.env).
 */
export {
  LAB_ALLOWED_MIME,
  LAB_MAX_BYTES,
  LAB_SIGNED_URL_TTL_SECONDS,
} from './lab-upload.ts'
