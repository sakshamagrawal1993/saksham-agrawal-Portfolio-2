/**
 * Diagnostic-clarification state and duplicate protection.
 *
 * The Interview model proposes a primary and backup question. The proxy owns
 * the bounded phase and refuses to serve a near-duplicate. State lives inside
 * workflow_versions so this can roll out without a schema migration and stays
 * attached to the consultation's existing optimistic-request boundary.
 */
import type { InterviewResult, JsonObject } from './types.ts'

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
  return input.enabled
    && input.turnCount < input.maxTurns
    && input.evidenceSufficient
    && !input.mediaBlocksCompletion
    && input.redFlagsOutstanding.length === 0
    && confidenceLowOrUnavailable
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

function tokenSet(value: string): Set<string> {
  return new Set(normalize(value).split(/\s+/).filter((token) => token.length > 1))
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
  }
}

/** Primary first, backup second. No extra model call is ever made. */
export function selectDiagnosticClarificationCandidate(
  interview: InterviewResult,
  history: Array<{ role?: unknown; content?: unknown }>,
  state: DiagnosticClarificationState,
): ClarificationCandidate | null {
  if (!interview.diagnostic_clarification) return null
  const transcriptQuestions = history
    .filter((message) => message.role === 'assistant')
    .map((message) => String(message.content || '').trim())
    .filter(Boolean)
  const priorQuestions = [...transcriptQuestions, ...state.askedQuestions]
  return candidateIfNew(
    interview.next_question,
    interview.options,
    interview.question_purpose,
    priorQuestions,
    state.askedPurposes,
    false,
  ) || candidateIfNew(
    interview.backup_question,
    interview.backup_options.length ? interview.backup_options : interview.options,
    interview.backup_question_purpose,
    priorQuestions,
    state.askedPurposes,
    true,
  )
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
