/**
 * P1-08 · Speculative diagnosis pre-warm — pure helpers.
 *
 * Correctness always beats speed. Serve only when kill-switch is on, the prior
 * speculative row is `validated`, and material clinical inputs are unchanged.
 * `missing_slots` alone does not invalidate. Expected hit-rate is low when the
 * next answer updates `filled_slots`.
 */

import {
  getDiagnosisEvidenceFloor,
  getDiagnosisTurnFloor,
  isDiagnosisEvenTurnRequired,
  MAX_TURNS,
} from './config.ts'
import type { JsonObject } from './types.ts'

export type DiagnosisGateInput = {
  evidenceScore: number
  turnCount: number
  readyForReport: boolean
  maxTurns?: number
}

/**
 * Exact gate boolean used by `send_message` (do not drift thresholds).
 *
 * P2-14 G2: score ≥ evidence floor ∧ turn ≥ turn floor ∧
 * (!EVEN_REQUIRED ∨ even ∨ ready_for_report ∨ ≥ MAX_TURNS).
 * Defaults: EVEN_REQUIRED=false, turn floor 6, evidence floor 50.
 * At the turn cap, any non-zero clinical evidence opens the report attempt.
 * Zero remains the sole no-health-information state.
 */
export function computeShouldRunDiagnosis(input: DiagnosisGateInput): boolean {
  const maxTurns = input.maxTurns ?? MAX_TURNS
  const scoreFloor = getDiagnosisEvidenceFloor()
  const turnFloor = getDiagnosisTurnFloor()
  const evenRequired = isDiagnosisEvenTurnRequired()
  const parityOk =
    !evenRequired
    || input.turnCount % 2 === 0
    || input.readyForReport
    || input.turnCount >= maxTurns
  const evidenceOk = input.evidenceScore >= scoreFloor
    || (input.turnCount >= maxTurns && input.evidenceScore > 0)
  return evidenceOk
    && input.turnCount >= turnFloor
    && parityOk
}

/**
 * Q1(A): after turn N, fire speculative when gate is closed now but would open
 * on N+1 given **current** evidence, projecting `readyForReport: false`
 * (never invent next-turn ready_for_report).
 */
export function isOneTurnFromDiagnosisGate(input: {
  evidenceScore: number
  turnCount: number
  maxTurns?: number
}): boolean {
  const now = computeShouldRunDiagnosis({
    evidenceScore: input.evidenceScore,
    turnCount: input.turnCount,
    readyForReport: false,
    maxTurns: input.maxTurns,
  })
  if (now) return false
  return computeShouldRunDiagnosis({
    evidenceScore: input.evidenceScore,
    turnCount: input.turnCount + 1,
    readyForReport: false,
    maxTurns: input.maxTurns,
  })
}

export type MaterialDiagnosisSnapshot = {
  filled_slots: unknown
  patient: unknown
  target_slot: unknown
  media_context?: unknown
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(record).sort()) {
    out[key] = sortKeysDeep(record[key])
  }
  return out
}

/** Canonical JSON for material equality (order-stable). */
export function canonicalizeMaterial(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value ?? null))
}

export function materialSnapshotsEqual(
  a: MaterialDiagnosisSnapshot,
  b: MaterialDiagnosisSnapshot,
): boolean {
  return canonicalizeMaterial(a.filled_slots) === canonicalizeMaterial(b.filled_slots)
    && canonicalizeMaterial(a.patient) === canonicalizeMaterial(b.patient)
    && canonicalizeMaterial(a.target_slot ?? null) === canonicalizeMaterial(b.target_slot ?? null)
    && canonicalizeMaterial(a.media_context ?? []) === canonicalizeMaterial(b.media_context ?? [])
}

export function materialSnapshotFromInputSnapshot(inputSnapshot: unknown): MaterialDiagnosisSnapshot {
  const snap = inputSnapshot && typeof inputSnapshot === 'object'
    ? inputSnapshot as JsonObject
    : {}
  return {
    filled_slots: snap.filled_slots ?? {},
    patient: snap.patient ?? {},
    target_slot: snap.target_slot ?? null,
    media_context: snap.media_context ?? [],
  }
}

export type SpeculativeRunRow = {
  id: string
  run_status: string
  is_speculative?: boolean
  input_snapshot: unknown
  turn_count?: number
  differential_diagnosis?: unknown
  confidence_score?: unknown
  clinical_summary?: unknown
  clinical_reasoning?: unknown
  validation_reason?: unknown
  workflow_metadata?: unknown
}

/**
 * Serve-eligible iff kill-switch on ∧ validated ∧ material equality.
 * Withheld / error / invalid / missing / in-flight → never serve.
 */
export function isSpeculativeRunServeEligible(args: {
  enabled: boolean
  run: SpeculativeRunRow | null | undefined
  current: MaterialDiagnosisSnapshot
}): boolean {
  if (!args.enabled || !args.run) return false
  if (args.run.run_status !== 'validated') return false
  return materialSnapshotsEqual(
    materialSnapshotFromInputSnapshot(args.run.input_snapshot),
    args.current,
  )
}
