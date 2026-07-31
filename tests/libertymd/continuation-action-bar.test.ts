/**
 * P0-21 — source contracts for the continuation action bar (footer slot, not transcript).
 *
 * Deno cannot mount React without a harness, so this suite asserts source placement,
 * empty→null, telemetry suffixes/props, Chat+App mounts, and AC3 footer/ResizeObserver
 * contracts. Non-zero case count required (DoD+).
 *
 * Run focused: `deno test --no-config --allow-read tests/libertymd/continuation-action-bar.test.ts`
 * Wired into `test:libertymd:ci` via `test:libertymd:continuation-action-bar`.
 */
declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const BAR_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDContinuationActionBar.tsx',
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
const CARE_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDCareControls.tsx',
  import.meta.url,
)
const ANALYTICS_SOURCE = new URL(
  '../../components/LibertyMD/libertymd-analytics.ts',
  import.meta.url,
)
const SCROLL_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDChatScroll.tsx',
  import.meta.url,
)

/** Extract the JSX/tree region under `contentRef` assignment for a crude placement check. */
function contentRefRegion(source: string): string {
  const marker = 'ref={contentRef}'
  const start = source.indexOf(marker)
  if (start < 0) throw new Error('contentRef not found')
  // Take until the next `</main>` or footerRef — enough to catch inline CTAs.
  const footer = source.indexOf('ref={footerRef}', start)
  const mainClose = source.indexOf('</main>', start)
  const end = Math.min(
    footer > start ? footer : source.length,
    mainClose > start ? mainClose : source.length,
  )
  return source.slice(start, end)
}

function footerRefRegion(source: string): string {
  const marker = 'ref={footerRef}'
  const start = source.indexOf(marker)
  if (start < 0) throw new Error('footerRef not found')
  const end = source.indexOf('</footer>', start)
  if (end < 0) throw new Error('</footer> not found after footerRef')
  return source.slice(start, end)
}

