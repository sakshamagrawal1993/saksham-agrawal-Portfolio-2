/**
 * P1-13 — resume invitation copy + chief-complaint wire contracts.
 *
 * Source/contract suite (Deno cannot mount React). Truncate / resolve / body
 * helpers are re-checked as pure copies of the CareControls exports so AC1
 * present/absent + truncation stay non-zero without importing TSX.
 *
 * REQUIRES EXPERT REVIEW on interpolating invitation body — engineering Done ≠ clinical approval.
 *
 * Run: `deno test --no-config --allow-read tests/libertymd/resume-prompt.test.ts`
 */
declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const CARE_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDCareControls.tsx',
  import.meta.url,
)
const CHAT_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDChat.tsx',
  import.meta.url,
)
const BAR_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDContinuationActionBar.tsx',
  import.meta.url,
)
const ANALYTICS_SOURCE = new URL(
  '../../components/LibertyMD/libertymd-analytics.ts',
  import.meta.url,
)
const APP_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDApp.tsx',
  import.meta.url,
)

const RESUME_COMPLAINT_MAX_CHARS = 100

function truncateResumeChiefComplaint(raw: string, maxChars = RESUME_COMPLAINT_MAX_CHARS): string {
  const text = String(raw || '').trim().replace(/\s+/g, ' ')
  if (!text) return ''
  if (text.length <= maxChars) return text
  const slice = text.slice(0, maxChars)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > Math.floor(maxChars * 0.6) ? slice.slice(0, lastSpace) : slice
  return `${cut.trimEnd()}…`
}

function resolveResumeChiefComplaint(consultation: {
  chief_complaint?: string | null
  filled_slots?: Record<string, unknown> | null
} | null | undefined): string | null {
  const fromColumn = String(consultation?.chief_complaint ?? '').trim()
  if (fromColumn) return fromColumn
  const slots = consultation?.filled_slots
  if (slots && typeof slots === 'object' && !Array.isArray(slots)) {
    const fromSlots = String(slots.chief_complaint ?? '').trim()
    if (fromSlots) return fromSlots
  }
  return null
}

function buildResumeInvitationBody(chiefComplaint: string | null | undefined): string {
  const trimmed = String(chiefComplaint ?? '').trim()
  if (trimmed) {
    const echo = truncateResumeChiefComplaint(trimmed)
    return `You were sharing about “${echo}”. Your previous answers are still private and available.`
  }
  return "Your previous answers are still private and available. Continue when you're ready, or start fresh with a new concern."
}

