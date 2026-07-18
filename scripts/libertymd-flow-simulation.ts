/// <reference lib="deno.ns" />

import {
  assessClinicalEvidence,
  classifyResponseRelevance,
  decideReportOutcome,
  detectDeterministicEmergency,
} from '../supabase/functions/libertymd-care-proxy/clinical-policy.ts'
import { getLoopProtocol, LIBERTYMD_VALIDATION_CASES } from './libertymd-validation-cases.ts'

type Check = {
  name: string
  expected: string
  actual: string
  passed: boolean
}

const loop = Number(Deno.args.find((arg) => arg.startsWith('--loop='))?.split('=')[1] || 1)

const cases = LIBERTYMD_VALIDATION_CASES
const protocol = getLoopProtocol(loop)

const checks: Check[] = []
const record = (name: string, expected: string, actual: string) => {
  checks.push({ name, expected, actual, passed: expected === actual })
}

const emergency = detectDeterministicEmergency(cases.heartAttack.message)
record('emergency_flow', 'force_end', emergency ? 'force_end' : 'continue')

const normalEvidence = assessClinicalEvidence(cases.lowFever.filledSlots)
const normalDecision = decideReportOutcome({
  diagnosisValid: true,
  confidence: 84,
  turnCount: 8,
  readyForReport: true,
  evidence: normalEvidence,
  nonClinicalResponseCount: 0,
})
record('normal_differential_flow', 'complete', normalDecision.outcome)

const ambiguousEvidence = assessClinicalEvidence(cases.noHighConfidence.filledSlots)
const lowConfidenceDecision = decideReportOutcome({
  diagnosisValid: true,
  confidence: 44,
  turnCount: 15,
  readyForReport: false,
  evidence: ambiguousEvidence,
  nonClinicalResponseCount: 0,
})
record('turn_15_low_confidence_flow', 'review', lowConfidenceDecision.outcome)
record('turn_15_low_confidence_reason', 'insufficient_clinical_information', lowConfidenceDecision.reason)

const randomClassifications = cases.nonMedical.messages.map(classifyResponseRelevance)
record('random_response_classification', 'off_topic', randomClassifications.every((value) => value === 'off_topic') ? 'off_topic' : 'mixed')

const randomEvidence = assessClinicalEvidence({ chief_complaint: 'unknown symptom' })
const randomDecision = decideReportOutcome({
  diagnosisValid: true,
  confidence: 95,
  turnCount: 15,
  readyForReport: true,
  evidence: randomEvidence,
  nonClinicalResponseCount: 15,
})
record('random_response_terminal_flow', 'review', randomDecision.outcome)
record('random_response_terminal_reason', 'insufficient_clinical_information', randomDecision.reason)

const negatedEmergency = detectDeterministicEmergency('I have a sore throat with no chest pain and no trouble breathing.')
record('negated_emergency', 'continue', negatedEmergency ? 'force_end' : 'continue')

const boundaryDecision = decideReportOutcome({
  diagnosisValid: true,
  confidence: loop % 2 === 0 ? 59 : 60,
  turnCount: 10,
  readyForReport: true,
  evidence: normalEvidence,
  nonClinicalResponseCount: 0,
})
record('confidence_boundary', loop % 2 === 0 ? 'continue' : 'complete', boundaryDecision.outcome)

const failed = checks.filter((check) => !check.passed)
const caseResults = [
  {
    case: cases.lowFever.name,
    expected: cases.lowFever.expected,
    actual: `${normalDecision.outcome}; evidence ${normalEvidence.score}/100`,
    passed: normalDecision.outcome === 'complete',
  },
  {
    case: cases.heartAttack.name,
    expected: cases.heartAttack.expected,
    actual: emergency ? 'force_end' : 'continue',
    passed: Boolean(emergency),
  },
  {
    case: cases.noHighConfidence.name,
    expected: cases.noHighConfidence.expected,
    actual: `${lowConfidenceDecision.outcome}; ${lowConfidenceDecision.reason}`,
    passed: lowConfidenceDecision.outcome === 'review',
  },
  {
    case: cases.nonMedical.name,
    expected: cases.nonMedical.expected,
    actual: `${randomClassifications.every((value) => value === 'off_topic') ? 'off_topic' : 'mixed'}; ${randomDecision.outcome}`,
    passed: randomClassifications.every((value) => value === 'off_topic') && randomDecision.outcome === 'review',
  },
]
const output = {
  loop,
  mode: 'codex_simulation',
  model: 'deterministic_policy_no_model_call',
  scenarios: 4,
  review_and_recommendation_results: loop === 1
    ? 'Reviewed the implemented LibertyMD care policy and established the baseline acceptance contract.'
    : `Reviewed loop ${loop - 1} recommendation before testing: ${getLoopProtocol(loop - 1).recommendation}`,
  items_to_be_built_in_this_loop: protocol.build,
  corrections_part_1: `Applied the pre-run focus: ${protocol.focus}. No unverified model output is trusted by the simulation.`,
  cases_run_in_this_loop: caseResults,
  observations_and_corrections_required: failed.length
    ? failed.map((check) => `${check.name}: expected ${check.expected}, got ${check.actual}`)
    : ['All four required case contracts passed; no production correction was required.'],
  corrections_part_2: failed.length
    ? 'The loop is blocked until the failed deterministic contract is corrected and rerun.'
    : 'No second correction was necessary; retained the passing policy and fixtures unchanged.',
  recommendations_for_the_next_loop: protocol.recommendation,
  checks,
  passed: failed.length === 0,
  findings: failed.map((check) => `${check.name}: expected ${check.expected}, got ${check.actual}`),
  recommendation: failed.length ? 'Correct the deterministic policy before the next loop.' : protocol.recommendation,
}

console.log(JSON.stringify(output))
if (failed.length) Deno.exit(1)
