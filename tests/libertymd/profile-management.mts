/**
 * P4-04 — Profile management CRUD contracts.
 *
 * Asserts: management list; update/delete; cap; snapshot immutability;
 * self dual-write; self label reject; self undeletable; picker non-PHI preserved;
 * UI source contracts for AccountDrawer CRUD.
 *
 * Run focused:
 *   deno test --no-config --no-check --allow-env --allow-read tests/libertymd/profile-management.mts
 * Wired into `test:libertymd:ci` via `test:libertymd:profile-management`.
 */
import { handleCreatePatient } from '../../supabase/functions/libertymd-care-proxy/actions/create-patient.ts'
import { handleDeletePatient } from '../../supabase/functions/libertymd-care-proxy/actions/delete-patient.ts'
import { handleListOwnedPatients } from '../../supabase/functions/libertymd-care-proxy/actions/list-owned-patients.ts'
import { handleUpdatePatient } from '../../supabase/functions/libertymd-care-proxy/actions/update-patient.ts'
import {
  LIBERTYMD_MAX_ACTIVE_PATIENTS,
  LIBERTYMD_MIN_PATIENT_AGE,
  toPatientListItem,
} from '../../supabase/functions/libertymd-care-proxy/lib/profiles.ts'
import {
  PROFILE_CAP_REACHED_CODE,
  SELF_UNDELETABLE_CODE,
} from '../../supabase/functions/libertymd-care-proxy/lib/errors.ts'
import {
  assertEquals,
  assertTrue,
  consultationRow,
  createFakeContext,
  opsFor,
} from './support/proxy-doubles.mts'

declare const Deno: {
  test: (name: string, fn: () => unknown | Promise<unknown>) => void
  readTextFile: (path: string | URL) => Promise<string>
}

function linkedCtx(options: Parameters<typeof createFakeContext>[0] = {}) {
  const { ctx, ops } = createFakeContext({
    isAnonymous: false,
    profile: { user_id: 'user-1', age: 44, sex_at_birth: 'male', is_anonymous: false },
    ...options,
  })
  Object.assign(ctx, { isAnonymous: false })
  Object.assign(ctx.user, {
    email: 'linked@example.com',
    is_anonymous: false,
    app_metadata: { provider: 'google' },
    user_metadata: { full_name: 'Linked User' },
  })
  return { ctx, ops }
}

function activePatients(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i === 0 ? 'patient-self' : `patient-${i}`,
    owner_user_id: 'user-1',
    relationship: i === 0 ? 'self' : 'other',
    display_label: i === 0 ? 'Me' : `Other ${i}`,
    age: 30 + i,
    sex_at_birth: i % 2 === 0 ? 'male' : 'female',
    is_active: true,
  }))
}

Deno.test('P4-04 AC1/Q3: list_owned_patients returns age/sex for linked owner', async () => {
  const patients = activePatients(2)
  const { ctx } = linkedCtx({ patients })
  const response = await handleListOwnedPatients(ctx)
  assertEquals(response.status, 200)
  const body = await response.json() as { patients?: Array<Record<string, unknown>> }
  assertEquals(Array.isArray(body.patients), true)
  assertEquals(body.patients?.length, 2)
  assertEquals(typeof body.patients?.[0]?.age, 'number')
  assertEquals(typeof body.patients?.[0]?.sex_at_birth, 'string')
  assertEquals(body.patients?.[0]?.has_age, undefined, 'management shape is not picker flags')
})

Deno.test('P4-04 AC3: anonymous list_owned_patients → sign_in_required', async () => {
  const { ctx, ops } = createFakeContext({ isAnonymous: true })
  const response = await handleListOwnedPatients(ctx)
  assertEquals(response.status, 403)
  const body = await response.json() as Record<string, unknown>
  assertEquals(body.code, 'sign_in_required')
  assertEquals(body.severity, 'technical')
  assertEquals(opsFor(ops, 'libertymd_patients', 'select').length, 0, 'zero patient read on anon fence')
})

