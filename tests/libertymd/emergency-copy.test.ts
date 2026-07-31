/**
 * P0-17 — exhaustive emergency-copy resolver coverage.
 *
 * REQUIRES EXPERT REVIEW markers must remain pending until a clinician signs
 * every variant. Engineering pass ≠ clinical approval.
 */
import {
  CLINICAL_CRISIS_TYPES,
  EMERGENCY_COPY_BY_CRISIS_TYPE,
  EMERGENCY_SHARED_HEADING,
  GENERIC_MEDICAL_COPY,
  applyCanonicalForceEndCopy,
  emergencyCopyDetail,
  resolveEmergencyCopy,
} from '../../supabase/functions/libertymd-care-proxy/lib/emergency-copy.ts'
import { EMERGENCY_PATTERNS } from '../../supabase/functions/libertymd-care-proxy/emergency-patterns.ts'
import {
  CLINICAL_CRISIS_TYPES as CLIENT_CLINICAL_CRISIS_TYPES,
  EMERGENCY_COPY_BY_CRISIS_TYPE as CLIENT_COPY_BY_TYPE,
  EMERGENCY_SHARED_HEADING as CLIENT_SHARED_HEADING,
  GENERIC_MEDICAL_COPY as CLIENT_GENERIC,
  resolveLibertyMdEmergencyCopy,
} from '../../components/LibertyMD/libertymd-emergency-copy.ts'

