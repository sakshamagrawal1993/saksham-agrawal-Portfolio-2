/// <reference lib="deno.ns" />

import {
  isLibertyMDResumableStatus,
  resolveLibertyMDResumeStatus,
} from '../../supabase/functions/libertymd-care-proxy/session-recovery.ts'

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

Deno.test('abandoned consultations resume from their preserved active state', () => {
  for (const status of ['awaiting_demographics', 'interviewing', 'high_risk'] as const) {
    assertEquals(
      resolveLibertyMDResumeStatus({ abandoned_from_status: status }),
      status,
      `Expected ${status} to be restored`,
    )
  }
})

Deno.test('legacy abandoned consultation without demographics resumes at demographics', () => {
  assertEquals(
    resolveLibertyMDResumeStatus({ filled_slots: { chief_complaint: 'headache' } }),
    'awaiting_demographics',
    'Missing demographics must not skip the demographic gate',
  )
})

Deno.test('legacy abandoned consultation restores a high-risk interview safely', () => {
  assertEquals(
    resolveLibertyMDResumeStatus({
      filled_slots: { age: 42, sex_at_birth: 'female' },
      safety_state: { status: 'high_risk_continue' },
    }),
    'high_risk',
    'High-risk safety state must be preserved',
  )
})

Deno.test('legacy abandoned consultation with demographics resumes normal interview', () => {
  assertEquals(
    resolveLibertyMDResumeStatus({
      filled_slots: { age: 42, sex_at_birth: 'female' },
      safety_state: { status: 'pass' },
    }),
    'interviewing',
    'Complete demographics should restore the interview',
  )
})

Deno.test('terminal statuses are never treated as resumable states', () => {
  for (const status of ['completed', 'emergency_stopped', 'clinical_review_needed', 'report_pending_auth']) {
    assertEquals(isLibertyMDResumableStatus(status), false, `${status} must stay terminal`)
  }
})
