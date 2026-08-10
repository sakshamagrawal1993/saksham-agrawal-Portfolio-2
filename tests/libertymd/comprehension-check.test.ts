/**
 * P1-14 — Comprehension check pure helper + source contracts.
 *
 * Run:
 *   deno test --no-config --allow-read --sloppy-imports tests/libertymd/comprehension-check.test.ts
 */
declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

import {
  buildComprehensionCheckPayload,
  buildComprehensionSummary,
  COMPREHENSION_SLOT_LABELS_BY_LANGUAGE,
  CONTINUE_EMPTY_QUESTION_FALLBACK,
  isComprehensionCompleted,
  readComprehensionFlags,
  withComprehensionCompleted,
  withComprehensionPending,
} from '../../supabase/functions/libertymd-care-proxy/lib/comprehension-check.ts'
import { CLINICAL_SLOTS } from '../../supabase/functions/libertymd-care-proxy/lib/slots.ts'
import { CLINICAL_LANGUAGES } from '../../supabase/functions/libertymd-care-proxy/lib/journey-locale.ts'
import {
  comprehensionBridgeMessage,
  continueFallbackQuestion,
  fallbackEntryQuestion,
  reportGateMessage,
  startAcknowledgement,
} from '../../supabase/functions/libertymd-care-proxy/lib/clinical-copy.ts'

const CHAT = new URL('../../components/LibertyMD/LibertyMDChat.tsx', import.meta.url)
const SHEET = new URL('../../components/LibertyMD/LibertyMDComprehensionCheck.tsx', import.meta.url)
const ANALYTICS = new URL('../../components/LibertyMD/libertymd-analytics.ts', import.meta.url)
const SEND = new URL('../../supabase/functions/libertymd-care-proxy/actions/send-message.ts', import.meta.url)
const OVERLAY = new URL('../../components/LibertyMD/LibertyMDOverlaySheet.tsx', import.meta.url)
const EN = new URL('../../i18n/locales/en.json', import.meta.url)
const LANGUAGE_MIGRATION = new URL(
  '../../supabase/migrations/20260810090000_libertymd_multilingual_consultation_language.sql',
  import.meta.url,
)

Deno.test('P1-14 AC2 · summary lines ⊆ present slot keys/values; empty optionals omit', () => {
  const lines = buildComprehensionSummary({
    chief_complaint: 'headache',
    onset: 'yesterday',
    severity: '',
    associated_symptoms: [],
    medications: null,
    red_flag_negatives: 'no chest pain',
  })
  const slots = lines.map((line) => line.slot)
  if (!slots.includes('chief_complaint') || !slots.includes('onset') || !slots.includes('red_flag_negatives')) {
    throw new Error('expected present valued slots in summary')
  }
  if (slots.includes('severity') || slots.includes('associated_symptoms') || slots.includes('medications')) {
    throw new Error('empty optionals must be omitted (no invented negatives)')
  }
  const onset = lines.find((line) => line.slot === 'onset')
  if (!onset || onset.value !== 'yesterday') {
    throw new Error('summary must echo stored value only')
  }
  // Invented-negative ban: never fabricate "no fever" style claims for missing keys.
  const blob = JSON.stringify(lines).toLowerCase()
  if (blob.includes('no fever') || blob.includes('denies')) {
    throw new Error('must not invent clinical negatives')
  }
})

Deno.test('P1-14 · payload includes pending + categorical slot_count', () => {
  const payload = buildComprehensionCheckPayload({
    chief_complaint: 'cough',
    duration: '3 days',
  })
  if (payload.pending !== true) throw new Error('pending must be true')
  if (payload.slot_count !== payload.summary_lines.length) {
    throw new Error('slot_count must match summary_lines length')
  }
  if (payload.slot_count < 1) throw new Error('non-zero fixture required')
})

