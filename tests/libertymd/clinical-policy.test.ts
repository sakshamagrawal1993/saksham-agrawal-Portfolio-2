/// <reference lib="deno.ns" />

import {
  assessClinicalEvidence,
  classifyResponseRelevance,
  decideReportOutcome,
  detectDeterministicEmergency,
} from '../../supabase/functions/libertymd-care-proxy/clinical-policy.ts'
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

Deno.test('valid Low Fever report completes at confidence 60', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: true,
    confidence: 60,
    turnCount: 8,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 0,
  })
  assertEquals(decision.outcome, 'complete', 'Confidence 60 ready report')
})

Deno.test('confidence 59 cannot release a report', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: true,
    confidence: 59,
    turnCount: 8,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 0,
  })
  assertEquals(decision.outcome, 'continue', 'Confidence 59 report outcome')
})

Deno.test('empty diagnosis cannot release despite high confidence', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: false,
    confidence: 99,
    turnCount: 15,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 0,
  })
  assertEquals(decision.outcome, 'review', 'Empty diagnosis terminal outcome')
  assertEquals(decision.reason, 'low_diagnostic_confidence', 'Empty diagnosis review reason')
})

Deno.test('turn 15 cannot force completion with insufficient evidence', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.noHighConfidence.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: true,
    confidence: 95,
    turnCount: 15,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 0,
  })
  assertEquals(decision.outcome, 'review', 'Ambiguous turn 15 outcome')
  assertEquals(decision.reason, 'insufficient_clinical_information', 'Ambiguous turn 15 reason')
})

Deno.test('five non-clinical answers force clinical review', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: true,
    confidence: 90,
    turnCount: 15,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 5,
  })
  assertEquals(decision.outcome, 'review', 'Non-clinical terminal outcome')
  assertEquals(decision.reason, 'insufficient_clinical_information', 'Non-clinical terminal reason')
})
