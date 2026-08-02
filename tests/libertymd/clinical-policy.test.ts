/// <reference lib="deno.ns" />

// P0-16 / P0-14f — registers the severity-boundary tests into this gate.
// `deno test` collects every Deno.test reached through the module graph, and
// `package.json` is outside that ticket's file manifest, so the severity suite
// rides along here rather than adding a script. See the header of the imported
// file for the clean follow-up if a named gate is preferred.
import './severity-mapping.test.ts'
import './emergency-patterns.test.ts'
import './emergency-copy.test.ts'
import './i18n-substrate.test.ts'
import './journey-locale.test.ts'

import {
  assessClinicalEvidence,
  classifyResponseRelevance,
  decideReportOutcome,
  detectDeterministicEmergency,
} from '../../supabase/functions/libertymd-care-proxy/clinical-policy.ts'
import { EMERGENCY_PATTERN_SET_VERSION } from '../../supabase/functions/libertymd-care-proxy/emergency-patterns.ts'
import { LIBERTYMD_VALIDATION_CASES } from '../../scripts/libertymd-validation-cases.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

Deno.test('Heart Attack fixture force-ends before model inference', () => {
  const result = detectDeterministicEmergency(LIBERTYMD_VALIDATION_CASES.heartAttack.message)
  assert(result, 'Expected deterministic emergency result')
  assertEquals(result.crisisType, 'acs_chest_pain', 'Expected ACS crisis type')
})

Deno.test('negated emergency terms do not false-positive', () => {
  const result = detectDeterministicEmergency('Mild sore throat with no chest pain and no trouble breathing.')
  assertEquals(result, null, 'Negated emergency terms should continue')
})

Deno.test('jaw pain with sweating or nausea force-ends', () => {
  const result = detectDeterministicEmergency('I have jaw pain with sweating and nausea and feel suddenly very unwell.')
  assertEquals(result?.crisisType, 'acs_chest_pain', 'Jaw-pain ACS crisis type')
})

Deno.test('sudden severe abdominal pain force-ends', () => {
  const result = detectDeterministicEmergency('I have sudden severe abdominal pain with vomiting.')
  assertEquals(result?.crisisType, 'surgical_abdomen', 'Surgical abdomen crisis type')
})

Deno.test('severe right-lower abdominal pain force-ends', () => {
  const result = detectDeterministicEmergency('I have severe right lower abdominal pain and the pain is so bad I cannot walk.')
  assertEquals(result?.crisisType, 'surgical_abdomen', 'Right-lower abdominal crisis type')
})

Deno.test('low oxygen saturation force-ends', () => {
  const result = detectDeterministicEmergency('My oxygen saturation is 89 and I am gasping for air.')
  assertEquals(result?.crisisType, 'respiratory_distress', 'Low-oxygen crisis type')
})

Deno.test('low fever has sufficient explicit evidence', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  assertEquals(evidence.score, 100, 'Low Fever evidence score')
  assert(evidence.sufficient, 'Low Fever should have sufficient evidence')
})

Deno.test('uncertain placeholders do not count as evidence', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.noHighConfidence.filledSlots)
  assertEquals(evidence.score, 35, 'Ambiguous evidence score')
  assert(!evidence.sufficient, 'Ambiguous evidence must be insufficient')
})

Deno.test('all non-medical fixtures classify off topic', () => {
  for (const message of LIBERTYMD_VALIDATION_CASES.nonMedical.messages) {
    assertEquals(classifyResponseRelevance(message), 'off_topic', `Expected off-topic: ${message}`)
  }
})

Deno.test('short clinical answers remain accepted', () => {
  for (const message of ['yes', 'no', 'yesterday', '3/10', 'not sure']) {
    assertEquals(classifyResponseRelevance(message), 'clinical', `Expected clinical: ${message}`)
  }
})

Deno.test('mid-consult, sufficient evidence and workflow-ready releases moderate-confidence report', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: true,
    confidence: 60,
    turnCount: 8,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 0,
  })
  assertEquals(decision.outcome, 'complete', 'moderate confidence must not suppress the report')
  assertEquals(decision.reason, 'workflow_ready', 'workflow-ready closes a sufficiently informed consult')
})

Deno.test('mid-consult, confidence 80 completes', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: true,
    confidence: 80,
    turnCount: 8,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 0,
  })
  assertEquals(decision.outcome, 'complete', 'confidence 80 releases the report')
  assertEquals(decision.reason, 'high_confidence', 'via the high-confidence door')
})

Deno.test('at the turn cap, a moderately confident physician-review report releases', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: true,
    confidence: 65,
    turnCount: 15,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 0,
  })
  assertEquals(decision.outcome, 'complete', 'cap path unchanged')
  assertEquals(decision.reason, 'turn_limit_report', 'confidence-neutral cap reason')
})

Deno.test('workflow-ready low-confidence report is released', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: true,
    confidence: 59,
    turnCount: 8,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 0,
  })
  assertEquals(decision.outcome, 'complete', 'Low confidence must not suppress a ready report')
  assertEquals(decision.reason, 'workflow_ready', 'Confidence-neutral ready reason')
})

