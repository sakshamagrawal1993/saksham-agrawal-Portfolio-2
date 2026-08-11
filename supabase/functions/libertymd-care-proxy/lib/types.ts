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
  | 'generate_report'
  | 'release_report'
  | 'sync_identity'
  | 'record_identity_event'
  | 'prepare_account_merge'
  | 'complete_account_merge'
  | 'get_history'
  | 'get_consultation'
  | 'get_partial_outcome'
  | 'create_patient'
  | 'update_patient'
  | 'delete_patient'
  | 'list_owned_patients'
  | 'request_report_email'
  | 'redeem_report_link'
  | 'submit_report_feedback'
  | 'record_care_interest'
  | 'respond_followup_checkin'
  | 'unsubscribe_followup_checkin'
  | 'upload_photo'
  | 'retry_photo_analysis'
  | 'upload_lab'

/** P4-05 — cross-account merge attribution path (HTTP + identity_event metadata). Not Lexicon merge_outcome. */
export type CollisionPath = 'matched_self' | 'distinct_profile'

/**
 * P1-19 — sanitized landing attribution (allow-listed only).
 * Never include raw `q` / `query` / free-text search. Server re-sanitizes.
 */
export interface LandingAttributionFields {
  anon_session_key?: string
  landing_session_id?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  keyword_id?: string
  matched_topic_slug?: string
  /** Client may send `topic` as alias for matched_topic_slug — proxy maps it. */
  topic?: string
  locale?: string
  device_class?: string
  landing_path?: string
}

export interface RequestPayload extends LandingAttributionFields {
  action: ProxyAction
  consultation_id?: string
  message?: string
  /**
   * P3-07 — explicit clinical journey language on `start_consultation` only.
   * Proxy `journey-locale` normalizer is SoT (allow-list → en|es → AC6 gate).
   * Distinct from P1-19 attribution `locale` (chrome/landing analytics).
   */
  language?: string
  age?: number | string
  sex_at_birth?: string
  region?: 'US' | 'EU'
  mode?: 'skip' | 'google'
  client_message_id?: string
  /** Idempotency/lease token for an asynchronous report-generation attempt. */
  generation_request_id?: string
  expected_version?: number
  identity_event?: 'google_link_started' | 'google_link_cancelled' | 'google_link_conflict'
  transfer_token?: string
  /** P1-04 create_patient — relationship for dependent/other profiles. */
  relationship?: 'self' | 'dependent' | 'other' | string
  /** P1-04 create_patient — non-PHI display label. */
  display_label?: string
  /** P1-03 — explicit bind when activeOwnedCount > 1. */
  patient_id?: string
  /**
   * P1-03 telemetry only — how the explicit patient was chosen.
   * Ignored when patient_id is omitted (sole-active auto-bind).
   */
  selection_source?: 'picker' | 'someone_else_create'
  /**
   * P3-05 — how the consult opened. Server coerces to `chip` | `freetext` only.
   * Never put chip label / message / chief_complaint on product events.
   */
  entry_type?: 'chip' | 'freetext' | string
  /** P3-05 — opaque allow-listed chip id when entry_type is chip. */
  chip_id?: string
  /**
   * P2-08 delivery contact (`request_report_email`) and P2-12 optional waitlist
   * contact (`record_care_interest`). Different write paths/tables. Null/omit on
   * waitlist = demand without contact. Never merged to profiles.email; not marketing consent.
   */
  contact_email?: string
  /** P2-08 — raw bearer token for redeem_report_link (hash looked up service-role). */
  delivery_token?: string
  /** P4-01 — raw bearer token for respond_followup_checkin / unsubscribe_followup_checkin. */
  followup_token?: string
  /** P4-01 — categorical feeling answer (better | same | worse). */
  followup_answer?: string
  /** P4-02 — categorical doctor-visit answer (yes | no | not_yet). One-shot while null. */
  followup_saw_doctor?: string
  /** P4-02 — optional product-feedback match (yes | no | unsure); omit when skipped. */
  followup_report_match?: string
  /** P2-10 — was this report helpful (required for submit_report_feedback). */
  helpful?: boolean
  /** P2-10 — optional free-text “what was missing?” (≤500; clinical DB only). */
  comment?: string
  /**
   * P4-06 — photo ingest (base64 bytes). Proxy strips EXIF then service_role
   * stores under libertymd-care. Never trust client path / filename / user id.
   * P4-07 — lab also accepts PDF under `file_base64` (preferred) or `image_base64`
   * alias; CARE documents one transport SoT. Never trust client path / filename.
   */
  content_type?: string
  image_base64?: string
  /** P4-07 — preferred lab base64 field (PDF + images); image_base64 is alias. */
  file_base64?: string
  /** P4-06 retry — server resolves the private path; client never supplies it. */
  object_uuid?: string
  /** Client-side pre-persistence window while an accepted file request is in flight. */
  media_upload_in_progress?: boolean
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
  /** US | EU — care region (AC2 numbers via region_config). */
  region?: string
  /** Persisted consultation-level routing category used by emergency resume. */
  care_setting?: string
  /** P3-07 journey-wide clinical language (`en` | `es`). Immutable after create. */
  language?: string
}

