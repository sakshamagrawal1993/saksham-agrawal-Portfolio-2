/**
 * P0-14c — egress-safe match provenance on edge_deterministic firings.
 * P0-14b — every-turn screen lock-in (mid-consult / parity / capped).
 *
 * Asserts via proxy doubles (no live Supabase). Imported by
 * `n8n-breaker.mts` so it rides the existing `--allow-env` gate without a
 * package.json script change.
 *
 * Note: `test:libertymd:evaluation` remains single-message
 * (`detectDeterministicEmergency(scenario.message)` only). Multi-turn /
 * mid-consult proofs live here, not in the clinical-scenario corpus.
 */
import { handleSaveDemographics } from '../../supabase/functions/libertymd-care-proxy/actions/save-demographics.ts'
import { handleSendMessage } from '../../supabase/functions/libertymd-care-proxy/actions/send-message.ts'
import { handleStartConsultation } from '../../supabase/functions/libertymd-care-proxy/actions/start-consultation.ts'
import { EMERGENCY_PATTERN_SET_VERSION } from '../../supabase/functions/libertymd-care-proxy/emergency-patterns.ts'
import {
  GUARDRAIL_WEBHOOK,
  INTERVIEW_WEBHOOK,
  MAX_TURNS,
} from '../../supabase/functions/libertymd-care-proxy/lib/config.ts'
import {
  composeSafetyRawResult,
  runGuardrail,
  saveSafetyEvent,
  toClientSafety,
} from '../../supabase/functions/libertymd-care-proxy/lib/safety.ts'
import {
  assertEquals,
  assertTrue,
  consultationRow,
  createFakeContext,
  okResponse,
  opsFor,
  stubFetch,
} from './support/proxy-doubles.mts'

declare const Deno: { test: (name: string, fn: () => unknown | Promise<unknown>) => void }

const ACS_MESSAGE = 'I have crushing chest pain and pain radiating to my left arm.'
const CLIENT_MESSAGE_ID = '11111111-1111-4111-8111-111111111111'

const EXPECTED_RAW_KEYS = [
  'care_setting',
  'crisis_type',
  'force_end',
  'is_emergency',
  'match',
  'message',
  'red_flags',
  'risk_level',
  'source',
  'status',
].sort()

const EXPECTED_MATCH_KEYS = [
  'lane',
  'pattern_set_version',
  'rule_id',
  'span',
  'span_end',
  'span_start',
].sort()

function interviewPass() {
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
  })
}

async function withConsoleSpy<T>(operation: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = []
  const capture = (...args: unknown[]) => {
    logs.push(args.map((arg) => {
      try {
        return typeof arg === 'string' ? arg : JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    }).join(' '))
  }
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  }
  console.log = capture
  console.warn = capture
  console.error = capture
  try {
    const result = await operation()
    return { result, logs }
  } finally {
    console.log = original.log
    console.warn = original.warn
    console.error = original.error
  }
}

Deno.test('P0-14c AC6/AC7 · edge force-end persists nine keys + match, no transcript', async () => {
  const { ctx, ops } = createFakeContext({ consultation: consultationRow() })
  const verdict = await runGuardrail(ACS_MESSAGE, [], {}, {})
  assertEquals(verdict.source, 'edge_deterministic', 'edge source')
  assertTrue(verdict.match, 'internal match present')
  assertEquals(verdict.raw.match, undefined, 'client raw must not carry match')
  await saveSafetyEvent(ctx, consultationRow(), verdict, 1)

  const inserts = opsFor(ops, 'libertymd_safety_events', 'insert')
  assertEquals(inserts.length, 1, 'one safety event insert')
  const row = inserts[0].payload as Record<string, unknown>
  const rawResult = row.raw_result as Record<string, unknown>
  assertEquals(JSON.stringify(Object.keys(rawResult).sort()), JSON.stringify(EXPECTED_RAW_KEYS), 'raw_result keys')
  const match = rawResult.match as Record<string, unknown>
  assertEquals(JSON.stringify(Object.keys(match).sort()), JSON.stringify(EXPECTED_MATCH_KEYS), 'match keys')
  assertEquals(match.rule_id, 'acs_chest_pain', 'rule_id')
  assertEquals(match.span, 'crushing chest', 'span')
  assertEquals(match.span_start, 7, 'span_start')
  assertEquals(match.span_end, 21, 'span_end')
  assertEquals(match.pattern_set_version, EMERGENCY_PATTERN_SET_VERSION, 'pattern_set_version')
  assertEquals(match.lane, 'edge', 'lane')
  assertEquals(rawResult.message_text, undefined, 'no message_text')
  assertEquals(rawResult.history, undefined, 'no history')
  assertEquals(rawResult.patient, undefined, 'no patient')
  assertTrue(String(match.span).length <= 120, 'span bounded')
})

