/**
 * Diagnostic-clarification state and duplicate protection.
 *
 * The Interview model proposes a primary and backup question. The proxy owns
 * the bounded phase and refuses to serve a near-duplicate. State lives inside
 * workflow_versions so this can roll out without a schema migration and stays
 * attached to the consultation's existing optimistic-request boundary.
 */
import type { InterviewResult, JsonObject } from './types.ts'
import type { ClinicalFallbackQuestion } from './clinical-copy.ts'
import { CLINICAL_SLOTS, isClinicalSlotSatisfied, type ClinicalSlot } from './slots.ts'

export const DIAGNOSTIC_CLARIFICATION_KEY = 'diagnostic_clarification'

export interface DiagnosticClarificationState {
  askedCount: number
  askedQuestions: string[]
  askedPurposes: string[]
  completed: boolean
  completionReason: string | null
  lastTurn: number | null
}

export interface ClarificationCandidate {
  question: string
  options: string[]
  purpose: string
  usedBackup: boolean
  targetSlot: string
}

export interface ClarificationEligibilityInput {
  enabled: boolean
  turnCount: number
  maxTurns: number
  evidenceSufficient: boolean
  mediaBlocksCompletion: boolean
  redFlagsOutstanding: string[]
  topConfidence: number | null
  stopConfidence: number
  state: DiagnosticClarificationState
  maxQuestions: number
  interviewRequestedClarification: boolean
}

/** Missing mini diagnosis is intentionally eligible: Interview can self-steer. */
export function shouldAskDiagnosticClarification(input: ClarificationEligibilityInput): boolean {
  const confidenceLowOrUnavailable = input.topConfidence === null
    || input.topConfidence < input.stopConfidence
  // A high mini-differential can still disagree with the Interview Agent's
  // case-specific judgment. Permit at most two explicit final-validation asks
  // in that situation; this gives the final Diagnosis more evidence without
  // letting an over-cautious model consume the full conversation budget.
  const highConfidenceFinalValidation = !confidenceLowOrUnavailable
    && input.interviewRequestedClarification
    && input.state.askedCount < Math.min(2, input.maxQuestions)
  return input.enabled
    && input.turnCount < input.maxTurns
    && input.evidenceSufficient
    && !input.mediaBlocksCompletion
    && (confidenceLowOrUnavailable || highConfidenceFinalValidation)
    && !input.state.completed
    && input.state.askedCount < input.maxQuestions
    && input.interviewRequestedClarification
}

const emptyState = (): DiagnosticClarificationState => ({
  askedCount: 0,
  askedQuestions: [],
  askedPurposes: [],
  completed: false,
  completionReason: null,
  lastTurn: null,
})

const textList = (value: unknown, max = 6): string[] => Array.isArray(value)
  ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, max)
  : []

export function readDiagnosticClarificationState(workflowVersions: unknown): DiagnosticClarificationState {
  if (!workflowVersions || typeof workflowVersions !== 'object') return emptyState()
  const raw = (workflowVersions as Record<string, unknown>)[DIAGNOSTIC_CLARIFICATION_KEY]
  if (!raw || typeof raw !== 'object') return emptyState()
  const row = raw as Record<string, unknown>
  const askedQuestions = textList(row.asked_questions)
  const askedPurposes = textList(row.asked_purposes)
  const parsedCount = Number(row.asked_count)
  return {
    askedCount: Number.isFinite(parsedCount)
      ? Math.max(askedQuestions.length, Math.max(0, Math.min(5, Math.round(parsedCount))))
      : askedQuestions.length,
    askedQuestions,
    askedPurposes,
    completed: row.completed === true,
    completionReason: typeof row.completion_reason === 'string' && row.completion_reason.trim()
      ? row.completion_reason.trim()
      : null,
    lastTurn: Number.isInteger(Number(row.last_turn)) ? Number(row.last_turn) : null,
  }
}

