/**
 * P2-13 — Report lifecycle states: pure helper + source contracts.
 *
 * Run focused: `deno test --no-config --no-check --sloppy-imports --allow-read --allow-env tests/libertymd/report-lifecycle.test.ts`
 * Wired into `test:libertymd:ci` via `test:libertymd:report-lifecycle`.
 */
import {
  REPORT_LIFECYCLE_STATES,
  GENERATING_WAIT_TIMEOUT_MS,
  copyLooksLikeUserBlame,
  copyPromisesFalseGuestRestore,
  deriveReportLifecycleState,
  formatRetentionRemaining,
  isRetentionExpired,
  isRetentionStillValid,
  shouldClearStaleReportOnHydrate,
  shouldShowGuestRetentionWarning,
  showReadyOnlyChrome,
} from '../../components/LibertyMD/libertymd-report-lifecycle.ts'
import { GENERATING_WAIT_TIMEOUT_MS as WAITING_TIMEOUT } from '../../components/LibertyMD/libertymd-waiting.ts'

declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const ROOT = new URL('../..', import.meta.url)

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function assertTrue(value: unknown, message?: string) {
  if (!value) throw new Error(message || 'Expected truthy')
}

Deno.test('P2-13 AC1 · six Spec states exported', () => {
  assertEquals(REPORT_LIFECYCLE_STATES.length, 6)
  for (const name of [
    'generating',
    'ready',
    'partial',
    'generation_failed',
    'guest_expired',
    'not_yet_eligible',
  ]) {
    assertTrue(REPORT_LIFECYCLE_STATES.includes(name as typeof REPORT_LIFECYCLE_STATES[number]), name)
  }
})

Deno.test('P2-13 AC6/L2 · generating timeout ≥ 55s + buffer (65s)', () => {
  assertEquals(GENERATING_WAIT_TIMEOUT_MS, WAITING_TIMEOUT)
  assertTrue(GENERATING_WAIT_TIMEOUT_MS >= 55_000, 'must cover proxy diagnosis budget')
  assertEquals(GENERATING_WAIT_TIMEOUT_MS, 65_000)
})

Deno.test('P2-13 AC1 · derive each Spec state', () => {
  assertEquals(
    deriveReportLifecycleState({
      phase: 'intake',
      isBusy: true,
      waitMode: 'reviewing',
    }),
    'generating',
  )
  assertEquals(
    deriveReportLifecycleState({
      phase: 'report_gate',
      hasReportBody: true,
    }),
    'ready',
  )
  assertEquals(
    deriveReportLifecycleState({
      phase: 'clinical_review_needed',
    }),
    'partial',
  )
  assertEquals(
    deriveReportLifecycleState({
      phase: 'intake',
      generationFailed: true,
    }),
    'generation_failed',
  )
  assertEquals(
    deriveReportLifecycleState({
      phase: 'report_gate',
      hasReportBody: false,
      reportOmittedReason: 'retention_expired',
    }),
    'guest_expired',
  )
  assertEquals(
    deriveReportLifecycleState({
      phase: 'intake',
      lastTurnCount: 2,
      evidenceScore: 20,
    }),
    'not_yet_eligible',
  )
})

Deno.test('P2-13 L3 · ready wins over generation_failed when body exists (insert-once)', () => {
  assertEquals(
    deriveReportLifecycleState({
      phase: 'report_ready',
      hasReportBody: true,
      generationFailed: true,
    }),
    'ready',
  )
  assertTrue(showReadyOnlyChrome('ready'))
  assertEquals(showReadyOnlyChrome('generation_failed'), false)
  assertEquals(showReadyOnlyChrome('partial'), false)
})

Deno.test('P2-13 AC2 · generation-failed copy bans user-blame', () => {
  assertTrue(copyLooksLikeUserBlame("We couldn't continue from these answers"))
  assertTrue(copyLooksLikeUserBlame('your answers were insufficient'))
  assertEquals(
    copyLooksLikeUserBlame('Something went wrong on our side while preparing your report.'),
    false,
  )
})

Deno.test('P2-13 AC3/L4 · pre-lapse warning from server ISO (not hardcoded 7d)', () => {
  const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
  const past = new Date(Date.now() - 60_000).toISOString()
  assertTrue(isRetentionStillValid(future))
  assertTrue(isRetentionExpired(past))
  assertTrue(shouldShowGuestRetentionWarning({
    hasReportBody: true,
    saved: false,
    retentionExpiresAt: future,
  }))
  assertEquals(shouldShowGuestRetentionWarning({
    hasReportBody: true,
    saved: true,
    retentionExpiresAt: future,
  }), false)
  assertTrue(formatRetentionRemaining(future).includes('day') || formatRetentionRemaining(future).includes('hour'))
})