Deno.test('P0-14c AC8 · n8n webhook transcript fields are stripped before persist', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === GUARDRAIL_WEBHOOK) {
      return okResponse({
        status: 'pass',
        risk_level: 'low',
        crisis_type: 'none',
        force_end: false,
        is_emergency: false,
        care_setting: 'home',
        message: 'No emergency detected.',
        red_flags: [],
        source: 'n8n',
        message_text: 'LEAKED TRANSCRIPT',
        history: [{ role: 'user', content: 'LEAKED HISTORY' }],
        patient: { age: 44, name: 'LEAKED' },
      })
    }
    return failUpstream(url)
  })
  try {
    const { ctx, ops } = createFakeContext()
    const verdict = await runGuardrail('I have a mild sore throat', [], {}, {})
    assertEquals(verdict.force_end, false, 'non-emergency')
    assertEquals(verdict.raw.message_text, undefined, 'raw allow-listed')
    assertEquals(verdict.raw.history, undefined, 'raw allow-listed history')
    assertEquals(verdict.raw.patient, undefined, 'raw allow-listed patient')
    await saveSafetyEvent(ctx, consultationRow(), verdict, 2)
    const rawResult = (opsFor(ops, 'libertymd_safety_events', 'insert')[0].payload as { raw_result: Record<string, unknown> }).raw_result
    assertEquals(rawResult.message_text, undefined, 'persisted no message_text')
    assertEquals(rawResult.history, undefined, 'persisted no history')
    assertEquals(rawResult.patient, undefined, 'persisted no patient')
    assertEquals(rawResult.match, undefined, 'n8n path has no match')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('guardrail consistency · low-risk no-red-flag verdict cannot enter high-risk UI state', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === GUARDRAIL_WEBHOOK) {
      return okResponse({
        status: 'high_risk_continue',
        risk_level: 'low',
        crisis_type: 'none',
        force_end: false,
        is_emergency: false,
        care_setting: 'telehealth',
        message: 'The symptoms remain mild; continue the routine interview.',
        red_flags: [],
        source: 'llm',
      })
    }
    return failUpstream(url)
  })
  try {
    const verdict = await runGuardrail('My mild headache began after a long screen day.', [], {}, {})
    assertEquals(verdict.status, 'pass', 'internally low-risk verdict must not trigger high-risk UI')
    assertEquals(verdict.risk_level, 'low', 'clinical risk remains low')
    assertEquals(verdict.force_end, false, 'non-emergency remains non-terminal')
    assertEquals(verdict.source, 'n8n_low_risk_normalized', 'normalization remains auditable')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('guardrail specificity · bare shortness of breath plus fever cannot force-end', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === GUARDRAIL_WEBHOOK) {
      return okResponse({
        status: 'force_end',
        risk_level: 'high',
        crisis_type: 'respiratory_distress',
        force_end: true,
        is_emergency: true,
        care_setting: 'emergency_department',
        message: 'Go to the emergency department now.',
        red_flags: ['shortness of breath', 'four-day fever'],
        source: 'llm',
      })
    }
    return failUpstream(url)
  })
  try {
    const verdict = await runGuardrail('No, that is all', [
      { role: 'user', content: 'I have had a fever for four days.' },
      { role: 'user', content: 'Shortness of breath' },
      { role: 'assistant', content: 'Are you gasping, blue around the lips, or unable to speak?' },
      { role: 'user', content: 'No, I have not traveled' },
    ], {}, {})

    assertEquals(verdict.status, 'high_risk_continue', 'ambiguous respiratory symptom must stay in interview')
    assertEquals(verdict.force_end, false, 'no patient-stated severe respiratory feature')
    assertEquals(verdict.is_emergency, false, 'not an emergency stop')
    assertEquals(verdict.care_setting, 'urgent_care', 'concerning symptom remains clinically cautious')
    assertEquals(verdict.source, 'llm_specificity_backstop', 'server boundary recorded for audit')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('guardrail specificity · patient-stated gasping and inability to speak can force-end', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === GUARDRAIL_WEBHOOK) {
      return okResponse({
        status: 'force_end',
        risk_level: 'emergency',
        crisis_type: 'respiratory_distress',
        force_end: true,
        is_emergency: true,
        care_setting: 'call_911',
        message: 'Call emergency services now.',
        red_flags: ['gasping', 'cannot speak'],
        source: 'llm',
      })
    }
    return failUpstream(url)
  })
  try {
    const verdict = await runGuardrail('It is getting worse', [
      { role: 'user', content: 'I am gasping for air and cannot speak a full sentence.' },
    ], {}, {})

    assertEquals(verdict.status, 'force_end', 'high-specificity patient evidence remains terminal')
    assertEquals(verdict.force_end, true, 'true emergency is not downgraded')
    assertEquals(verdict.source, 'llm', 'original verdict source retained')
  } finally {
    fetchLog.restore()
  }
})

