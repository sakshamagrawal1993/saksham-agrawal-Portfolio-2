/**
 * P1-07 — Staged waiting states: pure helper + source contracts.
 *
 * Deno cannot mount React without a harness, so Chat/App wait chrome and
 * composer/lease contracts are asserted via source greps. Pure cases cover
 * diagnosis-gate mirror, progressive reveal prefixes, TTFT buckets, and
 * mid-wait draft restore.
 *
 * Run focused: `deno test --no-config --no-check --sloppy-imports --allow-read tests/libertymd/waiting.test.ts`
 * Wired into `test:libertymd:ci` via `test:libertymd:waiting`.
 */
import {
  buildRevealPrefixes,
  latencyBucket,
  LIBERTYMD_STAGED_WAITING_ENABLED,
  nextComposerInputAfterRestore,
  predictWaitMode,
  predictWaitModeFromLastKnown,
  shouldRunDiagnosisGate,
  upcomingTurnCount,
} from '../../components/LibertyMD/libertymd-waiting.ts'
import {
  emitTurnCompletedTtft,
  __setLibertyMdTrackForTests,
} from '../../components/LibertyMD/libertymd-analytics.ts'
import { MAX_INTERVIEW_TURNS } from '../../components/LibertyMD/libertymd-interview-expectations.ts'

declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const WAITING_SOURCE = new URL(
  '../../components/LibertyMD/libertymd-waiting.ts',
  import.meta.url,
)
const INDICATOR_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDWaitingIndicator.tsx',
  import.meta.url,
)
const CHAT_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDChat.tsx',
  import.meta.url,
)
const APP_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDApp.tsx',
  import.meta.url,
)
const ANALYTICS_SOURCE = new URL(
  '../../components/LibertyMD/libertymd-analytics.ts',
  import.meta.url,
)
const SEND_MESSAGE_SOURCE = new URL(
  '../../supabase/functions/libertymd-care-proxy/actions/send-message.ts',
  import.meta.url,
)

Deno.test('P1-07 AC2 / P2-14 AC1 · diagnosis gate mirrors proxy G2 boolean', () => {
  // Ordinary early turn → typing
  if (shouldRunDiagnosisGate({ turnCount: 3, evidenceScore: 80 })) {
    throw new Error('turn 3 must not run diagnosis')
  }
  if (predictWaitMode({ turnCount: 3, evidenceScore: 80 }) !== 'typing') {
    throw new Error('ordinary turn → typing')
  }
  // Eligible: score≥50, turn≥6 (even still ok)
  if (!shouldRunDiagnosisGate({ turnCount: 6, evidenceScore: 50 })) {
    throw new Error('turn 6 even + score 50 must run')
  }
  if (predictWaitMode({ turnCount: 6, evidenceScore: 50 }) !== 'reviewing') {
    throw new Error('diagnosis-eligible → reviewing')
  }
  // P2-14: odd turn 7 with score/floor → must run (even-turn removed)
  if (!shouldRunDiagnosisGate({ turnCount: 7, evidenceScore: 90 })) {
    throw new Error('odd turn 7 with score≥50 must run after even-turn removal')
  }
  if (predictWaitMode({ turnCount: 7, evidenceScore: 90 }) !== 'reviewing') {
    throw new Error('odd turn 7 eligible → reviewing')
  }
  // Score <50 on odd turn → still closed
  if (shouldRunDiagnosisGate({ turnCount: 7, evidenceScore: 49 })) {
    throw new Error('odd turn 7 score 49 must not run')
  }
  // Ready_for_report still opens when parity restored via Vite mirror
  if (
    !shouldRunDiagnosisGate({
      turnCount: 7,
      evidenceScore: 90,
      readyForReport: true,
      env: { VITE_LIBERTYMD_DIAGNOSIS_EVEN_TURN_REQUIRED: 'true' },
    })
  ) {
    throw new Error('ready_for_report on odd turn must run under EVEN_REQUIRED')
  }
  if (
    shouldRunDiagnosisGate({
      turnCount: 7,
      evidenceScore: 90,
      readyForReport: false,
      env: { VITE_LIBERTYMD_DIAGNOSIS_EVEN_TURN_REQUIRED: 'true' },
    })
  ) {
    throw new Error('legacy EVEN_REQUIRED must keep odd turn 7 closed without ready')
  }
  // Cap rescues under EVEN_REQUIRED
  if (
    !shouldRunDiagnosisGate({
      turnCount: MAX_INTERVIEW_TURNS,
      evidenceScore: 55,
      env: { VITE_LIBERTYMD_DIAGNOSIS_EVEN_TURN_REQUIRED: 'true' },
    })
  ) {
    throw new Error('at cap must run when score ok')
  }
  // Turn <6 + ready still false (G3 rejected)
  if (shouldRunDiagnosisGate({ turnCount: 5, evidenceScore: 90, readyForReport: true })) {
    throw new Error('turn 5 + ready must not open below floor')
  }
  // Low evidence → typing even at turn 8
  if (predictWaitMode({ turnCount: 8, evidenceScore: 40 }) !== 'typing') {
    throw new Error('low evidence must stay typing')
  }
})

