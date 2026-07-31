/**
 * P1-05 — adults-only profiles enforced.
 *
 * Asserts: create under-18 → adults_only + care-pointer + zero insert;
 * create over-120 / non-integer → neutral range (not adults_only);
 * demographics under-18 → same code/copy; ensureSelfPatient omits under-floor age;
 * LIBERTYMD_MIN_PATIENT_AGE wires save_demographics + wasPrefilled.
 *
 * Run focused: `deno test --no-config --no-check --allow-env --allow-read tests/libertymd/adults-only.mts`
 * Wired into `test:libertymd:ci` via `test:libertymd:adults-only`.
 */
import { handleCreatePatient } from '../../supabase/functions/libertymd-care-proxy/actions/create-patient.ts'
import { handleSaveDemographics } from '../../supabase/functions/libertymd-care-proxy/actions/save-demographics.ts'
import { handleUpdatePatient } from '../../supabase/functions/libertymd-care-proxy/actions/update-patient.ts'
import {
  ADULTS_ONLY_CODE,
  SAFE_ADULTS_ONLY,
} from '../../supabase/functions/libertymd-care-proxy/lib/errors.ts'
import {
  ensureSelfPatient,
  LIBERTYMD_MIN_PATIENT_AGE,
} from '../../supabase/functions/libertymd-care-proxy/lib/profiles.ts'
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
  })
  return { ctx, ops }
}

Deno.test('P1-05 AC1/Q5: create age 17 → adults_only + care pointer + zero insert', async () => {
  assertEquals(LIBERTYMD_MIN_PATIENT_AGE, 18, 'floor remains 18')
  const { ctx, ops } = linkedCtx()
  const response = await handleCreatePatient(ctx, {
    action: 'create_patient',
    relationship: 'other',
    age: 17,
    sex_at_birth: 'female',
  })
  assertEquals(response.status, 400)
  const body = await response.json() as Record<string, unknown>
  assertEquals(body.code, ADULTS_ONLY_CODE)
  assertEquals(body.error, SAFE_ADULTS_ONLY)
  assertEquals(body.severity, 'technical')
  assertTrue(String(body.error).includes('adults'), 'adults-only wording')
  assertTrue(String(body.error).includes('children and adolescents'), 'care pointer')
  assertEquals(opsFor(ops, 'libertymd_patients', 'insert').length, 0)
})

Deno.test('P1-05 Q2: create age 121 / non-integer → neutral range, not adults_only', async () => {
  const { ctx: ctx121, ops: ops121 } = linkedCtx()
  const over = await handleCreatePatient(ctx121, {
    action: 'create_patient',
    relationship: 'dependent',
    age: 121,
    sex_at_birth: 'male',
  })
  assertEquals(over.status, 400)
  const overBody = await over.json() as Record<string, unknown>
  assertEquals(overBody.code, undefined, 'no adults_only on over-120')
  assertEquals(overBody.error, `Enter an age from ${LIBERTYMD_MIN_PATIENT_AGE} to 120`)
  assertEquals(opsFor(ops121, 'libertymd_patients', 'insert').length, 0)

  const { ctx: ctxNaN, ops: opsNaN } = linkedCtx()
  const bad = await handleCreatePatient(ctxNaN, {
    action: 'create_patient',
    relationship: 'dependent',
    age: 'abc' as unknown as number,
    sex_at_birth: 'male',
  })
  assertEquals(bad.status, 400)
  const badBody = await bad.json() as Record<string, unknown>
  assertEquals(badBody.code, undefined)
  assertEquals(badBody.error, `Enter an age from ${LIBERTYMD_MIN_PATIENT_AGE} to 120`)
  assertEquals(opsFor(opsNaN, 'libertymd_patients', 'insert').length, 0)
})

Deno.test('P1-05 AC1: create age 18 still succeeds', async () => {
  const { ctx, ops } = linkedCtx()
  const response = await handleCreatePatient(ctx, {
    action: 'create_patient',
    relationship: 'dependent',
    display_label: 'Parent',
    age: LIBERTYMD_MIN_PATIENT_AGE,
    sex_at_birth: 'female',
  })
  assertEquals(response.status, 200)
  assertEquals(opsFor(ops, 'libertymd_patients', 'insert').length, 1)
})

Deno.test('P1-05 AC2: demographics age 17 → adults_only; no profile/patient write', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({
      status: 'awaiting_demographics',
      turn_count: 1,
      version: 1,
      target_slot: 'onset',
    }),
  })
  const response = await handleSaveDemographics(ctx, {
    action: 'save_demographics',
    consultation_id: 'consultation-1',
    age: 17,
    sex_at_birth: 'female',
    message: 'It started yesterday',
  })
  assertEquals(response.status, 400)
  const body = await response.json() as Record<string, unknown>
  assertEquals(body.code, ADULTS_ONLY_CODE)
  assertEquals(body.error, SAFE_ADULTS_ONLY)
  assertEquals(opsFor(ops, 'libertymd_profiles', 'update').length, 0)
  assertEquals(opsFor(ops, 'libertymd_patients', 'update').length, 0)
})

