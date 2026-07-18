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
}

export type ReportDecision =
  | { outcome: 'complete'; reason: 'high_confidence' | 'workflow_ready' | 'turn_limit_confident' }
  | { outcome: 'continue'; reason: 'collect_more_evidence' | 'raise_confidence' }
  | { outcome: 'review'; reason: 'low_diagnostic_confidence' | 'insufficient_clinical_information' }

export interface DeterministicEmergency {
  crisisType: string
  message: string
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

const hasValue = (value: unknown) => {
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
  const rules = [
    {
      pattern: /chest (pain|pressure|tightness)|crushing (chest|pressure)|pain radiating to (left )?arm|jaw pain.{0,30}(sweat|sweating|nausea)/i,
      crisisType: 'acs_chest_pain',
      message: 'These symptoms can be a medical emergency. Call emergency services or go to the ER now. Do not drive yourself.',
    },
    {
      pattern: /worst headache of (my|his|her) life|thunderclap|sudden severe headache/i,
      crisisType: 'thunderclap_headache',
      message: 'A sudden worst-of-life headache can be an emergency. Call emergency services or go to the ER now.',
    },
    {
      pattern: /throat (is )?tight|lip swelling|tongue swelling|anaphylaxis|cannot breathe after/i,
      crisisType: 'anaphylaxis',
      message: 'This may be anaphylaxis. Use epinephrine if available and call emergency services immediately.',
    },
    {
      pattern: /cannot breathe|can't breathe|blue lips|gasping for air|oxygen (sat|saturation).{0,12}(8\d|9[0-2])\b/i,
      crisisType: 'respiratory_distress',
      message: 'Severe breathing problems need emergency care. Call emergency services or go to the ER now.',
    },
    {
      pattern: /sudden severe (abdominal|belly|stomach) pain|severe (right lower|lower right|lower) (abdominal|belly|stomach) pain|rigid abdomen|pain (is )?so bad i (can't|cannot) walk/i,
      crisisType: 'surgical_abdomen',
      message: 'Severe abdominal pain with these features can be a surgical emergency. Seek ER care now.',
    },
  ]

  for (const rule of rules) {
    const match = text.match(rule.pattern)
    if (!match || match.index === undefined) continue
    const before = text.slice(Math.max(0, match.index - 36), match.index)
    if (/\b(no|not|without|denies|denied|never)\b/.test(before)) continue
    return { crisisType: rule.crisisType, message: rule.message }
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

  const acceptedShortAnswers = /^(yes|no|none|nope|better|worse|same|today|yesterday|unknown|unsure|not sure|\d{1,3}(?:\/10)?)$/
  if (acceptedShortAnswers.test(text)) return 'clinical'

  const offTopic = /\b(football|cricket|sports?|who won (the )?game|stock market|bitcoin|weather forecast|tell me a joke|write (me )?a poem|banana|pineapple|movie|celebrity|politics|recipe|homework|random answer|not medical|asdf|qwerty|qwrty|zxcv|hjkl)\b/
  if (offTopic.test(text)) return 'off_topic'

  const letters = (text.match(/[a-z]/g) || []).length
  const alphaRatio = letters / Math.max(text.length, 1)
  const words = text.match(/[a-z]+/g) || []
  const hasVowelWord = words.some((word) => /[aeiou]/.test(word))
  if (text.length >= 4 && (alphaRatio < 0.35 || !hasVowelWord)) return 'off_topic'
  if (words.length === 1 && words[0].length <= 2) return 'unclear'

  return 'clinical'
}

export function decideReportOutcome(input: ReportDecisionInput): ReportDecision {
  if (input.turnCount >= 15 && (!input.evidence.sufficient || input.nonClinicalResponseCount >= 5)) {
    return { outcome: 'review', reason: 'insufficient_clinical_information' }
  }

  if (input.diagnosisValid && input.evidence.sufficient) {
    if (input.confidence >= 80) return { outcome: 'complete', reason: 'high_confidence' }
    if (input.readyForReport && input.confidence >= 60) return { outcome: 'complete', reason: 'workflow_ready' }
    if (input.turnCount >= 15 && input.confidence >= 65) return { outcome: 'complete', reason: 'turn_limit_confident' }
  }

  if (input.turnCount >= 15) {
    return { outcome: 'review', reason: input.evidence.sufficient ? 'low_diagnostic_confidence' : 'insufficient_clinical_information' }
  }

  return {
    outcome: 'continue',
    reason: input.evidence.sufficient ? 'raise_confidence' : 'collect_more_evidence',
  }
}
