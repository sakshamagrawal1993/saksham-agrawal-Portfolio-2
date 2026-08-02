/**
 * P0-13 AC5 — attempt each hard-invariant violation and prove the proxy refuses
 * it before inference or persistence can occur.
 *
 * See support/proxy-doubles.mts for why this is a Deno `.mts` test.
 */
import './get-consultation-classification.mts'
import {
  addMessage,
  assertTurnWithinCap,
  InvariantViolation,
  updateOwnedConsultation,
} from '../../supabase/functions/libertymd-care-proxy/lib/consultations.ts'
import {
  PostEmergencyInferenceError,
  runDiagnosis,
  runInterview,
} from '../../supabase/functions/libertymd-care-proxy/lib/n8n-client.ts'
import {
  assertEquals,
  assertRejects,
  consultationRow,
  createFakeContext,
  okResponse,
  opsFor,
  stubFetch,
} from './support/proxy-doubles.mts'

declare const Deno: { test: (name: string, fn: () => unknown | Promise<unknown>) => void }

Deno.test('P0-13 AC1/AC5: a turn above 15 is rejected', async () => {
  await assertRejects(
    () => assertTurnWithinCap('consultation-1', 16),
    (error) => error instanceof InvariantViolation && error.invariant === 'max_turns',
    'turn 16 must be structurally impossible',
  )
})

Deno.test('P0-13 AC2/AC5: post-emergency Interview and Diagnosis calls are rejected', async () => {
  const consultation = consultationRow({ status: 'emergency_stopped' })
  const fetchLog = stubFetch(() => okResponse({ next_question: 'must not run' }))
  try {
    await assertRejects(
      () => runInterview([], {}, {}, [], null, 4, consultation.status, consultation.id),
      (error) =>
        error instanceof PostEmergencyInferenceError
        && error.stage === 'interview'
        && error.status === 'emergency_stopped',
      'post-emergency interview inference',
    )
    await assertRejects(
      () => runDiagnosis([], {}, consultation, {}),
      (error) =>
        error instanceof PostEmergencyInferenceError
        && error.stage === 'diagnosis'
        && error.status === 'emergency_stopped',
      'post-emergency diagnosis inference',
    )
    assertEquals(fetchLog.calls.length, 0, 'rejected inference must issue no network request')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P0-13 AC3/AC5: a message_type outside the closed enum is rejected', async () => {
  const { ctx, ops } = createFakeContext()
  await assertRejects(
    () => addMessage(ctx, consultationRow(), 'assistant', 'unsafe type attempt', {
      message_type: 'question',
    }),
    (error) => error instanceof InvariantViolation && error.invariant === 'message_type_enum',
    'invalid message_type',
  )
  assertEquals(opsFor(ops, 'libertymd_messages', 'insert').length, 0, 'invalid message type must not be written')
})

Deno.test('P0-13 AC4/AC5: a JWT subject cannot update another user consultation', async () => {
  const { ctx, ops } = createFakeContext({ userId: 'jwt-user' })
  const unowned = consultationRow({ user_id: 'different-user' })
  await assertRejects(
    () => updateOwnedConsultation(ctx, unowned, { status: 'completed' }),
    (error) =>
      error instanceof InvariantViolation
      && error.invariant === 'consultation_ownership'
      && error.httpStatus === 404,
    'cross-user consultation update',
  )
  assertEquals(opsFor(ops, 'libertymd_consultations', 'update').length, 0, 'unowned consultation must not be written')
})

/**
 * BUG-A regression — every `resolution_reason` the proxy writes must be a member
 * of the closed vocabulary enforced by
 * `libertymd_consultations_resolution_reason_check`.
 *
 * The turn-cap path wrote 'turn_limit_reached', which is not in the CHECK, so
 * every consult that reached MAX_TURNS failed its UPDATE and surfaced to the
 * user as a 500. A source scan is the right shape of test here: the values are
 * string literals in three different branches, and the failure mode is a value
 * that never appears in any unit fixture.
 */
Deno.test('BUG-A: resolution_reason literals stay inside the DB CHECK vocabulary', async () => {
  const ALLOWED = new Set([
    'high_confidence',
    'workflow_ready',
    'turn_limit_confident',
    'turn_limit_report',
    'low_diagnostic_confidence',
    'insufficient_clinical_information',
    'no_health_information',
  ])
  const dir = new URL('../../supabase/functions/libertymd-care-proxy/', import.meta.url)
  const files: string[] = []
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && entry.name.endsWith('.ts')) files.push(entry.name)
    if (entry.isDirectory) {
      for await (const sub of Deno.readDir(new URL(`${entry.name}/`, dir))) {
        if (sub.isFile && sub.name.endsWith('.ts')) files.push(`${entry.name}/${sub.name}`)
      }
    }
  }
  const offenders: string[] = []
  for (const file of files) {
    const src = await Deno.readTextFile(new URL(file, dir))
    for (const match of src.matchAll(/resolution_reason:\s*'([^']+)'/g)) {
      if (!ALLOWED.has(match[1])) offenders.push(`${file}: '${match[1]}'`)
    }
  }
  // Compare joined strings: the local assertEquals shim is identity-based, so
  // two distinct empty arrays would never be equal.
  assertEquals(offenders.join(', '), '', 'resolution_reason values outside the DB CHECK')
  assertEquals(files.length > 5, true, 'source scan must actually find proxy files')
})