/**
 * P4-03 — enriched `get_history` / identity / bootstrap history row.
 * Scalars only — never embed `report_data`. Withheld / expired rows omitted upstream.
 */
export interface HistorySummaryItem {
  id: string
  status: string
  chief_complaint: string | null
  turn_count: number | null
  report_gate: string | null
  created_at: string
  updated_at: string | null
  completed_at: string | null
  patient_id: string | null
  patient_display_label: string | null
  headline: string | null
  triage_tier: string | null
  retention_expires_at: string | null
}

export interface PatientRow {
  id: string
  owner_user_id: string
  relationship: 'self' | 'dependent' | 'other'
  display_label: string | null
  age: number | null
  sex_at_birth: string | null
  gender_identity: string | null
  /** Soft-active flag; list / skip / picker use is_active = true only (P1-03). */
  is_active?: boolean
}

/** Non-PHI picker row for bootstrap / multi-start reject (P1-03 Q8A). */
export interface PatientListItem {
  id: string
  relationship: 'self' | 'dependent' | 'other' | string
  display_label: string | null
  has_age: boolean
  has_sex: boolean
  is_complete: boolean
}

/**
 * P4-04 Q3A — linked-only management list row (AccountDrawer CRUD).
 * Includes age/sex for the JWT owner. Never used for intake picker.
 */
export interface ManagedPatientListItem {
  id: string
  relationship: 'self' | 'dependent' | 'other' | string
  display_label: string | null
  age: number | null
  sex_at_birth: string | null
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

/**
 * P0-14c — server-only audit provenance for an `edge_deterministic` force-end.
 *
 * Persisted under `libertymd_safety_events.raw_result.match` only. Must never
 * appear in HTTP `safety` payloads, `consultations.safety_state`, logs, or
 * telemetry (CONTEXT.md §3.5).
 */
export interface GuardrailMatchAudit {
  rule_id: string
  span: string
  span_start: number
  span_end: number
  pattern_set_version: string
  lane: 'edge'
}

/**
 * P0-15a — PHI-free observational LLM shadow under `raw_result.shadow_llm`.
 * Never on HTTP `safety`, `safety_state`, telemetry, or console.
 */
export type ShadowLlmOutcome = 'completed' | 'timeout' | 'transport' | 'error'

export type ShadowLlmStatus =
  | 'agreed_force_end'
  | 'disagreed'
  | 'pending'
  | 'timeout'
  | 'disabled'
  | 'error'

export interface ShadowLlmPayload {
  status: string
  force_end: boolean
  crisis_type: string
  care_setting: string
  outcome: ShadowLlmOutcome
  shadow_llm_status: ShadowLlmStatus
}

/** Screening inputs needed to re-call the guardrail webhook for a shadow. */
export interface GuardrailScreenContext {
  message: string
  history: unknown[]
  patient: JsonObject
}

/** P3-08 · Resolved patient-facing emergency strings (force_end + reopen). */
export interface EmergencyCopyWire {
  heading: string
  standingInstruction: string
  detail: string
  crisis_type: string
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
  /**
   * Client-safe verdict blob for `safety_state` / response `raw`. Never carries
   * `match`, `shadow_llm`, or transcript fields (`message_text` / `history` / `patient`).
   */
  raw: JsonObject
  /**
   * P0-14c — optional internal audit field. Read only by `saveSafetyEvent`.
   * Strip with `toClientSafety` before every HTTP `safety:` response.
   */
  match?: GuardrailMatchAudit
  /**
   * P3-08 — resolved heading / standing / detail from catalog + region_config
   * (fixture fail-open). Present on force_end; client displays these strings only.
   */
  emergency_copy?: EmergencyCopyWire
}

/** One entry of the mini-differential (machine-read, English by contract). */
export interface WorkingDifferentialEntry {
  condition: string
  confidence: number
  supporting?: string[]
  refuting?: string[]
  discriminator?: string
}

/**
 * P5-DDX — one async mini-differential run.
 *
 * `computed_at_turn` is the ordering key: the proxy accepts a write only when it
 * exceeds the stored value, so a slow early run landing late cannot regress the
 * differential to an older view of the case.
 */
export interface DifferentialResult {
  entries: WorkingDifferentialEntry[]
  top_confidence: number
  discriminator: string
  red_flags_outstanding: string[]
  delta_reason: string
  computed_at_turn: number
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
  /** The existing Interview call may enter a bounded, low-confidence phase. */
  diagnostic_clarification: boolean
  clarification_exhausted: boolean
  question_purpose: string
  backup_question: string
  backup_options: string[]
  backup_question_purpose: string
  /**
   * BO 2026-08-01 — running differential + calibrated confidence for the top
   * entry, recomputed every turn. `diagnostic_confidence` is what gates the
   * early stop (>= 80); condition names are English by contract because they are
   * matched downstream and shown to no patient.
   */
  working_differential: WorkingDifferentialEntry[]
  diagnostic_confidence: number
  stop_reason: string | null
  source: string
}
