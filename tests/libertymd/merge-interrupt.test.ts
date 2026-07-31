/**
 * P1-25 — Merge interrupt audit-lock: source contracts.
 *
 * AC1–AC4 / AC6: ReportGate mount gate, emergency z-order, composer/draft not locked
 * by conflict error, App has no merge chrome, CARE interrupt policy greppable,
 * S3 mergeNotice gated on transfer token, no new Mixpanel invent in Chat hunk.
 *
 * Run focused: `deno test --no-config --allow-read tests/libertymd/merge-interrupt.test.ts`
 * Wired into `test:libertymd:ci` via `test:libertymd:merge-interrupt`.
 */
declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const CHAT_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDChat.tsx',
  import.meta.url,
)
const CARE_CONTROLS = new URL(
  '../../components/LibertyMD/LibertyMDCareControls.tsx',
  import.meta.url,
)
const APP_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDApp.tsx',
  import.meta.url,
)
const OVERLAY_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDOverlaySheet.tsx',
  import.meta.url,
)
const EMERGENCY_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDEmergencyAlert.tsx',
  import.meta.url,
)
const CARE_DOC = new URL(
  '../../docs/libertymd/CARE-ARCHITECTURE.md',
  import.meta.url,
)
const IDENTITY_SOURCE = new URL(
  '../../supabase/functions/libertymd-care-proxy/actions/identity.ts',
  import.meta.url,
)

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function reportGateRegion(source: string): string {
  const start = source.indexOf('export function LibertyMDReportGate')
  assert(start >= 0, 'LibertyMDReportGate not found')
  const next = source.indexOf('export function LibertyMDAccountDrawer', start)
  assert(next > start, 'LibertyMDAccountDrawer not found after ReportGate')
  return source.slice(start, next)
}

function chatReportGateMount(source: string): string {
  const marker = "phase === 'report_gate' && isReportGateOpen && ("
  const start = source.indexOf(marker)
  assert(start >= 0, 'Chat ReportGate mount predicate missing')
  const selfClose = source.indexOf('/>', start)
  assert(selfClose > start, 'LibertyMDReportGate self-close missing after mount')
  // Include through the wrapping conditional close.
  const wrapClose = source.indexOf(')}', selfClose)
  assert(wrapClose > selfClose, 'ReportGate mount wrap close missing')
  return source.slice(start, wrapClose + 2)
}

Deno.test('P1-25 AC1: CARE documents merge interrupt policy', async () => {
  const care = await Deno.readTextFile(CARE_DOC)
  assert(care.includes('P1-25 · Merge interrupt policy'), 'CARE must own P1-25 interrupt paragraph')
  assert(care.includes('prepare_account_merge'), 'CARE must name prepare status gate')
  assert(care.includes('report_pending_auth'), 'CARE must name gate status')
  assert(care.includes('z-[120]') || care.includes('z-120') || care.includes('Emergency Alert'), 'CARE must document emergency outrank')
  assert(care.includes('no clinical row movement') || care.includes('no clinical row'), 'CARE must document RPC abort consistency')
  // P4-05 landed Paths 0–2; interrupt policy still greppable and points at collision rule.
  assert(care.includes('P4-05 · Merge collision rule'), 'CARE must own P4-05 collision rule')
  assert(
    !care.includes('durable expired') || care.includes('do **not** durably persist'),
    'CARE must not overclaim durable expired/failed merge-row status',
  )
})

Deno.test('P1-25 AC1: prepare source-gates non-report_pending_auth', async () => {
  const identity = await Deno.readTextFile(IDENTITY_SOURCE)
  const prepareStart = identity.indexOf('export async function handlePrepareAccountMerge')
  assert(prepareStart >= 0, 'handlePrepareAccountMerge missing')
  const prepareEnd = identity.indexOf('export async function handleCompleteAccountMerge', prepareStart)
  const prepare = identity.slice(prepareStart, prepareEnd > prepareStart ? prepareEnd : prepareStart + 1200)
  assert(prepare.includes("consultation.status !== 'report_pending_auth'"), 'prepare must status-gate')
  assert(prepare.includes('Report is not ready'), 'prepare must return not-ready error')
  assert(prepare.includes('409'), 'prepare must respond 409 off-gate')
})

Deno.test('P1-25 AC1/AC2: Chat mounts ReportGate only on report_gate phase', async () => {
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  const mount = chatReportGateMount(chat)
  assert(mount.includes('<LibertyMDReportGate'), 'ReportGate must mount under phase gate')
  assert(
    !chat.includes("phase === 'intake' && isReportGateOpen"),
    'ReportGate must never mount on intake',
  )
  assert(
    chat.includes("if (status === 'report_pending_auth') return 'report_gate'"),
    'phaseFromStatus must map report_pending_auth → report_gate',
  )
  // interviewing / high_risk fall through to intake (no dedicated branch).
  const phaseFn = chat.slice(
    chat.indexOf('const phaseFromStatus'),
    chat.indexOf('const statusCopy'),
  )
  assert(!phaseFn.includes("'high_risk'"), 'high_risk must not map to report_gate')
  assert(phaseFn.includes("return 'intake'"), 'non-gate statuses fall through to intake')
})

