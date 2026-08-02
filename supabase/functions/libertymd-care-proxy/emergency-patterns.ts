/**
 * Canonical deterministic emergency patterns for LibertyMD.
 *
 * REQUIRES EXPERT REVIEW: the pattern set and all patient-facing emergency
 * copy are engineering safety fixtures pending clinician approval.
 *
 * Pattern-set version bump procedure: any edit to `EMERGENCY_PATTERNS` (matcher,
 * id, crisis type, care setting, or copy) requires bumping
 * `EMERGENCY_PATTERN_SET_VERSION` in the same commit. The version is persisted
 * on every `edge_deterministic` `libertymd_safety_events.raw_result.match`.
 *
 * P0-17: `message` is a thin read-through of canonical `detail` from
 * `lib/emergency-copy.ts` so n8n sync still emits one message string.
 */
import { emergencyCopyDetail } from './lib/emergency-copy.ts'

export const EMERGENCY_PATTERN_SET_VERSION = '1.1.0'

export type EmergencyCareSetting = 'call_911' | 'crisis_line'

export interface EmergencyPattern {
  id: string
  crisisType: string
  careSetting: EmergencyCareSetting
  message: string
  matcher: RegExp
  clinicianReview: {
    status: 'pending'
    note: string
  }
}

const PENDING_REVIEW = {
  status: 'pending',
  note: 'REQUIRES EXPERT REVIEW before clinical release.',
} as const

export const EMERGENCY_PATTERNS: readonly EmergencyPattern[] = [
  {
    id: 'acs_chest_pain',
    crisisType: 'acs_chest_pain',
    careSetting: 'call_911',
    message: emergencyCopyDetail('acs_chest_pain'),
    // Bare "chest pain" is deliberately not terminal. Pain only while
    // coughing, taking a deep breath, moving, or pressing the area is common
    // in respiratory and musculoskeletal presentations. Those cases still go
    // through the n8n guardrail as high_risk_continue so the interview can ask
    // persistence, severity, rest/exertion, radiation, and associated signs.
    // Force-end is reserved for pressure/squeezing/crushing/heaviness or chest
    // pain paired with a high-specificity ACS warning feature.
    matcher: /(?:crushing|squeezing|heavy) (?:chest|pressure)|chest (?:pressure|squeezing|heaviness)|elephant (?:on|sitting)|(?:chest (?:pain|discomfort).{0,80}(?:radiat(?:es|ing)?|spread(?:s|ing)?).{0,35}(?:arm|jaw|back|neck))|(?:chest (?:pain|discomfort).{0,80}(?:cold sweat|sweating|lightheaded|faint(?:ed|ing)?))|(?:(?:cold sweat|sweating|lightheaded|faint(?:ed|ing)?).{0,80}chest (?:pain|discomfort))|(?:chest (?:pain|discomfort).{0,60}(?:persistent|keeps returning|comes back|lasting (?:more than )?(?:a few|[5-9]|[1-9]\d) minutes?))|(?:jaw pain.{0,30}(?:cold sweat|sweat|sweating|nausea|lightheaded|faint(?:ed|ing)?))/i,
    clinicianReview: PENDING_REVIEW,
  },
  {
    id: 'thunderclap_headache',
    crisisType: 'thunderclap_headache',
    careSetting: 'call_911',
    message: emergencyCopyDetail('thunderclap_headache'),
    matcher: /worst headache of (my|his|her) life|thunderclap|sudden(ly)? (severe|worst|excruciating|blinding|intense) headache|headache.{0,25}(came on|hit me|started).{0,15}(suddenly|instantly|out of nowhere)|headache with (neck stiffness|confusion|weakness|vision loss)/i,
    clinicianReview: PENDING_REVIEW,
  },
  {
    id: 'anaphylaxis',
    crisisType: 'anaphylaxis',
    careSetting: 'call_911',
    message: emergencyCopyDetail('anaphylaxis'),
    matcher: /throat (is )?tight|lip swelling|tongue swelling|anaphylaxis|cannot breathe after|wheezing after (a )?(peanut|shellfish|bee|sting)/i,
    clinicianReview: PENDING_REVIEW,
  },
  {
    id: 'respiratory_distress',
    crisisType: 'respiratory_distress',
    careSetting: 'call_911',
    message: emergencyCopyDetail('respiratory_distress'),
    matcher: /cannot breathe|can't breathe|blue lips|gasping for air|oxygen (sat|saturation).{0,12}(8\d|9[0-2])\b/i,
    clinicianReview: PENDING_REVIEW,
  },
  {
    id: 'surgical_abdomen',
    crisisType: 'surgical_abdomen',
    careSetting: 'call_911',
    message: emergencyCopyDetail('surgical_abdomen'),
    matcher: /sudden severe (abdominal|belly|stomach) pain|severe (right lower|lower right|lower) (abdominal|belly|stomach) pain|rigid abdomen|pain (is )?so bad i (can't|cannot) walk/i,
    clinicianReview: PENDING_REVIEW,
  },
  {
    id: 'stroke_fast',
    crisisType: 'stroke_fast',
    careSetting: 'call_911',
    message: emergencyCopyDetail('stroke_fast'),
    matcher: /face (is )?(drooping|droopy)|one side of (my|the) (body|face).{0,30}(weak|numb)|arm (is )?(weak|numb).{0,30}(speech|speak)|speech (is )?(slurred|garbled)|cannot speak properly|can't speak properly/i,
    clinicianReview: PENDING_REVIEW,
  },
  {
    id: 'suicidal_ideation',
    crisisType: 'suicidal_ideation',
    careSetting: 'crisis_line',
    message: emergencyCopyDetail('suicidal_ideation'),
    matcher: /\b(i want to kill myself|i (am|'m) going to kill myself|i (want|plan) to end my life|i plan to kill myself|i (have|'ve) been thinking about (ending my life|killing myself|suicide)|i am thinking about suicide|i (am|'m) suicidal)\b/i,
    clinicianReview: {
      status: 'pending',
      note: 'REQUIRES EXPERT REVIEW: highest-uncertainty matcher and crisis-line copy.',
    },
  },
]
