/**
 * P0-19 / P0-20 / P0-23 — near-bottom band helpers + source contracts for the shared scroll
 * hook, "New message" jump pill wiring (Chat + App), and transcript bottom clearance.
 *
 * Deno cannot import `LibertyMDChatScroll.tsx` (React / lucide deps) without a harness,
 * so this file:
 *   1. Table-tests the band geometry that the exported helpers implement.
 *   2. Asserts the source exports those helpers and the documented tolerance.
 *   3. Asserts Chat + App mount `LibertyMDNewMessagePill` with emergency hide / force,
 *      App footer `z-20`, and hook pin/pill contracts.
 *   4. P0-23: asserts `TRANSCRIPT_BOTTOM_CLEARANCE_CLASS` export + both-surface
 *      `contentRef` mount; Q4A "do not grow" needle (present/absent + full RO block
 *      remain in continuation-action-bar AC3 — do not duplicate that suite here).
 *
 * Run focused: `deno test --no-config --allow-read tests/libertymd/chat-scroll.test.ts`
 * Also wired into `test:libertymd:ci` via `test:libertymd:chat-scroll` (P0-20 S1).
 */
declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const NEAR_BOTTOM_TOLERANCE_PX = 120

/** Mirrors `distanceFromBottom` exported from LibertyMDChatScroll.tsx. */
function distanceFromBottom(element: {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight
}

/** Mirrors `isNearBottom` exported from LibertyMDChatScroll.tsx. */
function isNearBottom(
  element: { scrollHeight: number; scrollTop: number; clientHeight: number },
  tolerancePx: number = NEAR_BOTTOM_TOLERANCE_PX,
): boolean {
  return distanceFromBottom(element) <= tolerancePx
}

function metrics(scrollHeight: number, scrollTop: number, clientHeight: number) {
  return { scrollHeight, scrollTop, clientHeight }
}

const SCROLL_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDChatScroll.tsx',
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

Deno.test('distanceFromBottom: flush bottom is 0', () => {
  const d = distanceFromBottom(metrics(1000, 800, 200))
  if (d !== 0) throw new Error(`expected 0, got ${d}`)
})

Deno.test('distanceFromBottom: scrolled up reports positive distance', () => {
  const d = distanceFromBottom(metrics(1000, 500, 200))
  if (d !== 300) throw new Error(`expected 300, got ${d}`)
})

Deno.test('isNearBottom: within default tolerance band (inclusive)', () => {
  if (!isNearBottom(metrics(1000, 680, 200))) {
    throw new Error('expected near bottom at exactly NEAR_BOTTOM_TOLERANCE_PX')
  }
})

Deno.test('isNearBottom: beyond tolerance is not near bottom', () => {
  if (isNearBottom(metrics(1000, 679, 200))) {
    throw new Error('expected not near bottom just past the band')
  }
})

Deno.test('isNearBottom: custom tolerance', () => {
  if (!isNearBottom(metrics(1000, 750, 200), 50)) {
    throw new Error('expected near bottom with tolerance 50 (distance 50)')
  }
  if (isNearBottom(metrics(1000, 749, 200), 50)) {
    throw new Error('expected not near bottom with tolerance 50 (distance 51)')
  }
})

Deno.test('source exports NEAR_BOTTOM_TOLERANCE_PX = 120 and pure helpers', async () => {
  const source = await Deno.readTextFile(SCROLL_SOURCE)
  const checks = [
    'export const NEAR_BOTTOM_TOLERANCE_PX = 120',
    'export function distanceFromBottom',
    'export function isNearBottom',
    'requestAnimationFrame',
    'ResizeObserver',
    'visualViewport',
    // Rework loop 1: deferred App scroller must re-bind listeners/RO when shell mounts.
    'scrollerKey',
    '[scrollerKey]',
    '[anchorToBottom, scrollerKey]',
  ]
  for (const needle of checks) {
    if (!source.includes(needle)) {
      throw new Error(`LibertyMDChatScroll.tsx missing expected contract: ${needle}`)
    }
  }
})

Deno.test('App passes scrollerKey so hook rebinds after leaving initial phase', async () => {
  const appSource = await Deno.readTextFile(APP_SOURCE)
  if (!appSource.includes('scrollerKey: phase !== \'initial\'')) {
    throw new Error('LibertyMDApp.tsx must pass scrollerKey: phase !== \'initial\'')
  }
})

Deno.test('hook exports pill state machine contracts (showJump / jumpToLatest / force clear)', async () => {
  const source = await Deno.readTextFile(SCROLL_SOURCE)
  const checks = [
    'export function LibertyMDNewMessagePill',
    'const [showJumpToLatest, setShowJumpToLatest] = useState(false)',
    'const jumpToLatest = useCallback(() => {',
    'setShowJumpToLatest(false)',
    'anchorToBottom(\'smooth\')',
    'if (!pinnedRef.current) setShowJumpToLatest(true)',
    '[messageRevision, force]',
    'if (force) {',
    'anchorToBottom(\'instant\')',
    'return { scrollRef, contentRef, footerRef, showJumpToLatest, jumpToLatest, restoreScrollPosition }',
  ]
  for (const needle of checks) {
    if (!source.includes(needle)) {
      throw new Error(`LibertyMDChatScroll.tsx missing pill contract: ${needle}`)
    }
  }
  // Scroll-dismiss: near-bottom clears the pill without a tap.
  if (!source.includes('distanceFromBottom(element) <= NEAR_BOTTOM_TOLERANCE_PX')) {
    throw new Error('scroll handler must clear pill inside NEAR_BOTTOM_TOLERANCE_PX band')
  }
})

Deno.test('Chat mounts LibertyMDNewMessagePill with emergency hide and jump handler', async () => {
  const chatSource = await Deno.readTextFile(CHAT_SOURCE)
  const checks = [
    'LibertyMDNewMessagePill',
    'showJumpToLatest',
    'jumpToLatest',
    'force: isEmergencyStopped',
    'showJumpToLatest && !isEmergencyStopped',
    'label="New message"',
    'onClick={jumpToLatest}',
    'relative z-20',
  ]
  for (const needle of checks) {
    if (!chatSource.includes(needle)) {
      throw new Error(`LibertyMDChat.tsx missing pill wiring: ${needle}`)
    }
  }
})

Deno.test('App mounts LibertyMDNewMessagePill with emergency hide, z-20 footer, jump handler', async () => {
  const appSource = await Deno.readTextFile(APP_SOURCE)
  const checks = [
    'LibertyMDNewMessagePill',
    'showJumpToLatest',
    'jumpToLatest',
    'force: phase === \'emergency_end\'',
    'showJumpToLatest && !isEmergencyStopped',
    'label="New message"',
    'onClick={jumpToLatest}',
    'relative z-20 shrink-0',
  ]
  for (const needle of checks) {
    if (!appSource.includes(needle)) {
      throw new Error(`LibertyMDApp.tsx missing pill wiring: ${needle}`)
    }
  }
  // P0-21 Q2A: App consult footer gains Chat-parity safe-area.
  if (!appSource.includes('pb-[max(12px,env(safe-area-inset-bottom))]')) {
    throw new Error('App footer must include Chat-parity safe-area padding (P0-21)')
  }
})

Deno.test('P0-23: TRANSCRIPT_BOTTOM_CLEARANCE_CLASS exported as pb-10 sm:pb-12', async () => {
  const source = await Deno.readTextFile(SCROLL_SOURCE)
  if (!source.includes("export const TRANSCRIPT_BOTTOM_CLEARANCE_CLASS = 'pb-10 sm:pb-12'")) {
    throw new Error(
      'LibertyMDChatScroll.tsx must export TRANSCRIPT_BOTTOM_CLEARANCE_CLASS = \'pb-10 sm:pb-12\'',
    )
  }
  // Ownership comment so clearance stays attributed to P0-23 closeout.
  if (!source.includes('P0-23') || !source.includes('persistent clearance')) {
    throw new Error('clearance constant must keep the P0-23 persistent-clearance ownership comment')
  }
})

Deno.test('P0-23: Chat contentRef applies TRANSCRIPT_BOTTOM_CLEARANCE_CLASS', async () => {
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  // Applied on the scrolled content node (contentRef), not as footer chrome.
  if (
    !chat.includes(
      'ref={contentRef} className={`mx-auto w-full max-w-3xl ${TRANSCRIPT_BOTTOM_CLEARANCE_CLASS}`}',
    )
  ) {
    throw new Error(
      'LibertyMDChat.tsx contentRef must apply TRANSCRIPT_BOTTOM_CLEARANCE_CLASS on scrolled content',
    )
  }
})

Deno.test('P0-23: App contentRef applies TRANSCRIPT_BOTTOM_CLEARANCE_CLASS', async () => {
  const app = await Deno.readTextFile(APP_SOURCE)
  if (!app.includes('ref={contentRef} className={TRANSCRIPT_BOTTOM_CLEARANCE_CLASS}')) {
    throw new Error(
      'LibertyMDApp.tsx contentRef must apply TRANSCRIPT_BOTTOM_CLEARANCE_CLASS on scrolled content',
    )
  }
})

Deno.test('P0-23: Q4A do-not-grow needle on footer ResizeObserver path', async () => {
  // Non-overlapping with continuation AC3: only the Q4A "do not grow" contract string.
  // Present/absent bar ∈ footerRef + empty→null stay in continuation-action-bar.test.ts.
  const source = await Deno.readTextFile(SCROLL_SOURCE)
  if (
    !source.includes(
      'do not grow TRANSCRIPT_BOTTOM_CLEARANCE_CLASS unless clip evidence appears',
    )
  ) {
    throw new Error(
      'footer ResizeObserver comment must forbid growing clearance without clip evidence (Q4A)',
    )
  }
  if (!source.includes('observer.observe(footerRef.current)')) {
    throw new Error('footer ResizeObserver must still observe footerRef')
  }
})
