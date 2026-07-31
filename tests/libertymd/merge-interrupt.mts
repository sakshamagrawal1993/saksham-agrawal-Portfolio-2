/**
 * P1-25 — prepare_account_merge status gate (proxy handler contracts).
 *
 * AC1/AC2/AC3: prepare returns 409 unless owned consult is report_pending_auth;
 * interviewing / high_risk never insert libertymd_account_merges.
 *
 * See support/proxy-doubles.mts for why this is a Deno `.mts` test.
 *
 * Run focused: `deno test --no-config --no-check --allow-env tests/libertymd/merge-interrupt.mts`
 * Wired into `test:libertymd:ci` via `test:libertymd:merge-interrupt`.
 */
import { handlePrepareAccountMerge } from '../../supabase/functions/libertymd-care-proxy/actions/identity.ts'
import {
  assertEquals,
  consultationRow,
  createFakeContext,
  opsFor,
} from './support/proxy-doubles.mts'

declare const Deno: { test: (name: string, fn: () => unknown | Promise<unknown>) => void }

async function prepareForStatus(status: string) {
  const consultation = consultationRow({ status: status as 'interviewing' })
  const { ctx, ops } = createFakeContext({
    isAnonymous: true,
    consultation,
  })
  const response = await handlePrepareAccountMerge(ctx, {
    action: 'prepare_account_merge',
    consultation_id: consultation.id,
  })
  return { response, ops, body: await response.json() as Record<string, unknown> }
}

Deno.test('P1-25 AC1: prepare rejects interviewing with 409, zero merge insert', async () => {
  const { response, ops, body } = await prepareForStatus('interviewing')
  assertEquals(response.status, 409, 'interviewing prepare must be 409')
  assertEquals(body.error, 'Report is not ready')
  assertEquals(opsFor(ops, 'libertymd_account_merges', 'insert').length, 0, 'no merge row mid-interview')
})

Deno.test('P1-25 AC1: prepare rejects high_risk with 409, zero merge insert', async () => {
  const { response, ops, body } = await prepareForStatus('high_risk')
  assertEquals(response.status, 409, 'high_risk prepare must be 409')
  assertEquals(body.error, 'Report is not ready')
  assertEquals(opsFor(ops, 'libertymd_account_merges', 'insert').length, 0, 'no merge row during high_risk')
})

Deno.test('P1-25 AC1: prepare allows report_pending_auth (token issuance path)', async () => {
  const consultation = consultationRow({ status: 'report_pending_auth' })
  const { ctx, ops } = createFakeContext({
    isAnonymous: true,
    consultation,
  })
  const response = await handlePrepareAccountMerge(ctx, {
    action: 'prepare_account_merge',
    consultation_id: consultation.id,
  })
  assertEquals(response.status, 200, 'gate status must allow prepare')
  const body = await response.json() as { transfer_token?: string; expires_in_seconds?: number }
  assertEquals(typeof body.transfer_token, 'string', 'transfer token returned')
  assertEquals(body.expires_in_seconds, 600)
  assertEquals(opsFor(ops, 'libertymd_account_merges', 'insert').length, 1, 'merge row inserted at gate only')
})
