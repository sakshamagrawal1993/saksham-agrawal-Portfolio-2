/**
 * P0-24 — mobile viewport closeout source contracts (shell / safe-area / leave / tap targets).
 *
 * Prefer this suite over cluttering chat-scroll with meta/leave/tap needles.
 * Run focused: `deno test --no-config --allow-read tests/libertymd/mobile-viewport.test.ts`
 * Wired into `test:libertymd:ci` via `test:libertymd:mobile-viewport`.
 *
 * AC8 physical devices remain UNTESTABLE (no harness) — do not greenwash from this file.
 */
declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const ROOT = new URL('../..', import.meta.url)
const INDEX_HTML = new URL('index.html', ROOT)
const INDEX_CSS = new URL('index.css', ROOT)
const CHAT = new URL('components/LibertyMD/LibertyMDChat.tsx', ROOT)
const APP = new URL('components/LibertyMD/LibertyMDApp.tsx', ROOT)
const LANG = new URL('components/LibertyMD/LibertyMDLanguageSwitcher.tsx', ROOT)
const SCROLL = new URL('components/LibertyMD/LibertyMDChatScroll.tsx', ROOT)
const LOCK = new URL('components/LibertyMD/libertymd-scroll-lock.ts', ROOT)

Deno.test('AC1: Chat root uses 100svh; App root uses min-h-[100svh] not min-h-screen', async () => {
  const chat = await Deno.readTextFile(CHAT)
  const app = await Deno.readTextFile(APP)
  if (!chat.includes('h-[100svh]')) {
    throw new Error('Chat shell must keep h-[100svh]')
  }
  if (!app.includes('min-h-[100svh]')) {
    throw new Error('App root must use min-h-[100svh]')
  }
  // Root class line must not retain classic min-h-screen (marketing film spacers out of scope).
  if (/className="min-h-screen\b/.test(app)) {
    throw new Error('App root must not use min-h-screen (AC1 / Q2 absorb)')
  }
})

Deno.test('AC1 Q2A: App consult column governed by svh without min-h-[560px]', async () => {
  const app = await Deno.readTextFile(APP)
  if (!app.includes('h-[min(70svh,720px)]')) {
    throw new Error('App consult column must keep h-[min(70svh,720px)]')
  }
  // Class usage only — comments may mention the removed floor.
  if (/className="[^"]*min-h-\[560px\]/.test(app) || /className=\{`[^`]*min-h-\[560px\]/.test(app)) {
    throw new Error('App consult column must drop min-h-[560px] so short 70svh can govern (Q2A)')
  }
  if (!app.includes('min-h-0 flex-col')) {
    throw new Error('App consult column must keep min-h-0 flex-child pattern')
  }
})

Deno.test('AC2: viewport-fit=cover + Chat top safe-area + bottom safe-area retained', async () => {
  const html = await Deno.readTextFile(INDEX_HTML)
  const css = await Deno.readTextFile(INDEX_CSS)
  const chat = await Deno.readTextFile(CHAT)
  const app = await Deno.readTextFile(APP)
  if (!html.includes('viewport-fit=cover')) {
    throw new Error('index.html viewport meta must include viewport-fit=cover (Q3A)')
  }
  if (!css.includes('.libertymd-safe-top') || !css.includes('safe-area-inset-top')) {
    throw new Error('index.css must define libertymd-safe-top with safe-area-inset-top')
  }
  if (!chat.includes('libertymd-safe-top')) {
    throw new Error('Chat header must apply libertymd-safe-top')
  }
  if (!chat.includes('pb-[max(12px,env(safe-area-inset-bottom))]')) {
    throw new Error('Chat footer bottom safe-area must be retained')
  }
  if (!app.includes('pb-[max(12px,env(safe-area-inset-bottom))]')) {
    throw new Error('App consult footer bottom safe-area must be retained')
  }
})

Deno.test('AC3/AC4 source: visualViewport settle + scroll-lock restore retained', async () => {
  const scroll = await Deno.readTextFile(SCROLL)
  const lock = await Deno.readTextFile(LOCK)
  for (const needle of ['visualViewport', 'VIEWPORT_SETTLE_MS', 'viewportSettlingUntilRef']) {
    if (!scroll.includes(needle)) {
      throw new Error(`LibertyMDChatScroll.tsx missing keyboard settle contract: ${needle}`)
    }
  }
  if (!lock.includes('window.scrollTo(0, scrollY)') || !lock.includes('scroller.scrollTop')) {
    throw new Error('scroll-lock release must restore body scrollY and consult scrollTop')
  }
  if (!lock.includes('P0-24 DoD+') || !lock.includes('Soft leave')) {
    throw new Error('scroll-lock must document P0-24 soft-leave / scroll-restore DoD+')
  }
})

