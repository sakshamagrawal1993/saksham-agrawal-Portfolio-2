/// <reference lib="deno.ns" />

import {
  assessClinicalEvidence,
  classifyResponseRelevance,
  decideReportOutcome,
  detectDeterministicEmergency,
} from '../supabase/functions/libertymd-care-proxy/clinical-policy.ts'

type JsonObject = Record<string, unknown>
type Scenario = {
  id: string
  message: string
  filled_slots?: JsonObject
  decision_input?: {
    diagnosis_valid: boolean
    confidence: number
    turn_count: number
    ready_for_report: boolean
    non_clinical_response_count: number
  }
  expected: {
    emergency_action: 'force_end' | 'continue'
    input_relevance: 'clinical' | 'unclear' | 'off_topic'
    report_outcome?: 'continue' | 'complete' | 'review'
  }
  clinical_review: { status: string }
}

const suiteUrl = new URL('../tests/libertymd/clinical-scenarios.v0.1.json', import.meta.url)
const gatesUrl = new URL('../governance/libertymd/clinical-quality-gates.json', import.meta.url)
const suite = JSON.parse(await Deno.readTextFile(suiteUrl)) as {
  suite_version: string
  clinical_status: string
  scenarios: Scenario[]
}
const gates = JSON.parse(await Deno.readTextFile(gatesUrl)) as {
  status: string
  clinical_performance_targets: {
    emergency_sensitivity_minimum: number | null
    emergency_specificity_minimum: number | null
    approved_by: string | null
    approved_at: string | null
  }
}

let truePositive = 0
let trueNegative = 0
let falsePositive = 0
let falseNegative = 0
const failures: Array<Record<string, unknown>> = []

for (const scenario of suite.scenarios) {
  const emergencyActual = detectDeterministicEmergency(scenario.message) ? 'force_end' : 'continue'
  const relevanceActual = classifyResponseRelevance(scenario.message)
  if (scenario.expected.emergency_action === 'force_end') {
    if (emergencyActual === 'force_end') truePositive += 1
    else falseNegative += 1
  } else if (emergencyActual === 'continue') trueNegative += 1
  else falsePositive += 1

  if (emergencyActual !== scenario.expected.emergency_action) {
    failures.push({ id: scenario.id, dimension: 'emergency_action', expected: scenario.expected.emergency_action, actual: emergencyActual })
  }
  if (relevanceActual !== scenario.expected.input_relevance) {
    failures.push({ id: scenario.id, dimension: 'input_relevance', expected: scenario.expected.input_relevance, actual: relevanceActual })
  }

  if (scenario.expected.report_outcome && scenario.filled_slots && scenario.decision_input) {
    const evidence = assessClinicalEvidence(scenario.filled_slots)
    const decision = decideReportOutcome({
      diagnosisValid: scenario.decision_input.diagnosis_valid,
      confidence: scenario.decision_input.confidence,
      turnCount: scenario.decision_input.turn_count,
      readyForReport: scenario.decision_input.ready_for_report,
      evidence,
      nonClinicalResponseCount: scenario.decision_input.non_clinical_response_count,
    })
    if (decision.outcome !== scenario.expected.report_outcome) {
      failures.push({ id: scenario.id, dimension: 'report_outcome', expected: scenario.expected.report_outcome, actual: decision.outcome })
    }
  }
}

const sensitivity = truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : null
const specificity = trueNegative + falsePositive ? trueNegative / (trueNegative + falsePositive) : null
const pendingClinicalReview = suite.scenarios.filter((scenario) => scenario.clinical_review.status !== 'approved').length
const requireApproval = Deno.args.includes('--require-clinical-approval')
const engineeringRegressionPassed = failures.length === 0
const targets = gates.clinical_performance_targets
const clinicalTargetsApproved = gates.status === 'approved'
  && typeof targets.emergency_sensitivity_minimum === 'number'
  && typeof targets.emergency_specificity_minimum === 'number'
  && Boolean(targets.approved_by)
  && Boolean(targets.approved_at)
const clinicalTargetsMet = clinicalTargetsApproved
  && sensitivity !== null
  && specificity !== null
  && sensitivity >= Number(targets.emergency_sensitivity_minimum)
  && specificity >= Number(targets.emergency_specificity_minimum)
const clinicalReleaseGatePassed = engineeringRegressionPassed
  && pendingClinicalReview === 0
  && suite.clinical_status === 'approved'
  && clinicalTargetsMet

console.log(JSON.stringify({
  suiteVersion: suite.suite_version,
  clinicalStatus: suite.clinical_status,
  scenarios: suite.scenarios.length,
  confusionMatrix: { truePositive, trueNegative, falsePositive, falseNegative },
  sensitivity,
  specificity,
  pendingClinicalReview,
  clinicalTargetsApproved,
  clinicalTargetsMet,
  configuredTargets: {
    emergencySensitivityMinimum: targets.emergency_sensitivity_minimum,
    emergencySpecificityMinimum: targets.emergency_specificity_minimum,
  },
  failures,
  engineeringRegressionPassed,
  clinicalReleaseGatePassed,
}, null, 2))

if (!engineeringRegressionPassed || (requireApproval && !clinicalReleaseGatePassed)) Deno.exit(1)
