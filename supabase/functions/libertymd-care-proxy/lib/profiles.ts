/**
 * Profile and patient reads/writes.
 *
 * Moved verbatim from the index.ts request closure in L0-5 (pure structural
 * refactor). Ownership of a patient row is always re-checked against
 * `ctx.user.id` — identity comes from the JWT, never from the payload.
 *
 * P1-04: anonymous owners may not create additional patients via
 * `createPatient` (any relationship). Linked users may create dependent/other
 * only when age ≥ LIBERTYMD_MIN_PATIENT_AGE. Self remains ensureSelfPatient only.
 */
import {
  ADULTS_ONLY_CODE,
  SAFE_ADULTS_ONLY,
  SignInRequiredError,
  PatientCreateValidationError,
  ProfileCapReachedError,
  SelfUndeletableError,
  ageRangeErrorMessage,
} from './errors.ts'
import { addIdentityEvent } from './telemetry.ts'
import { avatarUrl, displayName } from './utils.ts'
import type { ProxyContext } from './context.ts'
import type {
  JsonObject,
  ManagedPatientListItem,
  PatientListItem,
  PatientRow,
} from './types.ts'

/**
 * Adults-only minimum age for patient create / demographics / ensure write
 * (DECISIONS · Profile age policy). P1-03 skip eligibility reuses the same floor.
 * Lifting later = change this constant **plus** clinical-content review
 * (interview/diagnosis/guardrail, scenarios) — see CARE-ARCHITECTURE.
 */
export const LIBERTYMD_MIN_PATIENT_AGE = 18

/**
 * P4-04 — max active patients per owner (includes `self` → ≤4 non-self).
 * Enforced on `create_patient` only. Merge Path 2 may leave owners above N
 * (documented residual — do not reopen merge).
 */
export const LIBERTYMD_MAX_ACTIVE_PATIENTS = 5

/** Sex values accepted for demographics skip / save (Q6A). Create path stays female|male. */
export const SKIP_ELIGIBLE_SEXES = [
  'female',
  'male',
  'intersex',
  'prefer_not_to_say',
] as const

/** Non-self create/edit sex allow-list (P4-04 S3). */
export const NON_SELF_SEXES = ['female', 'male'] as const

export { SignInRequiredError, PatientCreateValidationError, ProfileCapReachedError, SelfUndeletableError } from './errors.ts'
export {
  isSignInRequiredError,
  isPatientCreateValidationError,
  isProfileCapReachedError,
  isSelfUndeletableError,
} from './errors.ts'

/** P1-03 Q6A — integer age 18–120 and a known sex enum. */
export function isSkipEligiblePatient(patient: PatientRow | null | undefined): boolean {
  if (!patient) return false
  const age = typeof patient.age === 'number' ? patient.age : Number(patient.age)
  if (!Number.isInteger(age) || age < LIBERTYMD_MIN_PATIENT_AGE || age > 120) return false
  const sex = typeof patient.sex_at_birth === 'string' ? patient.sex_at_birth.trim() : ''
  return (SKIP_ELIGIBLE_SEXES as readonly string[]).includes(sex)
}

/** Non-PHI picker projection (Q8A) — completeness flags, no raw age/sex values. */
export function toPatientListItem(patient: PatientRow): PatientListItem {
  const age = typeof patient.age === 'number' ? patient.age : Number(patient.age)
  const has_age = Number.isInteger(age) && age >= LIBERTYMD_MIN_PATIENT_AGE && age <= 120
  const sex = typeof patient.sex_at_birth === 'string' ? patient.sex_at_birth.trim() : ''
  const has_sex = (SKIP_ELIGIBLE_SEXES as readonly string[]).includes(sex)
  return {
    id: patient.id,
    relationship: patient.relationship,
    display_label: patient.display_label,
    has_age,
    has_sex,
    is_complete: has_age && has_sex,
  }
}

/**
 * P4-04 Q3A — management list projection (linked-only). Includes age/sex for
 * AccountDrawer CRUD. Never used for intake picker / bootstrap `patients[]`.
 */