Deno.test('P1-14 · every supported clinical language maps every comprehension slot', () => {
  const expectedSlots = [...CLINICAL_SLOTS].sort()
  for (const language of CLINICAL_LANGUAGES) {
    const labels = COMPREHENSION_SLOT_LABELS_BY_LANGUAGE[language]
    const mappedSlots = Object.keys(labels).sort()
    if (JSON.stringify(mappedSlots) !== JSON.stringify(expectedSlots)) {
      throw new Error(`${language} comprehension labels must cover every clinical slot`)
    }
    if (Object.values(labels).some((label) => !label.trim())) {
      throw new Error(`${language} comprehension labels must not be empty`)
    }
  }

  const english = buildComprehensionSummary({ onset: 'yesterday' }, 'en')[0]
  const spanish = buildComprehensionSummary({ onset: 'ayer' }, 'es')[0]
  const french = buildComprehensionSummary({ onset: 'hier' }, 'fr')[0]
  const hinglish = buildComprehensionSummary({ onset: 'kal' }, 'hi-Latn')[0]
  const unsupportedClinicalLocale = buildComprehensionSummary({ onset: 'yesterday' }, 'xx')[0]
  if (english?.label !== 'When it started') throw new Error('English map not selected')
  if (spanish?.label !== 'Cuándo comenzó') throw new Error('Spanish map not selected')
  if (french?.label !== 'Début des symptômes') throw new Error('French map not selected')
  if (hinglish?.label !== 'Yeh kab shuru hui') throw new Error('Hinglish map not selected')
  if (unsupportedClinicalLocale?.label !== english.label) throw new Error('unsupported locale must fall back to English')
})

Deno.test('P3-09 · database constraint accepts the complete closed clinical language set', async () => {
  const migration = await Deno.readTextFile(LANGUAGE_MIGRATION)
  for (const language of CLINICAL_LANGUAGES) {
    if (!migration.includes(`'${language}'`)) {
      throw new Error(`migration is missing clinical language ${language}`)
    }
  }
})

Deno.test('P3-09 · deterministic journey copy exists in every clinical language', () => {
  for (const language of CLINICAL_LANGUAGES) {
    const values = [
      startAcknowledgement(language, null, false),
      fallbackEntryQuestion(language),
      comprehensionBridgeMessage(language),
      continueFallbackQuestion(language),
      reportGateMessage(language, true),
      reportGateMessage(language, false),
    ]
    if (values.some((value) => !value.trim())) throw new Error(`${language}: missing deterministic journey copy`)
  }
  if (!startAcknowledgement('de', null, false).includes('Vielen Dank')) throw new Error('German acknowledgement')
  if (!fallbackEntryQuestion('de').includes('Wann')) throw new Error('German fallback question')
  if (!comprehensionBridgeMessage('de').includes('zusammengefasst')) throw new Error('German comprehension bridge')
  if (!reportGateMessage('de', true).includes('Ihr LibertyMD-Bericht ist fertig')) throw new Error('German report gate')
  if (!startAcknowledgement('en', null, false, 'I have fever').includes('your fever')) {
    throw new Error('English fever acknowledgement regression')
  }
})

Deno.test('P1-14 · once-completed / pending workflow_versions helpers', () => {
  if (isComprehensionCompleted({})) throw new Error('default not completed')
  const pending = withComprehensionPending({ guardrail: 'v1' })
  if (pending.comprehension_pending !== true || pending.guardrail !== 'v1') {
    throw new Error('pending flag missing')
  }
  const done = withComprehensionCompleted(pending)
  if (!isComprehensionCompleted(done) || done.comprehension_pending !== false) {
    throw new Error('completed flag missing')
  }
})

Deno.test('P1-14 · readComprehensionFlags from send_message body', () => {
  const none = readComprehensionFlags({ action: 'send_message' })
  if (none.comprehensionAck || none.comprehensionCorrection) {
    throw new Error('flags must default false')
  }
  const ack = readComprehensionFlags({ comprehension_ack: true })
  if (!ack.comprehensionAck || ack.comprehensionCorrection) {
    throw new Error('ack flag failed')
  }
  const correct = readComprehensionFlags({ comprehension_correction: true })
  if (!correct.comprehensionCorrection || correct.comprehensionAck) {
    throw new Error('correction flag failed')
  }
})

Deno.test('P1-14 AC1/AC5 · Chat mounts OverlaySheet consumer; Gap 5 literal gone as confirm UX', async () => {
  const chat = await Deno.readTextFile(CHAT)
  const sheet = await Deno.readTextFile(SHEET)
  const send = await Deno.readTextFile(SEND)
  const overlay = await Deno.readTextFile(OVERLAY)

  if (!chat.includes('LibertyMDComprehensionCheck')) {
    throw new Error('Chat must mount LibertyMDComprehensionCheck')
  }
  if (!chat.includes('parseComprehensionCheck') || !chat.includes('setComprehensionCheck')) {
    throw new Error('Chat must wire comprehension_check payload')
  }
  if (!sheet.includes('LibertyMDOverlaySheet')) {
    throw new Error('comprehension component must consume OverlaySheet')
  }
  if (!overlay.includes('z-[90]') || !overlay.includes('z-[120]')) {
    throw new Error('OverlaySheet must document z-90 below emergency z-120')
  }
  if (!chat.includes('comprehension_ack: true') || !chat.includes('comprehension_correction: true')) {
    throw new Error('Chat proceed/correct must flag send_message')
  }
  if (!chat.includes('onDismiss={() => setComprehensionCheck(null)}')) {
    throw new Error('dismiss must clear sheet only (≠ proceed)')
  }
  if (!send.includes('buildComprehensionCheckPayload') || !send.includes('continueFallbackQuestion')) {
    throw new Error('send_message must short-circuit + retire Gap 5 fallback')
  }
  if (send.includes('Before I prepare the report, is there anything else')) {
    throw new Error('Gap 5 anything-else literal must be retired from send_message')
  }
  if (!send.includes('comprehension_completed') && !send.includes('withComprehensionCompleted')) {
    throw new Error('once-completed flag required')
  }
  if (!CONTINUE_EMPTY_QUESTION_FALLBACK.includes('changed since the symptom')) {
    throw new Error('continue fallback must stay non-open-ended')
  }
})

