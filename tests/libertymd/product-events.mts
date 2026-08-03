/**
 * P1-15 — product_events allow-list, bucketing, PHI shape, emit proofs.
 *
 * `.mts` so Deno can import proxy modules without dragging them into the
 * recursive repo `tsc` glob (same discipline as n8n-breaker / safety-audit).
 */
import {
  DIAGNOSIS_WEBHOOK,
  GUARDRAIL_WEBHOOK,
  INTERVIEW_WEBHOOK,
} from '../../supabase/functions/libertymd-care-proxy/lib/config.ts'
import { handleAbandonConsultation } from '../../supabase/functions/libertymd-care-proxy/actions/abandon-resume.ts'
import { handleSaveDemographics } from '../../supabase/functions/libertymd-care-proxy/actions/save-demographics.ts'
import { handleStartConsultation, CHIP_IDS } from '../../supabase/functions/libertymd-care-proxy/actions/start-consultation.ts'
import {
  LIBERTYMD_COMPLAINT_CHIP_DIAGNOSIS_BAN,
  LIBERTYMD_COMPLAINT_CHIP_IDS,
  LIBERTYMD_COMPLAINT_CHIPS,
} from '../../components/LibertyMD/libertymd-complaint-chips.ts'
import { handleSendMessage } from '../../supabase/functions/libertymd-care-proxy/actions/send-message.ts'
import {
  PRODUCT_EVENT_NAMES,
  addProductEvent,
  emitInferenceFailed,
  latencyBucket,
  scoreBucket,
} from '../../supabase/functions/libertymd-care-proxy/lib/telemetry.ts'
import {
  assertEquals,
  assertRejects,
  assertTrue,
  consultationRow,
  createFakeContext,
  failResponse,
  okResponse,
  opsFor,
  stubFetch,
} from './support/proxy-doubles.mts'

declare const Deno: { test: (name: string, fn: () => unknown | Promise<unknown>) => void }

const FORBIDDEN_PROP_KEYS = [
  'message',
  'symptom',
  'diagnosis',
  'email',
  'age',
  'sex',
  'sex_at_birth',
  'report',
  'report_data',
  'content',
  'chief_complaint',
  'name',
  'confidence_score',
  'evidence_score',
] as const

function productEventRows(ops: ReturnType<typeof createFakeContext>['ops']) {
  return opsFor(ops, 'libertymd_product_events', 'insert')
    .map((op) => {
      const payload = Array.isArray(op.payload) ? op.payload[0] : op.payload
      return payload as { event_name?: string; consultation_id?: string; properties?: Record<string, unknown> }
    })
}

function assertNoForbiddenKeys(props: Record<string, unknown> | undefined, label: string) {
  const keys = Object.keys(props || {})
  for (const forbidden of FORBIDDEN_PROP_KEYS) {
    assertEquals(keys.includes(forbidden), false, `${label}: forbidden key ${forbidden}`)
  }
}

function interviewPass(overrides: Record<string, unknown> = {}) {
  return okResponse({
    next_question: 'When did this start?',
    options: ['Today', 'Yesterday', 'This week', 'Longer'],
    ready_for_report: false,
    target_slot: 'onset',
    slot_updates: {},
    missing_slots: ['onset'],
    input_relevance: 'clinical',
    input_relevance_reason: 'clinical',
    source: 'n8n',
    ...overrides,
  })
}

function guardrailPass() {
  return okResponse({
    status: 'pass',
    force_end: false,
    risk_level: 'low',
    care_setting: 'self_care',
    message: 'ok',
    red_flags: [],
    source: 'n8n',
  })
}

Deno.test('P1-15 AC2 · closed set has exactly 18 names', () => {
  assertEquals(PRODUCT_EVENT_NAMES.length, 18, '18 closed names')
  assertEquals(new Set(PRODUCT_EVENT_NAMES).size, 18, 'unique')
})

Deno.test('P1-15 AC2 · unknown event name throws before insert', async () => {
  const { ctx, ops } = createFakeContext()
  await assertRejects(
    () => addProductEvent(ctx, 'not_a_real_event', 'consultation-1', { ok: true }),
    (error) => error instanceof Error && error.message.includes('Unknown product event name'),
    'unknown name must throw',
  )
  assertEquals(opsFor(ops, 'libertymd_product_events', 'insert').length, 0, 'no insert on unknown')
})