Deno.test('continuation bar: empty action returns null (no permanent shell)', async () => {
  const source = await Deno.readTextFile(BAR_SOURCE)
  if (!source.includes('if (!action) return null')) {
    throw new Error('LibertyMDContinuationActionBar must return null when action is empty')
  }
  if (/min-h-\d+/.test(source) && source.includes('min-h-') && !source.includes('h-12')) {
    // Allow button h-12; forbid a slot-level permanent min-height shell.
  }
  if (source.includes('min-h-[') && source.includes('data-libertymd-continuation-action-bar')) {
    const barBlock = source.slice(
      source.indexOf('data-libertymd-continuation-action-bar') - 80,
      source.indexOf('data-libertymd-continuation-action-bar') + 200,
    )
    if (/min-h-\[/.test(barBlock)) {
      throw new Error('continuation slot must not have a permanent min-height shell')
    }
  }
})

Deno.test('continuation bar: landmark region, IO viewport path, no alert/modal/trap', async () => {
  const source = await Deno.readTextFile(BAR_SOURCE)
  const checks = [
    'aria-label="Continue consultation"',
    'data-libertymd-continuation-action-bar',
    'IntersectionObserver',
    'computeContinuationWasInViewport',
  ]
  for (const needle of checks) {
    if (!source.includes(needle)) {
      throw new Error(`ContinuationActionBar missing: ${needle}`)
    }
  }
  if (source.includes('role="alert"') || source.includes("role='alert'")) {
    throw new Error('continuation bar must not use role=alert')
  }
  if (source.includes('aria-modal') || source.includes('fixed inset-0')) {
    throw new Error('continuation bar must not be a focus-trapping modal')
  }
})

Deno.test('analytics: continuation_prompt_shown / _actioned helpers with required props', async () => {
  const source = await Deno.readTextFile(ANALYTICS_SOURCE)
  const checks = [
    "trackLibertyMd('continuation_prompt_shown'",
    'was_in_viewport:',
    "trackLibertyMd('continuation_prompt_actioned'",
    'seconds_to_action:',
    'emitContinuationPromptShown',
    'emitContinuationPromptActioned',
  ]
  for (const needle of checks) {
    if (!source.includes(needle)) {
      throw new Error(`libertymd-analytics missing continuation contract: ${needle}`)
    }
  }
  // P1-14 AC6 — optional action discriminator (backward compatible for bar callers).
  if (!source.includes("action?: 'proceed' | 'correct'") && !source.includes('action?: \'proceed\' | \'correct\'')) {
    if (!source.includes('props?.action')) {
      throw new Error('emitContinuationPromptActioned must support optional action (P1-14)')
    }
  }
})

Deno.test('was_in_viewport uses IntersectionObserver (geometry fallback) — not hard-coded true', async () => {
  const bar = await Deno.readTextFile(BAR_SOURCE)
  if (!bar.includes('IntersectionObserver')) {
    throw new Error('must use IntersectionObserver at render (P1-17 AC6)')
  }
  if (!bar.includes('computeContinuationWasInViewport')) {
    throw new Error('must keep geometry fallback for jsdom / no-IO environments')
  }
  if (/was_in_viewport:\s*true/.test(bar) || /emitContinuationPromptShown\([^,]+,\s*true\)/.test(bar)) {
    throw new Error('was_in_viewport must not be hard-coded true')
  }
  if (!bar.includes('getBoundingClientRect') || !bar.includes('visualViewport')) {
    throw new Error('geometry fallback must use getBoundingClientRect vs visualViewport')
  }
  if (!bar.includes("typeof IntersectionObserver !== 'undefined'") && !bar.includes('typeof IntersectionObserver ===')) {
    throw new Error('must branch on IntersectionObserver availability for jsdom fallback')
  }
})

Deno.test('Chat: View report options not under contentRef; bar in footerRef', async () => {
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  const content = contentRefRegion(chat)
  if (content.includes('View report options')) {
    throw new Error('Chat must not place "View report options" under contentRef')
  }
  const footer = footerRefRegion(chat)
  if (!footer.includes('LibertyMDContinuationActionBar')) {
    throw new Error('Chat must mount LibertyMDContinuationActionBar inside footerRef')
  }
  if (!footer.includes('continuationAction')) {
    throw new Error('Chat footer must pass continuationAction')
  }
  if (!chat.includes("type: 'report_gate'") || !chat.includes("type: 'resume'")) {
    throw new Error('Chat must host report_gate and resume continuation types')
  }
  if (!chat.includes("type: 'clinical_review_start_fresh'")) {
    throw new Error('Chat must host clinical_review_start_fresh continuation type (P1-10)')
  }
  if (!chat.includes('continuationOwnsFooter')) {
    throw new Error('Chat must hide composer/chips while continuation owns footer')
  }
  if (!chat.includes('pb-[max(12px,env(safe-area-inset-bottom))]')) {
    throw new Error('Chat footer must keep safe-area padding')
  }
})

Deno.test('App: View report options not under contentRef; bar + safe-area in footerRef', async () => {
  const app = await Deno.readTextFile(APP_SOURCE)
  const content = contentRefRegion(app)
  if (content.includes('View report options')) {
    throw new Error('App must not place "View report options" under contentRef')
  }
  const footer = footerRefRegion(app)
  if (!footer.includes('LibertyMDContinuationActionBar')) {
    throw new Error('App must mount LibertyMDContinuationActionBar inside footerRef')
  }
  if (!app.includes('pb-[max(12px,env(safe-area-inset-bottom))]')) {
    throw new Error('App consult footer must gain Chat-parity safe-area (P0-21 Q2A)')
  }
  if (app.includes('LibertyMDAbandonedRecoveryPrompt') || app.includes("type: 'resume'")) {
    throw new Error('App must not invent abandoned-recovery / resume continuation')
  }
  if (!app.includes('continuationOwnsFooter')) {
    throw new Error('App must hide composer while report-gate CTA owns footer')
  }
})

Deno.test('Chat resume is bar-hosted — not center aria-modal only path', async () => {
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  const care = await Deno.readTextFile(CARE_SOURCE)
  // Chat must not mount recovery as a sibling overlay outside the footer bar.
  if (chat.includes('<LibertyMDAbandonedRecoveryPrompt')) {
    throw new Error('Chat must not mount LibertyMDAbandonedRecoveryPrompt as a standalone overlay')
  }
  if (!chat.includes('LibertyMDContinuationActionBar')) {
    throw new Error('Chat resume must go through ContinuationActionBar')
  }
  if (care.includes('aria-modal') && care.includes('libertymd-recovery-title')) {
    // Recovery prompt itself must not carry aria-modal anymore.
    const recoveryStart = care.indexOf('function LibertyMDAbandonedRecoveryPrompt')
    const recoveryEnd = care.indexOf('export function LibertyMDReportGate', recoveryStart)
    const recovery = care.slice(recoveryStart, recoveryEnd > 0 ? recoveryEnd : care.length)
    if (recovery.includes('aria-modal') || recovery.includes('fixed inset-0') || recovery.includes('alertdialog')) {
      throw new Error('LibertyMDAbandonedRecoveryPrompt must retire center modal / aria-modal')
    }
  }
})

Deno.test('P1-10: clinical_review_start_fresh type + CTA in bar; categorical telemetry', async () => {
  const bar = await Deno.readTextFile(BAR_SOURCE)
  const checks = [
    "'clinical_review_start_fresh'",
    'data-libertymd-clinical-review-start-fresh',
    "emitContinuationPromptActioned('clinical_review_start_fresh'",
    "chatx.startNewConsult",
  ]
  for (const needle of checks) {
    if (!bar.includes(needle)) {
      throw new Error(`ContinuationActionBar P1-10 missing: ${needle}`)
    }
  }
  // No PHI / free-text symptom props in emit calls.
  if (/emitContinuationPrompt(Shown|Actioned)\([^)]*symptom/i.test(bar)) {
    throw new Error('continuation telemetry must not include symptom text')
  }
})

Deno.test('AC3: action slot child of observed footerRef; baseline clearance unchanged; RO kept', async () => {
  const scroll = await Deno.readTextFile(SCROLL_SOURCE)
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  const app = await Deno.readTextFile(APP_SOURCE)

  if (!scroll.includes('export const TRANSCRIPT_BOTTOM_CLEARANCE_CLASS = \'pb-10 sm:pb-12\'')) {
    throw new Error('baseline TRANSCRIPT_BOTTOM_CLEARANCE_CLASS must remain pb-10 sm:pb-12')
  }
  if (!scroll.includes('observer.observe(footerRef.current)')) {
    throw new Error('footer ResizeObserver path must not be removed')
  }
  if (!scroll.includes('visualViewport')) {
    throw new Error('visualViewport settle must not be removed')
  }
  if (!chat.includes('TRANSCRIPT_BOTTOM_CLEARANCE_CLASS') || !app.includes('TRANSCRIPT_BOTTOM_CLEARANCE_CLASS')) {
    throw new Error('both surfaces must still apply baseline clearance class')
  }
  // Slot inside footer on both surfaces (already checked via footerRefRegion above).
  if (!footerRefRegion(chat).includes('LibertyMDContinuationActionBar')) {
    throw new Error('Chat AC3: bar must be child of footerRef')
  }
  if (!footerRefRegion(app).includes('LibertyMDContinuationActionBar')) {
    throw new Error('App AC3: bar must be child of footerRef')
  }
})