Deno.test('P1-14 AC3/AC6 · telemetry type + action discriminator; correction metadata', async () => {
  const analytics = await Deno.readTextFile(ANALYTICS)
  const sheet = await Deno.readTextFile(SHEET)
  const send = await Deno.readTextFile(SEND)
  const chat = await Deno.readTextFile(CHAT)

  if (!analytics.includes("action: props.action") && !analytics.includes('action: props?.action')) {
    // Helper must forward optional action
    if (!analytics.includes('...(props?.action ? { action: props.action }')) {
      throw new Error('emitContinuationPromptActioned must accept action discriminator')
    }
  }
  if (!sheet.includes("emitContinuationPromptShown('comprehension_check'")) {
    throw new Error('sheet must emit shown with type comprehension_check')
  }
  if (!sheet.includes("action: 'proceed'") || !sheet.includes("action: 'correct'")) {
    throw new Error('sheet must emit action proceed|correct')
  }
  if (!send.includes("source: 'comprehension_correction'")) {
    throw new Error('proxy must tag correction metadata.source')
  }
  if (chat.includes(".from('libertymd_") || chat.includes('.from("libertymd_')) {
    throw new Error('Chat must not write clinical tables')
  }
})

Deno.test('P1-14 R1 · emergency outranks; never mount on emergency_end', async () => {
  const chat = await Deno.readTextFile(CHAT)
  if (!chat.includes("comprehensionCheck && phase !== 'emergency_end'")) {
    throw new Error('comprehension must not mount on emergency_end')
  }
  const overlay = await Deno.readTextFile(OVERLAY)
  if (!overlay.includes('z-[90]')) {
    throw new Error('OverlaySheet must stay at z-90 (below emergency z-120)')
  }
})

Deno.test('P1-14 · i18n chatx.comprehension* keys present', async () => {
  const en = JSON.parse(await Deno.readTextFile(EN)) as { chatx?: Record<string, string> }
  const keys = [
    'comprehensionEyebrow',
    'comprehensionTitle',
    'comprehensionConfirm',
    'comprehensionProceed',
    'comprehensionProceedAck',
    'comprehensionCorrect',
    'comprehensionCorrectionLabel',
    'comprehensionCorrectionPlaceholder',
    'comprehensionCorrectionSubmit',
    'comprehensionCorrectionCancel',
  ]
  for (const key of keys) {
    if (!en.chatx?.[key]) throw new Error(`missing chatx.${key}`)
  }
  if (!String(en.chatx?.comprehensionConfirm).toLowerCase().includes('wrong or missing')) {
    throw new Error('confirm copy must ask anything wrong or missing')
  }
})

Deno.test('P1-14 R2 · Diagnosis-path sibling fixtures seed comprehension_completed', async () => {
  // Gate-open standing suites must opt into once-completed (or ack) so they still
  // exercise Diagnosis — without gutting the product short-circuit for real users.
  const speculative = await Deno.readTextFile(
    new URL('./speculative-diagnosis.mts', import.meta.url),
  )
  const productEvents = await Deno.readTextFile(
    new URL('./product-events.mts', import.meta.url),
  )
  const seed = 'comprehension_completed: true'
  if (!speculative.includes(seed) || (speculative.match(/comprehension_completed: true/g) || []).length < 2) {
    throw new Error('speculative-diagnosis gate-open fixtures must seed comprehension_completed (≥2)')
  }
  if (!productEvents.includes(seed)) {
    throw new Error('product-events report-path fixture must seed comprehension_completed')
  }
  const send = await Deno.readTextFile(SEND)
  if (!send.includes('gateOpen && !comprehensionDone && !completingComprehension')) {
    throw new Error('product short-circuit must remain intact')
  }
})