function failUpstream(url: string): Response {
  throw new Error(`unexpected fetch in P0-14c test: ${url}`)
}

Deno.test('P0-14c AC9/AC10/AC11/AC12 · start-consultation force-end egress containment', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === INTERVIEW_WEBHOOK) return interviewPass()
    if (url === GUARDRAIL_WEBHOOK) return failUpstream(url)
    return okResponse({})
  })
  const { ctx, ops } = createFakeContext()
  try {
    const { result: response, logs } = await withConsoleSpy(() =>
      handleStartConsultation(ctx, { action: 'start_consultation', message: ACS_MESSAGE })
    )
    const body = await response.json() as {
      safety?: { match?: unknown; raw?: { match?: unknown } }
      message?: string
    }
    const span = 'crushing chest'
    assertEquals(body.safety?.match, undefined, 'no top-level match')
    assertEquals(body.safety?.raw?.match, undefined, 'no raw.match')
    assertEquals(JSON.stringify(body).includes(span), false, 'response body must not contain span')
    assertTrue(logs.every((line) => !line.includes(span)), 'no span in console')

    const safetyInsert = opsFor(ops, 'libertymd_safety_events', 'insert')[0]?.payload as { raw_result: Record<string, unknown> }
    assertTrue(safetyInsert?.raw_result?.match, 'raw_result.match persisted')
    const updates = opsFor(ops, 'libertymd_consultations', 'update')
    const safetyState = updates.map((op) => (op.payload as { safety_state?: Record<string, unknown> }).safety_state).find(Boolean)
    assertTrue(safetyState, 'safety_state written')
    assertEquals(safetyState!.match, undefined, 'safety_state has no match')
    assertEquals(safetyState!.shadow_llm, undefined, 'P0-15a: safety_state has no shadow_llm')
    for (const key of ['status', 'risk_level', 'crisis_type', 'force_end', 'is_emergency', 'care_setting', 'message', 'red_flags', 'source']) {
      assertTrue(key in safetyState!, `safety_state has ${key}`)
    }

    const productEvents = opsFor(ops, 'libertymd_product_events', 'insert')
      .map((op) => op.payload as { event_name?: string; properties?: Record<string, unknown> })
      .filter((row) => row.event_name === 'emergency_stopped')
    assertEquals(productEvents.length, 1, 'emergency_stopped emitted')
    assertEquals(
      JSON.stringify(Object.keys(productEvents[0].properties || {}).sort()),
      JSON.stringify(['source', 'turn_count'].sort()),
      'telemetry props',
    )
    assertTrue(
      !JSON.stringify(productEvents[0].properties || {}).includes('shadow_llm'),
      'P0-15a: telemetry omits shadow_llm',
    )
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P0-14c AC9 / P0-14b AC2–AC3 · send-message mid-consult (seeded turn 4) force-end contract', async () => {
  // Seeded mid-consult proof (P0-14b Q1): prior turn_count 3 + send → event turn 4.
  // Wiring already screens every free-text path; this locks full contract fields.
  const INTERVIEW_QUESTION = 'When did this start?'
  const fetchLog = stubFetch((url) => {
    if (url === INTERVIEW_WEBHOOK) return interviewPass()
    if (url === GUARDRAIL_WEBHOOK) return failUpstream(url)
    return okResponse({})
  })
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({
      status: 'interviewing',
      turn_count: 3,
      version: 3,
      chief_complaint: 'mild sore throat for two days',
    }),
  })
  try {
    const { result: response, logs } = await withConsoleSpy(() =>
      handleSendMessage(ctx, {
        action: 'send_message',
        consultation_id: 'consultation-1',
        message: ACS_MESSAGE,
        client_message_id: CLIENT_MESSAGE_ID,
        expected_version: 3,
      })
    )
    const body = await response.json() as {
      safety?: {
        match?: unknown
        raw?: { match?: unknown }
        source?: string
        force_end?: boolean
        is_emergency?: boolean
        status?: string
        crisis_type?: string
        care_setting?: string
      }
      emergency?: boolean
      message?: string
    }
    assertEquals(body.emergency, true, 'emergency response')
    assertEquals(body.safety?.source, 'edge_deterministic', 'edge source')
    assertEquals(body.safety?.force_end, true, 'force_end')
    assertEquals(body.safety?.is_emergency, true, 'is_emergency')
    assertEquals(body.safety?.status, 'force_end', 'status force_end')
    assertEquals(body.safety?.crisis_type, 'acs_chest_pain', 'crisis_type')
    assertEquals(body.safety?.care_setting, 'call_911', 'care_setting')
    assertEquals(body.safety?.match, undefined, 'no match on safety')
    assertEquals(body.safety?.raw?.match, undefined, 'no raw.match')
    assertEquals(JSON.stringify(body).includes('crushing chest'), false, 'no span in body')
    assertTrue(logs.every((line) => !line.includes('crushing chest')), 'no span in logs')
    assertTrue(body.message !== INTERVIEW_QUESTION, 'interview question not user-facing continuation')
    assertEquals(
      JSON.stringify(body).includes(INTERVIEW_QUESTION),
      false,
      'interview output not acted on in response',
    )

    const consultUpdate = opsFor(ops, 'libertymd_consultations', 'update')
      .map((op) => op.payload as {
        status?: string
        turn_count?: number
        safety_state?: Record<string, unknown>
      })
      .find((payload) => payload.status === 'emergency_stopped')
    assertTrue(consultUpdate, 'consultation emergency_stopped')
    assertEquals(consultUpdate!.turn_count, 4, 'response/event turn_count === 4')
    assertEquals(consultUpdate!.safety_state?.match, undefined, 'safety_state no match')
    assertEquals(consultUpdate!.safety_state?.source, 'edge_deterministic', 'safety_state source')
    assertEquals(consultUpdate!.safety_state?.force_end, true, 'safety_state force_end')

    const safetyInsert = opsFor(ops, 'libertymd_safety_events', 'insert')[0]?.payload as {
      turn_count?: number
      source?: string
      force_end?: boolean
    }
    assertEquals(safetyInsert?.turn_count, 4, 'safety event turn_count 4')
    assertEquals(safetyInsert?.source, 'edge_deterministic', 'safety event source')
    assertEquals(safetyInsert?.force_end, true, 'safety event force_end')

    const productEvents = opsFor(ops, 'libertymd_product_events', 'insert')
      .map((op) => op.payload as { event_name?: string; properties?: Record<string, unknown> })
      .filter((row) => row.event_name === 'emergency_stopped')
    assertEquals(productEvents.length, 1, 'emergency_stopped emitted')
    assertEquals(
      JSON.stringify(Object.keys(productEvents[0].properties || {}).sort()),
      JSON.stringify(['source', 'turn_count'].sort()),
      'telemetry props only { turn_count, source }',
    )
    assertEquals(productEvents[0].properties?.turn_count, 4, 'telemetry turn_count 4')
    assertEquals(productEvents[0].properties?.source, 'edge_deterministic', 'telemetry source')

    const assistantMsgs = opsFor(ops, 'libertymd_messages', 'insert')
      .map((op) => op.payload as { role?: string; content?: string; message_type?: string })
      .filter((row) => row.role === 'assistant')
    assertTrue(assistantMsgs.length >= 1, 'assistant safety message persisted')
    assertTrue(
      assistantMsgs.every((row) => row.content !== INTERVIEW_QUESTION),
      'interview question not written as continuation',
    )
    assertTrue(
      assistantMsgs.some((row) => row.message_type === 'safety'),
      'assistant message typed as safety',
    )
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P0-14c AC9 · save-demographics force-end response omits span', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === INTERVIEW_WEBHOOK) return interviewPass()
    return okResponse({})
  })
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({ status: 'awaiting_demographics', turn_count: 1, version: 1 }),
  })
  try {
    const { result: response, logs } = await withConsoleSpy(() =>
      handleSaveDemographics(ctx, {
        action: 'save_demographics',
        consultation_id: 'consultation-1',
        age: 44,
        sex_at_birth: 'male',
        message: ACS_MESSAGE,
      })
    )
    const body = await response.json() as {
      safety?: { match?: unknown; raw?: { match?: unknown } }
      emergency?: boolean
    }
    assertEquals(body.emergency, true, 'emergency response')
    assertEquals(body.safety?.match, undefined, 'no match on safety')
    assertEquals(body.safety?.raw?.match, undefined, 'no raw.match')
    assertEquals(JSON.stringify(body).includes('crushing chest'), false, 'no span in body')
    assertTrue(logs.every((line) => !line.includes('crushing chest')), 'no span in logs')
    const safetyState = opsFor(ops, 'libertymd_consultations', 'update')
      .map((op) => (op.payload as { safety_state?: Record<string, unknown> }).safety_state)
      .find(Boolean)
    assertEquals(safetyState?.match, undefined, 'safety_state no match')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P0-14c AC2/AC14 · composeSafetyRawResult and toClientSafety contract', async () => {
  const verdict = await runGuardrail(ACS_MESSAGE, [], {}, {})
  const persisted = composeSafetyRawResult(verdict)
  assertEquals(JSON.stringify(Object.keys(persisted).sort()), JSON.stringify(EXPECTED_RAW_KEYS), 'compose keys')
  assertEquals((persisted.match as { rule_id: string }).rule_id, 'acs_chest_pain', 'groupable rule_id')
  const client = toClientSafety(verdict)
  assertEquals(client.match, undefined, 'toClientSafety omits match')
  assertEquals(client.raw.match, undefined, 'client raw omits match')
  assertEquals(JSON.stringify(client).includes('crushing chest'), false, 'client DTO has no span')
})