declare const Deno: { test: (name: string, fn: () => unknown | Promise<unknown>) => void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

const MEDICAL_FORBIDDEN_MH = /\b988\b|Suicide & Crisis Lifeline|self-harm|suicidal ideation resource/i
const SI_FORBIDDEN_MEDICAL = /\b911\b|\bER\b|emergency room|emergency department|ambulance|drive yourself|Seek emergency care now|emergency care/i

Deno.test('P0-17 AC1/AC19 · known keys are exactly the seven P0-14a clinical types', () => {
  const expected = [
    'acs_chest_pain',
    'anaphylaxis',
    'respiratory_distress',
    'stroke_fast',
    'suicidal_ideation',
    'surgical_abdomen',
    'thunderclap_headache',
  ]
  assertEquals(JSON.stringify([...CLINICAL_CRISIS_TYPES].sort()), JSON.stringify(expected), 'clinical vocabulary')
  const patternTypes = [...new Set(EMERGENCY_PATTERNS.map((p) => p.crisisType))].sort()
  assertEquals(JSON.stringify(patternTypes), JSON.stringify(expected), 'pattern vocabulary parity')
  for (const key of CLINICAL_CRISIS_TYPES) {
    const copy = resolveEmergencyCopy(key)
    assertEquals(copy.crisisType, key, `${key} must not fall through to generic`)
    assert(copy.heading.length > 0, `${key} heading non-empty`)
    assert(copy.standingInstruction.length > 0, `${key} standing non-empty`)
    assert(copy.detail.length > 0, `${key} detail non-empty`)
  }
})

Deno.test('P0-17 AC2 · cardiac action', () => {
  const copy = resolveEmergencyCopy('acs_chest_pain')
  // AC2 requires cardiac/heart identity — "medical emergency" alone must not pass.
  assert(/cardiac/i.test(copy.detail) && /heart/i.test(copy.detail), 'cardiac/heart identity in detail')
  assert(/\b911\b/.test(copy.detail), 'cardiac detail 911')
  assert(/do not drive yourself/i.test(`${copy.standingInstruction} ${copy.detail}`), 'do not drive')
  assert(!MEDICAL_FORBIDDEN_MH.test(`${copy.heading} ${copy.standingInstruction} ${copy.detail}`), 'no MH resource')
})

Deno.test('P0-17 AC3 · stroke action', () => {
  const copy = resolveEmergencyCopy('stroke_fast')
  assert(/stroke/i.test(copy.detail), 'stroke identity')
  assert(/\b911\b/.test(copy.detail), 'stroke 911')
  assert(/do not drive yourself/i.test(`${copy.standingInstruction} ${copy.detail}`), 'do not drive')
  assert(/when (they|symptoms) started/i.test(`${copy.standingInstruction} ${copy.detail}`), 'note onset')
  assert(!MEDICAL_FORBIDDEN_MH.test(`${copy.heading} ${copy.standingInstruction} ${copy.detail}`), 'no MH resource')
})

Deno.test('P0-17 AC4 · thunderclap action', () => {
  const copy = resolveEmergencyCopy('thunderclap_headache')
  assert(/neurolog/i.test(`${copy.standingInstruction} ${copy.detail}`), 'neurological identity')
  assert(/headache/i.test(copy.detail), 'headache identity')
  assert(/\b911\b|\bER\b/i.test(copy.detail), '911 or ER')
  assert(!MEDICAL_FORBIDDEN_MH.test(`${copy.heading} ${copy.standingInstruction} ${copy.detail}`), 'no MH resource')
})

Deno.test('P0-17 AC5 · anaphylaxis action', () => {
  const copy = resolveEmergencyCopy('anaphylaxis')
  assert(/epinephrine/i.test(`${copy.standingInstruction} ${copy.detail}`), 'epinephrine')
  assert(/\b911\b/.test(`${copy.standingInstruction} ${copy.detail}`), '911 with epinephrine')
  assert(!MEDICAL_FORBIDDEN_MH.test(`${copy.heading} ${copy.standingInstruction} ${copy.detail}`), 'no MH resource')
})

Deno.test('P0-17 AC6 · respiratory action', () => {
  const copy = resolveEmergencyCopy('respiratory_distress')
  assert(/breath/i.test(copy.detail), 'breathing identity')
  assert(/\b911\b/.test(copy.detail), '911')
  assert(!MEDICAL_FORBIDDEN_MH.test(`${copy.heading} ${copy.standingInstruction} ${copy.detail}`), 'no MH resource')
})

Deno.test('P0-17 AC7 · surgical-abdomen action', () => {
  const copy = resolveEmergencyCopy('surgical_abdomen')
  assert(/surgical|abdominal/i.test(copy.detail), 'surgical abdomen identity')
  assert(/\bER\b|911|emergency/i.test(copy.detail), 'ED care')
  assert(!/\beat\b|food|medication|self-treat/i.test(copy.detail), 'no self-treatment advice')
  assert(!MEDICAL_FORBIDDEN_MH.test(`${copy.heading} ${copy.standingInstruction} ${copy.detail}`), 'no MH resource')
})

Deno.test('P0-17 AC8 · suicidal ideation uses 988 without medical-emergency framing', () => {
  const copy = resolveEmergencyCopy('suicidal_ideation')
  const joined = `${copy.heading} ${copy.standingInstruction} ${copy.detail}`
  assert(/\b988\b/.test(joined), '988 present')
  assert(/trusted person/i.test(copy.detail), 'trusted person')
  assert(!SI_FORBIDDEN_MEDICAL.test(joined), `SI must not use medical framing: ${joined}`)
  assertEquals(copy.heading, EMERGENCY_SHARED_HEADING, 'shared BO heading')
})

Deno.test('P0-17 AC9 · mental-health resources only on suicidal_ideation', () => {
  for (const key of CLINICAL_CRISIS_TYPES) {
    if (key === 'suicidal_ideation') continue
    const copy = resolveEmergencyCopy(key)
    const joined = `${copy.heading} ${copy.standingInstruction} ${copy.detail}`
    assert(!MEDICAL_FORBIDDEN_MH.test(joined), `${key} must not mention MH resources`)
  }
  const generic = resolveEmergencyCopy('other_emergency')
  assert(!MEDICAL_FORBIDDEN_MH.test(`${generic.heading} ${generic.standingInstruction} ${generic.detail}`), 'generic no MH')
})

Deno.test('P0-17 AC10 · safe generic fallback for unknown / other / empty', () => {
  const inputs: unknown[] = [
    'other_emergency',
    'qa_throwaway',
    'none',
    '',
    '   ',
    null,
    undefined,
    'ACS_CHEST_PAIN_TYPO',
    'SomethingElse',
  ]
  for (const input of inputs) {
    const copy = resolveEmergencyCopy(input)
    assertEquals(copy.crisisType, 'generic_medical', `fallback for ${String(input)}`)
    assertEquals(copy.heading, GENERIC_MEDICAL_COPY.heading, 'heading')
    assert(copy.heading.length > 0 && copy.standingInstruction.length > 0, 'non-blank')
    assert(/\b911\b|emergency department/i.test(`${copy.standingInstruction} ${copy.detail}`), 'medical help')
    assert(!MEDICAL_FORBIDDEN_MH.test(`${copy.heading} ${copy.standingInstruction} ${copy.detail}`), 'no MH')
  }
  // Differently cased known type still resolves (normalize lowercases).
  const knownCased = resolveEmergencyCopy('Suicidal_Ideation')
  assertEquals(knownCased.crisisType, 'suicidal_ideation', 'case-normalized known type')
})

Deno.test('P0-17 AC11 · force_end canonicalization overwrites model messages', () => {
  const cardiac = applyCanonicalForceEndCopy({
    status: 'force_end',
    force_end: true,
    crisis_type: 'acs_chest_pain',
    message: 'Please call 988 for support during chest pain.',
    raw: { message: 'Please call 988 for support during chest pain.' },
  })
  assertEquals(cardiac.message, emergencyCopyDetail('acs_chest_pain'), 'cardiac overwrite')
  assert(!/\b988\b/.test(cardiac.message), 'cardiac detail must not retain model 988')
  assertEquals(cardiac.raw?.message, cardiac.message, 'raw.message synced')

  const si = applyCanonicalForceEndCopy({
    status: 'force_end',
    force_end: true,
    crisis_type: 'suicidal_ideation',
    message: 'Call 911 or go to the ER / ambulance now.',
    raw: { message: 'Call 911 or go to the ER / ambulance now.' },
  })
  assertEquals(si.message, emergencyCopyDetail('suicidal_ideation'), 'SI overwrite')
  assert(!/\b911\b|\bER\b|ambulance/i.test(si.message), 'SI detail must not retain ER framing')
})

Deno.test('P0-17 AC12 · non-terminal messages are not rewritten', () => {
  const pass = applyCanonicalForceEndCopy({
    status: 'pass',
    force_end: false,
    crisis_type: 'none',
    message: 'No emergency detected.',
  })
  assertEquals(pass.message, 'No emergency detected.', 'pass unchanged')

  const highRisk = applyCanonicalForceEndCopy({
    status: 'high_risk_continue',
    force_end: false,
    crisis_type: 'acs_chest_pain',
    message: 'Continue carefully with red-flag questions.',
  })
  assertEquals(highRisk.message, 'Continue carefully with red-flag questions.', 'high_risk unchanged')

  const technical = applyCanonicalForceEndCopy({
    status: 'high_risk_continue',
    force_end: false,
    crisis_type: 'guardrail_unavailable',
    message: 'We could not complete a safety check because of a temporary app issue.',
  })
  assertEquals(
    technical.message,
    'We could not complete a safety check because of a temporary app issue.',
    'technical unchanged',
  )
})

Deno.test('P0-17 AC17 · pattern message is thin read-through of detail', () => {
  for (const pattern of EMERGENCY_PATTERNS) {
    assertEquals(
      pattern.message,
      emergencyCopyDetail(pattern.crisisType),
      `${pattern.id} message must equal copy detail`,
    )
  }
})

Deno.test('P0-17 AC20 · every variant is pending REQUIRES EXPERT REVIEW', () => {
  for (const key of CLINICAL_CRISIS_TYPES) {
    const copy = EMERGENCY_COPY_BY_CRISIS_TYPE[key]
    assertEquals(copy.clinicianReview.status, 'pending', `${key} pending`)
    assert(
      copy.clinicianReview.note.includes('REQUIRES EXPERT REVIEW'),
      `${key} review marker`,
    )
  }
  assertEquals(GENERIC_MEDICAL_COPY.clinicianReview.status, 'pending', 'generic pending')
  assert(
    GENERIC_MEDICAL_COPY.clinicianReview.note.includes('REQUIRES EXPERT REVIEW'),
    'generic review marker',
  )
})

Deno.test('P0-17 Q1 · server↔client copy maps are byte-identical', () => {
  assertEquals(
    JSON.stringify([...CLINICAL_CRISIS_TYPES]),
    JSON.stringify([...CLIENT_CLINICAL_CRISIS_TYPES]),
    'clinical key lists',
  )
  assertEquals(EMERGENCY_SHARED_HEADING, CLIENT_SHARED_HEADING, 'shared heading')
  for (const key of CLINICAL_CRISIS_TYPES) {
    const server = EMERGENCY_COPY_BY_CRISIS_TYPE[key]
    const client = CLIENT_COPY_BY_TYPE[key]
    assertEquals(server.heading, client.heading, `${key} heading`)
    assertEquals(server.standingInstruction, client.standingInstruction, `${key} standing`)
    assertEquals(server.detail, client.detail, `${key} detail`)
    assertEquals(server.clinicianReview.status, client.clinicianReview.status, `${key} review status`)
  }
  assertEquals(GENERIC_MEDICAL_COPY.heading, CLIENT_GENERIC.heading, 'generic heading')
  assertEquals(GENERIC_MEDICAL_COPY.standingInstruction, CLIENT_GENERIC.standingInstruction, 'generic standing')
  assertEquals(GENERIC_MEDICAL_COPY.detail, CLIENT_GENERIC.detail, 'generic detail')

  assertEquals(
    resolveLibertyMdEmergencyCopy('suicidal_ideation').standingInstruction,
    resolveEmergencyCopy('suicidal_ideation').standingInstruction,
    'client resolver SI standing',
  )
  assertEquals(
    resolveLibertyMdEmergencyCopy('other_emergency').detail,
    resolveEmergencyCopy('other_emergency').detail,
    'client resolver fallback detail',
  )
})

Deno.test('P0-17 BO · shared heading and resource exclusivity on standing lines', () => {
  for (const key of CLINICAL_CRISIS_TYPES) {
    assertEquals(resolveEmergencyCopy(key).heading, EMERGENCY_SHARED_HEADING, `${key} shared heading`)
  }
  assertEquals(resolveEmergencyCopy(null).heading, EMERGENCY_SHARED_HEADING, 'generic shared heading')
  const siStanding = resolveEmergencyCopy('suicidal_ideation').standingInstruction
  assert(/\b988\b/.test(siStanding) && !/\b911\b/.test(siStanding), 'SI standing 988 only')
  for (const key of CLINICAL_CRISIS_TYPES) {
    if (key === 'suicidal_ideation') continue
    const standing = resolveEmergencyCopy(key).standingInstruction
    assert(/\b911\b/.test(standing), `${key} standing 911`)
    assert(!/\b988\b/.test(standing), `${key} standing no 988`)
  }
})
