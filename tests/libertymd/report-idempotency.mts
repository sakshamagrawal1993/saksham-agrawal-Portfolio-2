/**
 * P2-07 — report insert-once / clinical immutability (thin suite).
 *
 * Covers helper conflict path + migration trigger presence. Full send_message
 * orphan / speculative cases live in speculative-diagnosis.mts.
 */
import { ensureReportInserted } from '../../supabase/functions/libertymd-care-proxy/lib/report-persistence.ts'
import {
  assertEquals,
  assertTrue,
  createFakeContext,
  opsFor,
} from './support/proxy-doubles.mts'

declare const Deno: {
  test: (name: string, fn: () => unknown | Promise<unknown>) => void
  readTextFile: (path: string) => Promise<string>
}

const MIGRATION =
  new URL('../../supabase/migrations/20260731220000_libertymd_report_insert_once_p2_07.sql', import.meta.url)

Deno.test('P2-07 · migration ships BEFORE UPDATE clinical guard', async () => {
  const sql = await Deno.readTextFile(MIGRATION)
  assertTrue(/libertymd_reports_reject_clinical_update/i.test(sql), 'reject function')
  assertTrue(/before update on public\.libertymd_reports/i.test(sql), 'BEFORE UPDATE trigger')
  assertTrue(/report_data/i.test(sql) && /confidence_score/i.test(sql), 'clinical columns guarded')
  assertTrue(/final_diagnostic_run_id/i.test(sql) && /model_metadata/i.test(sql), 'FK + metadata guarded')
})

Deno.test('P2-07 AC2/AC3 · ensureReportInserted is insert-once; conflict re-selects winner', async () => {
  const { ctx, ops } = createFakeContext({
    reportInsertConflict: true,
    reportConflictExisting: {
      id: 'report-winner',
      consultation_id: 'consultation-1',
      user_id: 'user-1',
      report_data: { differential_diagnosis: [{ name: 'winner' }] },
      confidence_score: 90,
      final_diagnostic_run_id: 'run-winner',
      access_status: 'withheld',
      model_metadata: { source: 'libertymd-diagnosis' },
    },
  })

  const result = await ensureReportInserted(ctx, {
    consultationId: 'consultation-1',
    userId: 'user-1',
    reportData: { differential_diagnosis: [{ name: 'loser retry' }] },
    confidenceScore: 70,
    finalDiagnosticRunId: 'run-loser',
    accessStatus: 'withheld',
    releasedAt: null,
    retentionExpiresAt: null,
    modelMetadata: { source: 'libertymd-diagnosis', turn_count: 9 },
  })

  assertEquals(result.inserted, false, 'conflict → not inserted')
  assertEquals(result.report.final_diagnostic_run_id, 'run-winner', 'FK stays first-insert source')
  assertEquals(
    (result.report.report_data as { differential_diagnosis?: Array<{ name?: string }> })
      ?.differential_diagnosis?.[0]?.name,
    'winner',
    'clinical body not clobbered',
  )
  assertEquals(opsFor(ops, 'libertymd_reports', 'upsert').length, 0, 'never upsert')
  assertTrue(opsFor(ops, 'libertymd_reports', 'insert').length >= 1, 'attempted insert')
})

Deno.test('P2-07 AC1 · first insert materialises clinical body + FK', async () => {
  const { ctx, ops } = createFakeContext()
  const result = await ensureReportInserted(ctx, {
    consultationId: 'consultation-1',
    userId: 'user-1',
    reportData: { differential_diagnosis: [{ name: 'fresh' }] },
    confidenceScore: 82,
    finalDiagnosticRunId: 'run-fresh',
    accessStatus: 'withheld',
    releasedAt: null,
    retentionExpiresAt: '2030-01-01T00:00:00.000Z',
    modelMetadata: { source: 'libertymd-diagnosis', turn_count: 8 },
  })
  assertEquals(result.inserted, true)
  assertEquals(result.report.final_diagnostic_run_id, 'run-fresh')
  assertEquals(result.report.confidence_score, 82)
  assertEquals(opsFor(ops, 'libertymd_reports', 'insert').length, 1)
  assertEquals(opsFor(ops, 'libertymd_reports', 'upsert').length, 0)
})
