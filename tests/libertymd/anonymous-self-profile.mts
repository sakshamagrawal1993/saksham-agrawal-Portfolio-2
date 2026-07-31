/**
 * P1-04 — anonymous = single self profile.
 *
 * Asserts: anonymous create_patient rejects (403 + sign_in_required + zero insert)
 * for dependent / self; linked dependent ≥18 succeeds; linked self rejected;
 * ensureSelfPatient does not clobber non-null age/sex (AC3); label may refresh.
 *
 * See support/proxy-doubles.mts for why this is a Deno `.mts` test.
 *
 * Run focused: `deno test --no-config --no-check --allow-env tests/libertymd/anonymous-self-profile.mts`
 * Wired into `test:libertymd:ci` via `test:libertymd:anonymous-self`.
 */
import { handleCreatePatient } from '../../supabase/functions/libertymd-care-proxy/actions/create-patient.ts'
import { handleDeletePatient } from '../../supabase/functions/libertymd-care-proxy/actions/delete-patient.ts'
import { handleUpdatePatient } from '../../supabase/functions/libertymd-care-proxy/actions/update-patient.ts'
import { handleSyncIdentity } from '../../supabase/functions/libertymd-care-proxy/actions/identity.ts'
import {
  ensureSelfPatient,
  LIBERTYMD_MIN_PATIENT_AGE,
} from '../../supabase/functions/libertymd-care-proxy/lib/profiles.ts'
import {
  assertEquals,
  createFakeContext,
  opsFor,
} from './support/proxy-doubles.mts'

declare const Deno: { test: (name: string, fn: () => unknown | Promise<unknown>) => void }

Deno.test('P1-04 AC1/AC4: anonymous create_patient(dependent) → 403 sign_in_required, zero insert', async () => {
  const { ctx, ops } = createFakeContext({ isAnonymous: true })
  const response = await handleCreatePatient(ctx, {
    action: 'create_patient',
    relationship: 'dependent',
    display_label: 'Family member',
    age: 30,
    sex_at_birth: 'female',
  })
  assertEquals(response.status, 403, 'anonymous create must be 403')
  const body = await response.json() as Record<string, unknown>
  assertEquals(body.code, 'sign_in_required', 'stable reject code')
  assertEquals(body.severity, 'technical', 'technical severity')
  assertEquals(typeof body.error, 'string', 'safe error string')
  assertEquals(opsFor(ops, 'libertymd_patients', 'insert').length, 0, 'zero insert')
})

Deno.test('P1-04 Q7: anonymous create_patient(self) → 403 sign_in_required, zero insert', async () => {
  const { ctx, ops } = createFakeContext({ isAnonymous: true })
  const response = await handleCreatePatient(ctx, {
    action: 'create_patient',
    relationship: 'self',
    age: 40,
    sex_at_birth: 'male',
  })
  assertEquals(response.status, 403, 'anonymous self create must be 403')
  const body = await response.json() as Record<string, unknown>
  assertEquals(body.code, 'sign_in_required')
  assertEquals(opsFor(ops, 'libertymd_patients', 'insert').length, 0, 'zero insert for anonymous self')
})

Deno.test('P1-04 Q1A: linked create_patient(dependent, age≥18) succeeds', async () => {
  const { ctx, ops } = createFakeContext({
    isAnonymous: false,
    profile: { user_id: 'user-1', age: 44, sex_at_birth: 'male', is_anonymous: false },
  })
  // Linked context: createFakeContext defaults isAnonymous true — override user.
  Object.assign(ctx, { isAnonymous: false })
  Object.assign(ctx.user, {
    email: 'linked@example.com',
    is_anonymous: false,
    app_metadata: { provider: 'google' },
    user_metadata: { full_name: 'Linked User' },
  })

  const response = await handleCreatePatient(ctx, {
    action: 'create_patient',
    relationship: 'dependent',
    display_label: 'Parent',
    age: LIBERTYMD_MIN_PATIENT_AGE,
    sex_at_birth: 'female',
  })
  assertEquals(response.status, 200, 'linked adult dependent create must succeed')
  const body = await response.json() as { patient?: { relationship?: string; age?: number } }
  assertEquals(body.patient?.relationship, 'dependent')
  assertEquals(body.patient?.age, LIBERTYMD_MIN_PATIENT_AGE)
  assertEquals(opsFor(ops, 'libertymd_patients', 'insert').length, 1, 'one insert')
})

Deno.test('P1-04 Q1A: linked create_patient(self) rejected; age < 18 rejected', async () => {
  const { ctx, ops } = createFakeContext({ isAnonymous: false })
  Object.assign(ctx, { isAnonymous: false })
  Object.assign(ctx.user, {
    email: 'linked@example.com',
    is_anonymous: false,
    app_metadata: { provider: 'google' },
  })

  const selfRes = await handleCreatePatient(ctx, {
    action: 'create_patient',
    relationship: 'self',
    age: 40,
    sex_at_birth: 'male',
  })
  assertEquals(selfRes.status, 400, 'linked self via create_patient rejected')
  assertEquals(opsFor(ops, 'libertymd_patients', 'insert').length, 0)

  const underage = await handleCreatePatient(ctx, {
    action: 'create_patient',
    relationship: 'other',
    age: 17,
    sex_at_birth: 'female',
  })
  assertEquals(underage.status, 400, 'age < 18 rejected')
  const underBody = await underage.json() as Record<string, unknown>
  assertEquals(underBody.code, 'adults_only', 'P1-05 adults_only code')
  assertEquals(
    typeof underBody.error === 'string' && underBody.error.includes('adults'),
    true,
    'P1-05 adults-only copy',
  )
  assertEquals(opsFor(ops, 'libertymd_patients', 'insert').length, 0)
})

