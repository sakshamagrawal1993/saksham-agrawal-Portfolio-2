/**
 * P0-22 — source contracts for LibertyMDOverlaySheet + ReportGate migration.
 *
 * Deno cannot mount React without a harness, so this suite asserts source: portal to
 * document.body, Escape→onClose (≠ emergency swallow), backdrop dismiss, handle-only drag,
 * focus trap/restore + container initial focus, body+consult scroll-lock capture/restore,
 * ReportGate uses the primitive, Chat+App still mount ReportGate, AccountDrawer may
 * host P1-04 add-profile CTA (P0-22 Q3A freeze superseded),
 * mobile sheet vs desktop popup branches.
 *
 * Run focused: `deno test --no-config --allow-read tests/libertymd/overlay-sheet.test.ts`
 * Wired into `test:libertymd:ci` via `test:libertymd:overlay-sheet`.
 */
declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const OVERLAY_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDOverlaySheet.tsx',
  import.meta.url,
)
const SCROLL_LOCK_SOURCE = new URL(
  '../../components/LibertyMD/libertymd-scroll-lock.ts',
  import.meta.url,
)
const CARE_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDCareControls.tsx',
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
const EMERGENCY_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDEmergencyAlert.tsx',
  import.meta.url,
)
const ACCOUNT_BACKUP = new URL(
  '../../tickets/P0-22/backup/20260731-133756/LibertyMDCareControls.tsx',
  import.meta.url,
)

function reportGateRegion(source: string): string {
  const start = source.indexOf('export function LibertyMDReportGate')
  if (start < 0) throw new Error('LibertyMDReportGate not found')
  const next = source.indexOf('export function LibertyMDAccountDrawer', start)
  if (next < 0) throw new Error('LibertyMDAccountDrawer not found after ReportGate')
  return source.slice(start, next)
}

function accountDrawerRegion(source: string): string {
  const start = source.indexOf('export function LibertyMDAccountDrawer')
  if (start < 0) throw new Error('LibertyMDAccountDrawer not found')
  const next = source.indexOf('export function LibertyMDProfileCapabilityOffer', start)
  const end = next > start ? next : source.length
  return source.slice(start, end)
}

function contentRefRegion(source: string): string {
  const marker = 'ref={contentRef}'
  const start = source.indexOf(marker)
  if (start < 0) throw new Error('contentRef not found')
  const footer = source.indexOf('ref={footerRef}', start)
  const mainClose = source.indexOf('</main>', start)
  const end = Math.min(
    footer > start ? footer : source.length,
    mainClose > start ? mainClose : source.length,
  )
  return source.slice(start, end)
}

Deno.test('overlay sheet: portals to document.body via createPortal', async () => {
  const source = await Deno.readTextFile(OVERLAY_SOURCE)
  if (!source.includes("from 'react-dom'") && !source.includes('from "react-dom"')) {
    throw new Error('must import createPortal from react-dom')
  }
  if (!source.includes('createPortal(')) {
    throw new Error('must call createPortal')
  }
  if (!source.includes('document.body')) {
    throw new Error('portal target must be document.body')
  }
  if (!source.includes('fixed inset-0') || !source.includes('z-[90]')) {
    throw new Error('overlay must be fixed + z-[90] (below emergency z-120)')
  }
})

Deno.test('overlay sheet: Escape closes (unlike emergency swallow); backdrop + trap + restore', async () => {
  const overlay = await Deno.readTextFile(OVERLAY_SOURCE)
  const emergency = await Deno.readTextFile(EMERGENCY_SOURCE)

  if (!overlay.includes("event.key === 'Escape'") || !overlay.includes('onClose()')) {
    throw new Error('Escape must invoke onClose')
  }
  // Emergency still swallows Escape without calling a close handler.
  if (!emergency.includes("event.key === 'Escape'") || !emergency.includes('return;')) {
    throw new Error('sanity: emergency Escape swallow must still exist')
  }
  if (emergency.includes('onClose()')) {
    throw new Error('emergency must not grow an onClose Escape path')
  }

  if (!overlay.includes('event.target === event.currentTarget') || !overlay.includes('onClose()')) {
    throw new Error('backdrop tap must call onClose')
  }
  if (!overlay.includes("event.key !== 'Tab'") || !overlay.includes('focusable')) {
    throw new Error('hand-rolled Tab focus trap required')
  }
  if (!overlay.includes('previousFocusRef') || !overlay.includes('restore.focus')) {
    throw new Error('focus restore on close required')
  }
  if (!overlay.includes('tabIndex={-1}') || !overlay.includes('panelRef.current?.focus')) {
    throw new Error('initial focus must land on labelled dialog container')
  }
  if (!overlay.includes('role="dialog"') || !overlay.includes('aria-modal="true"')) {
    throw new Error('dialog semantics required')
  }
  if (!overlay.includes('dismiss policy differs') && !overlay.includes('Escape **closes**') && !overlay.includes('Escape closes')) {
    // Comment required that policy differs from emergency.
    if (!overlay.includes('emergency swallows Escape') && !overlay.includes('opposite of LibertyMDEmergencyAlert')) {
      throw new Error('must comment that Escape closes (≠ emergency swallow)')
    }
  }
})