Deno.test('P1-15 AC2 / AC7 · known inference_failed accepted by helper', async () => {
  const { ctx, ops } = createFakeContext()
  await emitInferenceFailed(ctx, 'consultation-1', {
    stage: 'guardrail',
    error_class: 'timeout',
    outcome: 'fail_cautious',
  })
  const rows = productEventRows(ops)
  assertEquals(rows.length, 1, 'one insert')
  assertEquals(rows[0].event_name, 'inference_failed')
  assertEquals(rows[0].properties?.stage, 'guardrail')
  assertEquals(rows[0].properties?.error_class, 'timeout')
  assertNoForbiddenKeys(rows[0].properties, 'inference_failed')
})

Deno.test('P1-15 AC4 · scoreBucket and latencyBucket bands', () => {
  assertEquals(scoreBucket(0), '<50')
  assertEquals(scoreBucket(49.9), '<50')
  assertEquals(scoreBucket(50), '50-64')
  assertEquals(scoreBucket(64), '50-64')
  assertEquals(scoreBucket(65), '65-79')
  assertEquals(scoreBucket(79), '65-79')
  assertEquals(scoreBucket(80), '80-89')
  assertEquals(scoreBucket(89), '80-89')
  assertEquals(scoreBucket(90), '90+')
  assertEquals(scoreBucket(100), '90+')
  assertEquals(latencyBucket(0), '<500')
  assertEquals(latencyBucket(499), '<500')
  assertEquals(latencyBucket(500), '500-1500')
  assertEquals(latencyBucket(1499), '500-1500')
  assertEquals(latencyBucket(1500), '1500-4000')
  assertEquals(latencyBucket(3999), '1500-4000')
  assertEquals(latencyBucket(4000), '4000-10000')
  assertEquals(latencyBucket(9999), '4000-10000')
  assertEquals(latencyBucket(10_000), '10000+')
})

