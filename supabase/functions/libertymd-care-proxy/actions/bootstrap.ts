/**
 * `bootstrap` — first call of a session: resolve profile, self patient, history.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 *
 * P1-03: also returns `patients[]` (active owned only, non-PHI completeness flags)
 * for the multi-profile picker. Anonymous remains ≤1 self (P1-04).
 *
 * P1-19: when `anon_session_key` is present, upsert a session-keyed landing row
 * from allow-listed attribution and return opaque `landing_session_id`.
 */
import { historySummary } from '../lib/consultations.ts'
import { jsonResponse } from '../lib/errors.ts'
import { upsertLandingSession } from '../lib/landing-sessions.ts'
import {
  ensureProfile,
  ensureSelfPatient,
  listOwnedActivePatients,
  toPatientListItem,
} from '../lib/profiles.ts'
import { firstName } from '../lib/utils.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { RequestPayload } from '../lib/types.ts'

export async function handleBootstrap(
  ctx: ProxyContext,
  payload: RequestPayload = { action: 'bootstrap' },
) {
  const profile = await ensureProfile(ctx)
  const patient = await ensureSelfPatient(ctx, profile)
  const activePatients = await listOwnedActivePatients(ctx)
  const patients = (activePatients.length > 0 ? activePatients : [patient]).map(toPatientListItem)

  // P1-19 Q1(C) — pre-consult landing upsert when session key is present.
  const landing = await upsertLandingSession(ctx, payload)

  return jsonResponse({
    user_id: ctx.user.id,
    is_anonymous: ctx.isAnonymous,
    greeting_name: firstName(ctx.user) || null,
    profile,
    patient,
    patients,
    history: await historySummary(ctx),
    ...(landing?.id ? { landing_session_id: landing.id } : {}),
  })
}
