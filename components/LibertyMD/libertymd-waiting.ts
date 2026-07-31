/**
 * P1-07 · Staged waiting states (pure helpers).
 *
 * Wait-mode prediction mirrors proxy `shouldRunDiagnosis` / `computeShouldRunDiagnosis`
 * (same boolean). Gate runs after interview slot merge server-side — client
 * prediction is best-effort; false +/- reviewing chrome is acceptable.
 *
 * Do not import Deno proxy modules into Vite.
 *
 * Rollback: set `LIBERTYMD_STAGED_WAITING_ENABLED` to false → typing-only.
 *
 * P2-14 eligibility defaults must stay lockstep with proxy
 * `LIBERTYMD_DIAGNOSIS_*` secrets (Deno `lib/config.ts`). Vite cannot read those
 * secrets — compile-time mirrors below. Optional `VITE_LIBERTYMD_DIAGNOSIS_*`
 * flips chrome without a code edit; proxy SoT for acted-upon gate is still the
 * Deno secrets. Dual-surface rollback: CARE-ARCHITECTURE.
 */
import { MAX_INTERVIEW_TURNS } from './libertymd-interview-expectations'

/** One-flag rollback — fall back to single typing indicator. */
export const LIBERTYMD_STAGED_WAITING_ENABLED = true

/** Word-ish progressive reveal tick (clarified S1: ~30–50ms). */
export const REVEAL_TICK_MS = 40

/**
 * P2-13 / L2 — Spec generating wait ceiling.
 * Proxy diagnosis budget default is 55_000ms (`N8N_TIMEOUT_MS.diagnosis`);
 * client adds a small buffer so the escape fires after the proxy budget.
 * Re-exported from lifecycle helper as `GENERATING_WAIT_TIMEOUT_MS` (65s).
 */
export const GENERATING_WAIT_TIMEOUT_MS = 65_000

/**
 * P2-14 · Diagnosis eligibility mirrors (proxy defaults: floor 6 / score 50 /
 * even-turn required false). Optional Vite overrides for chrome rollback
 * without code edit; unset → compile-time defaults.
 */
type EnvLike = Record<string, string | boolean | undefined>

function readViteEnv(): EnvLike {
  return typeof import.meta !== 'undefined'
    ? ((import.meta as { env?: EnvLike }).env ?? {})
    : {}
}

function viteBool(raw: string | boolean | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback
  const normalized = String(raw).trim().toLowerCase()
  if (normalized === 'true' || normalized === '1') return true
  if (normalized === 'false' || normalized === '0') return false
  return fallback
}

function viteInt(
  raw: string | boolean | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw === '') return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

/** Compile-time / Vite mirrors of proxy `getDiagnosisTurnFloor` default 6. */
export function getClientDiagnosisTurnFloor(env?: EnvLike): number {
  const source = env ?? readViteEnv()
  return viteInt(source.VITE_LIBERTYMD_DIAGNOSIS_TURN_FLOOR, 6, 1, MAX_INTERVIEW_TURNS)
}

/** Compile-time / Vite mirrors of proxy `getDiagnosisEvidenceFloor` default 50. */
export function getClientDiagnosisEvidenceFloor(env?: EnvLike): number {
  const source = env ?? readViteEnv()
  return viteInt(source.VITE_LIBERTYMD_DIAGNOSIS_EVIDENCE_FLOOR, 50, 1, 100)
}

/**
 * Compile-time / Vite mirrors of proxy `isDiagnosisEvenTurnRequired` default false.
 * Set `VITE_LIBERTYMD_DIAGNOSIS_EVEN_TURN_REQUIRED=true` to restore legacy odd-turn
 * reviewing chrome without redeploying client code (proxy secret is separate).
 */
export function isClientDiagnosisEvenTurnRequired(env?: EnvLike): boolean {
  const source = env ?? readViteEnv()
  return viteBool(source.VITE_LIBERTYMD_DIAGNOSIS_EVEN_TURN_REQUIRED, false)
}

/** §1 latency bands — copy of proxy `latencyBucket` unions (no Deno import). */
export type LatencyBucket = '<500' | '500-1500' | '1500-4000' | '4000-10000' | '10000+'

export type WaitMode = 'typing' | 'reviewing'