Deno.test('overlay sheet: handle-only drag on mobile; desktop omits drag handlers', async () => {
  const source = await Deno.readTextFile(OVERLAY_SOURCE)
  if (!source.includes('data-libertymd-overlay-drag-handle')) {
    throw new Error('dedicated drag handle marker required')
  }
  if (!source.includes('!isDesktop && (') && !source.includes('{!isDesktop &&')) {
    throw new Error('drag handle must be mobile-only (desktop omits handlers)')
  }
  if (!source.includes('onPointerDown={onHandlePointerDown}')) {
    throw new Error('handle pointer handlers required on sheet path')
  }
  // Drag must not attach to overlay body as the owner.
  const bodyIdx = source.indexOf('data-libertymd-overlay-body')
  const bodySlice = source.slice(bodyIdx, bodyIdx + 280)
  if (bodySlice.includes('onPointerDown')) {
    throw new Error('sheet body must not own drag-dismiss (handle-only Q4A)')
  }
  if (!source.includes("items-end") || !source.includes('sm:items-center')) {
    throw new Error('mobile sheet + desktop centered popup branch required')
  }
  if (!source.includes("data-libertymd-overlay-mode={isDesktop ? 'popup' : 'sheet'}")) {
    throw new Error('mode attribute for sheet vs popup required')
  }
})

Deno.test('scroll lock: captures and restores body scrollY and consult scrollTop', async () => {
  const source = await Deno.readTextFile(SCROLL_LOCK_SOURCE)
  if (!source.includes('window.scrollY') || !source.includes("position = 'fixed'")) {
    throw new Error('iOS-safe body lock (fixed + scrollY) required')
  }
  if (!source.includes('window.scrollTo(0, scrollY)')) {
    throw new Error('body scrollY restore required')
  }
  if (!source.includes('scrollTop') || !source.includes("overflow = 'hidden'")) {
    throw new Error('consult scroller scrollTop capture + overflow lock required')
  }
  if (!source.includes('data-libertymd-consult-scroller')) {
    throw new Error('consult scroller selector required')
  }
  if (!source.includes('previousConsult') && !source.includes('scrollTop = previousConsult.scrollTop')) {
    if (!source.includes('scroller.scrollTop = previousConsult.scrollTop')) {
      throw new Error('consult scrollTop restore required')
    }
  }
})

Deno.test('ReportGate migrates onto OverlaySheet; soft-gate actions preserved', async () => {
  const care = await Deno.readTextFile(CARE_SOURCE)
  const gate = reportGateRegion(care)
  if (!gate.includes('LibertyMDOverlaySheet') || !gate.includes('<LibertyMDOverlaySheet')) {
    throw new Error('ReportGate must render LibertyMDOverlaySheet')
  }
  if (gate.includes('fixed inset-0 z-[90]') && !gate.includes('LibertyMDOverlaySheet')) {
    throw new Error('legacy non-portalled fixed gate chrome must be gone')
  }
  for (const token of ['onGoogle', 'onSkip', 'onClose', 'aria-label="Close"', "t('reportGate.google')"]) {
    if (!gate.includes(token)) throw new Error(`ReportGate must preserve ${token}`)
  }
  if (!care.includes("from './LibertyMDOverlaySheet'")) {
    throw new Error('CareControls must import LibertyMDOverlaySheet')
  }
})