export function diagnosticClarificationContext(
  workflowVersions: unknown,
  enabled: boolean,
  maxQuestions: number,
): JsonObject {
  const state = readDiagnosticClarificationState(workflowVersions)
  return {
    enabled,
    asked_count: state.askedCount,
    max_questions: maxQuestions,
    asked_questions: state.askedQuestions,
    asked_purposes: state.askedPurposes,
    completed: state.completed,
  }
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('en-US')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const QUESTION_STOPWORDS = new Set([
  // Common question scaffolding must not make two clinically different asks
  // look equivalent. Exact-string matching above still catches true repeats.
  'are', 'can', 'did', 'do', 'does', 'have', 'has', 'is', 'the', 'there', 'you',
  'haben', 'hat', 'ist', 'sind', 'sie', 'eine', 'einen', 'einer', 'bemerkt',
  'ha', 'hay', 'tiene', 'tienes', 'usted',
  'aap', 'hai', 'hain', 'kya',
])

function tokenSet(value: string): Set<string> {
  return new Set(normalize(value).split(/\s+/).filter((token) => (
    token.length > 1 && !QUESTION_STOPWORDS.has(token)
  )))
}

/** Lightweight, deterministic comparison; the model still receives full history. */
export function questionsNearDuplicate(left: string, right: string): boolean {
  const a = normalize(left)
  const b = normalize(right)
  if (!a || !b) return false
  if (a === b) return true
  if (Math.min(a.length, b.length) >= 18 && (a.includes(b) || b.includes(a))) return true
  const aTokens = tokenSet(a)
  const bTokens = tokenSet(b)
  if (aTokens.size < 3 || bTokens.size < 3) return false
  let shared = 0
  for (const token of aTokens) if (bTokens.has(token)) shared += 1
  return shared / Math.min(aTokens.size, bTokens.size) >= 0.72
}

function purposeAlreadyAsked(purpose: string, priorPurposes: string[]): boolean {
  const normalized = normalize(purpose)
  if (!normalized) return false
  return priorPurposes.some((prior) => {
    const priorNormalized = normalize(prior)
    return priorNormalized === normalized || questionsNearDuplicate(priorNormalized, normalized)
  })
}

function candidateIfNew(
  question: string,
  options: string[],
  purpose: string,
  priorQuestions: string[],
  priorPurposes: string[],
  usedBackup: boolean,
  targetSlot = 'none',
): ClarificationCandidate | null {
  const cleanQuestion = String(question || '').trim()
  if (!cleanQuestion) return null
  if (priorQuestions.some((prior) => questionsNearDuplicate(prior, cleanQuestion))) return null
  if (purposeAlreadyAsked(purpose, priorPurposes)) return null
  return {
    question: cleanQuestion,
    options: options.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 4),
    purpose: String(purpose || '').trim(),
    usedBackup,
    targetSlot,
  }
}

const CLINICAL_SLOT_SET = new Set<string>(CLINICAL_SLOTS)

function unfilledTargetSlot(targetSlot: unknown, filledSlots: JsonObject): ClinicalSlot | null {
  const slot = String(targetSlot || '').trim()
  if (!CLINICAL_SLOT_SET.has(slot)) return null
  return isClinicalSlotSatisfied(slot as ClinicalSlot, filledSlots[slot]) ? null : slot as ClinicalSlot
}

/**
 * Clarification is a phase, not a clinical data domain. Older Interview
 * workflow versions label every clarification question with the phase name,
 * so map its machine-readable purpose back onto the existing slot vocabulary.
 */
function resolveClinicalTargetSlot(question: string, purpose: string, declared: unknown): ClinicalSlot {
  const declaredSlot = String(declared || '').trim()
  if (CLINICAL_SLOT_SET.has(declaredSlot)) return declaredSlot as ClinicalSlot
  const value = normalize(`${purpose} ${question}`)
  if (/\b(onset|start|began|timing|when|commenc|beginn|inicio|shuru)\b/u.test(value)) return 'onset'
  if (/\b(duration|how long|days|hours|weeks|dauer|duracion|duree|samay)\b/u.test(value)) return 'duration'
  if (/\b(severity|severe|intensity|scale|0 to 10|starke|intensidad|intensite|gambhir)\b/u.test(value)) return 'severity'
  if (/\b(location|where|site|side|body area|ort|ubicacion|localisation|jagah)\b/u.test(value)) return 'location'
  if (/\b(function|impact|sleep|walking|work|activities|eat|drink|aktivitat|actividad|activite)\b/u.test(value)) return 'functional_impact'
  if (/\b(red flag|warning sign|breath|chest pain|faint|confusion|stiff neck|oxygen)\b/u.test(value)) return 'red_flag_negatives'
  if (/\b(history|condition|medicine|medication|allerg|pregnan|vorgeschichte|antecedent)\b/u.test(value)) return 'relevant_history'
  if (/\b(character|trigger|worse|better|movement|position|pattern|quality|provok|twist|twisting|direction)\b/u.test(value)) return 'character'
  return 'associated_symptoms'
}

