/**
 * Profile and patient reads/writes.
 *
 * Moved verbatim from the index.ts request closure in L0-5 (pure structural
 * refactor). Ownership of a patient row is always re-checked against
 * `ctx.user.id` — identity comes from the JWT, never from the payload.
 */
import { addIdentityEvent } from './telemetry.ts'
import { avatarUrl, displayName } from './utils.ts'
import type { ProxyContext } from './context.ts'
import type { JsonObject, PatientRow } from './types.ts'

export async function ensureProfile(ctx: ProxyContext) {
  const { db, user, isAnonymous } = ctx
  const { data: existing, error } = await db
    .from('libertymd_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw error
  if (existing) {
    if (!isAnonymous) {
      const { data: updated, error: updateError } = await db
        .from('libertymd_profiles')
        .update({
          display_name: displayName(user) || existing.display_name,
          email: user.email,
          avatar_url: avatarUrl(user) || existing.avatar_url,
          identity_provider: String(user.app_metadata?.provider || 'google'),
          is_anonymous: false,
        })
        .eq('user_id', user.id)
        .select('*')
        .single()
      if (updateError) throw updateError
      return updated
    }
    return existing
  }

  const { data: created, error: upsertError } = await db
    .from('libertymd_profiles')
    .upsert({
      user_id: user.id,
      display_name: displayName(user),
      email: user.email || null,
      avatar_url: avatarUrl(user),
      identity_provider: isAnonymous ? 'anonymous' : String(user.app_metadata?.provider || 'google'),
      is_anonymous: isAnonymous,
    }, { onConflict: 'user_id' })
    .select('*')
    .single()
  if (upsertError) throw upsertError
  await addIdentityEvent(
    ctx,
    isAnonymous ? 'anonymous_profile_created' : 'google_link_completed',
    null,
    { source: 'profile_created' },
  )
  return created
}

export async function ensureSelfPatient(ctx: ProxyContext, profile: JsonObject): Promise<PatientRow> {
  const { db, user } = ctx
  const { data: patientId, error: ensureError } = await db.rpc('libertymd_ensure_self_patient', {
    p_user_id: user.id,
  })
  if (ensureError || !patientId) throw ensureError || new Error('Unable to create patient record')

  const updates = {
    display_label: displayName(user) || profile.display_name || 'Me',
    age: profile.age || null,
    sex_at_birth: profile.sex_at_birth || null,
  }
  const { data: patient, error: patientError } = await db
    .from('libertymd_patients')
    .update(updates)
    .eq('id', patientId)
    .eq('owner_user_id', user.id)
    .select('*')
    .single()
  if (patientError) throw patientError
  return patient as PatientRow
}

export async function getOrCreateSelfPatient(ctx: ProxyContext): Promise<PatientRow> {
  const { db, user } = ctx
  const { data: existing, error } = await db
    .from('libertymd_patients')
    .select('*')
    .eq('owner_user_id', user.id)
    .eq('relationship', 'self')
    .maybeSingle()
  if (error) throw error
  if (existing) return existing as PatientRow

  const profile = await ensureProfile(ctx)
  return ensureSelfPatient(ctx, profile)
}

export async function getOwnedPatient(ctx: ProxyContext, patientId: string): Promise<PatientRow> {
  const { data, error } = await ctx.db
    .from('libertymd_patients')
    .select('*')
    .eq('id', patientId)
    .eq('owner_user_id', ctx.user.id)
    .single()
  if (error) throw error
  return data as PatientRow
}
