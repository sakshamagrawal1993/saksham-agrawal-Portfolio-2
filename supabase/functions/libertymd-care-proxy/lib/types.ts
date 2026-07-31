/**
 * Shared request/row/inference shapes for the LibertyMD care proxy.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 * P0-16 added the severity taxonomy below — see the block comment there for why
 * a function lives in a types module.
 */
import type { ResponseRelevance } from '../clinical-policy.ts'

export type JsonObject = Record<string, unknown>

export type ConsultationStatus =
  | 'awaiting_demographics'
  | 'interviewing'
  | 'high_risk'
  | 'report_pending_auth'
  | 'completed'
  | 'emergency_stopped'
  | 'clinical_review_needed'
  | 'abandoned'

export type ProxyAction =
  | 'bootstrap'
  | 'start_consultation'
  | 'abandon_consultation'
  | 'resume_consultation'
  | 'save_demographics'
  | 'send_message'
  | 'release_report'
  | 'sync_identity'
  | 'record_identity_event'
  | 'prepare_account_merge'
  | 'complete_account_merge'
  | 'get_history'
  | 'get_consultation'

export interface RequestPayload {
  action: ProxyAction
  consultation_id?: string
  message?: string
  age?: number | string
  sex_at_birth?: string
  region?: 'US' | 'EU'
  mode?: 'skip' | 'google'
  client_message_id?: string
  expected_version?: number
  identity_event?: 'google_link_started' | 'google_link_cancelled' | 'google_link_conflict'
  transfer_token?: string
}

export interface ConsultationRow {
  id: string
  user_id: string
  status: ConsultationStatus
  chief_complaint: string | null
  turn_count: number
  filled_slots: JsonObject
  missing_slots: string[]
  target_slot: string | null
  intermediate_diagnoses: unknown[]
  safety_state: JsonObject
  report_gate: string
  non_clinical_response_count: number
  consecutive_non_clinical_response_count: number
  clinical_evidence_score: number
  resolution_reason: string | null
  version: number
  active_request_id: string | null
  active_request_started_at: string | null
  patient_id: string
  patient_snapshot: JsonObject
  workflow_versions: JsonObject
  abandoned_from_status: ConsultationStatus | null
  abandoned_at: string | null
}

export interface PatientRow {
  id: string
  owner_user_id: string
  relationship: 'self' | 'dependent' | 'other'
  display_label: string | null
  age: number | null
  sex_at_birth: string | null
  gender_identity: string | null
}

/**
 * P0-16 — the four user-visible severities, and the only mapping allowed to
 * produce them.
 *
 * ## Why this lives in `types.ts`
 *
 * `severityForSafetySignal` is the single server-side authority for turning a
 * persisted safety signal into a presentation tier, so it must be importable by
 * `tests/libertymd/` without pulling in anything that reads the environment.
 * `lib/safety.ts` transitively imports `lib/config.ts`, which calls
 * `Deno.env.get` at module load; importing it from a test would need
 * `--allow-env` and would drag Deno-typed modules into the repo `tsc` program.
 * `types.ts` has no runtime dependencies at all — only a `import type` — so it
 * is the one place in this module graph a pure discriminator can live and still
 * be tested. It sits next to `GuardrailResult`, the contract it discriminates.
 *
 * ## The rules, in strict precedence order
 *
 * 1. `force_end` → `emergency`. **Nothing else can ever return `emergency`.**
 *    P0-16 AC4 — asserted over the full status × source matrix in
 *    `tests/libertymd/severity-mapping.test.ts`.
 * 2. A technical `source` (`error_fail_cautious` and friends) → `technical`.
 *    This is P0-14f: the guardrail failing at the *transport* level still fails
 *    cautious internally (`status: 'high_risk_continue'`), but a network fault
 *    is not a finding about the user's body and must not be dressed as one.
 * 3. `high_risk_continue` → `caution`.
 * 4. everything else, including `pass` and the unscreened-turn verdict →
 *    `info`.
 *
 * Rule 1 outranks rule 2 deliberately: safety asymmetry (CONTEXT.md §4) means a
 * real emergency must never be demoted to a technical notice, even if some
 * future source string is both. Rule 2 outranks rule 3 for the same asymmetry
 * read from the other end — a caution the user cannot act on is noise, and
 * noise is what makes real cautions ignorable.
 *
 * @see components/LibertyMD/libertymd-severity.ts — the client mirror. The two
 * are asserted equal over the whole matrix by the test above; if you change one
 * rule here, that test fails until the mirror matches.
 */