type ForceEndSafety = {
  match?: unknown
  raw?: { match?: unknown }
  source?: string
  force_end?: boolean
  is_emergency?: boolean
  status?: string
  crisis_type?: string
  care_setting?: string
}

function assertForceEndParity(label: string, safety: ForceEndSafety | undefined) {
  assertTrue(safety, `${label}: safety present`)
  assertEquals(safety!.status, 'force_end', `${label}: status`)
  assertEquals(safety!.force_end, true, `${label}: force_end`)
  assertEquals(safety!.is_emergency, true, `${label}: is_emergency`)
  assertEquals(safety!.crisis_type, 'acs_chest_pain', `${label}: crisis_type`)
  assertEquals(safety!.care_setting, 'call_911', `${label}: care_setting`)
  assertEquals(safety!.source, 'edge_deterministic', `${label}: source`)
  assertEquals(safety!.match, undefined, `${label}: no client match`)
  assertEquals(safety!.raw?.match, undefined, `${label}: no raw.match`)
}

Deno.test('P0-14b AC5 · turn-1 vs turn-N force-end parity on contract fields', async () => {
  const INTERVIEW_QUESTION = 'When did this start?'
  const fetchLog = stubFetch((url) => {
    if (url === INTERVIEW_WEBHOOK) return interviewPass()
    if (url === GUARDRAIL_WEBHOOK) return failUpstream(url)
    return okResponse({})
  })
  try {
    const startCtx = createFakeContext()
    const startResponse = await handleStartConsultation(startCtx.ctx, {
      action: 'start_consultation',
      message: ACS_MESSAGE,
    })
    const startBody = await startResponse.json() as {
      emergency?: boolean
      safety?: ForceEndSafety
      message?: string
    }
    assertEquals(startBody.emergency, true, 'turn-1 emergency')
    assertForceEndParity('turn-1', startBody.safety)
    assertTrue(startBody.message !== INTERVIEW_QUESTION, 'turn-1 does not act on interview')

    const startEvents = opsFor(startCtx.ops, 'libertymd_product_events', 'insert')
      .map((op) => op.payload as { event_name?: string; properties?: Record<string, unknown> })
      .filter((row) => row.event_name === 'emergency_stopped')
    assertEquals(startEvents.length, 1, 'turn-1 emergency_stopped')
    assertEquals(
      JSON.stringify(Object.keys(startEvents[0].properties || {}).sort()),
      JSON.stringify(['source', 'turn_count'].sort()),
      'turn-1 telemetry props',
    )
    assertEquals(startEvents[0].properties?.turn_count, 1, 'turn-1 telemetry turn_count')
    assertEquals(startEvents[0].properties?.source, 'edge_deterministic', 'turn-1 telemetry source')

    const midCtx = createFakeContext({
      consultation: consultationRow({
        status: 'interviewing',
        turn_count: 3,
        version: 3,
        chief_complaint: 'mild sore throat for two days',
      }),
    })
    const midResponse = await handleSendMessage(midCtx.ctx, {
      action: 'send_message',
      consultation_id: 'consultation-1',
      message: ACS_MESSAGE,
      client_message_id: CLIENT_MESSAGE_ID,
      expected_version: 3,
    })
    const midBody = await midResponse.json() as {
      emergency?: boolean
      safety?: ForceEndSafety
      message?: string
    }
    assertEquals(midBody.emergency, true, 'turn-N emergency')
    assertForceEndParity('turn-N', midBody.safety)
    assertTrue(midBody.message !== INTERVIEW_QUESTION, 'turn-N does not act on interview')

    const midEvents = opsFor(midCtx.ops, 'libertymd_product_events', 'insert')
      .map((op) => op.payload as { event_name?: string; properties?: Record<string, unknown> })
      .filter((row) => row.event_name === 'emergency_stopped')
    assertEquals(midEvents.length, 1, 'turn-N emergency_stopped')
    assertEquals(
      JSON.stringify(Object.keys(midEvents[0].properties || {}).sort()),
      JSON.stringify(['source', 'turn_count'].sort()),
      'turn-N telemetry props',
    )
    assertEquals(midEvents[0].properties?.turn_count, 4, 'turn-N telemetry turn_count (only intentional difference)')
    assertEquals(midEvents[0].properties?.source, 'edge_deterministic', 'turn-N telemetry source')

    // Parity on force-end contract fields (turn_count may differ — only intentional difference).
    for (const key of ['status', 'force_end', 'is_emergency', 'crisis_type', 'care_setting', 'source'] as const) {
      assertEquals(startBody.safety![key], midBody.safety![key], `parity ${key}`)
    }
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P0-14b AC6 · capped-turn still screens before closeAtTurnCap', async () => {
  // At MAX_TURNS the interview path is skipped, but the edge screen must still run.
  // If a future "optimisation" skips the screen at cap, this fails before clinical_review close.
  const fetchLog = stubFetch((url) => {
    if (url === INTERVIEW_WEBHOOK || url === GUARDRAIL_WEBHOOK) return failUpstream(url)
    return okResponse({})
  })
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({
      status: 'interviewing',
      turn_count: MAX_TURNS,
      version: MAX_TURNS,
      chief_complaint: 'mild sore throat for two days',
    }),
  })
  try {
    const response = await handleSendMessage(ctx, {
      action: 'send_message',
      consultation_id: 'consultation-1',
      message: ACS_MESSAGE,
      client_message_id: CLIENT_MESSAGE_ID,
      expected_version: MAX_TURNS,
    })
    const body = await response.json() as {
      emergency?: boolean
      safety?: ForceEndSafety
    }
    assertEquals(body.emergency, true, 'capped turn still force-ends')
    assertForceEndParity('capped', body.safety)
    assertEquals(fetchLog.calls.length, 0, 'edge decides in-process; no n8n at cap on ACS')

    const consultUpdate = opsFor(ops, 'libertymd_consultations', 'update')
      .map((op) => op.payload as { status?: string; turn_count?: number })
      .find((payload) => payload.status === 'emergency_stopped')
    assertTrue(consultUpdate, 'emergency_stopped before turn-cap close')
    assertEquals(consultUpdate!.turn_count, MAX_TURNS, 'turn_count stays at MAX_TURNS')
    assertTrue(
      !opsFor(ops, 'libertymd_consultations', 'update').some((op) => {
        const status = (op.payload as { status?: string }).status
        return status === 'clinical_review_needed' || status === 'completed' || status === 'report_pending_auth'
      }),
      'closeAtTurnCap must not win over edge force-end',
    )

    const productEvents = opsFor(ops, 'libertymd_product_events', 'insert')
      .map((op) => op.payload as { event_name?: string; properties?: Record<string, unknown> })
      .filter((row) => row.event_name === 'emergency_stopped')
    assertEquals(productEvents.length, 1, 'capped emergency_stopped')
    assertEquals(
      JSON.stringify(Object.keys(productEvents[0].properties || {}).sort()),
      JSON.stringify(['source', 'turn_count'].sort()),
      'capped telemetry props',
    )
    assertEquals(productEvents[0].properties?.turn_count, MAX_TURNS, 'capped telemetry turn_count')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P1-01 · non-emergency start returns first question and persists target_slot', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === INTERVIEW_WEBHOOK) return interviewPass()
    if (url === GUARDRAIL_WEBHOOK) {
      return okResponse({
        status: 'pass',
        force_end: false,
        risk_level: 'low',
        care_setting: 'self_care',
        message: 'ok',
        red_flags: [],
      })
    }
    return okResponse({})
  })
  const { ctx, ops } = createFakeContext()
  try {
    const response = await handleStartConsultation(ctx, {
      action: 'start_consultation',
      message: 'I have had a mild headache for two days',
    })
    const body = await response.json() as {
      emergency?: boolean
      state?: string
      next_question?: string
      options?: string[]
      target_slot?: string
      acknowledgement?: string
    }
    assertEquals(body.emergency, undefined, 'not emergency')
    assertEquals(body.state, 'awaiting_demographics', 'still awaiting demographics')
    assertEquals(body.next_question, 'When did this start?', 'first interview question')
    assertEquals(body.target_slot, 'onset', 'target_slot from interview')
    assertTrue(Array.isArray(body.options) && body.options.length > 0, 'options present')
    assertTrue(
      !String(body.acknowledgement || '').toLowerCase().includes('biological sex'),
      'ack must not be the old long demographics ask',
    )
    const consultUpdates = opsFor(ops, 'libertymd_consultations', 'update')
      .map((op) => op.payload as { target_slot?: string; status?: string })
    assertTrue(
      consultUpdates.some((row) => row.target_slot === 'onset'),
      'target_slot persisted on consultation',
    )
    assertTrue(
      !consultUpdates.some((row) => row.status === 'interviewing'),
      'abandon remains awaiting_demographics until save',
    )
    const interviewCalls = fetchLog.calls.filter((call) => call.url === INTERVIEW_WEBHOOK)
    assertEquals(interviewCalls.length, 1, 'interview called once on non-emergency start')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P1-01 · save_demographics binds answer to pre-start slot and advances', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === INTERVIEW_WEBHOOK) {
      return okResponse({
        next_question: 'Where is the pain located?',
        options: ['Front', 'Side', 'Back', 'All over'],
        ready_for_report: false,
        target_slot: 'location',
        slot_updates: {},
        missing_slots: ['location'],
        input_relevance: 'clinical',
        input_relevance_reason: 'clinical',
        source: 'n8n',
      })
    }
    if (url === GUARDRAIL_WEBHOOK) {
      return okResponse({
        status: 'pass',
        force_end: false,
        risk_level: 'low',
        care_setting: 'self_care',
        message: 'ok',
        red_flags: [],
      })
    }
    return okResponse({})
  })
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({
      status: 'awaiting_demographics',
      turn_count: 1,
      version: 1,
      target_slot: 'onset',
      filled_slots: { chief_complaint: 'headache' },
      missing_slots: ['onset', 'duration', 'severity', 'associated_symptoms', 'red_flag_negatives', 'relevant_history'],
      patient_snapshot: { age: null, sex_at_birth: null },
    }),
  })
  try {
    const response = await handleSaveDemographics(ctx, {
      action: 'save_demographics',
      consultation_id: 'consultation-1',
      age: 34,
      sex_at_birth: 'female',
      message: 'It started yesterday morning',
    })
    assertEquals(response.status, 200, 'save ok')
    const body = await response.json() as {
      emergency?: boolean
      state?: string
      next_question?: string
      target_slot?: string
    }
    assertEquals(body.emergency, undefined, 'not emergency')
    assertTrue(body.state === 'interviewing' || body.state === 'high_risk', 'advanced past demographics')
    assertEquals(body.next_question, 'Where is the pain located?', 'following interview question')
    assertEquals(body.target_slot, 'location', 'next target_slot')

    const userClinical = opsFor(ops, 'libertymd_messages', 'insert')
      .map((op) => op.payload as { role?: string; content?: string; target_slot?: string; slot_updates?: Record<string, unknown> })
      .filter((row) => row.role === 'user' && row.content === 'It started yesterday morning')
    assertEquals(userClinical.length, 1, 'clinical answer retained')
    assertEquals(userClinical[0].target_slot, 'onset', 'bound to pre-start slot')
    assertEquals(userClinical[0].slot_updates?.onset, 'It started yesterday morning', 'slot_updates bind')

    const consent = opsFor(ops, 'libertymd_consent_events', 'insert')
    assertEquals(consent.length, 1, 'consent insert')
    const rows = consent[0].payload as Array<{ consent_type?: string; decision?: string }>
    assertEquals(rows.length, 3, 'three consent rows')
    assertTrue(rows.every((row) => row.decision === 'accepted'), 'accepted only')

    const demoSaved = opsFor(ops, 'libertymd_product_events', 'insert')
      .map((op) => op.payload as { event_name?: string; properties?: Record<string, unknown> })
      .find((row) => row.event_name === 'demographics_saved')
    assertTrue(demoSaved, 'demographics_saved emitted')
    assertEquals(demoSaved!.properties?.was_prefilled, false, 'was_prefilled false when snapshot empty')
  } finally {
    fetchLog.restore()
  }
})

