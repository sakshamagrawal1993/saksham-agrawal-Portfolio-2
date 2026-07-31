/**
 * P4-05 — Merge collision rule contracts (Paths 0–2, collision_path, Lexicon fence).
 *
 * AC4 matrix + AC5/AC7 source contracts. SQL match/mismatch live in
 * `supabase/tests/libertymd_care_rls.test.sql` (test:libertymd:db — may CANNOT RUN).
 *
 * Run focused:
 *   deno test --no-config --no-check --allow-env --allow-read \
 *     tests/libertymd/merge-collision.mts tests/libertymd/merge-collision.test.ts
 * Wired into `test:libertymd:ci` via `test:libertymd:merge-collision`.
 */
import { handleCompleteAccountMerge, handleSyncIdentity } from '../../supabase/functions/libertymd-care-proxy/actions/identity.ts'
import {
  assertEquals,
  consultationRow,
  createFakeContext,
  opsFor,
} from './support/proxy-doubles.mts'

declare const Deno: { test: (name: string, fn: () => unknown | Promise<unknown>) => void }

Deno.test('P4-05 AC4(b): complete merge returns collision_path matched_self', async () => {
  const consultation = consultationRow({
    status: 'report_pending_auth',
    user_id: 'target-user',
  })
  const { ctx, ops } = createFakeContext({
    userId: 'target-user',
    isAnonymous: false,
    consultation,
    profile: { user_id: 'target-user', age: 34, sex_at_birth: 'female' },
    patient: { id: 'patient-target-self', relationship: 'self' },
    report: { report_data: { headline: 'ok' }, confidence_score: 70, access_status: 'withheld' },
    mergeCompleteRows: [{
      consultation_id: consultation.id,
      source_user_id: 'source-user',
      collision_path: 'matched_self',
    }],
  })
  const response = await handleCompleteAccountMerge(ctx, {
    action: 'complete_account_merge',
    consultation_id: consultation.id,
    transfer_token: 'token-match',
  })
  assertEquals(response.status, 200, 'merge success')
  const body = await response.json() as Record<string, unknown>
  assertEquals(body.collision_path, 'matched_self', 'HTTP collision_path matched_self')
  assertEquals(opsFor(ops, 'libertymd_complete_account_merge', 'rpc').length, 1, 'RPC invoked once')
})

Deno.test('P4-05 AC4(c): complete merge returns collision_path distinct_profile', async () => {
  const consultation = consultationRow({
    status: 'report_pending_auth',
    user_id: 'target-user',
  })
  const { ctx } = createFakeContext({
    userId: 'target-user',
    isAnonymous: false,
    consultation,
    profile: { user_id: 'target-user', age: 45, sex_at_birth: 'female' },
    patient: { id: 'patient-other', relationship: 'other' },
    report: { report_data: { headline: 'ok' }, confidence_score: 70, access_status: 'withheld' },
    mergeCompleteRows: [{
      consultation_id: consultation.id,
      source_user_id: 'source-user',
      collision_path: 'distinct_profile',
    }],
  })
  const response = await handleCompleteAccountMerge(ctx, {
    action: 'complete_account_merge',
    consultation_id: consultation.id,
    transfer_token: 'token-mismatch',
  })
  assertEquals(response.status, 200, 'merge success')
  const body = await response.json() as Record<string, unknown>
  assertEquals(body.collision_path, 'distinct_profile', 'HTTP collision_path distinct_profile')
})

Deno.test('P4-05 AC4(d): fail-closed merge abort returns error, no success Path enum', async () => {
  const consultation = consultationRow({ status: 'report_pending_auth' })
  const { ctx, ops } = createFakeContext({
    userId: 'target-user',
    isAnonymous: false,
    consultation,
    mergeCompleteError: { message: 'Account transfer could not save this visit safely' },
  })
  let threw = false
  try {
    await handleCompleteAccountMerge(ctx, {
      action: 'complete_account_merge',
      consultation_id: consultation.id,
      transfer_token: 'token-fail',
    })
  } catch {
    threw = true
  }
  assertEquals(threw, true, 'abort must throw (no success response)')
  assertEquals(opsFor(ops, 'libertymd_complete_account_merge', 'rpc').length, 1, 'RPC attempted')
  const failEvents = opsFor(ops, 'libertymd_identity_events', 'insert')
  assertEquals(failEvents.length >= 1, true, 'account_merge_failed identity_event recorded')
})

Deno.test('P4-05 AC4(a): Path 0 sync_identity does not require collision_path', async () => {
  const consultation = consultationRow({ status: 'report_pending_auth' })
  const { ctx, ops } = createFakeContext({
    userId: 'same-user',
    isAnonymous: false,
    consultation,
    profile: { user_id: 'same-user' },
    patient: { id: 'patient-1', relationship: 'self' },
    report: { report_data: { headline: 'ok' }, confidence_score: 70, access_status: 'withheld' },
  })
  const response = await handleSyncIdentity(ctx, {
    action: 'sync_identity',
    consultation_id: consultation.id,
  })
  assertEquals(response.status, 200, 'sync_identity success')
  const body = await response.json() as Record<string, unknown>
  assertEquals(body.collision_path, undefined, 'Path 0 omits collision_path')
  assertEquals(
    opsFor(ops, 'libertymd_complete_account_merge', 'rpc').length,
    0,
    'Path 0 without transfer_token does not call merge RPC',
  )
})