Deno.test('invalid three-item diagnosis stays recoverable instead of showing incomplete', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: false,
    confidence: 99,
    turnCount: 15,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 0,
  })
  assertEquals(decision.outcome, 'continue', 'Invalid diagnosis is a retryable generation state')
  assertEquals(decision.reason, 'retry_report_generation', 'Technical/schema failure reason')
})

Deno.test('turn 15 releases low-information report when the user discussed health', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.noHighConfidence.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: true,
    confidence: 95,
    turnCount: 15,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 0,
  })
  assertEquals(decision.outcome, 'complete', 'Sparse health information still receives report')
  assertEquals(decision.reason, 'turn_limit_report', 'Confidence-neutral cap reason')
})

Deno.test('off-topic answers do not erase health information already shared', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: true,
    confidence: 90,
    turnCount: 15,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 5,
  })
  assertEquals(decision.outcome, 'complete', 'Existing health information still receives report')
  assertEquals(decision.reason, 'turn_limit_report', 'Cap report remains confidence-neutral')
})

Deno.test('only a consultation with no health information is incomplete', () => {
  const decision = decideReportOutcome({
    diagnosisValid: false,
    confidence: 0,
    turnCount: 15,
    readyForReport: false,
    evidence: assessClinicalEvidence({}),
    nonClinicalResponseCount: 5,
  })
  assertEquals(decision.outcome, 'review', 'No-health consultation is the sole incomplete case')
  assertEquals(decision.reason, 'no_health_information', 'Explicit no-health reason')
})

// ---------------------------------------------------------------- P0-14c AC1–AC5
// Single Deno.test keeps tsc Deno-name noise to +1 (repo pattern); bodies cover AC1–AC5.

Deno.test('P0-14c AC1–AC5 · span provenance, audit keys, verbatim slices, bound', () => {
  // AC1 / AC3
  const acs = 'I have crushing chest pain and pain radiating to my left arm.'
  const result = detectDeterministicEmergency(acs)
  assert(result, 'Expected ACS deterministic match')
  assertEquals(result.patternId, 'acs_chest_pain', 'patternId / rule_id source')
  assertEquals(result.matchedSpan, 'crushing chest', 'canonical ACS span')
  assertEquals(result.spanStart, 7, 'ACS span_start')
  assertEquals(result.spanEnd, 21, 'ACS span_end')
  assertEquals(result.patternSetVersion, EMERGENCY_PATTERN_SET_VERSION, 'pattern set version on detector')
  assert(EMERGENCY_PATTERN_SET_VERSION.length > 0, 'EMERGENCY_PATTERN_SET_VERSION must be non-empty')

  // AC2
  const match = {
    rule_id: result.patternId,
    span: result.matchedSpan,
    span_start: result.spanStart,
    span_end: result.spanEnd,
    pattern_set_version: result.patternSetVersion,
    lane: 'edge' as const,
  }
  assertEquals(
    JSON.stringify(Object.keys(match).sort()),
    JSON.stringify(['lane', 'pattern_set_version', 'rule_id', 'span', 'span_end', 'span_start'].sort()),
    'audit match key set',
  )

  // AC4
  const samples: Array<{ crisis: string; message: string }> = [
    { crisis: 'acs_chest_pain', message: 'I have Crushing Chest pain tonight.' },
    { crisis: 'thunderclap_headache', message: 'My headache came on Suddenly and hit me out of nowhere.' },
    { crisis: 'anaphylaxis', message: 'I started Wheezing after a bee sting.' },
    { crisis: 'respiratory_distress', message: 'I am Gasping for air and cannot breathe.' },
    { crisis: 'surgical_abdomen', message: 'I have Severe lower right abdominal pain.' },
    { crisis: 'stroke_fast', message: 'My Face is drooping and my arm is weak.' },
    { crisis: 'suicidal_ideation', message: 'I want to Kill myself.' },
  ]
  assertEquals(samples.length, 7, 'one sample per live presentation')
  for (const sample of samples) {
    const hit = detectDeterministicEmergency(sample.message)
    assert(hit, `Expected match for ${sample.crisis}`)
    assertEquals(hit.crisisType, sample.crisis, `${sample.crisis} crisis type`)
    assertEquals(
      sample.message.slice(hit.spanStart, hit.spanEnd),
      hit.matchedSpan,
      `${sample.crisis} verbatim slice`,
    )
  }

  // AC5
  const phrase = 'crushing chest'
  const longMessage = `${'x'.repeat(2000)}${phrase}${'y'.repeat(2000 - phrase.length)}`
  assertEquals(longMessage.length, 4000, 'fixture length')
  const longHit = detectDeterministicEmergency(longMessage)
  assert(longHit, 'Expected match inside long message')
  assert(longHit.matchedSpan.length <= 120, 'persist-bound span length')
  assert(longHit.spanEnd - longHit.spanStart <= 120, 'persist-bound span window')
  assert(longHit.matchedSpan.length <= 64, 'detector guard still ≤64')
})
