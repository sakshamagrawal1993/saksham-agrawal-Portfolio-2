import {
  EMERGENCY_PATTERNS,
  EMERGENCY_PATTERN_SET_VERSION,
  type EmergencyCareSetting,
} from './emergency-patterns.ts'

export type ClinicalSlots = Record<string, unknown>

export type ResponseRelevance = 'clinical' | 'unclear' | 'off_topic'

export interface EvidenceAssessment {
  score: number
  sufficient: boolean
  present: string[]
  missing: string[]
}

export interface ReportDecisionInput {
  diagnosisValid: boolean
  confidence: number
  turnCount: number
  readyForReport: boolean
  evidence: EvidenceAssessment
  nonClinicalResponseCount: number
  /**
   * The patient has seen the comprehension summary and confirmed it is right.
   * That is an explicit "I am done answering", and it is the strongest signal
   * available that the interview should end.
   */
  comprehensionConfirmed?: boolean
}

export type ReportDecision =
  | { outcome: 'complete'; reason: 'high_confidence' | 'workflow_ready' | 'turn_limit_report' | 'comprehension_confirmed' }
  | { outcome: 'continue'; reason: 'collect_more_evidence' | 'raise_confidence' | 'retry_report_generation' }
  | { outcome: 'review'; reason: 'no_health_information' }

export interface DeterministicEmergency {
  crisisType: string
  careSetting: EmergencyCareSetting
  message: string
  patternId: string
  /** Verbatim slice of the original inbound message (not the lowercased scan). */
  matchedSpan: string
  /** Inclusive start index of `matchedSpan` on the original message. */
  spanStart: number
  /** Exclusive end index of `matchedSpan` on the original message. */
  spanEnd: number
  patternSetVersion: string
}

const SLOT_WEIGHTS: Record<string, number> = {
  chief_complaint: 25,
  onset: 15,
  duration: 10,
  severity: 15,
  associated_symptoms: 10,
  red_flag_negatives: 15,
  relevant_history: 10,
}

/** Shared slot-value gate (P1-09 eligibility reuses for `chief_complaint`). */
export const hasValue = (value: unknown): boolean => {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return false
    return !/\b(unknown|uncertain|unsure|not sure|cannot reliably|contradict|unclear|unspecified|maybe yes|maybe no)\b/i.test(text)
  }
  if (Array.isArray(value)) return value.some(hasValue)
  return true
}

export function detectDeterministicEmergency(message: string): DeterministicEmergency | null {
  const text = message.toLowerCase()
  for (const rule of EMERGENCY_PATTERNS) {
    const globalPattern = new RegExp(rule.matcher.source, rule.matcher.flags.includes('g') ? rule.matcher.flags : `${rule.matcher.flags}g`)
    let match: RegExpExecArray | null
    while ((match = globalPattern.exec(text)) !== null) {
      if (match.index === undefined) continue
      const before = text.slice(Math.max(0, match.index - 40), match.index)
      // Negation does not carry across sentence/contrast boundaries. Deliberately
      // do NOT split on commas — "no lip swelling, tongue swelling, or X" is one
      // negated list (corpus: lip_dryness_no_swelling).
      const seg = before.split(/[;.!?]|\bbut\b|\bhowever\b|\balthough\b|\bthough\b/i).pop() || ''
      if (/\b(no|not|without|denies|denied|never|don'?t have|doesn'?t have)\b/.test(seg)) continue
      // Past-tense family history only — "my father had chest pain last year" is not
      // the patient's emergency; "my father is having chest pain" still fires.
      // Check the window before the match (includes the relative + had).
      if (
        /\b(my|his|her|their)\s+\w*\s*(father|mother|dad|mum|mom|brother|sister|friend|husband|wife|son|daughter|uncle|aunt)\s+(had|has had|used to have)\b/.test(before)
        || /\b(family history|history of|hx of)\b/.test(before)
      ) continue
      const spanStart = match.index
      const spanEnd = match.index + match[0].length
      return {
        crisisType: rule.crisisType,
        careSetting: rule.careSetting,
        message: rule.message,
        patternId: rule.id,
        // Slice the original message so casing is preserved for audit (AC4).
        matchedSpan: message.slice(spanStart, spanEnd),
        spanStart,
        spanEnd,
        patternSetVersion: EMERGENCY_PATTERN_SET_VERSION,
      }
    }
  }
  return null
}

export function assessClinicalEvidence(slots: ClinicalSlots): EvidenceAssessment {
  const present = Object.keys(SLOT_WEIGHTS).filter((slot) => hasValue(slots[slot]))
  const missing = Object.keys(SLOT_WEIGHTS).filter((slot) => !present.includes(slot))
  const score = present.reduce((total, slot) => total + SLOT_WEIGHTS[slot], 0)
  const timelinePresent = hasValue(slots.onset) || hasValue(slots.duration)
  const symptomDetailPresent = hasValue(slots.severity) || hasValue(slots.associated_symptoms)
  const safetyPresent = hasValue(slots.red_flag_negatives)

  return {
    score,
    sufficient: hasValue(slots.chief_complaint) && timelinePresent && symptomDetailPresent && safetyPresent && score >= 65,
    present,
    missing,
  }
}