Deno.test('P4-04 AC1: update non-self label/age/sex succeeds; no consult snapshot write', async () => {
  const consultation = consultationRow({
    patient_id: 'patient-other',
    patient_snapshot: { age: 40, sex_at_birth: 'female', display_label: 'Mom' },
  })
  const { ctx, ops } = linkedCtx({
    consultation,
    patients: [
      {
        id: 'patient-other',
        owner_user_id: 'user-1',
        relationship: 'other',
        display_label: 'Mom',
        age: 40,
        sex_at_birth: 'female',
        is_active: true,
      },
    ],
  })
  const response = await handleUpdatePatient(ctx, {
    action: 'update_patient',
    patient_id: 'patient-other',
    display_label: 'Mother',
    age: 42,
    sex_at_birth: 'female',
  })
  assertEquals(response.status, 200)
  const body = await response.json() as { patient?: { age?: number; display_label?: string } }
  assertEquals(body.patient?.age, 42)
  assertEquals(body.patient?.display_label, 'Mother')
  const patientUpdates = opsFor(ops, 'libertymd_patients', 'update')
  assertEquals(patientUpdates.length, 1)
  assertEquals(opsFor(ops, 'libertymd_profiles', 'update').length, 0, 'non-self does not dual-write profiles')
  const consultUpdates = opsFor(ops, 'libertymd_consultations', 'update')
  for (const op of consultUpdates) {
    const payload = op.payload as Record<string, unknown> | undefined
    assertTrue(!(payload && 'patient_snapshot' in payload), 'must not rewrite patient_snapshot')
  }
})

Deno.test('P4-04 AC5/Q1: self update dual-writes patients + profiles; snapshot untouched', async () => {
  const consultation = consultationRow({
    patient_id: 'patient-self',
    patient_snapshot: { age: 44, sex_at_birth: 'male' },
  })
  const { ctx, ops } = linkedCtx({
    consultation,
    patients: [{
      id: 'patient-self',
      owner_user_id: 'user-1',
      relationship: 'self',
      display_label: 'Me',
      age: 44,
      sex_at_birth: 'male',
      is_active: true,
    }],
    profile: { user_id: 'user-1', age: 44, sex_at_birth: 'male', is_anonymous: false },
  })
  const response = await handleUpdatePatient(ctx, {
    action: 'update_patient',
    patient_id: 'patient-self',
    age: 45,
    sex_at_birth: 'prefer_not_to_say',
  })
  assertEquals(response.status, 200)
  const body = await response.json() as {
    patient?: { age?: number; sex_at_birth?: string }
    profile?: { age?: number; sex_at_birth?: string }
  }
  assertEquals(body.patient?.age, 45)
  assertEquals(body.patient?.sex_at_birth, 'prefer_not_to_say')
  assertEquals(body.profile?.age, 45)
  assertEquals(body.profile?.sex_at_birth, 'prefer_not_to_say')
  assertEquals(opsFor(ops, 'libertymd_patients', 'update').length, 1)
  assertEquals(opsFor(ops, 'libertymd_profiles', 'update').length, 1)
  const consultUpdates = opsFor(ops, 'libertymd_consultations', 'update')
  for (const op of consultUpdates) {
    const payload = op.payload as Record<string, unknown> | undefined
    assertTrue(!(payload && 'patient_snapshot' in payload), 'self edit must not rewrite snapshots')
  }
})

Deno.test('P4-04 AC8/Q2: self display_label change rejected; zero label mutation', async () => {
  const { ctx, ops } = linkedCtx({
    patients: [{
      id: 'patient-self',
      owner_user_id: 'user-1',
      relationship: 'self',
      display_label: 'Me',
      age: 44,
      sex_at_birth: 'male',
      is_active: true,
    }],
  })
  const response = await handleUpdatePatient(ctx, {
    action: 'update_patient',
    patient_id: 'patient-self',
    display_label: 'Renamed Self',
    age: 44,
    sex_at_birth: 'male',
  })
  assertEquals(response.status, 400)
  assertEquals(opsFor(ops, 'libertymd_patients', 'update').length, 0)
})

