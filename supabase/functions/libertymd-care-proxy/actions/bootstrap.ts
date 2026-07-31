/**
 * `bootstrap` — first call of a session: resolve profile, self patient, history.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 */
import { historySummary } from '../lib/consultations.ts'
import { jsonResponse } from '../lib/errors.ts'
import { ensureProfile, ensureSelfPatient } from '../lib/profiles.ts'
import { firstName } from '../lib/utils.ts'
import type { ProxyContext } from '../lib/context.ts'

export async function handleBootstrap(ctx: ProxyContext) {
  const profile = await ensureProfile(ctx)
  const patient = await ensureSelfPatient(ctx, profile)
  return jsonResponse({
    user_id: ctx.user.id,
    is_anonymous: ctx.isAnonymous,
    greeting_name: firstName(ctx.user) || null,
    profile,
    patient,
    history: await historySummary(ctx),
  })
}