export type CareSeverity = 'info' | 'caution' | 'emergency' | 'technical'

/**
 * A safety signal as it survives persistence: the two columns
 * `libertymd_safety_events.status` / `.source`. Anything shaped like this can be
 * mapped — a fresh `GuardrailResult`, a `safety_state` blob read back off a
 * consultation, or a row replayed from history.
 */
export interface SafetySignal {
  status?: string | null
  source?: string | null
}

/**
 * `source` values that mean "the app failed", not "the body is at risk".
 *
 * `error_fail_cautious` is the live one — it is what `runGuardrail`'s catch has
 * always written, and the two rows in production data that P0-14f exists to fix
 * carry it. The other three are forward-compatible names for transport
 * classifications the proxy may add later.
 *
 * ## Every entry is a name the proxy itself writes, and none of them is generic
 *
 * The obvious wider list would also hold `'error'` and `'timeout'`. It must not.
 * `source` is `String(raw.source || 'n8n')` — an n8n-supplied value — for every
 * verdict that actually came back from the workflow. A generic entry here would
 * mean an n8n response that happened to carry `source: 'error'` alongside a
 * genuine `high_risk_continue` would be shown to the user as an app fault, and a
 * real clinical caution would be silently swallowed. That is the same class of
 * defect as P0-14f, running the other way.
 *
 * The residual risk is the opposite one: a *new* transport source added later
 * and forgotten here would fall through to `caution`, i.e. re-open the original
 * bug. That risk is handled by process rather than by a wildcard — the mirror
 * test in `tests/libertymd/severity-mapping.test.ts` fails the moment the two
 * lists differ, so a new source cannot be added on one side only.
 */
export const TECHNICAL_SAFETY_SOURCES: readonly string[] = [
  'error_fail_cautious',
  'guardrail_unavailable',
  'guardrail_timeout',
  'transport_error',
]

/** True when a persisted safety `source` denotes an app failure. */
export function isTechnicalSafetySource(source: string | null | undefined): boolean {
  return typeof source === 'string' && TECHNICAL_SAFETY_SOURCES.indexOf(source) !== -1
}

/** P0-16 AC2 — the mechanical `status` + `source` → severity mapping. */
export function severityForSafetySignal(signal: SafetySignal | null | undefined): CareSeverity {
  if (!signal) return 'info'
  if (signal.status === 'force_end') return 'emergency'
  if (isTechnicalSafetySource(signal.source)) return 'technical'
  if (signal.status === 'high_risk_continue') return 'caution'
  return 'info'
}

export interface GuardrailResult {
  status: 'pass' | 'high_risk_continue' | 'force_end'
  risk_level: 'low' | 'medium' | 'high' | 'emergency'
  crisis_type: string
  force_end: boolean
  is_emergency: boolean
  care_setting: string
  message: string
  red_flags: string[]
  source: string
  /**
   * P0-16 — the presentation tier, derived from `status` + `source` by
   * `severityForSafetySignal`, never assigned by hand. Published on the client
   * payload so no component has to infer it; the client still re-derives rather
   * than trusting it, so a server bug cannot reach emergency chrome.
   */
  severity: CareSeverity
  raw: JsonObject
}

export interface InterviewResult {
  next_question: string
  options: string[]
  ready_for_report: boolean
  target_slot: string
  slot_updates: JsonObject
  missing_slots: string[]
  input_relevance: ResponseRelevance
  input_relevance_reason: string
  source: string
}
