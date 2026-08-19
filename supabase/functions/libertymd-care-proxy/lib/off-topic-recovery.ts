/**
 * P1-10 · Warm off-topic recovery — patient-facing EN copy + ask selection.
 *
 * Coaching-only (navigation / focus coaching). Engineering Done ≠ clinical
 * launch sign-off. Do not put PHI in logs when calling these helpers.
 *
 * Mid-path and terminal bodies are proxy SoT (English). Client owns CTA /
 * status-strip i18n only.
 */

/** Locked mid-path warm preface (prepended to the named clinical ask). */
export const WARM_MID_PATH_PREFACE =
  "Let's stay focused on your health so I can help. Please answer about your symptoms."

/** Locked terminal body for off-topic `shouldStop` only (not turn-cap / empty DD). */
export const OFF_TOPIC_STOP_BODY =
  "We couldn't continue this consult because the recent answers weren't about your health concern. Start a new consult when you're ready to share your symptoms, or talk with a licensed clinician."

const OFF_TOPIC_COPY: Record<string, { preface: string; stop: string }> = {
  en: { preface: WARM_MID_PATH_PREFACE, stop: OFF_TOPIC_STOP_BODY },
  es: {
    preface: 'Mantengámonos centrados en su salud para poder ayudarle. Responda sobre sus síntomas.',
    stop: 'No pudimos continuar esta consulta porque las respuestas recientes no se referían a su problema de salud. Inicie una nueva consulta cuando esté listo para describir sus síntomas o hable con un profesional sanitario autorizado.',
  },
  pt: {
    preface: 'Vamos manter o foco na sua saúde para eu poder ajudar. Responda sobre os seus sintomas.',
    stop: 'Não foi possível continuar esta consulta porque as respostas recentes não eram sobre o seu problema de saúde. Inicie uma nova consulta quando estiver pronto para descrever os seus sintomas ou fale com um profissional de saúde habilitado.',
  },
  hi: {
    preface: 'आपकी मदद के लिए हम आपके स्वास्थ्य पर ध्यान रखें। कृपया अपने लक्षणों के बारे में उत्तर दें।',
    stop: 'हम यह परामर्श जारी नहीं रख सके क्योंकि हाल के उत्तर आपकी स्वास्थ्य समस्या के बारे में नहीं थे। जब आप अपने लक्षण बताने के लिए तैयार हों तब नया परामर्श शुरू करें या किसी लाइसेंस प्राप्त चिकित्सक से बात करें।',
  },
  'hi-Latn': {
    preface: 'Aapki madad ke liye hum aapki health par focus rakhein. Kripya apne symptoms ke baare mein jawab dein.',
    stop: 'Hum yeh consultation jaari nahi rakh sake kyunki haal ke jawab aapki health concern ke baare mein nahi the. Jab aap symptoms share karne ke liye taiyaar hon tab nayi consultation shuru karein ya licensed clinician se baat karein.',
  },
  fr: {
    preface: 'Restons concentrés sur votre santé afin que je puisse vous aider. Répondez au sujet de vos symptômes.',
    stop: 'Nous n’avons pas pu poursuivre cette consultation, car les réponses récentes ne concernaient pas votre problème de santé. Commencez une nouvelle consultation lorsque vous serez prêt à décrire vos symptômes ou parlez à un professionnel de santé agréé.',
  },
  de: {
    preface: 'Bleiben wir bei Ihrem Gesundheitsproblem, damit ich Ihnen helfen kann. Antworten Sie bitte zu Ihren Symptomen.',
    stop: 'Wir konnten diese Beratung nicht fortsetzen, weil sich die letzten Antworten nicht auf Ihr Gesundheitsproblem bezogen. Beginnen Sie eine neue Beratung, wenn Sie Ihre Symptome schildern möchten, oder wenden Sie sich an eine zugelassene medizinische Fachkraft.',
  },
}

function copyFor(language: string | undefined) {
  const normalized = language === 'es-ES' ? 'es' : String(language || 'en')
  return OFF_TOPIC_COPY[normalized] || OFF_TOPIC_COPY.en
}

export function offTopicStopBody(language = 'en'): string {
  return copyFor(language).stop
}

/** Legacy cold mid-path prefix (pre-P1-10) — skip when selecting the named ask. */
const LEGACY_COLD_REDIRECT_PREFIX = 'I need a health-related answer to continue safely.'

export type HistoryAskRow = {
  role?: unknown
  content?: unknown
  message_type?: unknown
  options?: unknown
  metadata?: unknown
}

function asCleanText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * True when content is a prior non-stop off-topic redirect (warm or legacy cold).
 * Used when history rows lack `metadata` (getHistory omits it today).
 */
export function isOffTopicRedirectContent(content: unknown): boolean {
  const text = asCleanText(content)
  if (!text) return false
  if (Object.values(OFF_TOPIC_COPY).some(({ preface }) => text.startsWith(preface))) return true
  if (text.startsWith(LEGACY_COLD_REDIRECT_PREFIX)) return true
  return false
}

function metadataSaysOffTopic(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false
  return (metadata as { response_relevance?: unknown }).response_relevance === 'off_topic'
}

/**
 * Q6A — last clinical interview ask: walk history newest-first for assistant
 * with `message_type !== 'safety'` and not an off-topic redirect
 * (`metadata.response_relevance !== 'off_topic'`, else content contract).
 * Fallback: `interview.next_question`.
 */
export function selectLastClinicalAsk(
  history: readonly HistoryAskRow[],
  fallbackNextQuestion: unknown,
): { content: string; options: unknown[] | undefined } {
  for (const item of [...history].reverse()) {
    if (item.role !== 'assistant') continue
    if (item.message_type === 'safety') continue
    if (metadataSaysOffTopic(item.metadata)) continue
    if (isOffTopicRedirectContent(item.content)) continue
    const content = asCleanText(item.content)
    if (!content) continue
    const options = Array.isArray(item.options) ? item.options : undefined
    return { content, options }
  }
  const fallback = asCleanText(fallbackNextQuestion)
  return { content: fallback, options: undefined }
}

/** Compose mid-path warm redirect: `{preface} {namedAsk}`. */
export function composeWarmMidPathRedirect(namedAsk: string, language = 'en'): string {
  const preface = copyFor(language).preface
  const ask = asCleanText(namedAsk)
  if (!ask) return preface
  return `${preface} ${ask}`
}
