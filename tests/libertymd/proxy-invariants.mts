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