export function isAdministrativeClosingQuestion(question: string, purpose: string): boolean {
  const value = normalize(`${question} ${purpose}`)
  return /\b(report|medical record|physician review|finali[sz]\p{L}*|conclud\p{L}*|close consultation|closing (?:the )?interview|consultation completed|transition to (?:the )?(?:summary|report)|bericht|informe|rapport|relatorio|relatorio medico)\b/u.test(value)
    || /\b(?:enough|sufficient|necessary) (?:information|details)\b/u.test(value)
    || /\b(?:gathered|prepare|provide|generate|review|share|proceed|finish)\p{L}*\b.{0,80}\b(?:summary|report|assessment|medical record|healthcare provider)\b/u.test(value)
    || /\b(?:resumen|zusammenfassung|resume|resumo|सारांश|summary)\b.{0,80}\b(?:medico|arzt|medecin|doctor|provider|रिपोर्ट|report)\b/u.test(value)
}

/** Primary first, backup second. No extra model call is ever made. */
export function selectDiagnosticClarificationCandidate(
  interview: InterviewResult,
  history: Array<{ role?: unknown; content?: unknown }>,
  state: DiagnosticClarificationState,
  allowUnflagged = false,
): ClarificationCandidate | null {
  if (!interview.diagnostic_clarification && !allowUnflagged) return null
  const transcriptQuestions = history
    .filter((message) => message.role === 'assistant')
    .map((message) => String(message.content || '').trim())
    .filter(Boolean)
  const priorQuestions = [...transcriptQuestions, ...state.askedQuestions]
  const primary = isAdministrativeClosingQuestion(interview.next_question, interview.question_purpose)
    ? null
    : candidateIfNew(
    interview.next_question,
    interview.options,
    interview.question_purpose,
    priorQuestions,
    state.askedPurposes,
    false,
    resolveClinicalTargetSlot(interview.next_question, interview.question_purpose, interview.target_slot),
  )
  const backup = isAdministrativeClosingQuestion(interview.backup_question, interview.backup_question_purpose)
    ? null
    : candidateIfNew(
    interview.backup_question,
    interview.backup_options.length ? interview.backup_options : interview.options,
    interview.backup_question_purpose,
    priorQuestions,
    state.askedPurposes,
    true,
    resolveClinicalTargetSlot(interview.backup_question, interview.backup_question_purpose, 'none'),
  )
  return primary || backup
}

/**
 * Zero-latency fallback when Interview does not enter clarification itself.
 * Mini-differential discriminators are already in the selected patient
 * language and are never condition labels; only the question is shown.
 */
export function selectDifferentialClarificationCandidate(
  entries: JsonObject[],
  history: Array<{ role?: unknown; content?: unknown }>,
  state: DiagnosticClarificationState,
): ClarificationCandidate | null {
  const transcriptQuestions = history
    .filter((message) => message.role === 'assistant')
    .map((message) => String(message.content || '').trim())
    .filter(Boolean)
  const priorQuestions = [...transcriptQuestions, ...state.askedQuestions]
  for (const entry of entries.slice(0, 3)) {
    const discriminator = String(entry.discriminator || '').trim()
    const condition = String(entry.condition || '').trim()
    const candidate = candidateIfNew(
      discriminator,
      [],
      condition ? `differentiate ${condition}` : 'differentiate leading causes',
      priorQuestions,
      state.askedPurposes,
      true,
      resolveClinicalTargetSlot(discriminator, condition ? `differentiate ${condition}` : '', 'none'),
    )
    if (candidate) return candidate
  }
  return null
}