Deno.test('P1-05 Q2: demographics age 121 → neutral range, not adults_only', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({ status: 'awaiting_demographics', turn_count: 1, version: 1 }),
  })
  const response = await handleSaveDemographics(ctx, {
    action: 'save_demographics',
    consultation_id: 'consultation-1',
    age: 121,
    sex_at_birth: 'male',
    message: 'It started yesterday',
  })
  assertEquals(response.status, 400)
  const body = await response.json() as Record<string, unknown>
  assertEquals(body.code, undefined)
  assertEquals(body.error, `Enter an age from ${LIBERTYMD_MIN_PATIENT_AGE} to 120`)
  assertEquals(opsFor(ops, 'libertymd_profiles', 'update').length, 0)
})

Deno.test('P1-05 AC4: ensureSelfPatient omits under-floor age write (never clamps)', async () => {
  const existing = {
    id: 'patient-self-1',
    owner_user_id: 'user-1',
    relationship: 'self' as const,
    age: null as number | null,
    sex_at_birth: null as string | null,
    display_label: 'Me',
    gender_identity: null,
  }
  const { ctx, ops } = createFakeContext({
    isAnonymous: false,
    patient: existing,
    profile: {
      user_id: 'user-1',
      display_name: 'Guest',
      age: 12,
      sex_at_birth: 'female',
      is_anonymous: false,
    },
  })
  Object.assign(ctx, { isAnonymous: false })
  Object.assign(ctx.user, {
    email: 'google@example.com',
    is_anonymous: false,
    app_metadata: { provider: 'google' },
    user_metadata: { full_name: 'Google User' },
  })

  const after = await ensureSelfPatient(ctx, {
    user_id: 'user-1',
    display_name: 'Guest',
    age: 12,
    sex_at_birth: 'female',
  })
  assertEquals(after.age, null, 'under-floor age must not persist')
  const updates = opsFor(ops, 'libertymd_patients', 'update')
  assertTrue(updates.length >= 1, 'update ran')
  const payload = updates[updates.length - 1].payload as { age?: unknown }
  assertEquals(Object.prototype.hasOwnProperty.call(payload, 'age'), false, 'age key omitted from update')
})

Deno.test('P1-05 AC4: save_demographics + wasPrefilled bind LIBERTYMD_MIN_PATIENT_AGE', async () => {
  const source = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-care-proxy/actions/save-demographics.ts', import.meta.url),
  )
  assertTrue(source.includes('LIBERTYMD_MIN_PATIENT_AGE'), 'import/use shared constant')
  assertTrue(source.includes('ADULTS_ONLY_CODE'), 'adults_only code on under-floor')
  assertTrue(source.includes('wasPrefilled') && source.includes('LIBERTYMD_MIN_PATIENT_AGE'), 'wasPrefilled uses constant')
  // No magic floor literal in the age gate (constant must be the compare).
  if (/age < 18\b/.test(source) || /Number\(snapshot\.age\) >= 18\b/.test(source)) {
    throw new Error('save_demographics must not hardcode age floor 18')
  }
})

Deno.test('P4-04 AC3: update age 17 → adults_only + zero write; same constant', async () => {
  const patients = [{
    id: 'patient-other',
    owner_user_id: 'user-1',
    relationship: 'other',
    display_label: 'Sibling',
    age: 28,
    sex_at_birth: 'female',
    is_active: true,
  }]
  const { ctx: updateCtx, ops: updateOps } = linkedCtx({ patients })
  const response = await handleUpdatePatient(updateCtx, {
    action: 'update_patient',
    patient_id: 'patient-other',
    display_label: 'Sibling',
    age: 17,
    sex_at_birth: 'female',
  })
  assertEquals(response.status, 400)
  const body = await response.json() as Record<string, unknown>
  assertEquals(body.code, ADULTS_ONLY_CODE)
  assertEquals(body.error, SAFE_ADULTS_ONLY)
  assertEquals(body.severity, 'technical')
  assertEquals(opsFor(updateOps, 'libertymd_patients', 'update').length, 0)
  assertEquals(LIBERTYMD_MIN_PATIENT_AGE, 18, 'edit reuses create floor')
})

Deno.test('P4-04 AC3: update age 121 → neutral range, not adults_only', async () => {
  const { ctx, ops } = linkedCtx({
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
  const response = await handleUpdatePatient(ctx, {
    action: 'update_patient',
    patient_id: 'patient-other',
    display_label: 'Sibling',
    age: 121,
    sex_at_birth: 'female',
  })
  assertEquals(response.status, 400)
  const body = await response.json() as Record<string, unknown>
  assertEquals(body.code, undefined)
  assertEquals(body.error, `Enter an age from ${LIBERTYMD_MIN_PATIENT_AGE} to 120`)
  assertEquals(opsFor(ops, 'libertymd_patients', 'update').length, 0)
})