Deno.test('P1-04 AC3: ensureSelfPatient keeps id + age/sex; label may refresh from Google', async () => {
  const existing = {
    id: 'patient-self-1',
    owner_user_id: 'user-1',
    relationship: 'self' as const,
    age: 42,
    sex_at_birth: 'female',
    display_label: 'Me',
    gender_identity: null,
  }
  const { ctx, ops } = createFakeContext({
    isAnonymous: false,
    patient: existing,
    profile: {
      user_id: 'user-1',
      display_name: 'Guest Name',
      age: null,
      sex_at_birth: null,
      is_anonymous: false,
    },
  })
  Object.assign(ctx, { isAnonymous: false })
  Object.assign(ctx.user, {
    email: 'google@example.com',
    is_anonymous: false,
    app_metadata: { provider: 'google' },
    user_metadata: { full_name: 'Google Name' },
  })

  const after = await ensureSelfPatient(ctx, {
    display_name: 'Guest Name',
    age: null,
    sex_at_birth: null,
  })

  assertEquals(after.id, existing.id, 'same patient id')
  assertEquals(after.age, 42, 'age not clobbered by null')
  assertEquals(after.sex_at_birth, 'female', 'sex not clobbered by null')
  assertEquals(after.display_label, 'Google Name', 'label may refresh from Google')

  const updates = opsFor(ops, 'libertymd_patients', 'update')
  assertEquals(updates.length >= 1, true, 'update issued')
  const payload = updates[0]?.payload as Record<string, unknown>
  assertEquals('age' in (payload || {}), false, 'age key omitted when existing non-null')
  assertEquals('sex_at_birth' in (payload || {}), false, 'sex key omitted when existing non-null')
})

Deno.test('P1-04 AC3: sync_identity leaves self id + demographics intact', async () => {
  const existing = {
    id: 'patient-self-2',
    owner_user_id: 'user-1',
    relationship: 'self' as const,
    age: 55,
    sex_at_birth: 'male',
    display_label: 'Me',
    gender_identity: null,
  }
  const { ctx } = createFakeContext({
    isAnonymous: false,
    patient: existing,
    profile: {
      user_id: 'user-1',
      display_name: 'Prior',
      age: 55,
      sex_at_birth: 'male',
      is_anonymous: false,
    },
    consultation: null,
  })
  Object.assign(ctx, { isAnonymous: false })
  Object.assign(ctx.user, {
    email: 'google@example.com',
    email_confirmed_at: '2026-07-31T00:00:00Z',
    is_anonymous: false,
    app_metadata: { provider: 'google' },
    user_metadata: { full_name: 'Linked Google' },
  })

  const response = await handleSyncIdentity(ctx, { action: 'sync_identity' })
  assertEquals(response.status, 200)
  const body = await response.json() as {
    patient?: { id?: string; age?: number; sex_at_birth?: string }
    profile?: { is_anonymous?: boolean }
    is_anonymous?: boolean
  }
  assertEquals(body.patient?.id, existing.id)
  assertEquals(body.patient?.age, 55)
  assertEquals(body.patient?.sex_at_birth, 'male')
  assertEquals(body.is_anonymous, false)
  assertEquals(body.profile?.is_anonymous, false)
})

// ---------------------------------------------------------------------------
// P4-04 extensions — anonymous fence on update / delete
// ---------------------------------------------------------------------------

Deno.test('P4-04 AC4: anonymous update_patient → 403 sign_in_required, zero write', async () => {
  const { ctx, ops } = createFakeContext({ isAnonymous: true })
  const response = await handleUpdatePatient(ctx, {
    action: 'update_patient',
    patient_id: 'patient-1',
    age: 40,
    sex_at_birth: 'female',
  })
  assertEquals(response.status, 403)
  const body = await response.json() as Record<string, unknown>
  assertEquals(body.code, 'sign_in_required')
  assertEquals(body.severity, 'technical')
  assertEquals(opsFor(ops, 'libertymd_patients', 'update').length, 0)
  assertEquals(opsFor(ops, 'libertymd_profiles', 'update').length, 0)
})

Deno.test('P4-04 AC4: anonymous delete_patient → 403 sign_in_required, zero write', async () => {
  const { ctx, ops } = createFakeContext({ isAnonymous: true })
  const response = await handleDeletePatient(ctx, {
    action: 'delete_patient',
    patient_id: 'patient-1',
  })
  assertEquals(response.status, 403)
  const body = await response.json() as Record<string, unknown>
  assertEquals(body.code, 'sign_in_required')
  assertEquals(opsFor(ops, 'libertymd_patients', 'update').length, 0)
})