Deno.test('P4-04 AC8: non-self sex outside female|male rejected; relationship immutable', async () => {
  const { ctx, ops } = linkedCtx({
    patients: [{
      id: 'patient-other',
      owner_user_id: 'user-1',
      relationship: 'other',
      display_label: 'Dad',
      age: 60,
      sex_at_birth: 'male',
      is_active: true,
    }],
  })
  const badSex = await handleUpdatePatient(ctx, {
    action: 'update_patient',
    patient_id: 'patient-other',
    display_label: 'Dad',
    age: 60,
    sex_at_birth: 'intersex',
  })
  assertEquals(badSex.status, 400)
  assertEquals(opsFor(ops, 'libertymd_patients', 'update').length, 0)

  const badRel = await handleUpdatePatient(ctx, {
    action: 'update_patient',
    patient_id: 'patient-other',
    relationship: 'self',
    display_label: 'Dad',
    age: 60,
    sex_at_birth: 'male',
  })
  assertEquals(badRel.status, 400)
})

Deno.test('P4-04 AC2: delete self → self_undeletable; is_active unchanged', async () => {
  const { ctx, ops } = linkedCtx({
    patients: [{
      id: 'patient-self',
      owner_user_id: 'user-1',
      relationship: 'self',
      display_label: 'Me',
      age: 44,
      sex_at_birth: 'male',
      is_active: true,
    }],
  })
  const response = await handleDeletePatient(ctx, {
    action: 'delete_patient',
    patient_id: 'patient-self',
  })
  assertEquals(response.status, 400)
  const body = await response.json() as Record<string, unknown>
  assertEquals(body.code, SELF_UNDELETABLE_CODE)
  assertEquals(body.severity, 'technical')
  assertEquals(opsFor(ops, 'libertymd_patients', 'update').length, 0, 'zero is_active flip')
})

Deno.test('P4-04 AC6: soft-delete non-self → is_active false; consults untouched', async () => {
  const consultation = consultationRow({ patient_id: 'patient-other' })
  const { ctx, ops } = linkedCtx({
    consultation,
    patients: [{
      id: 'patient-other',
      owner_user_id: 'user-1',
      relationship: 'other',
      display_label: 'Sibling',
      age: 28,
      sex_at_birth: 'female',
      is_active: true,
    }],
  })
  const response = await handleDeletePatient(ctx, {
    action: 'delete_patient',
    patient_id: 'patient-other',
  })
  assertEquals(response.status, 200)
  const body = await response.json() as { patient?: { is_active?: boolean } }
  assertEquals(body.patient?.is_active, false)
  const updates = opsFor(ops, 'libertymd_patients', 'update')
  assertEquals(updates.length, 1)
  assertEquals((updates[0].payload as { is_active?: boolean }).is_active, false)
  assertEquals(opsFor(ops, 'libertymd_consultations', 'update').length, 0)
  assertEquals(opsFor(ops, 'libertymd_consultations', 'insert').length, 0)
})

Deno.test('P4-04 AC7: at-cap create → profile_cap_reached + zero insert; under-cap succeeds', async () => {
  assertEquals(LIBERTYMD_MAX_ACTIVE_PATIENTS, 5)
  const atCap = linkedCtx({ patients: activePatients(5) })
  const fail = await handleCreatePatient(atCap.ctx, {
    action: 'create_patient',
    relationship: 'other',
    display_label: 'Extra',
    age: 33,
    sex_at_birth: 'female',
  })
  assertEquals(fail.status, 400)
  const failBody = await fail.json() as Record<string, unknown>
  assertEquals(failBody.code, PROFILE_CAP_REACHED_CODE)
  assertEquals(failBody.severity, 'technical')
  assertEquals(opsFor(atCap.ops, 'libertymd_patients', 'insert').length, 0)

  const under = linkedCtx({ patients: activePatients(4) })
  const ok = await handleCreatePatient(under.ctx, {
    action: 'create_patient',
    relationship: 'dependent',
    display_label: 'Parent',
    age: LIBERTYMD_MIN_PATIENT_AGE,
    sex_at_birth: 'male',
  })
  assertEquals(ok.status, 200)
  assertEquals(opsFor(under.ops, 'libertymd_patients', 'insert').length, 1)
})

