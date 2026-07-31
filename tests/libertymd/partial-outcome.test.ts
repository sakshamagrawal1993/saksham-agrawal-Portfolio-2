/**
 * P1-09 — Chat / OverlaySheet source contracts for partial-outcome exit sheet.
 *
 * Run: `deno test --no-config --allow-read tests/libertymd/partial-outcome.test.ts`
 */
declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const CHAT = new URL('../../components/LibertyMD/LibertyMDChat.tsx', import.meta.url)
const ANALYTICS = new URL('../../components/LibertyMD/libertymd-analytics.ts', import.meta.url)
const HELPER = new URL('../../components/LibertyMD/libertymd-partial-outcome.ts', import.meta.url)
const OVERLAY = new URL('../../components/LibertyMD/LibertyMDOverlaySheet.tsx', import.meta.url)
const PARTIAL_LIB = new URL(
  '../../supabase/functions/libertymd-care-proxy/lib/partial-outcome.ts',
  import.meta.url,
)

Deno.test('P1-09 Chat · startOver sheet-before-navigate (Q4A1)', async () => {
  const chat = await Deno.readTextFile(CHAT)
  if (!chat.includes("action: 'abandon_consultation'")) {
    throw new Error('startOver must still abandon')
  }
  if (!chat.includes('parsePartialOutcome') || !chat.includes('setPartialOutcomeSheet')) {
    throw new Error('startOver must mount partial outcome from abandon payload')
  }
  if (!chat.includes('finishPartialOutcomeLeave')) {
    throw new Error('navigate must wait for sheet dismiss')
  }
  const startBlock = chat.slice(
    chat.indexOf('const startOver'),
    chat.indexOf('const softLeaveConsult'),
  )
  // Immediate navigate only when no outcome — sheet path returns before navigate.
  if (!startBlock.includes('partial_outcome') && !startBlock.includes('parsePartialOutcome')) {
    throw new Error('startOver must read partial_outcome from abandon response')
  }
})

Deno.test('P1-09 Chat · soft leave fetch-then-sheet, no abandon', async () => {
  const chat = await Deno.readTextFile(CHAT)
  const softLeaveBlock = chat.slice(
    chat.indexOf('const softLeaveConsult'),
    chat.indexOf('const selectConsultation'),
  )
  if (softLeaveBlock.includes('abandon_consultation')) {
    throw new Error('soft leave must not call abandon_consultation')
  }
  if (!softLeaveBlock.includes("action: 'get_partial_outcome'")) {
    throw new Error('soft leave must fetch get_partial_outcome before sheet')
  }
  if (!chat.includes('LibertyMDOverlaySheet')) {
    throw new Error('Chat must mount OverlaySheet for partial outcome')
  }
  if (!chat.includes("phase !== 'emergency_end'") && !chat.includes('phase === \'emergency_end\'')) {
    throw new Error('partial outcome must never mount on emergency_end')
  }
})

Deno.test('P1-09 Chat · client shown / engaged telemetry helpers', async () => {
  const analytics = await Deno.readTextFile(ANALYTICS)
  const chat = await Deno.readTextFile(CHAT)
  if (!analytics.includes("trackLibertyMd('partial_outcome_shown'")) {
    throw new Error('emitPartialOutcomeShown missing')
  }
  if (!analytics.includes("trackLibertyMd('partial_outcome_engaged'")) {
    throw new Error('emitPartialOutcomeEngaged missing')
  }
  if (!chat.includes('emitPartialOutcomeShown') || !chat.includes('emitPartialOutcomeEngaged')) {
    throw new Error('Chat must wire shown on paint and engaged on CTA')
  }
  if (!chat.includes('finishPartialOutcomeLeave(true)')) {
    throw new Error('Got it CTA must engage')
  }
  if (!chat.includes('finishPartialOutcomeLeave(false)')) {
    throw new Error('backdrop/onClose must be shown-only dismiss')
  }
})

Deno.test('P1-09 · proxy helper + client parser present; OverlaySheet unchanged behaviour contract', async () => {
  const helper = await Deno.readTextFile(HELPER)
  const lib = await Deno.readTextFile(PARTIAL_LIB)
  const overlay = await Deno.readTextFile(OVERLAY)
  if (!helper.includes('parsePartialOutcome')) {
    throw new Error('client parser required')
  }
  if (!lib.includes('REQUIRES EXPERT REVIEW')) {
    throw new Error('proxy copy must tag REQUIRES EXPERT REVIEW')
  }
  if (!overlay.includes('z-[90]')) {
    throw new Error('OverlaySheet must stay below emergency z-120')
  }
})