export function classifyResponseRelevance(message: string): ResponseRelevance {
  const text = message.trim().toLowerCase()
  if (!text) return 'unclear'

  // Multilingual short answers (English, Spanish, Hindi, Hinglish, French, German, Portuguese)
  const acceptedShortAnswers = /^(yes|no|none|nope|better|worse|same|today|yesterday|unknown|unsure|not sure|sí|si|nada|ninguno|ninguna|mejor|peor|igual|hoy|ayer|desconocido|हाँ|हां|नहीं|नही|आज|कल|बेहतर|कम|ज्यादा|पता नहीं|haan|ha|hha|nahi|na|nhi|aaj|kal|parso|pata nahi|oui|non|aucun|meilleur|pire|aujourd'hui|hier|ja|nein|keine|besser|schlechter|heute|gestern|sim|não|nao|nenhum|melhor|pior|hoje|ontem|\d{1,3}(?:\/10)?)$/i
  if (acceptedShortAnswers.test(text)) return 'clinical'

  // Recognized medical vitals & measurements (temperatures, blood pressure, oxygen saturation, ranges with units)
  const isMedicalMeasurement = /^[\d\s\.\,\/\-–—°%fFcC()degdegreesbpmoxspo2]+$/.test(text)
    || /\b\d{1,3}(?:\.\d{1,2})?\s*(?:°|deg|degrees)?\s*[fc]\b/i.test(text)
    || /\b\d{2,3}\s*[-–—]\s*\d{2,3}\s*(?:°|deg|degrees)?\s*[fc]?\b/i.test(text)
    || /\b\d{2,3}\/\d{2,3}\b/.test(text)

  if (isMedicalMeasurement) return 'clinical'

  const offTopic = /\b(football|cricket|sports?|who won (the )?game|stock market|bitcoin|weather forecast|tell me a joke|write (me )?a poem|banana|pineapple|movie|celebrity|politics|recipe|homework|random answer|not medical|asdf|qwerty|qwrty|zxcv|hjkl)\b/
  if (offTopic.test(text)) return 'off_topic'

  // Unicode-aware letter matching (handles Spanish accents, Devanagari Hindi, French/German/Portuguese, etc.)
  const letters = (text.match(/\p{L}/gu) || []).length
  const alphaRatio = letters / Math.max(text.length, 1)
  const words = text.match(/\p{L}+/gu) || []

  // Check vowels for Latin-script text; non-Latin script words (e.g. Devanagari) automatically pass
  const isNonLatin = /[\u0900-\u097F]/u.test(text)
  const hasVowelWord = isNonLatin || words.some((word) => /[aeiouyáéíóúàèìòùâêîôûäëïöüãõâêô]/i.test(word))
  const hasNumbers = /\d/.test(text)

  if (text.length >= 4 && !hasNumbers && (alphaRatio < 0.35 || !hasVowelWord)) return 'off_topic'
  if (words.length === 1 && words[0].length <= 2 && !hasNumbers) return 'unclear'

  return 'clinical'
}

export function decideReportOutcome(input: ReportDecisionInput): ReportDecision {
  const hasHealthInformation = input.evidence.present.length > 0

  // Confidence changes the wording of the physician-review report; it does not
  // decide whether the patient receives one. Before the turn cap we still wait
  // for enough evidence to avoid ending the interview prematurely. At the cap,
  // any usable health information plus a structurally valid three-item
  // differential is released, even when confidence is low.
  if (input.diagnosisValid && hasHealthInformation) {
    if (input.turnCount >= 15) return { outcome: 'complete', reason: 'turn_limit_report' }
    // BO 2026-08-02 — a confirmed comprehension summary ends the interview.
    if (input.comprehensionConfirmed) {
      return { outcome: 'complete', reason: 'comprehension_confirmed' }
    }
    if (!input.evidence.sufficient) {
      return { outcome: 'continue', reason: 'collect_more_evidence' }
    }
    if (input.confidence >= 80) return { outcome: 'complete', reason: 'high_confidence' }
    if (input.readyForReport) return { outcome: 'complete', reason: 'workflow_ready' }
  }

  if (input.turnCount >= 15) {
    if (!hasHealthInformation) return { outcome: 'review', reason: 'no_health_information' }
    // A model/transport/schema failure is technical, not evidence that the
    // patient's health story is incomplete. Keep the consultation recoverable.
    return { outcome: 'continue', reason: 'retry_report_generation' }
  }

  return {
    outcome: 'continue',
    reason: input.evidence.sufficient ? 'raise_confidence' : 'collect_more_evidence',
  }
}
