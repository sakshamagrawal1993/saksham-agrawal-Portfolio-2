/**
 * Response construction + the proxy failure taxonomy.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 * Lane C owns this module — the failure-taxonomy work (P0-12) lands here.
 */
import { corsHeaders } from '../../_shared/cors.ts'
import { severityForSafetySignal } from './types.ts'
import type { CareSeverity, GuardrailResult } from './types.ts'

export const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

/**
 * P1-04 Q5A — anonymous multi-profile create reject. No PHI.
 * Distinct from history's `account_required` boolean field.
 */
export const SIGN_IN_REQUIRED_CODE = 'sign_in_required' as const

const SAFE_SIGN_IN_REQUIRED =
  'Link Google to add family profiles. Your current consult stays available as a guest.'

export class SignInRequiredError extends Error {
  readonly code = SIGN_IN_REQUIRED_CODE
  readonly severity = 'technical' as const
  readonly httpStatus = 403
  constructor(message: string = SAFE_SIGN_IN_REQUIRED) {
    super(message)
    this.name = 'SignInRequiredError'
  }
}

/**
 * P1-05 — under-floor age reject only (create + demographics). No PHI / raw age.
 * Distinct from neutral range messaging for non-integer / age > 120.
 */
export const ADULTS_ONLY_CODE = 'adults_only' as const

export const SAFE_ADULTS_ONLY =
  'LibertyMD is for adults (18+). For someone under 18, please use a clinician or service that cares for children and adolescents.'

export function ageRangeErrorMessage(minAge: number): string {
  return `Enter an age from ${minAge} to 120`
}

/** Client-safe validation failure for linked create_patient / update_patient (no PHI). */
export class PatientCreateValidationError extends Error {
  readonly httpStatus = 400
  readonly severity = 'technical' as const
  readonly code?: typeof ADULTS_ONLY_CODE
  constructor(message: string, options?: { code?: typeof ADULTS_ONLY_CODE }) {
    super(message)
    this.name = 'PatientCreateValidationError'
    if (options?.code) this.code = options.code
  }
}

export function isSignInRequiredError(error: unknown): error is SignInRequiredError {
  return error instanceof SignInRequiredError
}

export function isPatientCreateValidationError(error: unknown): error is PatientCreateValidationError {
  return error instanceof PatientCreateValidationError
}

/**
 * P4-04 — active profile cap reached on create. No PHI.
 * Distinct from adults_only / sign_in_required.
 */
export const PROFILE_CAP_REACHED_CODE = 'profile_cap_reached' as const

const SAFE_PROFILE_CAP_REACHED =
  'You already have the maximum number of active profiles. Remove one before adding another.'

export class ProfileCapReachedError extends Error {
  readonly code = PROFILE_CAP_REACHED_CODE
  readonly severity = 'technical' as const
  readonly httpStatus = 400
  constructor(message: string = SAFE_PROFILE_CAP_REACHED) {
    super(message)
    this.name = 'ProfileCapReachedError'
  }
}

export function isProfileCapReachedError(error: unknown): error is ProfileCapReachedError {
  return error instanceof ProfileCapReachedError
}

/**
 * P4-04 — self patient cannot be soft-deleted. No PHI.
 */
export const SELF_UNDELETABLE_CODE = 'self_undeletable' as const

const SAFE_SELF_UNDELETABLE = 'Your own profile cannot be removed.'

export class SelfUndeletableError extends Error {
  readonly code = SELF_UNDELETABLE_CODE
  readonly severity = 'technical' as const
  readonly httpStatus = 400
  constructor(message: string = SAFE_SELF_UNDELETABLE) {
    super(message)
    this.name = 'SelfUndeletableError'
  }
}

export function isSelfUndeletableError(error: unknown): error is SelfUndeletableError {
  return error instanceof SelfUndeletableError
}

/** P1-03 — multi-profile start without a valid owned patient_id. No PHI. */
export const PATIENT_SELECTION_REQUIRED_CODE = 'patient_selection_required' as const

const SAFE_PATIENT_SELECTION_REQUIRED = 'Choose who this consultation is for.'

export class PatientSelectionRequiredError extends Error {
  readonly code = PATIENT_SELECTION_REQUIRED_CODE
  readonly severity = 'technical' as const
  readonly httpStatus = 400
  readonly patients: unknown[]
  constructor(patients: unknown[] = [], message: string = SAFE_PATIENT_SELECTION_REQUIRED) {
    super(message)
    this.name = 'PatientSelectionRequiredError'
    this.patients = patients
  }
}

export function isPatientSelectionRequiredError(error: unknown): error is PatientSelectionRequiredError {
  return error instanceof PatientSelectionRequiredError
}

/**
 * The single top-level catch mapping.
 *
 * P0-16: the body carries `severity: 'technical'` so the client keys
 * presentation off data rather than which state variable was set.
 *
 * P0-12: never echo raw thrown messages / stacks to the client (CONTEXT.md §4
 * "never leak internals into the UI"). Status still derives from known safe
 * markers; the user-facing `error` string is always a class-safe constant.
 *
 * P1-04: `SignInRequiredError` maps to 403 + `code: 'sign_in_required'`.
 */