export function toManagedPatientListItem(patient: PatientRow): ManagedPatientListItem {
  const age = typeof patient.age === 'number' ? patient.age : Number(patient.age)
  return {
    id: patient.id,
    relationship: patient.relationship,
    display_label: patient.display_label,
    age: Number.isInteger(age) ? age : null,
    sex_at_birth: typeof patient.sex_at_birth === 'string' && patient.sex_at_birth.trim()
      ? patient.sex_at_birth.trim()
      : null,
  }
}

/** Active owned patients only (Q7A). Inactive never auto-bound. */
export async function listOwnedActivePatients(ctx: ProxyContext): Promise<PatientRow[]> {
  const { data, error } = await ctx.db
    .from('libertymd_patients')
    .select('*')
    .eq('owner_user_id', ctx.user.id)
    .eq('is_active', true)
  if (error) throw error
  return (Array.isArray(data) ? data : data ? [data] : []) as PatientRow[]
}

/**
 * P4-03 S5 — read-only id→display_label map for history grouping.
 * Includes soft-deleted (`is_active = false`) so past consults stay attributable.
 * No CRUD; ownership still JWT-scoped.
 */
export async function patientDisplayLabelsByIds(
  ctx: ProxyContext,
  patientIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(patientIds.map((id) => String(id || '').trim()).filter(Boolean))]
  const labels = new Map<string, string>()
  if (unique.length === 0) return labels
  const { data, error } = await ctx.db
    .from('libertymd_patients')
    .select('id,display_label,relationship')
    .eq('owner_user_id', ctx.user.id)
    .in('id', unique)
  if (error) throw error
  const rows = Array.isArray(data) ? data : data ? [data] : []
  for (const row of rows) {
    const id = typeof row?.id === 'string' ? row.id : ''
    if (!id) continue
    const raw = typeof row?.display_label === 'string' ? row.display_label.trim() : ''
    if (raw) {
      labels.set(id, raw.slice(0, 80))
      continue
    }
    labels.set(id, row?.relationship === 'self' ? 'Me' : 'Profile')
  }
  return labels
}

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

/**
 * Ensure the owner has a self patient row, then sync label/demographics.
 * P1-04 Q3: never clobber non-null age / sex_at_birth; display_label may refresh
 * from Google when present.
 */
