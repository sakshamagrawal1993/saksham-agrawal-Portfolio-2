/**
 * P1-11 — Chip styling: outline options vs filled sent answers (source contracts).
 *
 * Deno cannot mount React without a harness, so Chat chip/bubble chrome and
 * collapse gates are asserted via source greps (Lane D pattern).
 *
 * Run focused: `deno test --no-config --allow-read tests/libertymd/chip-styling.test.ts`
 * Wired into `test:libertymd:ci` via `test:libertymd:chip-styling`.
 */
declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const CHAT_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDChat.tsx',
  import.meta.url,
)

function optionChipConstant(source: string): string {
  const start = source.indexOf('const LIBERTYMD_OPTION_CHIP_CLASS')
  if (start < 0) throw new Error('LIBERTYMD_OPTION_CHIP_CLASS not found')
  const end = source.indexOf(';', start)
  if (end < 0) throw new Error('LIBERTYMD_OPTION_CHIP_CLASS unterminated')
  return source.slice(start, end + 1)
}

function userBubbleConstant(source: string): string {
  const start = source.indexOf('const LIBERTYMD_USER_BUBBLE_CLASS')
  if (start < 0) throw new Error('LIBERTYMD_USER_BUBBLE_CLASS not found')
  const end = source.indexOf(';', start)
  if (end < 0) throw new Error('LIBERTYMD_USER_BUBBLE_CLASS unterminated')
  return source.slice(start, end + 1)
}

function currentOptionsRegion(source: string): string {
  const start = source.indexOf('const currentOptions = useMemo')
  if (start < 0) throw new Error('currentOptions useMemo not found')
  const end = source.indexOf('}, [', start)
  if (end < 0) throw new Error('currentOptions deps not found')
  const close = source.indexOf(');', end)
  return source.slice(start, close > end ? close + 2 : end + 80)
}

Deno.test('P1-11 AC1 · outline chip classes ≠ filled user-bubble classes', async () => {
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  const chip = optionChipConstant(chat)
  const bubble = userBubbleConstant(chat)

  if (!chip.includes('rounded-full') || !chip.includes('border')) {
    throw new Error('option chips must be bordered pills')
  }
  if (!chip.includes('bg-white') && !chip.includes('bg-transparent')) {
    throw new Error('option chips must use non-filled surface')
  }
  if (chip.includes('shadow-sm') || chip.includes('shadow-md')) {
    throw new Error('option chips must reduce/remove competing shadow')
  }
  if (chip.includes('bg-libertymd-blue-600') || chip.includes('bg-[#2563EB]')) {
    throw new Error('option chips must not use filled Trust Blue')
  }

  if (!bubble.includes('bg-libertymd-blue-600')) {
    throw new Error('user bubbles must use filled libertymd-blue-600')
  }
  if (bubble.includes('border-libertymd') || bubble.includes('bg-white')) {
    throw new Error('user bubbles must not share outline/white chip surface')
  }
  if (chip === bubble) {
    throw new Error('outline chip and filled bubble class strings must differ')
  }
})

Deno.test('P1-11 AC2 · chips unmount while busy or holding (send-locked)', async () => {
  const region = currentOptionsRegion(await Deno.readTextFile(CHAT_SOURCE))
  if (!region.includes('isBusy')) {
    throw new Error('currentOptions must gate on isBusy')
  }
  if (!region.includes('holdingLocked')) {
    throw new Error('currentOptions must gate on holdingLocked (Q3A hide when send-locked)')
  }
  if (!region.includes("phase !== 'intake'")) {
    throw new Error('currentOptions must stay intake-only')
  }
  // After a user turn, latest is no longer AI → empty options
  if (!region.includes("latest?.sender === 'ai'")) {
    throw new Error('chips only when latest message is AI (collapse after user answer)')
  }
})

Deno.test('P1-11 AC3 · chip tap uses normal user-bubble send path', async () => {
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  if (!chat.includes('onClick={() => void sendMessage(option)}')) {
    throw new Error('chip tap must call sendMessage(option)')
  }
  if (!chat.includes('LIBERTYMD_USER_BUBBLE_CLASS')) {
    throw new Error('transcript user rows must use shared user-bubble class')
  }
  if (!chat.includes("sender: 'user', text: message")) {
    throw new Error('optimistic user bubble path must remain')
  }
  // No residual selected-chip transcript widget
  if (/selected.?chip|SelectedChip|optionChipInTranscript/i.test(chat)) {
    throw new Error('must not introduce a selected-chip transcript widget')
  }
})

Deno.test('P1-11 AC4 · focus-visible + tokenized chip/bubble chrome (no raw hex in constants)', async () => {
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  const chip = optionChipConstant(chat)
  const bubble = userBubbleConstant(chat)

  if (!chip.includes('focus-visible:')) {
    throw new Error('option chips must include focus-visible ring classes')
  }
  if (!chip.includes('ring-libertymd-blue') && !chip.includes('ring-2')) {
    throw new Error('option chips must expose a focus ring')
  }

  for (const hex of ['#BFD0EE', '#17325F', '#2563EB']) {
    if (chip.includes(hex) || bubble.includes(hex)) {
      throw new Error(`touched chip/bubble constants must not use raw ${hex}`)
    }
  }
  if (!chip.includes('border-libertymd-slate-300') && !chip.includes('border-libertymd-')) {
    throw new Error('chip border must use LibertyMD tokens')
  }
  if (!chip.includes('hover:border-libertymd-blue-600') || !chip.includes('hover:text-libertymd-blue-600')) {
    throw new Error('chip hover must use Trust Blue tokens')
  }
})

Deno.test('P1-11 R1 · P1-07 composer lock split preserved', async () => {
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  if (!chat.includes('composerSendLocked = isBusy || holdingLocked || phase !== \'intake\'')) {
    throw new Error('composerSendLocked expression must stay busy|holding|phase')
  }
  if (!chat.includes('composerInputLocked = holdingLocked || phase !== \'intake\'')) {
    throw new Error('composerInputLocked must exclude isBusy (draft editable during busy)')
  }
  if (chat.includes('composerInputLocked = isBusy')) {
    throw new Error('must not re-lock draft input on isBusy')
  }
})

Deno.test('P1-11 R2 · P1-10 replay still paints latest AI options when send unlocked', async () => {
  const region = currentOptionsRegion(await Deno.readTextFile(CHAT_SOURCE))
  // When not busy/holding and latest AI has options, chips return — no extra hide beyond send-lock
  if (!region.includes('latest.options')) {
    throw new Error('currentOptions must still read latest AI options (replay surface)')
  }
  if (region.includes('off-topic') || region.includes('selectLastClinicalAsk')) {
    throw new Error('Chat must not embed P1-10 replay selection logic')
  }
})
