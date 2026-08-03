import type { JsonObject } from './types.ts'

const CARDIO_RESPIRATORY_SYMPTOM = /\b(chest (?:only )?(?:pain|discomfort|tightness|hurts?|aches?)|short(?:ness)? of breath|short of breath|breathless|difficulty breathing)\b/i

const HIGH_SPECIFICITY_ACS = /\b(?:crushing|squeezing|heavy) (?:chest|pressure)\b|\bchest (?:pressure|squeezing|heaviness)\b|\bchest (?:pain|discomfort).{0,80}(?:radiat(?:es|ing)?|spread(?:s|ing)?).{0,35}(?:arm|jaw|back|neck)\b|\bchest (?:pain|discomfort).{0,80}(?:cold sweat|sweating|lightheaded|faint(?:ed|ing)?)\b|\b(?:cold sweat|sweating|lightheaded|faint(?:ed|ing)?).{0,80}chest (?:pain|discomfort)\b|\bchest (?:pain|discomfort).{0,60}(?:persistent|keeps returning|comes back|lasting (?:more than )?(?:a few|[5-9]|[1-9]\d) minutes?)\b/gi

const HIGH_SPECIFICITY_BREATHING = /\b(?:cannot|can't|unable to) breathe\b|\bgasping(?: for air)?\b|\bchoking\b|\b(?:cannot|can't|unable to) (?:speak|talk|get words out)\b|\b(?:blue|grey|gray) (?:lips|skin|face)\b|\bnew confusion\b|\b(?:collapsed|passed out|unconscious)\b|\boxygen (?:sat|saturation)?[^.]{0,12}(?:[0-8]\d|9[0-2])\b|\bsevere (?:shortness of breath|difficulty breathing)\b|\b(?:shortness of breath|difficulty breathing).{0,30}(?:at rest|while resting|sitting still)\b/gi

const NEGATION = /\b(no|not|without|denies|denied|never|don'?t have|doesn'?t have)\b/i
const THIRD_PARTY_HISTORY = /\b(my|his|her|their)\s+\w*\s*(father|mother|dad|mum|mom|brother|sister|friend|husband|wife|son|daughter|uncle|aunt)\s+(had|has had|used to have)\b|\b(family history|history of|hx of)\b/i

function historyText(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  const row = entry as Record<string, unknown>
  const role = String(row.role || row.sender || row.author || '').toLowerCase()
  if (role !== 'user' && role !== 'patient') return null
  const value = row.content ?? row.text ?? row.message
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function hasUnnegatedPatientMatch(statement: string, pattern: RegExp): boolean {
  const text = statement.toLowerCase()
  const matcher = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
  let match: RegExpExecArray | null
  while ((match = matcher.exec(text)) !== null) {
    const before = text.slice(Math.max(0, match.index - 60), match.index)
    const clause = before.split(/[;.!?]|\bbut\b|\bhowever\b|\balthough\b|\bthough\b/i).pop() || ''
    if (!NEGATION.test(clause) && !THIRD_PARTY_HISTORY.test(before)) return true
    if (match.index === matcher.lastIndex) matcher.lastIndex += 1
  }
  return false
}

function patientStatements(message: string, history: unknown[]): string[] {
  const statements = history.map(historyText).filter((value): value is string => Boolean(value))
  if (message.trim()) statements.push(message.trim())
  return statements
}

/**
 * A model may recognize a concerning cardio-respiratory symptom without having
 * enough patient-stated evidence to end the interview. This backstop makes the
 * terminal boundary deterministic: assistant questions, fever duration, bare
 * shortness of breath, and ambiguous yes/no answers cannot establish severe
 * respiratory distress or acute coronary syndrome.
 */
export function enforceCardioRespiratoryEmergencySpecificity(
  raw: JsonObject,
  message: string,
  history: unknown[],
): JsonObject {
  const requestedForceEnd = Boolean(raw.force_end || raw.is_emergency || raw.status === 'force_end')
  if (!requestedForceEnd) return raw

  const crisisType = String(raw.crisis_type || '').toLowerCase()
  if (crisisType !== 'respiratory_distress' && crisisType !== 'acs_chest_pain') return raw

  const statements = patientStatements(message, history)
  const hasHighSpecificityEvidence = crisisType === 'respiratory_distress'
    ? statements.some((statement) => hasUnnegatedPatientMatch(statement, HIGH_SPECIFICITY_BREATHING))
    : statements.some((statement) => hasUnnegatedPatientMatch(statement, HIGH_SPECIFICITY_ACS))

  if (hasHighSpecificityEvidence) return raw

  const patientContext = statements.join(' ')
  const hasRelevantSymptom = CARDIO_RESPIRATORY_SYMPTOM.test(patientContext)
  return {
    ...raw,
    status: 'high_risk_continue',
    risk_level: hasRelevantSymptom ? 'high' : 'medium',
    force_end: false,
    is_emergency: false,
    care_setting: hasRelevantSymptom ? 'urgent_care' : 'telehealth',
    message: 'I need a few more details to judge how urgent this is. Tell me whether it is severe, persistent or present at rest, and whether you can speak normally. If you become unable to breathe, faint, turn blue or grey, or develop heavy chest pressure that spreads, call emergency services now.',
    source: 'llm_specificity_backstop',
  }
}
