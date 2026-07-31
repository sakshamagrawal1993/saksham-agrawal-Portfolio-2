/**
 * P1-04 — `create_patient` action.
 *
 * Anonymous JWT: always 403 + `code: 'sign_in_required'` + technical severity,
 * zero insert (any relationship including `self`).
 * Linked: `dependent` / `other` with age ≥ LIBERTYMD_MIN_PATIENT_AGE;
 * linked `self` rejected (self remains ensureSelfPatient only).
 */
import {
  isPatientCreateValidationError,
  isProfileCapReachedError,
  isSignInRequiredError,
  jsonResponse,
} from '../lib/errors.ts'
import { createPatient } from '../lib/profiles.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { RequestPayload } from '../lib/types.ts'

export async function handleCreatePatient(ctx: ProxyContext, payload: RequestPayload) {
  try {
    const patient = await createPatient(ctx, {
      relationship: payload.relationship ?? '',
      display_label: payload.display_label,
      age: payload.age,
      sex_at_birth: payload.sex_at_birth,
    })
    return jsonResponse({ patient })
  } catch (error) {
    if (isSignInRequiredError(error)) {
      return jsonResponse(
        {
          code: error.code,
          error: error.message,
          severity: error.severity,
        },
        error.httpStatus,
      )
    }
    if (isProfileCapReachedError(error)) {
      return jsonResponse(
        {
          code: error.code,
          error: error.message,
          severity: error.severity,
        },
        error.httpStatus,
      )
    }
    if (isPatientCreateValidationError(error)) {
      return jsonResponse(
        {
          ...(error.code ? { code: error.code } : {}),
          error: error.message,
          severity: error.severity,
        },
        error.httpStatus,
      )
    }
    throw error
  }
}