Deno.test('P1-15 AC5 · consultation_started emits before inference_failed on fail_cautious', async () => {
  // Transport failure → runGuardrail source error_fail_cautious (not a body field).
  const fetchLog = stubFetch((url) => {
    if (url === GUARDRAIL_WEBHOOK) return failResponse(503)
    if (url === INTERVIEW_WEBHOOK) return interviewPass()
    return okResponse({})
  })
  const { ctx, ops } = createFakeContext()
  try {
    await handleStartConsultation(ctx, {
      action: 'start_consultation',
      message: 'I have had a mild headache for two days',
    })
    const names = productEventRows(ops).map((row) => row.event_name)
    const startedAt = names.indexOf('consultation_started')
    const failedAt = names.indexOf('inference_failed')
    assertTrue(startedAt >= 0, 'consultation_started present')
    assertTrue(failedAt >= 0, 'inference_failed present')
    assertTrue(startedAt < failedAt, 'consultation_started before inference_failed')
    assertTrue(names.includes('guardrail_evaluated'), 'guardrail_evaluated')
    assertTrue(names.includes('question_served'), 'question_served on start')
    const guardrail = productEventRows(ops).find((row) => row.event_name === 'guardrail_evaluated')
    assertEquals(guardrail!.properties?.shadow_llm_status, 'disabled', 'P1-16 AC2 shadow_llm_status')
    for (const row of productEventRows(ops)) {
      assertNoForbiddenKeys(row.properties, row.event_name || 'event')
    }
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P1-15 AC1 · start emits question_served with PHI-free slot id', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === INTERVIEW_WEBHOOK) return interviewPass()
    if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
    return okResponse({})
  })
  const { ctx, ops } = createFakeContext()
  try {
    await handleStartConsultation(ctx, {
      action: 'start_consultation',
      message: 'I have had a mild headache for two days',
    })
    const served = productEventRows(ops).find((row) => row.event_name === 'question_served')
    assertTrue(served, 'question_served emitted')
    assertEquals(served!.properties?.turn_index, 1)
    assertEquals(served!.properties?.target_slot, 'onset')
    assertEquals(served!.properties?.was_repeat, false)
    assertEquals(typeof served!.properties?.had_options, 'boolean')
    assertNoForbiddenKeys(served!.properties, 'question_served')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P1-15 AC1 / Q4 · demographics emits consent_recorded + turn_completed + question_served', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === INTERVIEW_WEBHOOK) {
      return interviewPass({
        next_question: 'Where is the pain located?',
        target_slot: 'location',
        options: ['Front', 'Side', 'Back', 'All over'],
        missing_slots: ['location'],
      })
    }
    if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
    return okResponse({})
  })
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({
      status: 'awaiting_demographics',
      turn_count: 1,
      target_slot: 'onset',
      version: 1,
    }),
  })
  try {
    await handleSaveDemographics(ctx, {
      action: 'save_demographics',
      consultation_id: 'consultation-1',
      age: 34,
      sex_at_birth: 'female',
      message: 'Two days ago',
    })
    const names = productEventRows(ops).map((row) => row.event_name)
    assertTrue(names.includes('consent_recorded'), 'consent_recorded')
    assertTrue(names.includes('turn_completed'), 'turn_completed')
    assertTrue(names.includes('question_served'), 'question_served')
    assertTrue(names.includes('demographics_saved'), 'demographics_saved')
    assertTrue(names.includes('guardrail_evaluated'), 'guardrail_evaluated')

    const consent = productEventRows(ops).find((row) => row.event_name === 'consent_recorded')
    assertEquals(consent!.properties?.method, 'demographics_submit')
    assertNoForbiddenKeys(consent!.properties, 'consent_recorded')

    const completed = productEventRows(ops).find((row) => row.event_name === 'turn_completed')
    assertEquals(completed!.properties?.target_slot, 'onset')
    assertEquals(completed!.properties?.turn_index, 1)
    assertNoForbiddenKeys(completed!.properties, 'turn_completed')

    const served = productEventRows(ops).find((row) => row.event_name === 'question_served')
    assertEquals(served!.properties?.target_slot, 'location')
    assertEquals(served!.properties?.was_repeat, false)
    assertNoForbiddenKeys(served!.properties, 'question_served demographics')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P1-15 Q3 · abandon emits consult_abandoned', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({
      status: 'interviewing',
      turn_count: 3,
      version: 4,
      filled_slots: {},
      intermediate_diagnoses: [],
    }),
  })
  const response = await handleAbandonConsultation(ctx, {
    action: 'abandon_consultation',
    consultation_id: 'consultation-1',
  })
  assertEquals(response.status, 200, 'abandon ok')
  const abandoned = productEventRows(ops).find((row) => row.event_name === 'consult_abandoned')
  assertTrue(abandoned, 'consult_abandoned emitted')
  assertEquals(abandoned!.properties?.abandoned_from_status, 'interviewing')
  assertEquals(abandoned!.properties?.last_status, 'interviewing')
  assertEquals(abandoned!.properties?.turn_index, 3)
  // P1-09 Q5A — ineligible (no chief_complaint) ⇒ payload null ⇒ shown false
  // (no longer proxies intermediate_diagnoses.length).
  assertEquals(abandoned!.properties?.partial_outcome_shown, false)
  assertNoForbiddenKeys(abandoned!.properties, 'consult_abandoned')
})

Deno.test('P1-09 Q5A · abandon eligible → partial_outcome_shown true', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({
      status: 'interviewing',
      turn_count: 4,
      version: 5,
      filled_slots: { chief_complaint: 'headache' },
      intermediate_diagnoses: [],
    }),
  })
  const response = await handleAbandonConsultation(ctx, {
    action: 'abandon_consultation',
    consultation_id: 'consultation-1',
  })
  assertEquals(response.status, 200, 'abandon ok')
  const body = await response.json()
  assertTrue(body.partial_outcome, 'partial_outcome attached when eligible')
  const abandoned = productEventRows(ops).find((row) => row.event_name === 'consult_abandoned')
  assertTrue(abandoned, 'consult_abandoned emitted')
  assertEquals(abandoned!.properties?.partial_outcome_shown, true)
  assertNoForbiddenKeys(abandoned!.properties, 'consult_abandoned eligible')
})

