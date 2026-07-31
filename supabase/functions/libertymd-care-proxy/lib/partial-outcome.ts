/**
 * P1-09 — ephemeral partial outcome from filled_slots (no n8n, no Diagnosis).
 *
 * Eligibility: turn_count >= 3 ∧ hasValue(chief_complaint) ∧ status ≠ emergency_stopped.
 * high_risk is eligible when those gates pass (S2A).
 *
 * Content bans: no differential list, no confidence (numeric / "Most likely" / "Possible"),
 * no condition-as-likely-cause framing.
 *
 * REQUIRES EXPERT REVIEW — provisional medical copy. Engineering Done ≠ clinical approval
 * (same posture as P0-17 emergency copy).
 */
import { hasValue, type ClinicalSlots } from '../clinical-policy.ts'

export const PARTIAL_OUTCOME_INCOMPLETE_LABEL =
  'Incomplete guidance — this is not a diagnosis or a full care plan'

export type PartialOutcomeBucket =
  | 'headache'
  | 'chest'
  | 'abdominal'
  | 'respiratory'
  | 'generic'

export interface PartialOutcomePayload {
  incomplete_label: string
  general_guidance: string
  see_today_signs: string[]
  /** Categorical bucket only — never raw complaint text in telemetry. */
  bucket: PartialOutcomeBucket
}

export interface PartialOutcomeSource {
  turn_count: number
  status: string
  filled_slots?: ClinicalSlots | null
}

interface BucketTemplate {
  guidance: string
  seeToday: string[]
}

/**
 * Engineering-owned seed buckets (Q3A). Provisional — REQUIRES EXPERT REVIEW.
 * Strings deliberately avoid differential / confidence vocabulary.
 */
const BUCKET_TEMPLATES: Record<PartialOutcomeBucket, BucketTemplate> = {
  headache: {
    guidance:
      'While this consult is incomplete, rest in a quiet space, stay hydrated, and note what makes the headache better or worse. Avoid new pain medicines beyond what you already use as directed unless a clinician advises otherwise.',
    seeToday: [
      'Sudden "worst ever" headache, especially with neck stiffness or confusion',
      'Headache with weakness, vision loss, trouble speaking, or fainting',
      'Headache after a head injury, or with fever and a stiff neck',
    ],
  },
  chest: {
    guidance:
      'While this consult is incomplete, ease activity, sit upright if breathing feels tight, and keep track of when chest discomfort started and what changes it. Do not treat this tip as clearance to ignore urgent symptoms.',
    seeToday: [
      'Pressure, squeezing, or pain in the chest that spreads to arm, jaw, or back',
      'Chest discomfort with shortness of breath, sweating, nausea, or lightheadedness',
      'Sudden severe shortness of breath or fainting with chest symptoms',
    ],
  },
  abdominal: {
    guidance:
      'While this consult is incomplete, take small sips of fluid if you can keep them down, avoid heavy meals or alcohol, and note the location and timing of belly pain. Seek care sooner if pain is escalating.',
    seeToday: [
      'Severe or rapidly worsening belly pain',
      'Belly pain with persistent vomiting, high fever, or inability to pass stool or gas',
      'Belly pain with fainting, bloody vomit, or black/bloody stool',
    ],
  },
  respiratory: {
    guidance:
      'While this consult is incomplete, rest, use any prescribed inhalers as directed, and note cough, fever, and breathing changes. Keep the environment smoke-free and hydrate if you can.',
    seeToday: [
      'Trouble breathing at rest, speaking only in short phrases, or lips/fingertips turning blue',
      'High fever with chest pain or confusion',
      'Wheezing or breathlessness that is not improving with your usual plan',
    ],
  },
  generic: {
    guidance:
      'While this consult is incomplete, rest, hydrate if you can, and write down your main symptom, when it started, and anything that makes it better or worse. This tip does not replace a clinician visit.',
    seeToday: [
      'Symptoms that are severe, rapidly worsening, or stopping you from walking, drinking, or staying awake',
      'New confusion, fainting, chest pressure, or trouble breathing',
      'Fever with a stiff neck, a rash that does not blanch, or uncontrolled bleeding',
    ],
  },
}

const BUCKET_MATCHERS: Array<{ bucket: PartialOutcomeBucket; pattern: RegExp }> = [
  { bucket: 'headache', pattern: /\b(headache|migraine|head\s*pain|cephalalgia)\b/i },
  {
    bucket: 'chest',
    pattern: /\b(chest\s*(pain|pressure|tightness|discomfort)|heart\s*palpit|angina)\b/i,
  },
  {
    bucket: 'abdominal',
    pattern: /\b(abdomin|belly|stomach\s*pain|nausea|vomit|diarrhea|constipation|cramp)/i,
  },
  {
    bucket: 'respiratory',
    pattern: /\b(cough|short(ness)?\s*of\s*breath|wheez|breath|respirat|asthma|pneumonia)\b/i,
  },
]

/** Classify free-text chief_complaint into a closed bucket (generic fallback). */
export function classifyComplaintBucket(chiefComplaint: unknown): PartialOutcomeBucket {
  const text = typeof chiefComplaint === 'string' ? chiefComplaint : ''
  for (const rule of BUCKET_MATCHERS) {
    if (rule.pattern.test(text)) return rule.bucket
  }
  return 'generic'
}

export function isPartialOutcomeEligible(source: PartialOutcomeSource): boolean {
  if (source.status === 'emergency_stopped') return false
  const turns = Number(source.turn_count) || 0
  if (turns < 3) return false
  const slots = source.filled_slots && typeof source.filled_slots === 'object'
    ? source.filled_slots
    : {}
  return hasValue(slots.chief_complaint)
}

/**
 * Deterministic generate-from-slots. Returns null when ineligible.
 * Never reads diagnosis differentials into the body.
 */
export function generatePartialOutcome(source: PartialOutcomeSource): PartialOutcomePayload | null {
  if (!isPartialOutcomeEligible(source)) return null
  const slots = source.filled_slots && typeof source.filled_slots === 'object'
    ? source.filled_slots
    : {}
  const bucket = classifyComplaintBucket(slots.chief_complaint)
  const template = BUCKET_TEMPLATES[bucket]
  const seeToday = [...template.seeToday]

  // Optional severity cue — generic reminder only; never names a likely diagnosis.
  if (hasValue(slots.severity)) {
    const severityText = String(slots.severity).toLowerCase()
    if (/\b(severe|10|9|worst|unbearable)\b/.test(severityText)) {
      seeToday.push('Pain or symptoms you would rate as severe or rapidly getting worse')
    }
  }

  return {
    incomplete_label: PARTIAL_OUTCOME_INCOMPLETE_LABEL,
    general_guidance: template.guidance,
    see_today_signs: seeToday,
    bucket,
  }
}