export async function ensureSelfPatient(ctx: ProxyContext, profile: JsonObject): Promise<PatientRow> {
  const { db, user } = ctx
  const { data: patientId, error: ensureError } = await db.rpc('libertymd_ensure_self_patient', {
    p_user_id: user.id,
  })
  if (ensureError || !patientId) throw ensureError || new Error('Unable to create patient record')

  const { data: existing, error: readError } = await db
    .from('libertymd_patients')
    .select('*')
    .eq('id', patientId)
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (readError) throw readError

  const existingRow = (existing || null) as PatientRow | null
  const googleLabel = displayName(user) || (typeof profile.display_name === 'string' ? profile.display_name : null)
  const updates: JsonObject = {
    display_label: googleLabel || existingRow?.display_label || 'Me',
  }

  // Never overwrite non-null age/sex with null or unrelated values (P1-04 Q3).
  // P1-05: omit writing age when under-floor / non-integer — never clamp up.
  if (existingRow?.age == null) {
    const nextAge = profile.age
    if (
      typeof nextAge === 'number'
      && Number.isInteger(nextAge)
      && nextAge >= LIBERTYMD_MIN_PATIENT_AGE
      && nextAge <= 120
    ) {
      updates.age = nextAge
    }
  }
  if (existingRow?.sex_at_birth == null || existingRow.sex_at_birth === '') {
    const nextSex = profile.sex_at_birth
    updates.sex_at_birth = typeof nextSex === 'string' && nextSex ? nextSex : null
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

/**
 * P4-07 — lab attribution must be owned **and** active.
 * `getOwnedPatient` alone can return soft-deleted rows — do not use it for new binds.
 */
export async function getOwnedActivePatient(
  ctx: ProxyContext,
  patientId: string,
): Promise<PatientRow | null> {
  const { data, error } = await ctx.db
    .from('libertymd_patients')
    .select('*')
    .eq('id', patientId)
    .eq('owner_user_id', ctx.user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  return (data as PatientRow | null) ?? null
}

export interface CreatePatientInput {
  relationship: 'self' | 'dependent' | 'other' | string
  display_label?: string | null
  age?: number | string | null
  sex_at_birth?: string | null
}

/**
 * P1-04 create path. Anonymous → SignInRequiredError (zero insert).
 * Linked self → validation reject (self is ensure-only).
 * Linked dependent/other → age ≥ LIBERTYMD_MIN_PATIENT_AGE insert.
 */
export async function createPatient(ctx: ProxyContext, input: CreatePatientInput): Promise<PatientRow> {
  if (ctx.isAnonymous) {
    throw new SignInRequiredError()
  }

  const relationship = String(input.relationship || '').trim()
  if (relationship === 'self') {
    throw new PatientCreateValidationError('Self profile is managed automatically.')
  }
  if (relationship !== 'dependent' && relationship !== 'other') {
    throw new PatientCreateValidationError('Choose a valid profile relationship.')
  }

  const age = typeof input.age === 'number' ? input.age : Number(input.age)
  // P1-05 Q2: split under-floor (adults-only + care pointer) vs other invalid (neutral range).
  if (Number.isInteger(age) && age < LIBERTYMD_MIN_PATIENT_AGE) {
    throw new PatientCreateValidationError(SAFE_ADULTS_ONLY, { code: ADULTS_ONLY_CODE })
  }
  if (!Number.isInteger(age) || age > 120) {
    throw new PatientCreateValidationError(ageRangeErrorMessage(LIBERTYMD_MIN_PATIENT_AGE))
  }

  const sex = typeof input.sex_at_birth === 'string' ? input.sex_at_birth.trim() : ''
  if (sex !== 'female' && sex !== 'male') {
    throw new PatientCreateValidationError('Choose sex assigned at birth.')
  }

  const labelRaw = typeof input.display_label === 'string' ? input.display_label.trim() : ''
  const display_label = labelRaw.slice(0, 80) || (relationship === 'dependent' ? 'Family member' : 'Other')

  await ensureProfile(ctx)

  // P4-04 S1 — cap active profiles (includes self) before insert; zero insert on reject.
  const active = await listOwnedActivePatients(ctx)
  if (active.length >= LIBERTYMD_MAX_ACTIVE_PATIENTS) {
    throw new ProfileCapReachedError()
  }

  const { data, error } = await ctx.db
    .from('libertymd_patients')
    .insert({
      owner_user_id: ctx.user.id,
      relationship,
      display_label,
      age,
      sex_at_birth: sex,
      is_active: true,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as PatientRow
}

export interface UpdatePatientInput {
  patient_id: string
  display_label?: string | null
  age?: number | string | null
  sex_at_birth?: string | null
  /** Ignored / rejected — relationship is immutable after create (P4-04 S3). */
  relationship?: string | null
}

export interface UpdatePatientResult {
  patient: PatientRow
  /** Present when self age/sex dual-wrote `libertymd_profiles` (Q1B). */
  profile?: { age: number; sex_at_birth: string }
}

/**
 * P4-04 — update owned active patient. Self: age/sex only (dual-write profiles);
 * non-self: label + age + sex. Never touches consultation `patient_snapshot`.
 */
export async function updatePatient(ctx: ProxyContext, input: UpdatePatientInput): Promise<UpdatePatientResult> {
  if (ctx.isAnonymous) {
    throw new SignInRequiredError()
  }

  const patientId = String(input.patient_id || '').trim()
  if (!patientId) {
    throw new PatientCreateValidationError('Choose a profile to update.')
  }

  const existing = await getOwnedPatient(ctx, patientId)
  if (existing.is_active === false) {
    throw new PatientCreateValidationError('That profile is no longer active.')
  }

  const isSelf = existing.relationship === 'self'

  // Relationship immutable — reject any attempt to change it.
  if (input.relationship != null && String(input.relationship).trim() !== ''
    && String(input.relationship).trim() !== existing.relationship) {
    throw new PatientCreateValidationError('Profile relationship cannot be changed.')
  }

  // Q2B — self display_label not editable this ticket.
  if (isSelf && input.display_label != null && String(input.display_label).trim() !== '') {
    const nextLabel = String(input.display_label).trim().slice(0, 80)
    const currentLabel = typeof existing.display_label === 'string' ? existing.display_label.trim() : ''
    if (nextLabel !== currentLabel) {
      throw new PatientCreateValidationError('Your own display label cannot be changed here.')
    }
  }

  const age = typeof input.age === 'number' ? input.age : Number(input.age)
  if (Number.isInteger(age) && age < LIBERTYMD_MIN_PATIENT_AGE) {
    throw new PatientCreateValidationError(SAFE_ADULTS_ONLY, { code: ADULTS_ONLY_CODE })
  }
  if (!Number.isInteger(age) || age > 120) {
    throw new PatientCreateValidationError(ageRangeErrorMessage(LIBERTYMD_MIN_PATIENT_AGE))
  }

  const sex = typeof input.sex_at_birth === 'string' ? input.sex_at_birth.trim() : ''
  if (isSelf) {
    if (!(SKIP_ELIGIBLE_SEXES as readonly string[]).includes(sex)) {
      throw new PatientCreateValidationError('Choose a valid sex option.')
    }
  } else if (sex !== 'female' && sex !== 'male') {
    throw new PatientCreateValidationError('Choose sex assigned at birth.')
  }

  const updates: JsonObject = {
    age,
    sex_at_birth: sex,
  }

  if (!isSelf) {
    const labelRaw = typeof input.display_label === 'string' ? input.display_label.trim() : ''
    updates.display_label = labelRaw.slice(0, 80)
      || (existing.relationship === 'dependent' ? 'Family member' : 'Other')
  }

  const { data: patient, error: patientError } = await ctx.db
    .from('libertymd_patients')
    .update(updates)
    .eq('id', patientId)
    .eq('owner_user_id', ctx.user.id)
    .select('*')
    .single()
  if (patientError) throw patientError

  // Q1B — self dual-write profiles age/sex only. Never rewrite consult snapshots.
  let profile: UpdatePatientResult['profile']
  if (isSelf) {
    const { data: profileRow, error: profileError } = await ctx.db
      .from('libertymd_profiles')
      .update({ age, sex_at_birth: sex })
      .eq('user_id', ctx.user.id)
      .select('age,sex_at_birth')
      .single()
    if (profileError) throw profileError
    profile = {
      age: Number(profileRow?.age ?? age),
      sex_at_birth: String(profileRow?.sex_at_birth ?? sex),
    }
  }

  return { patient: patient as PatientRow, profile }
}

/**
 * P4-04 — soft-deactivate non-self owned patient (`is_active = false`).
 * Self → SelfUndeletableError. Allowed even with open/past consults (S4).
 * No reactivate in this ticket (S2).
 */
export async function deactivatePatient(ctx: ProxyContext, patientIdRaw: string): Promise<PatientRow> {
  if (ctx.isAnonymous) {
    throw new SignInRequiredError()
  }

  const patientId = String(patientIdRaw || '').trim()
  if (!patientId) {
    throw new PatientCreateValidationError('Choose a profile to remove.')
  }

  const existing = await getOwnedPatient(ctx, patientId)
  if (existing.relationship === 'self') {
    throw new SelfUndeletableError()
  }
  if (existing.is_active === false) {
    return existing
  }

  const { data, error } = await ctx.db
    .from('libertymd_patients')
    .update({ is_active: false })
    .eq('id', patientId)
    .eq('owner_user_id', ctx.user.id)
    .select('*')
    .single()
  if (error) throw error
  return data as PatientRow
}

/**
 * P4-04 Q3A — linked-only management list with age/sex.
 * Anonymous → SignInRequiredError (same fence as create).
 */
export async function listManagedPatients(ctx: ProxyContext): Promise<ManagedPatientListItem[]> {
  if (ctx.isAnonymous) {
    throw new SignInRequiredError()
  }
  const rows = await listOwnedActivePatients(ctx)
  return rows.map(toManagedPatientListItem)
}