function recoveryPromptRegion(care: string): string {
  const start = care.indexOf('export function LibertyMDAbandonedRecoveryPrompt')
  if (start < 0) throw new Error('LibertyMDAbandonedRecoveryPrompt not found')
  const end = care.indexOf('export function LibertyMDReportGate', start)
  return care.slice(start, end > 0 ? end : care.length)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

Deno.test('P1-13 AC1 · invitation title locked; paused eyebrow retired', async () => {
  const care = await Deno.readTextFile(CARE_SOURCE)
  const prompt = recoveryPromptRegion(care)
  assert(prompt.includes('Pick up where you left off?'), 'title must be Pick up where you left off?')
  assert(!prompt.includes('Consultation paused'), 'paused eyebrow must be dropped')
  assert(!prompt.includes('Continue where you left off?'), 'old title must not remain')
})

Deno.test('P1-13 AC1 · body echoes truncated complaint when present; generic when absent', () => {
  const withComplaint = buildResumeInvitationBody('mild sore throat for two days')
  assert(withComplaint.includes('mild sore throat for two days'), 'body must echo complaint')
  assert(withComplaint.includes('You were sharing about'), 'body must frame as echo')
  assert(!withComplaint.includes('leave it closed'), 'punitive leave framing banned')

  const long = 'word '.repeat(40).trim()
  const truncatedBody = buildResumeInvitationBody(long)
  assert(truncatedBody.includes('…'), 'long complaint must truncate with ellipsis')
  assert(truncatedBody.length < long.length + 80, 'body must not dump full long complaint')

  const absent = buildResumeInvitationBody(null)
  assert(absent.includes('still private and available'), 'fallback body must keep continuity')
  assert(!absent.includes('You were sharing about'), 'absent path must not invent complaint')
  assert(absent.toLowerCase().includes('start fresh'), 'fallback may mention Start fresh')
})

Deno.test('P1-13 AC1 · resolve prefers column then filled_slots; never invents', () => {
  assert(
    resolveResumeChiefComplaint({ chief_complaint: 'headache', filled_slots: { chief_complaint: 'other' } }) === 'headache',
    'column wins',
  )
  assert(
    resolveResumeChiefComplaint({ chief_complaint: null, filled_slots: { chief_complaint: 'cough' } }) === 'cough',
    'filled_slots fallback',
  )
  assert(resolveResumeChiefComplaint({ chief_complaint: '  ', filled_slots: {} }) === null, 'empty → null')
  assert(resolveResumeChiefComplaint(null) === null, 'null consult → null')
})

Deno.test('P1-13 AC1 · truncate ~100 at word boundary', () => {
  assert(truncateResumeChiefComplaint('short') === 'short', 'short passthrough')
  const words = Array.from({ length: 30 }, (_, i) => `symptom${i}`).join(' ')
  const out = truncateResumeChiefComplaint(words)
  assert(out.endsWith('…'), 'ellipsis')
  assert(out.length <= RESUME_COMPLAINT_MAX_CHARS + 1, `≤${RESUME_COMPLAINT_MAX_CHARS}+ellipsis`)
  assert(!out.slice(0, -1).includes('…'), 'single trailing ellipsis')
})

Deno.test('P1-13 AC1 · CareControls exports helpers + wires chiefComplaint prop', async () => {
  const care = await Deno.readTextFile(CARE_SOURCE)
  const prompt = recoveryPromptRegion(care)
  for (const needle of [
    'RESUME_COMPLAINT_MAX_CHARS = 100',
    'export function truncateResumeChiefComplaint',
    'export function resolveResumeChiefComplaint',
    'export function buildResumeInvitationBody',
    'chiefComplaint',
    'buildResumeInvitationBody(chiefComplaint)',
  ]) {
    assert(care.includes(needle) || prompt.includes(needle), `missing: ${needle}`)
  }
})

Deno.test('P1-13 AC2 · Continue + Start fresh equally available; outline secondary', async () => {
  const care = await Deno.readTextFile(CARE_SOURCE)
  const prompt = recoveryPromptRegion(care)
  assert(prompt.includes('>Continue<') || prompt.includes('\n          Continue\n'), 'primary Continue')
  assert(prompt.includes('Start fresh'), 'secondary Start fresh')
  assert(!prompt.includes('Resume consultation'), 'old primary gone')
  assert(!prompt.includes('Start over'), 'old secondary gone')
  assert(prompt.includes('border border-libertymd-blue-200 bg-white'), 'secondary stays outline')
  assert(prompt.includes('bg-libertymd-blue-600'), 'primary stays filled')
  assert(prompt.includes('sm:grid-cols-2'), 'equal availability grid')
})

Deno.test('P1-13 AC3 · no abandoned/recovery in patient-visible resume chrome (prompt + strip)', async () => {
  const care = await Deno.readTextFile(CARE_SOURCE)
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  const prompt = recoveryPromptRegion(care)

  const banned = /\b(abandoned|recovery)\b/i
  // Visible string literals in the prompt JSX / helper bodies (not aria ids / export name).
  const visibleChunks = [
    ...prompt.matchAll(/['"`]([^'"`]{3,})['"`]/g),
  ].map((m) => m[1])
  for (const chunk of visibleChunks) {
    if (chunk.includes('libertymd-recovery')) continue // aria id
    if (chunk.includes('AbandonedRecovery')) continue
    assert(!banned.test(chunk), `banned token in prompt visible string: ${chunk}`)
  }
  assert(!prompt.includes('Consultation paused'), 'paused framing banned on prompt')

  const stripMatch = chat.match(/recovery_required:\s*'([^']+)'/)
  assert(stripMatch, 'statusCopy.recovery_required must exist')
  assert(!banned.test(stripMatch![1]), `strip must not say abandoned/recovery: ${stripMatch![1]}`)
  assert(!/paused/i.test(stripMatch![1]), `strip must drop paused framing: ${stripMatch![1]}`)
  assert(stripMatch![1].includes('Pick up where you left off'), 'strip invitation-aligned')
})

Deno.test('P1-13 · Chat retains chief_complaint and passes into resume continuation', async () => {
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  assert(chat.includes('resolveResumeChiefComplaint'), 'must resolve complaint from consult')
  assert(chat.includes('setResumeChiefComplaint'), 'must retain in state')
  assert(chat.includes('chiefComplaint: resumeChiefComplaint'), 'must pass into continuationAction')
  assert(chat.includes("type: 'resume'"), 'resume type preserved')
  // Start fresh remains navigate-only (no abandon on recovery escape).
  const resumeBlockStart = chat.indexOf("type: 'resume' as const")
  const resumeBlock = chat.slice(resumeBlockStart, resumeBlockStart + 450)
  assert(resumeBlock.includes('navigate(`/liberty-md?lang=${language}`)'), 'Start fresh navigate-only')
  assert(!resumeBlock.includes('abandon_consultation'), 'no new abandon on resume escape')
})

Deno.test('P1-13 · ContinuationActionBar passes chiefComplaint; telemetry stays categorical', async () => {
  const bar = await Deno.readTextFile(BAR_SOURCE)
  const analytics = await Deno.readTextFile(ANALYTICS_SOURCE)
  assert(bar.includes('chiefComplaint={action.chiefComplaint}'), 'bar must forward complaint')
  assert(bar.includes("type: 'resume'"), 'telemetry type resume unchanged')
  assert(
    !/emitContinuationPrompt(Shown|Actioned)\([^)]*chief/i.test(bar),
    'must not put chief complaint in emit args',
  )
  const shown = analytics.slice(
    analytics.indexOf('export function emitContinuationPromptShown'),
    analytics.indexOf('export function emitContinuationPromptActioned'),
  )
  const actioned = analytics.slice(
    analytics.indexOf('export function emitContinuationPromptActioned'),
    analytics.indexOf('export function emitPartialOutcomeShown'),
  )
  assert(!shown.includes('chief_complaint') && !actioned.includes('chief_complaint'), 'analytics helpers ban chief_complaint')
})

Deno.test('P1-13 R2 · App still must not invent resume', async () => {
  const app = await Deno.readTextFile(APP_SOURCE)
  assert(!app.includes('LibertyMDAbandonedRecoveryPrompt'), 'App must not mount recovery prompt')
  assert(!app.includes("type: 'resume'"), 'App must not invent resume continuation')
})

Deno.test('P1-13 Q3B · history status humanizes abandoned', async () => {
  const care = await Deno.readTextFile(CARE_SOURCE)
  const historyList = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDHistoryList.tsx', import.meta.url),
  )
  assert(care.includes('formatLibertyMdHistoryStatus'), 'history helper present')
  assert(care.includes("if (status === 'abandoned') return 'Incomplete'"), 'abandoned → Incomplete')
  // P4-03 extracted AccountDrawer history rows into LibertyMDHistoryList — helper call lives there.
  assert(
    historyList.includes('formatLibertyMdHistoryStatus(item.status)')
      || historyList.includes("status === 'abandoned') return 'Incomplete'"),
    'history row humanizes abandoned',
  )
  assert(!historyList.includes("item.status.replaceAll('_', ' ')"), 'raw replaceAll status leak removed')
})
