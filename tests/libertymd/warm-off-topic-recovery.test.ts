/**
 * P1-10 — Warm off-topic recovery contracts (copy + ask selection + thresholds + CTA).
 *
 * Run focused: `deno test --no-config --allow-read tests/libertymd/warm-off-topic-recovery.test.ts`
 * Wired into `test:libertymd:ci` via `test:libertymd:warm-off-topic`.
 */
import {
  WARM_MID_PATH_PREFACE,
  OFF_TOPIC_STOP_BODY,
  composeWarmMidPathRedirect,
  offTopicStopBody,
  selectLastClinicalAsk,
} from '../../supabase/functions/libertymd-care-proxy/lib/off-topic-recovery.ts'

declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const HELPER = new URL(
  '../../supabase/functions/libertymd-care-proxy/lib/off-topic-recovery.ts',
  import.meta.url,
)
const SEND = new URL(
  '../../supabase/functions/libertymd-care-proxy/actions/send-message.ts',
  import.meta.url,
)
const CHAT = new URL('../../components/LibertyMD/LibertyMDChat.tsx', import.meta.url)
const BAR = new URL(
  '../../components/LibertyMD/LibertyMDContinuationActionBar.tsx',
  import.meta.url,
)
const CARE = new URL('../../docs/libertymd/CARE-ARCHITECTURE.md', import.meta.url)
const EN = new URL('../../i18n/locales/en.json', import.meta.url)
const LOCALES = [
  'en.json',
  'de.json',
  'es.json',
  'es-ES.json',
  'fr.json',
  'hi.json',
  'pt.json',
] as const

const BANNED_MID_PATH = [
  'differential',
  'differential diagnosis',
  'one more',
] as const

Deno.test('AC1: warm mid-path preface + compose; banned substrings absent', () => {
  if (!WARM_MID_PATH_PREFACE.includes("Let's stay focused on your health")) {
    throw new Error('warm preface missing locked token')
  }
  const named = 'How long have you had the headache?'
  const body = composeWarmMidPathRedirect(named)
  if (!body.startsWith(WARM_MID_PATH_PREFACE)) {
    throw new Error('mid-path must start with warm preface')
  }
  if (!body.includes(named)) {
    throw new Error('mid-path must name the clinical ask')
  }
  for (const banned of BANNED_MID_PATH) {
    if (body.toLowerCase().includes(banned)) {
      throw new Error(`mid-path must not contain banned: ${banned}`)
    }
  }
  if (/\b[123]\s*\/\s*[35]\b/.test(WARM_MID_PATH_PREFACE) || /\bstrike\b/i.test(WARM_MID_PATH_PREFACE)) {
    throw new Error('preface must not include strike countdown')
  }
  for (const banned of BANNED_MID_PATH) {
    if (OFF_TOPIC_STOP_BODY.toLowerCase().includes(banned)) {
      throw new Error(`stop body must not contain banned: ${banned}`)
    }
  }
  if (OFF_TOPIC_STOP_BODY.toLowerCase().includes('differential')) {
    throw new Error('stop body must not say differential')
  }
})

Deno.test('AC1: off-topic recovery copy follows the clinical language', () => {
  const spanish = composeWarmMidPathRedirect('¿Cuándo comenzaron los síntomas?', 'es')
  if (!spanish.startsWith('Mantengámonos centrados')) throw new Error('Spanish preface missing')
  if (spanish.includes("Let's stay focused")) throw new Error('English preface leaked into Spanish')
  const hindiStop = offTopicStopBody('hi')
  if (!/[ऀ-ॿ]/.test(hindiStop)) throw new Error('Hindi terminal copy is not Devanagari')
  const regionalSpanish = offTopicStopBody('es-ES')
  if (!regionalSpanish.startsWith('No pudimos continuar')) throw new Error('es-ES did not inherit Spanish stop copy')
})

Deno.test('AC1 Q6A: selectLastClinicalAsk skips prior off-topic redirects', () => {
  const clinical = 'Where is the pain located?'
  const redirect = composeWarmMidPathRedirect(clinical)
  const history = [
    { role: 'assistant', message_type: 'normal', content: clinical, options: ['Left', 'Right'] },
    { role: 'user', content: 'what is the weather' },
    {
      role: 'assistant',
      message_type: 'normal',
      content: redirect,
      options: ['Left', 'Right'],
      metadata: { response_relevance: 'off_topic' },
    },
  ]
  const picked = selectLastClinicalAsk(history, 'fallback next?')
  if (picked.content !== clinical) {
    throw new Error(`expected last clinical ask, got: ${picked.content}`)
  }
  if (!Array.isArray(picked.options) || picked.options[0] !== 'Left') {
    throw new Error('options must replay from the clinical ask row')
  }

  // Content contract when metadata absent (getHistory omits metadata today).
  const noMeta = [
    { role: 'assistant', message_type: 'normal', content: clinical },
    {
      role: 'assistant',
      message_type: 'normal',
      content: `${WARM_MID_PATH_PREFACE} ${clinical}`,
    },
  ]
  const picked2 = selectLastClinicalAsk(noMeta, 'fallback')
  if (picked2.content !== clinical) {
    throw new Error(`content-contract skip failed: ${picked2.content}`)
  }

  const empty = selectLastClinicalAsk([], 'What is your main symptom?')
  if (empty.content !== 'What is your main symptom?') {
    throw new Error('must fall back to interview.next_question')
  }
})