export type DiagnosisGateInput = {
  /** Upcoming / in-flight turn index (proxy `turnCount` after +1). */
  turnCount: number
  evidenceScore: number
  readyForReport?: boolean
  maxTurns?: number
  /** Optional Vite env bag for tests / chrome rollback doubles. */
  env?: EnvLike
}

/**
 * Same boolean as proxy `computeShouldRunDiagnosis` (P2-14 G2):
 * score ≥ floor ∧ turn ≥ floor ∧ (!EVEN_REQUIRED ∨ even ∨ ready ∨ at cap).
 */
export function shouldRunDiagnosisGate(input: DiagnosisGateInput): boolean {
  const maxTurns = input.maxTurns ?? MAX_INTERVIEW_TURNS
  const turnCount = Number(input.turnCount)
  const score = Number(input.evidenceScore)
  if (!Number.isFinite(turnCount) || !Number.isFinite(score)) return false
  const scoreFloor = getClientDiagnosisEvidenceFloor(input.env)
  const turnFloor = getClientDiagnosisTurnFloor(input.env)
  const evenRequired = isClientDiagnosisEvenTurnRequired(input.env)
  const parityOk =
    !evenRequired
    || turnCount % 2 === 0
    || Boolean(input.readyForReport)
    || turnCount >= maxTurns
  return score >= scoreFloor && turnCount >= turnFloor && parityOk
}

/**
 * Upcoming turn index from last-known completed count (proxy: atCap keeps MAX).
 */
export function upcomingTurnCount(
  lastKnownTurnCount: number,
  maxTurns: number = MAX_INTERVIEW_TURNS,
): number {
  const last = Number.isFinite(lastKnownTurnCount) ? Math.max(0, Math.floor(lastKnownTurnCount)) : 0
  if (last >= maxTurns) return maxTurns
  return last + 1
}

/**
 * Whole-turn wait mode for the busy period. When staged waiting is disabled,
 * always returns typing.
 */
export function predictWaitMode(input: DiagnosisGateInput): WaitMode {
  if (!LIBERTYMD_STAGED_WAITING_ENABLED) return 'typing'
  return shouldRunDiagnosisGate(input) ? 'reviewing' : 'typing'
}

export function predictWaitModeFromLastKnown(input: {
  lastTurnCount: number
  evidenceScore: number
  readyForReport?: boolean
  maxTurns?: number
  env?: EnvLike
}): WaitMode {
  const maxTurns = input.maxTurns ?? MAX_INTERVIEW_TURNS
  return predictWaitMode({
    turnCount: upcomingTurnCount(input.lastTurnCount, maxTurns),
    evidenceScore: input.evidenceScore,
    readyForReport: input.readyForReport,
    maxTurns,
    env: input.env,
  })
}

/** §1 band constants — never emit raw ms in telemetry props. */
export function latencyBucket(ms: number): LatencyBucket {
  if (!Number.isFinite(ms) || ms < 500) return '<500'
  if (ms < 1500) return '500-1500'
  if (ms < 4000) return '1500-4000'
  if (ms < 10_000) return '4000-10000'
  return '10000+'
}

/**
 * Progressive reveal prefixes (word-ish chunks on whitespace).
 * Strict prefixes of `text`; last entry is always the full string.
 * Instant / reduced-motion / empty → single full paint.
 */
export function buildRevealPrefixes(
  text: string,
  opts?: { instant?: boolean; reducedMotion?: boolean },
): string[] {
  const full = String(text ?? '')
  if (!full || opts?.instant || opts?.reducedMotion) return [full]

  const parts = full.split(/(\s+)/)
  const prefixes: string[] = []
  let acc = ''
  for (const part of parts) {
    acc += part
    if (/\S/.test(part)) {
      prefixes.push(acc)
    }
  }
  if (!prefixes.length) return [full]
  if (prefixes[prefixes.length - 1] !== full) prefixes.push(full)
  return prefixes
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/** Composer restore rule (Q3): never clobber a mid-wait draft that differs from sent. */
export function nextComposerInputAfterRestore(
  currentInput: string,
  sentMessage: string,
): string {
  const current = String(currentInput ?? '')
  const sent = String(sentMessage ?? '')
  if (!current.trim() || current === sent) return sent
  return current
}
