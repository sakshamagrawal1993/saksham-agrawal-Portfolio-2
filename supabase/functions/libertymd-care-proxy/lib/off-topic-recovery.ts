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
  if (text.startsWith(WARM_MID_PATH_PREFACE)) return true
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
export function composeWarmMidPathRedirect(namedAsk: string): string {
  const ask = asCleanText(namedAsk)
  if (!ask) return WARM_MID_PATH_PREFACE
  return `${WARM_MID_PATH_PREFACE} ${ask}`
}