Deno.test('P1-07 AC2 · upcoming turn from last-known + best-effort false +/-', () => {
  if (upcomingTurnCount(5) !== 6) throw new Error('5 → upcoming 6')
  if (upcomingTurnCount(15) !== 15) throw new Error('at cap stays 15')
  // Client predicts from last-known; mid-request slot merge can flip gate
  // (documented best-effort): last turn 5 score 49 → typing; if merge lifts
  // score to 50 server-side, reviewing would have been false-negative.
  const predicted = predictWaitModeFromLastKnown({ lastTurnCount: 5, evidenceScore: 49 })
  if (predicted !== 'typing') throw new Error('pre-merge score 49 → typing prediction')
  const afterMergeWouldRun = shouldRunDiagnosisGate({ turnCount: 6, evidenceScore: 50 })
  if (!afterMergeWouldRun) throw new Error('post-merge would run — false - reviewing case exists')
  // Inverse: last score 60 turn 5 → reviewing prediction (upcoming 6)
  if (predictWaitModeFromLastKnown({ lastTurnCount: 5, evidenceScore: 60 }) !== 'reviewing') {
    throw new Error('score 60 turn→6 → reviewing prediction')
  }
  // P2-14: last turn 6 score 60 → upcoming 7 already on gate → reviewing
  if (predictWaitModeFromLastKnown({ lastTurnCount: 6, evidenceScore: 60 }) !== 'reviewing') {
    throw new Error('score 60 turn→7 odd → reviewing after even-turn removal')
  }
  if (!LIBERTYMD_STAGED_WAITING_ENABLED) {
    throw new Error('staged waiting should be enabled by default')
  }
})

Deno.test('P1-07 AC3 · progressive reveal prefixes (≥2 steps; reduced-motion instant)', () => {
  const text = 'When did this start and how severe is it?'
  const prefixes = buildRevealPrefixes(text)
  if (prefixes.length < 2) throw new Error(`expected ≥2 prefixes, got ${prefixes.length}`)
  for (const prefix of prefixes) {
    if (!text.startsWith(prefix)) throw new Error(`prefix not strict: ${JSON.stringify(prefix)}`)
  }
  if (prefixes[prefixes.length - 1] !== text) {
    throw new Error('last prefix must be full string')
  }
  const reduced = buildRevealPrefixes(text, { reducedMotion: true })
  if (reduced.length !== 1 || reduced[0] !== text) {
    throw new Error('reduced-motion must be single full paint')
  }
  const emergency = buildRevealPrefixes(text, { instant: true })
  if (emergency.length !== 1 || emergency[0] !== text) {
    throw new Error('instant (emergency) must be single full paint')
  }
})

Deno.test('P1-07 AC4 · mid-wait draft restore never clobbers distinct input', () => {
  if (nextComposerInputAfterRestore('', 'sent text') !== 'sent text') {
    throw new Error('empty → restore sent')
  }
  if (nextComposerInputAfterRestore('sent text', 'sent text') !== 'sent text') {
    throw new Error('still equals sent → restore sent')
  }
  if (nextComposerInputAfterRestore('new draft', 'sent text') !== 'new draft') {
    throw new Error('distinct mid-wait draft must be preserved')
  }
})

Deno.test('P1-07 AC7 · latency_bucket bands + emitTurnCompletedTtft PHI-free', () => {
  const cases: Array<[number, string]> = [
    [0, '<500'],
    [499, '<500'],
    [500, '500-1500'],
    [1499, '500-1500'],
    [1500, '1500-4000'],
    [3999, '1500-4000'],
    [4000, '4000-10000'],
    [9999, '4000-10000'],
    [10_000, '10000+'],
    [60_000, '10000+'],
  ]
  for (const [ms, band] of cases) {
    const got = latencyBucket(ms)
    if (got !== band) throw new Error(`${ms} → ${got}, expected ${band}`)
  }

  const events: Array<{ name: string; props: Record<string, unknown> }> = []
  __setLibertyMdTrackForTests((name, props) => {
    events.push({ name, props })
  })
  try {
    emitTurnCompletedTtft({ latency_bucket: '1500-4000' })
    if (events.length !== 1) throw new Error(`expected 1 event, got ${events.length}`)
    if (events[0].name !== 'LibertyMd turn_completed') {
      throw new Error(`bad name ${events[0].name}`)
    }
    if (events[0].props.latency_bucket !== '1500-4000') {
      throw new Error('missing latency_bucket')
    }
    if (events[0].props.latency_bucket_source !== 'client_ttft') {
      throw new Error('missing client_ttft discriminator')
    }
    for (const key of Object.keys(events[0].props)) {
      if (/message|symptom|slot|phi|consultation/i.test(key)) {
        throw new Error(`PHI-ish key forbidden: ${key}`)
      }
    }
  } finally {
    __setLibertyMdTrackForTests(null)
  }
})

