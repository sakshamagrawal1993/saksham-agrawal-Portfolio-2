/**
 * P1-06 — Honest progress indicator: pure helper + source contracts.
 *
 * Deno cannot mount React without a harness, so UI placement is asserted via
 * source greps. Pure cases cover slot-derived ratio, high-water never-regress,
 * qualitative copy (no false precision / no expected-8), ceiling from shared
 * MAX_INTERVIEW_TURNS, and hide-on-non-intake.
 *
 * Run focused: `deno test --no-config --allow-read tests/libertymd/progress.test.ts`
 * Wired into `test:libertymd:ci` via `test:libertymd:progress`.
 */
import {
  applyHighWater,
  bandFromRatio,
  buildProgressView,
  formatInterviewCeilingCopy,
  labelForBand,
  LIBERTYMD_PROGRESS_INDICATOR_ENABLED,
  nextHighWater,
  PROGRESS_CORE_SLOT_COUNT,
  PROGRESS_CORE_SLOTS,
  ratioFromMissingSlots,
  shouldShowInterviewProgress,
} from '../../components/LibertyMD/libertymd-progress.ts'
import {
  EXPECTED_INTERVIEW_TURNS,
  MAX_INTERVIEW_TURNS,
} from '../../components/LibertyMD/libertymd-interview-expectations.ts'

declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const PROGRESS_SOURCE = new URL(
  '../../components/LibertyMD/libertymd-progress.ts',
  import.meta.url,
)
const INDICATOR_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDProgressIndicator.tsx',
  import.meta.url,
)
const EXPECTATIONS_SOURCE = new URL(
  '../../components/LibertyMD/libertymd-interview-expectations.ts',
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

Deno.test('P1-06 AC1 · core-slot denominator is 6 (mirrored, not EXPECTED)', () => {
  if (PROGRESS_CORE_SLOT_COUNT !== 6) {
    throw new Error(`expected CORE length 6, got ${PROGRESS_CORE_SLOT_COUNT}`)
  }
  if (PROGRESS_CORE_SLOTS.length !== 6) {
    throw new Error('PROGRESS_CORE_SLOTS length mismatch')
  }
  const core = Number(PROGRESS_CORE_SLOT_COUNT)
  if (core === Number(EXPECTED_INTERVIEW_TURNS)) {
    throw new Error('must not equate CORE_SLOTS length with EXPECTED_INTERVIEW_TURNS')
  }
  if (core === Number(MAX_INTERVIEW_TURNS)) {
    throw new Error('must not equate CORE_SLOTS length with MAX_INTERVIEW_TURNS')
  }
})

Deno.test('P1-06 AC1 · ratioFromMissingSlots derives from missing list', () => {
  const allMissing = [...PROGRESS_CORE_SLOTS]
  if (ratioFromMissingSlots(allMissing) !== 0) {
    throw new Error('all missing ⇒ ratio 0')
  }
  const half = ['onset', 'duration', 'severity']
  if (ratioFromMissingSlots(half) !== 0.5) {
    throw new Error(`three of six missing ⇒ 0.5, got ${ratioFromMissingSlots(half)}`)
  }
  if (ratioFromMissingSlots([]) !== 1) {
    throw new Error('empty missing ⇒ ratio 1')
  }
  // Non-core names ignored
  if (ratioFromMissingSlots(['onset', 'chief_complaint']) !== 5 / 6) {
    throw new Error('non-core slots must not inflate missing count')
  }
})

Deno.test('P1-06 AC2 · high-water never regresses; advances on improve', () => {
  if (applyHighWater(0.5, 0.3) !== 0.5) {
    throw new Error('worse estimate must hold 0.5')
  }
  if (applyHighWater(0.5, 0.75) !== 0.75) {
    throw new Error('better estimate must advance')
  }
  if (applyHighWater(null, 0.5) !== 0.5) {
    throw new Error('null previous seeds from next')
  }
  if (nextHighWater(0.5, [...PROGRESS_CORE_SLOTS]) !== 0.5) {
    throw new Error('all-missing after 0.5 must hold high-water')
  }
  if (nextHighWater(0.5, []) !== 1) {
    throw new Error('empty missing must advance to 1')
  }
})

Deno.test('P1-06 AC3 · qualitative bands; no false-precision phrases', () => {
  const labels = [
    labelForBand('starting'),
    labelForBand('early'),
    labelForBand('midway'),
    labelForBand('wrapping'),
  ]
  for (const label of labels) {
    if (/\d+\s*(of|remaining|left)/i.test(label)) {
      throw new Error(`exact remaining forbidden in label: ${label}`)
    }
    if (/\babout\s+8\b/i.test(label) || label.includes(String(EXPECTED_INTERVIEW_TURNS))) {
      throw new Error(`progress chrome must not restate expected-8: ${label}`)
    }
    if (/\bof\s+15\b/i.test(label) || /question\s+\d+\s+of/i.test(label)) {
      throw new Error(`N of 15 forbidden: ${label}`)
    }
  }
  if (bandFromRatio(0) !== 'starting') throw new Error('ratio 0 ⇒ starting')
  if (bandFromRatio(0.2) !== 'early') throw new Error('ratio 0.2 ⇒ early')
  if (bandFromRatio(0.5) !== 'midway') throw new Error('ratio 0.5 ⇒ midway')
  if (bandFromRatio(0.8) !== 'wrapping') throw new Error('ratio 0.8 ⇒ wrapping')

  const view = buildProgressView({
    missingSlots: [...PROGRESS_CORE_SLOTS],
    highWaterRatio: null,
  })
  if (view.label !== 'Getting started') {
    throw new Error(`zero-state label expected Getting started, got ${view.label}`)
  }
})

Deno.test('P1-06 AC4 · ceiling uses shared MAX_INTERVIEW_TURNS (hedged)', () => {
  const ceiling = formatInterviewCeilingCopy()
  if (!ceiling.includes(String(MAX_INTERVIEW_TURNS))) {
    throw new Error(`ceiling must include MAX_INTERVIEW_TURNS=${MAX_INTERVIEW_TURNS}`)
  }
  if (!/^Up to \d+ questions$/.test(ceiling)) {
    throw new Error(`hedged ceiling shape failed: ${ceiling}`)
  }
  if (/of\s+15|question\s+\d+\s+of/i.test(ceiling)) {
    throw new Error('ceiling must not be N of 15')
  }
  if (MAX_INTERVIEW_TURNS !== 15) {
    throw new Error('MAX_INTERVIEW_TURNS must mirror proxy MAX_TURNS=15')
  }
})

Deno.test('P1-06 AC5 · single expected-8 definition; progress imports expectations', async () => {
  if (EXPECTED_INTERVIEW_TURNS !== 8) {
    throw new Error('EXPECTED_INTERVIEW_TURNS must remain 8')
  }
  const progressSrc = await Deno.readTextFile(PROGRESS_SOURCE)
  const expectationsSrc = await Deno.readTextFile(EXPECTATIONS_SOURCE)
  const defMatches = expectationsSrc.match(/EXPECTED_INTERVIEW_TURNS\s*=\s*8/g) || []
  if (defMatches.length !== 1) {
    throw new Error(`exactly one EXPECTED_INTERVIEW_TURNS=8 definition required, got ${defMatches.length}`)
  }
  if (!progressSrc.includes("from './libertymd-interview-expectations'")) {
    throw new Error('progress helper must import interview-expectations')
  }
  if (/EXPECTED_INTERVIEW_TURNS\s*=\s*8/.test(progressSrc)) {
    throw new Error('progress must not redefine EXPECTED_INTERVIEW_TURNS=8')
  }
  if (progressSrc.includes('libertymd-time-promise')) {
    throw new Error('forbidden second module libertymd-time-promise')
  }
  // Chrome must not restate expected-8 in copy helpers
  if (progressSrc.includes('About') && progressSrc.includes('EXPECTED')) {
    throw new Error('progress copy must not restate About/EXPECTED framing')
  }
})

Deno.test('P1-06 AC6 · hide predicate — intake only', () => {
  if (!LIBERTYMD_PROGRESS_INDICATOR_ENABLED) {
    throw new Error('rollback flag should default enabled for AC suite')
  }
  if (!shouldShowInterviewProgress('intake')) {
    throw new Error('intake must show progress')
  }
  const hidden = [
    'demographics_required',
    'emergency_end',
    'clinical_review_needed',
    'report_gate',
    'report_ready',
    'recovery_required',
    'error',
    'loading',
    'initial',
  ]
  for (const phase of hidden) {
    if (shouldShowInterviewProgress(phase)) {
      throw new Error(`progress must hide on ${phase}`)
    }
  }
})

Deno.test('P1-06 · Chat replaces status strip during intake; observes missing_slots', async () => {
  const source = await Deno.readTextFile(CHAT_SOURCE)
  if (!source.includes("from './LibertyMDProgressIndicator'")) {
    throw new Error('Chat must import LibertyMDProgressIndicator')
  }
  if (!source.includes('shouldShowInterviewProgress')) {
    throw new Error('Chat must use shouldShowInterviewProgress')
  }
  if (!source.includes('buildProgressView')) {
    throw new Error('Chat must call buildProgressView (shared helper)')
  }
  if (!source.includes('observeMissingSlots')) {
    throw new Error('Chat must observe missing_slots')
  }
  if (!source.includes('aria-live="polite"')) {
    throw new Error('Chat status strip aria-live polite must remain')
  }
  // Replace, do not stack a second permanent statusCopy alongside progress
  const stripStart = source.indexOf('aria-live="polite"')
  const stripRegion = source.slice(stripStart, stripStart + 600)
  if (!stripRegion.includes('LibertyMDProgressIndicator') || !stripRegion.includes('statusCopy[phase]')) {
    throw new Error('Chat must branch progress vs statusCopy in the same polite strip')
  }
  if (/N of 15|question \d+ of 15/.test(source)) {
    throw new Error('Chat must not hardcode N of 15 progress math')
  }
})

Deno.test('P1-06 · App mounts same indicator on residual intake', async () => {
  const source = await Deno.readTextFile(APP_SOURCE)
  if (!source.includes("from './LibertyMDProgressIndicator'")) {
    throw new Error('App must import LibertyMDProgressIndicator')
  }
  if (!source.includes('shouldShowInterviewProgress')) {
    throw new Error('App must use shouldShowInterviewProgress')
  }
  if (!source.includes('buildProgressView')) {
    throw new Error('App must call buildProgressView')
  }
  if (!source.includes('observeMissingSlots')) {
    throw new Error('App must observe missing_slots')
  }
  if (!source.includes('LibertyMDProgressIndicator')) {
    throw new Error('App must mount LibertyMDProgressIndicator')
  }
})

Deno.test('P1-06 · presentational indicator uses LibertyMD tokens + ceiling', async () => {
  const source = await Deno.readTextFile(INDICATOR_SOURCE)
  if (!source.includes('data-libertymd-progress-indicator')) {
    throw new Error('indicator marker missing')
  }
  if (!source.includes('bg-libertymd-blue-600')) {
    throw new Error('track fill must use libertymd-blue-600 token')
  }
  if (!source.includes('text-libertymd-slate-500')) {
    throw new Error('copy must use libertymd-slate-500 token')
  }
  if (!source.includes('view.ceiling')) {
    throw new Error('indicator must render hedged ceiling')
  }
})