/**
 * Apply the same no-repeat boundary to ordinary history-taking questions.
 * The Interview workflow already returns primary and backup candidates in one
 * response, so this adds no network call and no user-visible latency.
 */
export function selectNonDuplicateInterviewCandidate(
  interview: InterviewResult,
  history: Array<{ role?: unknown; content?: unknown }>,
  fallbackQuestions: string | Array<string | ClinicalFallbackQuestion> = '',
  filledSlots: JsonObject = {},
): ClarificationCandidate | null {
  const priorQuestions = history
    .filter((message) => message.role === 'assistant')
    .map((message) => String(message.content || '').trim())
    .filter(Boolean)
  const primaryTargetSlot = unfilledTargetSlot(interview.target_slot, filledSlots)
  const primaryTargetsFilledSlot = CLINICAL_SLOT_SET.has(String(interview.target_slot || '').trim()) && !primaryTargetSlot
  const primary = primaryTargetsFilledSlot || isAdministrativeClosingQuestion(interview.next_question, interview.question_purpose)
    ? null
    : candidateIfNew(
      interview.next_question,
      interview.options,
      interview.question_purpose,
      priorQuestions,
      [],
      false,
      primaryTargetSlot || interview.target_slot || 'none',
    )
  const backup = isAdministrativeClosingQuestion(interview.backup_question, interview.backup_question_purpose)
    ? null
    : candidateIfNew(
      interview.backup_question,
      interview.backup_options.length ? interview.backup_options : interview.options,
      interview.backup_question_purpose,
      priorQuestions,
      [],
      true,
      'none',
    )
  if (primary || backup) return primary || backup
  return selectNonDuplicateFallbackCandidate(fallbackQuestions, history, filledSlots)
}

export function selectNonDuplicateFallbackCandidate(
  fallbackQuestions: string | Array<string | ClinicalFallbackQuestion>,
  history: Array<{ role?: unknown; content?: unknown }>,
  filledSlots: JsonObject = {},
): ClarificationCandidate | null {
  const priorQuestions = history
    .filter((message) => message.role === 'assistant')
    .map((message) => String(message.content || '').trim())
    .filter(Boolean)
  const localFallbacks = Array.isArray(fallbackQuestions) ? fallbackQuestions : [fallbackQuestions]
  for (const fallbackQuestion of localFallbacks) {
    const question = typeof fallbackQuestion === 'string' ? fallbackQuestion : fallbackQuestion.question
    const targetSlot = typeof fallbackQuestion === 'string' ? 'none' : fallbackQuestion.targetSlot
    if (CLINICAL_SLOT_SET.has(targetSlot) && isClinicalSlotSatisfied(targetSlot as ClinicalSlot, filledSlots[targetSlot])) continue
    const fallback = candidateIfNew(
      question,
      [],
      'new clinical detail not already discussed',
      priorQuestions,
      [],
      true,
      targetSlot,
    )
    if (fallback) return fallback
  }
  return null
}

export function withDiagnosticClarificationQuestion(
  workflowVersions: JsonObject,
  state: DiagnosticClarificationState,
  candidate: ClarificationCandidate,
  turnCount: number,
): JsonObject {
  return {
    ...workflowVersions,
    [DIAGNOSTIC_CLARIFICATION_KEY]: {
      asked_count: Math.min(5, state.askedCount + 1),
      asked_questions: [...state.askedQuestions, candidate.question].slice(-5),
      asked_purposes: [...state.askedPurposes, candidate.purpose].filter(Boolean).slice(-5),
      completed: false,
      completion_reason: null,
      last_turn: turnCount,
    },
  }
}

export function withDiagnosticClarificationCompleted(
  workflowVersions: JsonObject,
  state: DiagnosticClarificationState,
  reason: 'confidence_met' | 'question_budget_exhausted' | 'no_new_question' | 'turn_limit',
): JsonObject {
  return {
    ...workflowVersions,
    [DIAGNOSTIC_CLARIFICATION_KEY]: {
      asked_count: state.askedCount,
      asked_questions: state.askedQuestions,
      asked_purposes: state.askedPurposes,
      completed: true,
      completion_reason: reason,
      last_turn: state.lastTurn,
    },
  }
}