Deno.test('AC5 Q1A: Chat soft leave — Back + popstate, no abandon, no window.confirm', async () => {
  const chat = await Deno.readTextFile(CHAT)
  const checks = [
    'LIBERTYMD_RECOVERABLE_CONSULTATION_KEY',
    'softLeaveConsult',
    "addEventListener('popstate'",
    'stashRecoverableConsultationId',
    'showSoftLeaveToast',
  ]
  for (const needle of checks) {
    if (!chat.includes(needle)) {
      throw new Error(`LibertyMDChat.tsx missing soft-leave contract: ${needle}`)
    }
  }
  if (/\bwindow\.confirm\s*\(/.test(chat)) {
    throw new Error('Chat must not call window.confirm (CONTEXT §4)')
  }
  // Soft leave path must not call abandon — abandon remains only on startOver.
  const softLeaveBlock = chat.slice(
    chat.indexOf('const softLeaveConsult'),
    chat.indexOf('const selectConsultation'),
  )
  if (softLeaveBlock.includes('abandon_consultation')) {
    throw new Error('softLeaveConsult must not call abandon_consultation')
  }
  if (!chat.includes("action: 'abandon_consultation'")) {
    throw new Error('startOver may still abandon — abandon_consultation must remain elsewhere')
  }
})

Deno.test('AC6: consult shell overflow-x containment helper present', async () => {
  const css = await Deno.readTextFile(INDEX_CSS)
  const chat = await Deno.readTextFile(CHAT)
  const app = await Deno.readTextFile(APP)
  if (!css.includes('.libertymd-consult-shell') || !css.includes('overflow-x: clip')) {
    throw new Error('index.css must define libertymd-consult-shell with overflow-x: clip')
  }
  if (!chat.includes('libertymd-consult-shell')) {
    throw new Error('Chat root must apply libertymd-consult-shell')
  }
  if (!app.includes('libertymd-consult-shell')) {
    throw new Error('App consult column must apply libertymd-consult-shell')
  }
})

Deno.test('AC7 Q4A: listed chrome tap targets use min-h-11 / min-w-11', async () => {
  const chat = await Deno.readTextFile(CHAT)
  const app = await Deno.readTextFile(APP)
  const lang = await Deno.readTextFile(LANG)

  // Chat Back / Menu / send — at least one min-h-11 min-w-11 each in header/composer region.
  const chatNeedles = [
    'min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-libertymd-slate-500', // Back
    'min-h-11 min-w-11 items-center justify-center rounded-full text-libertymd-navy', // Menu
    // "+ New chat" removed from the consult header (BO 2026-08-01); the action
    // moved into the account drawer, whose tap target is asserted below.
    'min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-libertymd-blue-600', // send
  ]
  for (const needle of chatNeedles) {
    if (!chat.includes(needle)) {
      throw new Error(`Chat missing ≥44 tap-target class needle: ${needle}`)
    }
  }
  const care = await Deno.readTextFile('components/LibertyMD/LibertyMDCareControls.tsx')
  if (!/data-libertymd-start-over="drawer"[\s\S]{0,400}h-12 w-full/.test(care)) {
    throw new Error('drawer start-over control must keep a ≥44px tap target')
  }
  if (!lang.includes('min-h-11 items-center gap-2')) {
    throw new Error('Language switcher trigger must be min-h-11 (Q4A)')
  }
  if (!app.includes('min-h-11 min-w-11 items-center justify-center text-libertymd-ink')) {
    throw new Error('App menu must be min-h-11 min-w-11 (Q4A)')
  }
  if (!app.includes('min-h-11 min-w-11 items-center justify-center gap-1.5')) {
    throw new Error('App Reset must expose min-h-11 min-w-11 hit area (Q4A)')
  }
})

Deno.test('S1A: Overlay desktop 90vh left alone (verify-only)', async () => {
  const overlay = await Deno.readTextFile(
    new URL('components/LibertyMD/LibertyMDOverlaySheet.tsx', ROOT),
  )
  if (!overlay.includes('90vh')) {
    throw new Error('Overlay desktop 90vh must remain (S1A leave alone)')
  }
  if (!overlay.includes('92dvh')) {
    throw new Error('Overlay mobile 92dvh must remain')
  }
})

Deno.test('DoD+: internal-scroller rationale documented on ChatScroll', async () => {
  const scroll = await Deno.readTextFile(SCROLL)
  if (!scroll.includes('Why an internal scroller (P0-24 DoD+)')) {
    throw new Error('LibertyMDChatScroll must document internal-scroller DoD+ rationale')
  }
})