Deno.test('P4-04 AC9: picker toPatientListItem stays non-PHI (no raw age/sex)', () => {
  const item = toPatientListItem({
    id: 'p1',
    owner_user_id: 'user-1',
    relationship: 'other',
    display_label: 'X',
    age: 55,
    sex_at_birth: 'female',
    gender_identity: null,
    is_active: true,
  })
  assertEquals(item.has_age, true)
  assertEquals(item.has_sex, true)
  assertEquals(item.is_complete, true)
  assertEquals('age' in item, false)
  assertEquals('sex_at_birth' in item, false)
})

Deno.test('P4-04 AC1/AC10: UI + proxy registration + CARE source contracts', async () => {
  const care = await Deno.readTextFile(new URL('../../docs/libertymd/CARE-ARCHITECTURE.md', import.meta.url))
  assertTrue(care.includes('LIBERTYMD_MAX_ACTIVE_PATIENTS = 5'))
  assertTrue(care.includes('profile_cap_reached'))
  assertTrue(care.includes('self_undeletable'))
  assertTrue(care.includes('list_owned_patients'))
  assertTrue(care.includes('patient_snapshot'))
  assertTrue(care.includes('Merge Path 2 residual') || care.includes('Path 2'))

  const index = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-care-proxy/index.ts', import.meta.url),
  )
  assertTrue(index.includes("'update_patient'"))
  assertTrue(index.includes("'delete_patient'"))
  assertTrue(index.includes("'list_owned_patients'"))

  const updateSrc = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-care-proxy/actions/update-patient.ts', import.meta.url),
  )
  // Handler documents snapshot immutability; must not UPDATE consultations.
  assertTrue(updateSrc.includes('Never rewrites consultation patient_snapshot') || updateSrc.includes('patient_snapshot'))
  assertTrue(!/from\(['"]libertymd_consultations['"]\)/.test(updateSrc), 'update action must not touch consultations')

  const profilesSrc = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-care-proxy/lib/profiles.ts', import.meta.url),
  )
  assertTrue(profilesSrc.includes('Never touches consultation `patient_snapshot`') || profilesSrc.includes('patient_snapshot'))
  assertTrue(!/from\(['"]libertymd_consultations['"]\)/.test(
    profilesSrc.slice(profilesSrc.indexOf('export async function updatePatient')),
  ), 'updatePatient helper must not write consultations')

  const panel = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDProfileManagementPanel.tsx', import.meta.url),
  )
  assertTrue(panel.includes('data-libertymd-profile-management'))
  assertTrue(panel.includes('data-libertymd-profile-delete-confirm'))
  assertTrue(panel.includes('data-libertymd-profile-create'))
  assertTrue(!panel.includes('window.confirm'))

  const drawer = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDCareControls.tsx', import.meta.url),
  )
  assertTrue(drawer.includes('profileManagement'))
  assertTrue(drawer.includes('LibertyMDProfileManagementPanel'))

  const chat = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDChat.tsx', import.meta.url),
  )
  const app = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDApp.tsx', import.meta.url),
  )
  assertTrue(chat.includes('profileManagement={profileManagementHandlers}'))
  assertTrue(app.includes('profileManagement={profileManagementHandlers}'))
  assertTrue(!chat.includes(".from('libertymd_patients')"))
  assertTrue(!app.includes(".from('libertymd_patients')"))

  const taxonomy = await Deno.readTextFile(
    new URL('../../components/LibertyMD/libertymd-failure-taxonomy.ts', import.meta.url),
  )
  assertTrue(taxonomy.includes('profile_cap_reached'))
  assertTrue(taxonomy.includes('self_undeletable'))
  assertTrue(taxonomy.includes('classifyProfileManagementFailure'))

  const profiles = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-care-proxy/lib/profiles.ts', import.meta.url),
  )
  assertTrue(profiles.includes('LIBERTYMD_MAX_ACTIVE_PATIENTS = 5'))
  assertTrue(profiles.includes('LIBERTYMD_MIN_PATIENT_AGE'))
})