const SAFE_NOT_FOUND = 'We could not find this consultation. Please start a new one.'
const SAFE_TECHNICAL = 'Something went wrong on our side. Please try again.'

/**
 * P4-06 — photo upload validation / storage failures are always technical.
 * Upload never blocks the consult continuum; user-facing copy must not wear
 * clinical caution or emergency clothing.
 */
export const PHOTO_UPLOAD_TECHNICAL_SEVERITY = 'technical' as const

export function errorResponse(error: unknown) {
  console.error('LibertyMD care proxy error', error)
  if (isSignInRequiredError(error)) {
    return jsonResponse(
      { code: error.code, error: error.message, severity: error.severity satisfies CareSeverity },
      error.httpStatus,
    )
  }
  if (isProfileCapReachedError(error)) {
    return jsonResponse(
      { code: error.code, error: error.message, severity: error.severity satisfies CareSeverity },
      error.httpStatus,
    )
  }
  if (isSelfUndeletableError(error)) {
    return jsonResponse(
      { code: error.code, error: error.message, severity: error.severity satisfies CareSeverity },
      error.httpStatus,
    )
  }
  if (isPatientCreateValidationError(error)) {
    return jsonResponse(
      {
        ...(error.code ? { code: error.code } : {}),
        error: error.message,
        severity: error.severity satisfies CareSeverity,
      },
      error.httpStatus,
    )
  }
  if (isPatientSelectionRequiredError(error)) {
    return jsonResponse(
      {
        code: error.code,
        error: error.message,
        severity: error.severity satisfies CareSeverity,
        patients: error.patients,
      },
      error.httpStatus,
    )
  }
  const message = error instanceof Error ? error.message : String(error)
  const status = message === 'Consultation not found' ? 404 : 500
  const userError = status === 404 ? SAFE_NOT_FOUND : SAFE_TECHNICAL
  return jsonResponse({ error: userError, severity: 'technical' satisfies CareSeverity }, status)
}

/** How a guardrail call failed. Coarse by design — no error string, no URL, no PHI. */
export type GuardrailFailureKind = 'timeout' | 'transport' | 'malformed_payload'

/**
 * P0-14f — the canonical verdict for a guardrail call that failed at the
 * transport level. P0-08 also maps unusable HTTP 200 bodies here
 * (`failure: 'malformed_payload'`) so empty `{}` never becomes a clinical pass.
 *
 * ## Two things point in opposite directions here, on purpose
 *
 * **The internal posture stays conservative.** `status: 'high_risk_continue'` is
 * what makes `send_message` move the consultation to `high_risk`, what makes
 * `save_demographics` refuse to downgrade an inherited verdict, and what makes
 * `resolveLibertyMDResumeStatus` resume a recovered consult cautiously. A screen
 * that did not run is not a screen that passed. Do not "simplify" this to a
 * pass — that is a false negative, and CONTEXT.md §4 prices those in missed MIs.
 *
 * **The user-facing description is about the app.** The old copy read "The
 * extended safety screen was unavailable. Seek urgent care if symptoms feel
 * severe or dangerous." — a clinical instruction, rendered in amber caution
 * chrome, caused by a socket. Two live `error_fail_cautious` rows are two people
 * told something about their body by a network fault. The message below states
 * what happened, owns it as ours, and gives no clinical instruction, because the
 * system has no clinical finding to report: it failed to look.
 *
 * `source` keeps the value `error_fail_cautious`. It is the discriminator
 * P0-14f AC1 turns on, it is what the production rows already carry, and
 * renaming it would break continuity of the live data.
 *
 * ## Why this lives in `lib/errors.ts` rather than in `lib/safety.ts`
 *
 * So that it can be tested. `lib/safety.ts` transitively imports `lib/config.ts`,
 * which calls `Deno.env.get` at module load, so importing it from
 * `tests/libertymd/` would need `--allow-env` that the `:policy` gate does not
 * grant, and would drag Deno-typed modules into the repo `tsc` program. This
 * module imports only `_shared/cors.ts`. P0-14f AC4 asks for an assertion that a
 * failing guardrail is technical *and* still cautious; that assertion has to be
 * able to construct this value. The *decision* to fail cautious still reads in
 * `lib/safety.ts`, at the `catch` that calls this.
 */
export function guardrailTransportFailureResult(failure: GuardrailFailureKind): GuardrailResult {
  return {
    status: 'high_risk_continue',
    risk_level: 'medium',
    crisis_type: 'guardrail_unavailable',
    force_end: false,
    is_emergency: false,
    care_setting: 'telehealth',
    message: 'A background safety check could not run just now. That is a problem on our side, not a finding about your health. Your consultation is continuing and is being handled carefully.',
    red_flags: [],
    source: 'error_fail_cautious',
    severity: severityForSafetySignal({ status: 'high_risk_continue', source: 'error_fail_cautious' }),
    // P0-14f AC1 — make the transport failure legible in the persisted record and
    // in `safety_state` on the consultation, not only in `source`.
    raw: { screened: false, failure, severity: 'technical' },
  }
}