Deno.test('AC2/AC3: send-message uses warm bodies; thresholds still >= 3 / >= 5', async () => {
  const send = await Deno.readTextFile(SEND)
  const helper = await Deno.readTextFile(HELPER)

  if (!send.includes("from '../lib/off-topic-recovery.ts'")) {
    throw new Error('send-message must import off-topic-recovery helper')
  }
  if (!send.includes('composeWarmMidPathRedirect') || !send.includes('offTopicStopBody')) {
    throw new Error('send-message must use localized warm mid-path + stop copy')
  }
  if (!send.includes('selectLastClinicalAsk')) {
    throw new Error('send-message must use Q6A selectLastClinicalAsk')
  }
  if (!send.includes('consecutiveNonClinicalResponseCount >= 3')) {
    throw new Error('consecutive threshold must remain >= 3')
  }
  if (!send.includes('nonClinicalResponseCount >= 5')) {
    throw new Error('total threshold must remain >= 5')
  }
  if (send.includes('I need a health-related answer to continue safely')) {
    throw new Error('legacy cold mid-path must be removed from send-message')
  }
  if (helper.toLowerCase().includes('differential')) {
    throw new Error('off-topic-recovery helper must not contain differential')
  }
})

Deno.test('AC2/AC4: Chat mounts clinical_review_start_fresh ContinuationActionBar', async () => {
  const chat = await Deno.readTextFile(CHAT)
  const bar = await Deno.readTextFile(BAR)

  if (!chat.includes("type: 'clinical_review_start_fresh'")) {
    throw new Error('Chat must set clinical_review_start_fresh continuation action')
  }
  if (!chat.includes("navigate(`/liberty-md?lang=${language}`)")) {
    throw new Error('start-fresh must navigate to /liberty-md')
  }
  if (!chat.includes('continuationOwnsFooter')) {
    throw new Error('clinical_review_needed must participate in continuationOwnsFooter')
  }
  if (!/phase === 'clinical_review_needed'[\s\S]*continuationOwnsFooter|continuationOwnsFooter[\s\S]*phase === 'clinical_review_needed'/.test(chat)) {
    // Soft check — ownership is asserted by the explicit || phase === line.
  }
  if (!chat.includes("|| phase === 'clinical_review_needed'")) {
    throw new Error('continuationOwnsFooter must include clinical_review_needed')
  }
  if (!bar.includes("'clinical_review_start_fresh'") || !bar.includes('data-libertymd-clinical-review-start-fresh')) {
    throw new Error('ContinuationActionBar must render clinical_review_start_fresh CTA')
  }
  if (!bar.includes("emitContinuationPromptActioned('clinical_review_start_fresh'")) {
    throw new Error('start-fresh actioned telemetry must use categorical type')
  }
  const reviewBlockStart = chat.indexOf("setPhase('clinical_review_needed')")
  if (reviewBlockStart < 0) throw new Error('clinical_review_needed phase set missing')
  const nearby = chat.slice(Math.max(0, reviewBlockStart - 200), reviewBlockStart + 200)
  if (nearby.includes('setPartialOutcomeSheet')) {
    throw new Error('must not mount partial outcome on clinical_review_needed path')
  }
})

Deno.test('R1: emergency still precedes off-topic in send-message', async () => {
  const send = await Deno.readTextFile(SEND)
  const forceIdx = send.indexOf('if (guardrail.force_end)')
  const offTopicIdx = send.indexOf('if (isNonClinical')
  if (forceIdx < 0 || offTopicIdx < 0) {
    throw new Error('force_end and isNonClinical branches required')
  }
  if (forceIdx > offTopicIdx) {
    throw new Error('emergency force_end must precede off-topic branch')
  }
})

Deno.test('i18n: CTA + status keys in all shipped locales', async () => {
  const en = JSON.parse(await Deno.readTextFile(EN))
  if (en.chatx?.startNewConsult !== 'Start a new consult') {
    throw new Error('EN startNewConsult locked seed mismatch')
  }
  // P2-13 L1 reframe: blame-adjacent "from these answers" retired; keep EN lock in sync.
  if (en.chatx?.clinicalReviewNeeded !== 'This consultation needs clinical review') {
    throw new Error('EN clinicalReviewNeeded locked seed mismatch')
  }
  for (const name of LOCALES) {
    const url = new URL(`../../i18n/locales/${name}`, import.meta.url)
    const json = JSON.parse(await Deno.readTextFile(url))
    if (!json.chatx?.startNewConsult || typeof json.chatx.startNewConsult !== 'string') {
      throw new Error(`${name} missing chatx.startNewConsult`)
    }
    if (!json.chatx?.clinicalReviewNeeded || typeof json.chatx.clinicalReviewNeeded !== 'string') {
      throw new Error(`${name} missing chatx.clinicalReviewNeeded`)
    }
  }
})

Deno.test('CARE notes warm recovery + threshold freeze', async () => {
  const care = await Deno.readTextFile(CARE)
  if (!care.includes('P1-10') || !care.includes('Warm off-topic')) {
    throw new Error('CARE must note P1-10 warm recovery')
  }
  if (!care.includes('3 consecutive') || !care.includes('5 total')) {
    throw new Error('CARE must record threshold freeze')
  }
  if (!care.includes('start fresh') && !care.includes('start-fresh')) {
    throw new Error('CARE must note start-fresh non-dead-end')
  }
})