Deno.test('P1-25 AC4: emergency z-120 outranks OverlaySheet z-90; ReportGate never on emergency_end', async () => {
  const emergency = await Deno.readTextFile(EMERGENCY_SOURCE)
  const overlay = await Deno.readTextFile(OVERLAY_SOURCE)
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  assert(emergency.includes('z-[120]'), 'emergency must stay z-[120]')
  assert(overlay.includes('z-[90]'), 'overlay / ReportGate host must stay z-[90]')
  const mount = chatReportGateMount(chat)
  assert(mount.startsWith("phase === 'report_gate' && isReportGateOpen && ("), 'ReportGate mount is report_gate-only')
  assert(!mount.includes('emergency_end'), 'ReportGate JSX mount must not include emergency_end')
  assert(
    chat.includes("status === 'emergency_stopped') return 'emergency_end'"),
    'emergency_stopped maps to emergency_end (mutually exclusive with report_gate)',
  )
})

Deno.test('P1-25 AC3: composer locks ignore error / hasIdentityConflict; draft keys survive', async () => {
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  const sendLock = chat.match(/const composerSendLocked\s*=\s*([^;]+);/)
  const inputLock = chat.match(/const composerInputLocked\s*=\s*([^;]+);/)
  assert(sendLock, 'composerSendLocked missing')
  assert(inputLock, 'composerInputLocked missing')
  assert(!sendLock[1].includes('error'), 'send lock must not key off error')
  assert(!sendLock[1].includes('hasIdentityConflict'), 'send lock must not key off identity conflict')
  assert(!inputLock[1].includes('error'), 'input lock must not key off error')
  assert(!inputLock[1].includes('hasIdentityConflict'), 'input lock must not key off identity conflict')
  // Draft persistence still wired (P1-12) — conflict path must not clear drafts by itself.
  assert(chat.includes('writeDraft') || chat.includes('readDraft'), 'draft persistence remains in Chat')
  assert(
    !chat.includes("clearLibertyMdConsultClientState") || chat.includes('shouldClearClientPhiForPhase'),
    'draft clear remains phase-gated, not conflict-gated',
  )
})

Deno.test('P1-25 S3: mergeNotice requires transfer token at Chat mount; CareControls merge chrome unchanged shape', async () => {
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  const mount = chatReportGateMount(chat)
  assert(
    mount.includes('libertymd-transfer:') && mount.includes('sessionStorage'),
    'identityConflict prop must gate on libertymd-transfer session token (S3)',
  )
  const care = await Deno.readTextFile(CARE_CONTROLS)
  const gate = reportGateRegion(care)
  assert(gate.includes("t('careControls.mergeNotice')"), 'mergeNotice chrome stays in ReportGate')
  assert(gate.includes('identityConflict && onExistingGoogle'), 'CareControls still keys mergeNotice on props')
  assert(gate.includes('data-libertymd-merge-collision-outcome') || gate.includes('collisionPath'), 'P4-05 outcome slot present')
  // P2-06 soft-gate chrome must remain (do not steal).
  assert(gate.includes('data-libertymd-soft-gate-benefits'), 'P2-06 benefits marker must remain')
  assert(gate.includes('data-libertymd-soft-gate-continue-guest'), 'P2-06 guest CTA marker must remain')
})

Deno.test('P1-25 S4: App has no merge conflict chrome / no prepare_account_merge', async () => {
  const app = await Deno.readTextFile(APP_SOURCE)
  assert(!app.includes('identityConflict'), 'App ReportGate must not pass identityConflict')
  assert(!app.includes('onExistingGoogle'), 'App must not mount Sign-in-and-merge')
  assert(!app.includes('prepare_account_merge'), 'App must not call prepare_account_merge')
  assert(!app.includes("t('careControls.mergeNotice')"), 'App must not render mergeNotice')
  assert(app.includes('<LibertyMDReportGate'), 'App still mounts soft ReportGate without merge chrome')
})

Deno.test('P1-25 AC6: no new Mixpanel / product_event invent in Chat identity merge path', async () => {
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  // Existing identity events are consumed (P1-17); do not invent merge-interrupt names.
  assert(!chat.includes('LibertyMd Merge Interrupt'), 'no invented Mixpanel name')
  assert(!chat.includes('merge_interrupt'), 'no invented product_event name')
  assert(!chat.includes(".from('libertymd_"), 'FE must not write clinical tables')
})
