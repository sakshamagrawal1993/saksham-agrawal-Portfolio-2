/**
 * P4-04 — `list_owned_patients` management list (Q3A).
 *
 * Linked-only active owned rows with age/sex/label/relationship for AccountDrawer.
 * Keeps bootstrap `patients[]` non-PHI. Anonymous → 403 `sign_in_required`.
 */
import {
  isSignInRequiredError,
  jsonResponse,
} from '../lib/errors.ts'
import { listManagedPatients } from '../lib/profiles.ts'
import type { ProxyContext } from '../lib/context.ts'

export async function handleListOwnedPatients(ctx: ProxyContext) {
  try {
    const patients = await listManagedPatients(ctx)
    return jsonResponse({ patients })
  } catch (error) {
    if (isSignInRequiredError(error)) {
      return jsonResponse(
        { code: error.code, error: error.message, severity: error.severity },
        error.httpStatus,
      )
    }
    throw error
  }
}
