/**
 * P4-04 — `delete_patient` action (soft-deactivate).
 *
 * Sets `is_active = false` for non-self owned patients. Self → 400
 * `self_undeletable`. Anonymous → 403 `sign_in_required`. Allowed even when
 * open/past consults reference the patient_id. No reactivate.
 */
import {
  isPatientCreateValidationError,
  isSelfUndeletableError,
  isSignInRequiredError,
  jsonResponse,
} from '../lib/errors.ts'
import { deactivatePatient } from '../lib/profiles.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { RequestPayload } from '../lib/types.ts'

export async function handleDeletePatient(ctx: ProxyContext, payload: RequestPayload) {
  try {
    const patient = await deactivatePatient(ctx, payload.patient_id ?? '')
    return jsonResponse({ patient })
  } catch (error) {
    if (isSignInRequiredError(error)) {
      return jsonResponse(
        { code: error.code, error: error.message, severity: error.severity },
        error.httpStatus,
      )
    }
    if (isSelfUndeletableError(error)) {
      return jsonResponse(
        { code: error.code, error: error.message, severity: error.severity },
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