/**
 * BO 2026-08-01 — the demographics card is demographics-only, so an empty
 * clinical answer is now ACCEPTED rather than rejected. Was: P1-01 Q4 required
 * a non-empty answer under the unified-entry contract.
 *
 * The safety property that must survive the change: a turn that accepts user
 * input still leaves an auditable safety row. With no free text there is
 * nothing to screen, so the row is the `no_free_text_to_screen` verdict
 * (P0-14d AC3/AC5) — never a silent pass and never an unrecorded turn.
 */
Deno.test('save_demographics accepts a demographics-only submit and still records a safety row', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({ status: 'awaiting_demographics', turn_count: 1, version: 1, target_slot: 'onset' }),
  })
  const response = await handleSaveDemographics(ctx, {
    action: 'save_demographics',
    consultation_id: 'consultation-1',
    age: 34,
    sex_at_birth: 'female',
    message: '   ',
  })
  // Not asserting 200: with no free text the interview leg still runs, and the
  // double answers it with a holding state (503). What matters is that the
  // request is no longer *rejected* for lacking a clinical answer.
  assertEquals(response.status === 400, false, 'demographics-only submit is not rejected')

  const safetyRows = opsFor(ops, 'libertymd_safety_events', 'insert')
  assertEquals(safetyRows.length >= 1, true, 'a safety row is still written')
  const recorded = safetyRows[safetyRows.length - 1]?.payload as Record<string, unknown> | undefined
  assertEquals(recorded?.source, 'no_free_text_to_screen', 'unscreened turn recorded honestly')
})
