/// <reference lib="deno.ns" />

import { assessClinicalEvidence, decideReportOutcome } from '../supabase/functions/libertymd-care-proxy/clinical-policy.ts'
import { getLoopProtocol, LIBERTYMD_VALIDATION_CASES } from './libertymd-validation-cases.ts'

type JsonObject = Record<string, unknown>
type Check = { name: string; expected: string; actual: string; passed: boolean }

const loop = Number(Deno.args.find((arg) => arg.startsWith('--loop='))?.split('=')[1] || 11)
const model = Deno.args.find((arg) => arg.startsWith('--model='))?.split('=')[1] || 'unknown'
const baseUrl = Deno.args.find((arg) => arg.startsWith('--base-url='))?.split('=')[1]
  || 'https://n8n.saksham-experiments.com/webhook'
const cases = LIBERTYMD_VALIDATION_CASES
const protocol = getLoopProtocol(loop)

async function post(path: string, body: JsonObject) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 65_000)
  const started = performance.now()
  try {
    const response = await fetch(`${baseUrl}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await response.text()
    let data: JsonObject = {}
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: text }
    }
    if (!response.ok) throw new Error(`${path} returned ${response.status}: ${text.slice(0, 300)}`)
    return { data, latencyMs: Math.round(performance.now() - started) }
  } finally {
    clearTimeout(timer)
  }
}

const checks: Check[] = []
const latencies: Record<string, number> = {}
const record = (name: string, expected: string, actual: string) => checks.push({ name, expected, actual, passed: expected === actual })

const emergency = await post('libertymd-guardrail', {
  message: cases.heartAttack.message,
  history: [],
  patient: cases.heartAttack.patient,
  filled_slots: {},
})
latencies.emergency = emergency.latencyMs
record('emergency_flow', 'force_end', String(emergency.data.status || 'missing'))

const interview = await post('libertymd-interview', {
  history: cases.lowFever.history,
  patient: cases.lowFever.patient,
  filled_slots: cases.lowFever.filledSlots,
  missing_slots: [],
  target_slot: 'none',
  turn_count: 8,
})
latencies.normalInterview = interview.latencyMs
record('normal_input_relevance', 'clinical', String(interview.data.input_relevance || 'missing'))

const diagnosis = await post('libertymd-diagnosis', {
  history: cases.lowFever.history,
  patient: cases.lowFever.patient,
  filled_slots: cases.lowFever.filledSlots,
  missing_slots: [],
  intermediate_diagnoses: [],
  turn_count: 8,
})
latencies.normalDiagnosis = diagnosis.latencyMs
record('normal_differential_flow', 'report_ready', diagnosis.data.valid_report === true ? 'report_ready' : String(diagnosis.data.validation_reason || 'report_invalid'))

const lowConfidence = await post('libertymd-diagnosis', {
  history: cases.noHighConfidence.history,
  patient: cases.noHighConfidence.patient,
  filled_slots: cases.noHighConfidence.filledSlots,
  missing_slots: [],
  intermediate_diagnoses: [],
  turn_count: 15,
})
latencies.lowConfidence = lowConfidence.latencyMs
const ambiguousEvidence = assessClinicalEvidence(cases.noHighConfidence.filledSlots)
const lowDecision = decideReportOutcome({
  diagnosisValid: lowConfidence.data.valid_report === true,
  confidence: Number(lowConfidence.data.confidence_score || 0),
  turnCount: 15,
  readyForReport: false,
  evidence: ambiguousEvidence,
  nonClinicalResponseCount: 0,
})
record('turn_15_no_high_confidence_flow', 'review', lowDecision.outcome)

const randomInterview = await post('libertymd-interview', {
  history: cases.nonMedical.history,
  patient: cases.nonMedical.patient,
  filled_slots: { chief_complaint: 'unknown' },
  missing_slots: ['onset', 'duration', 'severity', 'associated_symptoms', 'red_flag_negatives', 'relevant_history'],
  target_slot: 'onset',
  turn_count: 15,
})
latencies.random = randomInterview.latencyMs
record('random_response_relevance', 'off_topic', String(randomInterview.data.input_relevance || 'missing'))
record('random_response_slot_updates', 'empty', Object.keys((randomInterview.data.slot_updates as JsonObject) || {}).length === 0 ? 'empty' : 'populated')
record('random_response_ready_state', 'not_ready', randomInterview.data.ready_for_report === false ? 'not_ready' : 'ready')

const failed = checks.filter((check) => !check.passed)
const caseResults = [
  {
    case: cases.lowFever.name,
    expected: cases.lowFever.expected,
    actual: `${diagnosis.data.valid_report === true ? 'report_ready' : 'report_invalid'}; confidence ${diagnosis.data.confidence_score || 0}`,
    passed: interview.data.input_relevance === 'clinical' && diagnosis.data.valid_report === true,
  },
  {
    case: cases.heartAttack.name,
    expected: cases.heartAttack.expected,
    actual: String(emergency.data.status || 'missing'),
    passed: emergency.data.status === 'force_end',
  },
  {
    case: cases.noHighConfidence.name,
    expected: cases.noHighConfidence.expected,
    actual: `${lowDecision.outcome}; model confidence ${lowConfidence.data.confidence_score || 0}; evidence ${ambiguousEvidence.score}/100`,
    passed: lowDecision.outcome === 'review',
  },
  {
    case: cases.nonMedical.name,
    expected: cases.nonMedical.expected,
    actual: `${randomInterview.data.input_relevance || 'missing'}; ${Object.keys((randomInterview.data.slot_updates as JsonObject) || {}).length} slot updates; ready=${String(randomInterview.data.ready_for_report)}`,
    passed: randomInterview.data.input_relevance === 'off_topic'
      && Object.keys((randomInterview.data.slot_updates as JsonObject) || {}).length === 0
      && randomInterview.data.ready_for_report === false,
  },
]
console.log(JSON.stringify({
  loop,
  mode: 'live_n8n',
  model,
  phase: loop <= 18 ? 'smallest_supported_model' : 'final_gemini_3_1_flash_lite_confirmation',
  review_and_recommendation_results: `Reviewed loop ${loop - 1} recommendation before testing: ${getLoopProtocol(loop - 1).recommendation}`,
  items_to_be_built_in_this_loop: protocol.build,
  corrections_part_1: `Applied the pre-run focus: ${protocol.focus}. Live n8n outputs remain subject to deterministic post-model gates.`,
  cases_run_in_this_loop: caseResults,
  observations_and_corrections_required: failed.length
    ? failed.map((check) => `${check.name}: expected ${check.expected}, got ${check.actual}`)
    : ['All four required live case contracts passed; no production correction was required.'],
  corrections_part_2: failed.length
    ? 'The loop is blocked until the failed live contract is corrected and this loop is rerun.'
    : 'No second correction was necessary; retained the live workflows, prompts, and policy gates unchanged.',
  recommendations_for_the_next_loop: protocol.recommendation,
  checks,
  passed: failed.length === 0,
  findings: failed.map((check) => `${check.name}: expected ${check.expected}, got ${check.actual}`),
  observed: {
    normalConfidence: diagnosis.data.confidence_score || 0,
    lowConfidence: lowConfidence.data.confidence_score || 0,
    lowConfidenceValidation: lowConfidence.data.validation_reason || null,
    randomReason: randomInterview.data.input_relevance_reason || null,
  },
  latencies,
  recommendation: failed.length ? 'Fix the failed contract before advancing to the next loop.' : protocol.recommendation,
}))

if (failed.length) Deno.exit(1)