Deno.test('P1-07 source · Chat mounts distinct wait modes + draft-editable busy', async () => {
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  if (!chat.includes('LibertyMDWaitingIndicator')) {
    throw new Error('Chat must mount LibertyMDWaitingIndicator')
  }
  if (!chat.includes('predictWaitModeFromLastKnown')) {
    throw new Error('Chat must predict wait mode from last-known gate inputs')
  }
  if (!chat.includes('appendAssistantWithReveal')) {
    throw new Error('Chat must use progressive reveal helper path')
  }
  if (!chat.includes('emitTurnCompletedTtft')) {
    throw new Error('Chat must emit client TTFT')
  }
  if (!chat.includes('composerInputLocked')) {
    throw new Error('Chat must separate input lock from send lock')
  }
  if (!chat.includes('nextComposerInputAfterRestore')) {
    throw new Error('Chat must use sacred mid-wait draft restore')
  }
  // lease_conflict stays silent
  if (!/lease_conflict[\s\S]{0,120}restoreDraft\(\);\s*return/.test(chat)) {
    throw new Error('lease_conflict must restoreDraft and return with no banner')
  }
  // optimistic append precedes invoke (P1-12 may add clientMessageId on the bubble)
  const optIdx = chat.search(/sender:\s*'user',\s*\n\s*text:\s*message/)
  const optIdxLegacy = chat.indexOf("sender: 'user', text: message")
  const optimisticAt = optIdx >= 0 ? optIdx : optIdxLegacy
  const invokeIdx = chat.indexOf("action: 'send_message'")
  if (optimisticAt < 0 || invokeIdx < 0 || optimisticAt > invokeIdx) {
    throw new Error('optimistic user bubble must precede send_message invoke')
  }
})

Deno.test('P1-07 source · indicator has reviewing vs typing; App shares typing row', async () => {
  const indicator = await Deno.readTextFile(INDICATOR_SOURCE)
  if (!indicator.includes("data-wait-mode={mode}")) {
    throw new Error('indicator must expose wait mode')
  }
  if (!indicator.includes('ReviewingIcon') && !indicator.includes('reviewingLabel')) {
    throw new Error('indicator must support reviewing chrome')
  }
  if (indicator.includes('#2563EB') || indicator.includes('#5661F6')) {
    throw new Error('new wait chrome must not introduce raw hex (use tokens)')
  }
  const app = await Deno.readTextFile(APP_SOURCE)
  if (!app.includes('LibertyMDTypingWaitRow')) {
    throw new Error('App residual must use shared typing wait row')
  }
  if (app.includes('Checking safety and generating the next clinical step')) {
    throw new Error('App must not keep undifferentiated clinical wait copy')
  }
  // P2-13 L9 — App may mount reviewing/generating for lifecycle parity (+ timeout escape).
  if (!app.includes('GENERATING_WAIT_TIMEOUT_MS') || !app.includes("waitMode === 'reviewing'")) {
    throw new Error('App must wire generating/reviewing wait + timeout for P2-13 parity')
  }
})

Deno.test('P1-07 source · payload turn_count + analytics TTFT helper; no Deno telemetry import', async () => {
  const send = await Deno.readTextFile(SEND_MESSAGE_SOURCE)
  if (!/turn_count:\s*turnCount/.test(send)) {
    throw new Error('send_message happy path must return turn_count')
  }
  if (!send.includes('diagnosis_ran:')) {
    throw new Error('send_message should return optional diagnosis_ran')
  }
  const analytics = await Deno.readTextFile(ANALYTICS_SOURCE)
  if (!analytics.includes('emitTurnCompletedTtft')) {
    throw new Error('analytics must expose TTFT helper')
  }
  const waiting = await Deno.readTextFile(WAITING_SOURCE)
  if (waiting.includes('libertymd-care-proxy') || waiting.includes('telemetry.ts')) {
    throw new Error('waiting helper must not import Deno proxy telemetry')
  }
})

Deno.test('P2-13 L2 · generating wait timeout constant exported and wired in Chat', async () => {
  const waiting = await Deno.readTextFile(WAITING_SOURCE)
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  if (!waiting.includes('GENERATING_WAIT_TIMEOUT_MS') || !waiting.includes('65_000')) {
    throw new Error('waiting helper must export 65s generating timeout')
  }
  if (!chat.includes('GENERATING_WAIT_TIMEOUT_MS')) {
    throw new Error('Chat must wire generating timeout escape')
  }
  if (!chat.includes('setGenerationFailed(true)')) {
    throw new Error('Chat timeout/holding path must paint generation failed')
  }
})
