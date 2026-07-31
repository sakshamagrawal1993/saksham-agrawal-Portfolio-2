/**
 * P4-04 — `update_patient` action.
 *
 * Linked: update owned active patient (self age/sex dual-write profiles;
 * non-self label/age/sex). Adults-only via LIBERTYMD_MIN_PATIENT_AGE.
 * Anonymous → 403 sign_in_required. Never rewrites consultation patient_snapshot.
 */
import {
  isPatientCreateValidationError,
  isSignInRequiredError,
  jsonResponse,
} from '../lib/errors.ts'
import { updatePatient } from '../lib/profiles.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { RequestPayload } from '../lib/types.ts'

export async function handleUpdatePatient(ctx: ProxyContext, payload: RequestPayload) {
  try {
    const result = await updatePatient(ctx, {
      patient_id: payload.patient_id ?? '',
      display_label: payload.display_label,
      age: payload.age,
      sex_at_birth: payload.sex_at_birth,
      relationship: payload.relationship,
    })
    return jsonResponse({
      patient: result.patient,
      ...(result.profile ? { profile: result.profile } : {}),
    })
  } catch (error) {
    if (isSignInRequiredError(error)) {
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