Deno.test('P1-15 AC1 / Q5 · send-message report path buckets gate + emits report_ready', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === INTERVIEW_WEBHOOK) {
      return interviewPass({
        next_question: 'Anything else?',
        target_slot: 'associated_symptoms',
        ready_for_report: true,
        slot_updates: { aggravating_factors: 'none' },
        missing_slots: [],
      })
    }
    if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
    if (url === DIAGNOSIS_WEBHOOK) {
      return okResponse({
        valid_report: true,
        confidence_score: 82,
        differential_diagnosis: [
          { name: 'tension headache', likelihood: 'high' },
          { name: 'migraine', likelihood: 'low' },
        ],
        soap_note: { subjective: 'x', objective: 'x', assessment: 'x', plan: 'x' },
        model_metadata: {},
      })
    }
    return okResponse({})
  })

  const filled = {
    chief_complaint: 'headache',
    onset: 'two days',
    severity: '4',
    associated_symptoms: 'none',
    red_flag_negatives: 'no chest pain no shortness of breath',
    relevant_history: 'none',
    age: 34,
    sex_at_birth: 'female',
  }
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({
      status: 'interviewing',
      turn_count: 7,
      version: 7,
      filled_slots: filled,
      missing_slots: [],
      target_slot: 'aggravating_factors',
      clinical_evidence_score: 70,
      // P1-14 — gate-open report-path fixture seeds once-completed so Diagnosis
      // telemetry asserts (not the comprehension OverlaySheet short-circuit).
      workflow_versions: { comprehension_completed: true },
    }),
  })
  try {
    const response = await handleSendMessage(ctx, {
      action: 'send_message',
      consultation_id: 'consultation-1',
      message: 'Nothing else',
      client_message_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      expected_version: 7,
    })
    assertEquals(response.status, 200, 'send ok')
    const rows = productEventRows(ops)
    const names = rows.map((row) => row.event_name)
    assertTrue(names.includes('turn_completed'), 'turn_completed')
    assertTrue(names.includes('guardrail_evaluated'), 'guardrail_evaluated')
    assertTrue(names.includes('diagnosis_attempted'), 'diagnosis_attempted')
    assertTrue(names.includes('report_gate_reached'), 'report_gate_reached')
    assertTrue(names.includes('report_ready'), 'report_ready')

    const gate = rows.find((row) => row.event_name === 'report_gate_reached')!
    assertEquals(gate.properties?.confidence_bucket, '80-89')
    assertEquals(typeof gate.properties?.evidence_bucket, 'string')
    assertEquals(gate.properties?.confidence_score, undefined, 'no raw confidence')
    assertEquals(gate.properties?.evidence_score, undefined, 'no raw evidence')
    assertNoForbiddenKeys(gate.properties, 'report_gate_reached')

    const ready = rows.find((row) => row.event_name === 'report_ready')!
    assertEquals(ready.properties?.turn_index, 8)
    assertEquals(ready.properties?.confidence_bucket, '80-89')
    assertNoForbiddenKeys(ready.properties, 'report_ready')

    const reportInserts = opsFor(ops, 'libertymd_reports', 'insert')
    assertTrue(reportInserts.length === 1, 'P2-07: exactly one report insert')
    assertEquals(opsFor(ops, 'libertymd_reports', 'upsert').length, 0, 'P2-07: no clinical upsert')
    const reportPayload = (Array.isArray(reportInserts[0].payload) ? reportInserts[0].payload[0] : reportInserts[0].payload) as Record<string, unknown>
    assertTrue(Boolean(reportPayload.final_diagnostic_run_id), 'final_diagnostic_run_id set on first insert')

    const diagnosis = rows.find((row) => row.event_name === 'diagnosis_attempted')!
    assertEquals(diagnosis.properties?.outcome, 'valid')
    assertEquals(diagnosis.properties?.was_speculative, false, 'P1-16 AC2 was_speculative')
    assertEquals(diagnosis.properties?.served_from_cache, false, 'P1-08 fresh path served_from_cache')
    assertNoForbiddenKeys(diagnosis.properties, 'diagnosis_attempted')

    const guardrail = rows.find((row) => row.event_name === 'guardrail_evaluated')!
    assertEquals(guardrail.properties?.shadow_llm_status, 'disabled', 'P1-16 AC2 shadow_llm_status')
    assertNoForbiddenKeys(guardrail.properties, 'guardrail_evaluated')

    for (const row of rows) {
      assertNoForbiddenKeys(row.properties, row.event_name || 'event')
    }
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P1-15 AC3 · symptom text and email must not appear in product event props', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === INTERVIEW_WEBHOOK) return interviewPass()
    if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
    return okResponse({})
  })
  const { ctx, ops } = createFakeContext()
  try {
    await handleStartConsultation(ctx, {
      action: 'start_consultation',
      message: 'mild headache for two days, contact patient@example.com',
    })
    for (const row of productEventRows(ops)) {
      assertNoForbiddenKeys(row.properties, row.event_name || 'event')
      const blob = JSON.stringify(row.properties || {})
      assertEquals(blob.includes('headache'), false, 'no symptom text in props')
      assertEquals(blob.includes('patient@'), false, 'no email in props')
    }
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P3-05 · consultation_started tags chip entry_type + chip_id without PHI', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === INTERVIEW_WEBHOOK) return interviewPass()
    if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
    return okResponse({})
  })
  const { ctx, ops } = createFakeContext()
  try {
    await handleStartConsultation(ctx, {
      action: 'start_consultation',
      message: 'Sore throat',
      entry_type: 'chip',
      chip_id: 'sore_throat',
    })
    const started = productEventRows(ops).find((row) => row.event_name === 'consultation_started')
    assertTrue(started, 'consultation_started emitted')
    assertEquals(started!.properties?.entry_type, 'chip')
    assertEquals(started!.properties?.chip_id, 'sore_throat')
    assertNoForbiddenKeys(started!.properties, 'consultation_started chip')
    const blob = JSON.stringify(started!.properties || {})
    assertEquals(blob.includes('Sore throat'), false, 'no chip label in props')
    assertEquals(blob.includes('chief_complaint'), false, 'no chief_complaint key')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P3-05 · free-text start emits entry_type freetext; coerces invalid chip', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === INTERVIEW_WEBHOOK) return interviewPass()
    if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
    return okResponse({})
  })
  const { ctx, ops } = createFakeContext()
  try {
    await handleStartConsultation(ctx, {
      action: 'start_consultation',
      message: 'I have had a mild headache for two days',
      entry_type: 'freetext',
    })
    const free = productEventRows(ops).find((row) => row.event_name === 'consultation_started')
    assertEquals(free!.properties?.entry_type, 'freetext')
    assertEquals(free!.properties?.chip_id, undefined, 'no chip_id on freetext')

    const { ctx: ctx2, ops: ops2 } = createFakeContext()
    await handleStartConsultation(ctx2, {
      action: 'start_consultation',
      message: 'I have had a mild headache for two days',
      entry_type: 'chip',
      chip_id: 'not_a_real_chip',
    })
    const coerced = productEventRows(ops2).find((row) => row.event_name === 'consultation_started')
    assertEquals(coerced!.properties?.entry_type, 'freetext', 'invalid chip → freetext')
    assertEquals(coerced!.properties?.chip_id, undefined, 'omit chip_id on coerce')

    const { ctx: ctx3, ops: ops3 } = createFakeContext()
    await handleStartConsultation(ctx3, {
      action: 'start_consultation',
      message: 'Fever since yesterday',
    })
    const omitted = productEventRows(ops3).find((row) => row.event_name === 'consultation_started')
    assertEquals(omitted!.properties?.entry_type, 'freetext', 'missing entry_type → freetext')
    assertTrue(Object.prototype.hasOwnProperty.call(omitted!.properties || {}, 'entry_type'), 'never omit entry_type')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P3-05 · client catalog ids equal server CHIP_IDS; labels plain-language', () => {
  assertEquals(LIBERTYMD_COMPLAINT_CHIPS.length, 6, 'six chips')
  assertEquals(CHIP_IDS.size, 6, 'server CHIP_IDS size')
  assertEquals(LIBERTYMD_COMPLAINT_CHIP_IDS.size, CHIP_IDS.size, 'set sizes equal')
  for (const id of LIBERTYMD_COMPLAINT_CHIP_IDS) {
    assertTrue(CHIP_IDS.has(id), `server missing ${id}`)
  }
  for (const id of CHIP_IDS) {
    assertTrue(LIBERTYMD_COMPLAINT_CHIP_IDS.has(id as never), `client missing ${id}`)
  }
  for (const chip of LIBERTYMD_COMPLAINT_CHIPS) {
    const lower = chip.label.toLowerCase()
    for (const banned of LIBERTYMD_COMPLAINT_CHIP_DIAGNOSIS_BAN) {
      assertEquals(lower.includes(banned), false, `diagnosis-ish label: ${chip.label}`)
    }
    assertEquals(/strep|migraine|uti|chest pain|suicid/i.test(chip.label), false, `hard-exclude: ${chip.label}`)
  }
})