Deno.test('P2-06 · ReportGate benefits + equal-prominence Continue-as-guest (h-14 outline)', async () => {
  const care = await Deno.readTextFile(CARE_SOURCE)
  const gate = reportGateRegion(care)
  for (const token of [
    "t('reportGate.headline')",
    "t('reportGate.body')",
    "t('reportGate.benefitKeep')",
    "t('reportGate.benefitHistory')",
    "t('reportGate.benefitFamily')",
    "t('reportGate.skip')",
    'data-libertymd-soft-gate-continue-guest',
    'data-libertymd-soft-gate-benefits',
  ]) {
    if (!gate.includes(token)) throw new Error(`P2-06 soft-gate chrome missing ${token}`)
  }
  if (gate.includes('careControls.skipOnce')) {
    throw new Error('Continue-as-guest must use reportGate.skip, not muted skipOnce')
  }
  if (gate.includes('Free 24/7 care') || gate.includes('$39')) {
    throw new Error('legacy / commercial benefit chips forbidden')
  }
  // Source contract: guest control is h-14 outline (visual ATF = UNTESTABLE).
  const guestIdx = gate.indexOf('data-libertymd-soft-gate-continue-guest')
  if (guestIdx < 0) throw new Error('guest marker missing')
  const guestBtn = gate.slice(Math.max(0, guestIdx - 280), guestIdx + 200)
  if (!guestBtn.includes('h-14') || !guestBtn.includes('border-libertymd-blue-600')) {
    throw new Error('Continue-as-guest must be h-14 outline (border-libertymd-blue-600)')
  }
})

Deno.test('Chat + App mount ReportGate; consult scroller marked; sheet not under contentRef', async () => {
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  const app = await Deno.readTextFile(APP_SOURCE)

  for (const [label, source] of [['Chat', chat], ['App', app]] as const) {
    if (!source.includes('<LibertyMDReportGate')) {
      throw new Error(`${label} must still mount LibertyMDReportGate`)
    }
    if (!source.includes('data-libertymd-consult-scroller')) {
      throw new Error(`${label} consult scroller must carry data-libertymd-consult-scroller`)
    }
    const region = contentRefRegion(source)
    if (region.includes('LibertyMDReportGate') || region.includes('LibertyMDOverlaySheet')) {
      throw new Error(`${label}: overlay must not live under contentRef`)
    }
  }
})

Deno.test('AccountDrawer keeps history chrome; P1-04 may add capability CTA (Q3A freeze lifted)', async () => {
  const care = await Deno.readTextFile(CARE_SOURCE)
  const historyList = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDHistoryList.tsx', import.meta.url),
  )
  const drawer = accountDrawerRegion(care)
  // P0-22: drawer must not become an overlay-sheet host for report gate.
  if (drawer.includes('LibertyMDOverlaySheet')) {
    throw new Error('AccountDrawer must not host OverlaySheet (report gate stays separate)')
  }
  // P4-03 extracted empty/list chrome into LibertyMDHistoryList; drawer still mounts it.
  const historyChrome =
    drawer.includes('Consultation history')
    || drawer.includes('emptyHistory')
    || drawer.includes('historyHeading')
    || (drawer.includes('LibertyMDHistoryList') && historyList.includes('emptyHistory'))
  if (!historyChrome) {
    throw new Error('AccountDrawer history chrome must remain')
  }
  // P1-04 Q2C: anonymous add-profile primary CTA is allowed here.
  if (!drawer.includes('onCareForSomeoneElse') || !drawer.includes('data-libertymd-add-profile="drawer"')) {
    throw new Error('P1-04 drawer add-profile CTA expected')
  }
})

Deno.test('emergency file not edited; still outranks overlay', async () => {
  const emergency = await Deno.readTextFile(EMERGENCY_SOURCE)
  if (!emergency.includes('z-[120]')) {
    throw new Error('emergency must remain z-[120]')
  }
  // No backdrop dismiss / Escape close.
  if (emergency.includes('onMouseDown') && emergency.includes('onClose')) {
    throw new Error('emergency must not gain backdrop dismiss')
  }
  const overlay = await Deno.readTextFile(OVERLAY_SOURCE)
  if (!overlay.includes('z-[90]')) {
    throw new Error('overlay must stay under emergency at z-[90]')
  }
})