Deno.test('P2-13 AC3/L5 · clear stale report on omit hydrate; no false restore', () => {
  assertTrue(shouldClearStaleReportOnHydrate({
    phase: 'report_gate',
    hasIncomingReport: false,
    reportOmittedReason: 'retention_expired',
  }))
  assertEquals(shouldClearStaleReportOnHydrate({
    phase: 'intake',
    hasIncomingReport: false,
    reportOmittedReason: 'retention_expired',
  }), false)
  assertEquals(
    copyPromisesFalseGuestRestore(
      'Guest reports are removed after their retention window. Starting a new consultation is the way forward — signing in cannot restore a deleted guest report.',
    ),
    false,
  )
  assertTrue(copyPromisesFalseGuestRestore('Sign in to restore this guest report'))
})

Deno.test('P2-13 AC1/AC5 · Chat + App + shell source hooks', async () => {
  const chat = await Deno.readTextFile(new URL('components/LibertyMD/LibertyMDChat.tsx', ROOT))
  const app = await Deno.readTextFile(new URL('components/LibertyMD/LibertyMDApp.tsx', ROOT))
  const shell = await Deno.readTextFile(new URL('components/LibertyMD/LibertyMDReportLifecycleShell.tsx', ROOT))
  const care = await Deno.readTextFile(new URL('docs/libertymd/CARE-ARCHITECTURE.md', ROOT))
  const waiting = await Deno.readTextFile(new URL('components/LibertyMD/libertymd-waiting.ts', ROOT))
  const reads = await Deno.readTextFile(new URL('supabase/functions/libertymd-care-proxy/actions/reads.ts', ROOT))

  assertTrue(chat.includes('deriveReportLifecycleState'), 'Chat derives lifecycle')
  assertTrue(app.includes('deriveReportLifecycleState'), 'App derives lifecycle')
  assertTrue(chat.includes('GENERATING_WAIT_TIMEOUT_MS'), 'Chat generating timeout')
  assertTrue(app.includes('GENERATING_WAIT_TIMEOUT_MS'), 'App generating timeout')
  assertTrue(shell.includes('data-libertymd-report-lifecycle="partial"'), 'partial shell')
  assertTrue(shell.includes('data-libertymd-report-lifecycle="generation_failed"'), 'failed shell')
  assertTrue(shell.includes('data-libertymd-report-lifecycle="guest_expired"'), 'expired shell')
  assertTrue(shell.includes('data-libertymd-severity="technical"'), 'technical severity')
  assertTrue(shell.includes('data-libertymd-report-lifecycle-incomplete'), 'incomplete label hook')
  assertTrue(shell.includes('partialA11yNoDx') || shell.includes('No differential'), 'partial a11y no-dx hook')
  assertTrue(waiting.includes('65_000') || waiting.includes('GENERATING_WAIT_TIMEOUT_MS'), 'waiting timeout')
  assertTrue(reads.includes('report_omitted_reason') && reads.includes('retention_expires_at'), 'proxy L6 fields')
  assertTrue(care.includes('P2-13') && care.includes('65s'), 'CARE staging + budget')
  assertTrue(care.includes('not_yet_eligible') && care.includes('generation_failed'), 'CARE names six')
  // No new telemetry invent
  assertEquals(chat.includes('report_lifecycle_'), false, 'Chat no invent event')
  assertEquals(app.includes('report_lifecycle_'), false, 'App no invent event')
})

Deno.test('P2-13 R1 · soft-gate / delivery / feedback / doctor CTA not rewritten in shell', async () => {
  const shell = await Deno.readTextFile(new URL('components/LibertyMD/LibertyMDReportLifecycleShell.tsx', ROOT))
  assertEquals(shell.includes('softGate') || shell.includes('shouldOpenSoftGate'), false)
  assertEquals(shell.includes('emailDelivery') || shell.includes('LibertyMDReportEmail'), false)
  assertEquals(shell.includes('LibertyMDReportFeedback') || shell.includes('Was this helpful'), false)
  assertEquals(shell.includes('DoctorHandoff') || shell.includes('footerSlot'), false)
})

Deno.test('P2-13 AC4 · partial incomplete copy present; blame clinicalReviewNeeded reframed', async () => {
  const en = JSON.parse(await Deno.readTextFile(new URL('i18n/locales/en.json', ROOT))) as {
    report: { lifecycle: Record<string, string> }
    chatx: { clinicalReviewNeeded: string }
  }
  const chat = await Deno.readTextFile(new URL('components/LibertyMD/LibertyMDChat.tsx', ROOT))
  assertEquals(en.report.lifecycle.partialLabel, 'Incomplete')
  assertTrue(en.report.lifecycle.partialBody.includes('complete') || en.report.lifecycle.partialBody.includes('incomplete'))
  assertEquals(copyLooksLikeUserBlame(en.report.lifecycle.failedBody), false)
  assertEquals(copyPromisesFalseGuestRestore(en.report.lifecycle.expiredBody), false)
  // L1: partial chrome uses lifecycle incomplete title (not blame-adjacent chatx seed).
  assertTrue(chat.includes("t('report.lifecycle.partialTitle')"), 'Chat paints lifecycle partial title')
  assertEquals(copyLooksLikeUserBlame(en.report.lifecycle.partialTitle), false)
  assertEquals(copyLooksLikeUserBlame(en.report.lifecycle.partialBody), false)
})
