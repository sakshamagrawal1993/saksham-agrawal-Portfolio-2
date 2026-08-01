/**
 * P0-11 — timeout budgets and the per-stage circuit breaker.
 *
 * The tests that matter most here are §safety at the bottom. Everything above
 * them is ordinary state-machine coverage; those two assert the property the
 * whole ticket is constrained by, namely that an open guardrail breaker degrades
 * to *cautious*, never to "no risk", and never suppresses the deterministic
 * edge screen. They are written to fail loudly if someone later "optimises"
 * the guardrail path by short-circuiting it when the breaker is open.
 *
 * See tests/libertymd/support/proxy-doubles.mts for why these files are `.mts`.
 */
import './safety-audit.mts'
import './shadow-llm.mts'
import {
  GUARDRAIL_TIMEOUT_FLOOR_MS,
  GUARDRAIL_WEBHOOK,
  DIFFERENTIAL_WEBHOOK,
  INTERVIEW_WEBHOOK,
  N8N_BREAKER,
  N8N_TIMEOUT_MS,
} from '../../supabase/functions/libertymd-care-proxy/lib/config.ts'
import {
  isN8nStageAvailable,
  isN8nStageUnavailable,
  n8nBreakerSnapshot,
  n8nCallTarget,
  n8nStageForUrl,
  postJson,
  resetN8nBreakers,
  runDiagnosis,
  runInterview,
} from '../../supabase/functions/libertymd-care-proxy/lib/n8n-client.ts'
import { runGuardrail } from '../../supabase/functions/libertymd-care-proxy/lib/safety.ts'
import {
  classifyHoldingPayload,
  HOLDING_FALLBACK_MESSAGE,
  isRetryableCareProxyFailure,
  normalizeRetryAfterMs,
  parseHoldingFromFunctionsError,
  RETRY_AFTER_MS_DEFAULT,
  RETRY_AFTER_MS_MAX,
  statusFromFunctionsError,
} from '../../components/LibertyMD/libertymd-care-proxy-client.ts'
import {
  assertEquals,
  assertRejects,
  assertTrue,
  consultationRow,
  createFakeContext,
  failResponse,
  okResponse,
  stubFetch,
} from './support/proxy-doubles.mts'

declare const Deno: { test: (name: string, fn: () => unknown | Promise<unknown>) => void }

const stageOf = (stage: string) => n8nBreakerSnapshot().find((entry) => entry.stage === stage)!

/** Drive `count` transport failures through a stage. */
async function failStage(url: string, count: number) {
  const fetchLog = stubFetch(() => failResponse(503))
  try {
    for (let attempt = 0; attempt < count; attempt += 1) {
      await postJson(url, {}, 1_000).catch(() => undefined)
    }
  } finally {
    fetchLog.restore()
  }
}

/** Run `operation` with `Date.now` advanced by `offsetMs`. */
async function atClockOffset<T>(offsetMs: number, operation: () => Promise<T> | T): Promise<T> {
  const realNow = Date.now
  Date.now = () => realNow.call(Date) + offsetMs
  try {
    return await operation()
  } finally {
    Date.now = realNow
  }
}

// ------------------------------------------------------------------- AC1 / AC5

Deno.test('P0-11 AC1: every stage has an explicit timeout budget, and turn 1 is not the tightest', () => {
  for (const stage of ['guardrail', 'interview', 'diagnosis'] as const) {
    assertTrue(Number.isInteger(N8N_TIMEOUT_MS[stage]) && N8N_TIMEOUT_MS[stage] > 0, `${stage} budget must be a positive integer`)
  }
  // P0-14e AC1 carried forward: one guardrail number for every turn, so no turn
  // can end up with a tighter safety budget than another.
  assertEquals(N8N_TIMEOUT_MS.guardrail, 10_000, 'guardrail budget')
  assertTrue(
    N8N_TIMEOUT_MS.guardrail >= GUARDRAIL_TIMEOUT_FLOOR_MS,
    'guardrail budget must never fall below the safety floor',
  )
})

Deno.test('P0-11 AC5: breaker thresholds are config, not literals', () => {
  assertTrue(N8N_BREAKER.failureThreshold >= 2, 'threshold must be at least 2')
  assertTrue(N8N_BREAKER.rollingWindowMs > 0, 'rolling window must be positive')
  assertTrue(N8N_BREAKER.cooldownMs > 0, 'cooldown must be positive')
})

Deno.test('stage is derived from the webhook URL, and unknown URLs are not breaker-managed', () => {
  assertEquals(n8nStageForUrl(GUARDRAIL_WEBHOOK), 'guardrail', 'guardrail URL')
  assertEquals(n8nStageForUrl(INTERVIEW_WEBHOOK), 'interview', 'interview URL')
  assertEquals(n8nStageForUrl('https://example.com/whatever'), null, 'unknown URL')
})

// ------------------------------------------------------------------- AC3 / AC4

Deno.test('P0-11 AC3: the breaker trips after the configured number of failures', async () => {
  resetN8nBreakers()
  await failStage(INTERVIEW_WEBHOOK, N8N_BREAKER.failureThreshold - 1)
  assertEquals(stageOf('interview').state, 'closed', 'must stay closed below the threshold')

  await failStage(INTERVIEW_WEBHOOK, 1)
  assertEquals(stageOf('interview').state, 'open', 'must trip at the threshold')
  assertTrue(stageOf('interview').retry_after_ms > 0, 'an open breaker must advertise a retry window')
  resetN8nBreakers()
})

Deno.test('P0-11 AC3: an open breaker rejects without spending a timeout budget or a request', async () => {
  resetN8nBreakers()
  await failStage(INTERVIEW_WEBHOOK, N8N_BREAKER.failureThreshold)

  const fetchLog = stubFetch(() => okResponse({ next_question: 'should never be asked' }))
  try {
    const startedAt = Date.now()
    await assertRejects(
      () => postJson(INTERVIEW_WEBHOOK, {}, 25_000),
      (error) => isN8nStageUnavailable(error),
      'an open breaker must reject the call',
    )
    assertEquals(fetchLog.calls.length, 0, 'no request may be issued while the breaker is open')
    assertTrue(Date.now() - startedAt < 1_000, 'rejection must be immediate, not budget-length')
  } finally {
    fetchLog.restore()
    resetN8nBreakers()
  }
})

Deno.test('breakers are per stage: one failing workflow does not disable the others', async () => {
  resetN8nBreakers()
  await failStage(INTERVIEW_WEBHOOK, N8N_BREAKER.failureThreshold)
  assertEquals(stageOf('interview').state, 'open', 'interview trips')
  assertEquals(stageOf('guardrail').state, 'closed', 'guardrail is untouched')
  assertEquals(stageOf('diagnosis').state, 'closed', 'diagnosis is untouched')
  assertTrue(isN8nStageAvailable('guardrail'), 'guardrail stays available')
  resetN8nBreakers()
})

Deno.test('a success clears the rolling failure count, so failures must be consecutive to trip', async () => {
  resetN8nBreakers()
  await failStage(INTERVIEW_WEBHOOK, N8N_BREAKER.failureThreshold - 1)

  const fetchLog = stubFetch(() => okResponse({ next_question: 'ok' }))
  try {
    await postJson(INTERVIEW_WEBHOOK, {}, 1_000)
  } finally {
    fetchLog.restore()
  }
  assertEquals(stageOf('interview').recent_failures, 0, 'a success must clear the counter')

  await failStage(INTERVIEW_WEBHOOK, N8N_BREAKER.failureThreshold - 1)
  assertEquals(stageOf('interview').state, 'closed', 'interleaved successes must prevent a trip')
  resetN8nBreakers()
})

Deno.test('failures outside the rolling window are pruned rather than accumulated forever', async () => {
  resetN8nBreakers()
  await failStage(INTERVIEW_WEBHOOK, N8N_BREAKER.failureThreshold - 1)
  await atClockOffset(N8N_BREAKER.rollingWindowMs + 1_000, () => failStage(INTERVIEW_WEBHOOK, 1))
  assertEquals(stageOf('interview').state, 'closed', 'stale failures must not count towards a trip')
  resetN8nBreakers()
})

Deno.test('P0-11 AC4: cooldown expiry admits exactly one half-open probe', async () => {
  resetN8nBreakers()
  await failStage(INTERVIEW_WEBHOOK, N8N_BREAKER.failureThreshold)

  await atClockOffset(N8N_BREAKER.cooldownMs + 1, async () => {
    // A probe that never settles, so the second caller arrives while it is in flight.
    let releaseProbe: (() => void) | undefined
    const fetchLog = stubFetch(() => new Promise<Response>((resolve) => {
      releaseProbe = () => resolve(okResponse({ next_question: 'recovered' }))
    }))
    try {
      const probe = postJson(INTERVIEW_WEBHOOK, {}, 5_000)
      await assertRejects(
        () => postJson(INTERVIEW_WEBHOOK, {}, 5_000),
        (error) => isN8nStageUnavailable(error),
        'a second caller must be rejected while the probe is in flight',
      )
      assertEquals(fetchLog.calls.length, 1, 'a recovering stage must receive exactly one probe')
      if (releaseProbe) releaseProbe()
      await probe
    } finally {
      fetchLog.restore()
    }
  })

  assertEquals(stageOf('interview').state, 'closed', 'a successful probe must auto-recover the breaker')
  assertEquals(stageOf('interview').recent_failures, 0, 'recovery must clear the failure count')
  resetN8nBreakers()
})

Deno.test('P0-11 AC4: a failed probe re-opens the breaker with a fresh cooldown', async () => {
  resetN8nBreakers()
  await failStage(INTERVIEW_WEBHOOK, N8N_BREAKER.failureThreshold)

  await atClockOffset(N8N_BREAKER.cooldownMs + 1, async () => {
    await failStage(INTERVIEW_WEBHOOK, 1)
    assertEquals(stageOf('interview').state, 'open', 'a failed probe must re-open, not half-close')
    assertTrue(stageOf('interview').retry_after_ms > 0, 'the cooldown must restart')
  })
  resetN8nBreakers()
})

Deno.test('P0-11 AC4: breaker state is observable and carries no PHI', async () => {
  resetN8nBreakers()
  await failStage(INTERVIEW_WEBHOOK, N8N_BREAKER.failureThreshold)
  const snapshot = n8nBreakerSnapshot()
  // P5-DDX added a fourth stage: `differential`. Its own breaker matters —
  // a differential outage must not open the guardrail or interview stages,
  // which is asserted separately below.
  assertEquals(snapshot.length, 4, 'all four stages must be reported')
  const keys = Object.keys(snapshot[0]).sort().join(',')
  assertEquals(
    keys,
    'failure_threshold,recent_failures,retry_after_ms,stage,state,trips',
    'snapshot shape — counts and durations only, never message content',
  )
  assertEquals(stageOf('interview').trips, 1, 'trips must be counted for observability')
  resetN8nBreakers()
})

// -------------------------------------------------- callers see a typed outage

Deno.test('runInterview reports unavailable on transport failure, breaker_open when breaker is open', async () => {
  resetN8nBreakers()
  const single = stubFetch(() => failResponse(500))
  let result
  try {
    result = await runInterview([], {}, {}, ['onset'], 'onset', 4, 'interviewing', 'consultation-1')
  } finally {
    single.restore()
  }
  assertEquals(result.source, 'unavailable', 'a single transport failure holds, never fabricates clinical clothing')
  assertEquals(result.next_question, '', 'holding placeholders must not carry a clinical question')

  await failStage(INTERVIEW_WEBHOOK, N8N_BREAKER.failureThreshold)
  const blocked = stubFetch(() => okResponse({ next_question: 'never asked' }))
  try {
    const degraded = await runInterview([], {}, {}, ['onset'], 'onset', 4, 'interviewing', 'consultation-1')
    assertEquals(degraded.source, 'breaker_open', 'an open breaker must be distinguishable from transport unavailable')
    assertEquals(blocked.calls.length, 0, 'no interview request may be issued')
  } finally {
    blocked.restore()
    resetN8nBreakers()
  }
})

Deno.test('P0-08 AC3: empty interview HTTP 200 holds as unavailable, never fabricates onset questionnaire', async () => {
  resetN8nBreakers()
  const empty = stubFetch(() => okResponse({}))
  try {
    const result = await runInterview([], {}, {}, ['onset'], 'onset', 4, 'interviewing', 'consultation-1')
    assertEquals(result.source, 'unavailable')
    assertEquals(result.next_question, '')
    assertEquals(result.target_slot, 'none')
    assertEquals(stageOf('interview').recent_failures, 1, 'malformed 200 must revoke breaker success')
  } finally {
    empty.restore()
    resetN8nBreakers()
  }
})

Deno.test('P0-08 AC3: empty guardrail HTTP 200 is fail-cautious technical, never pass', async () => {
  resetN8nBreakers()
  const empty = stubFetch(() => okResponse({}))
  try {
    const result = await runGuardrail('mild sore throat for two days', [], {}, {})
    assertEquals(result.source, 'error_fail_cautious')
    assertEquals(result.severity, 'technical')
    assertEquals(result.status, 'high_risk_continue')
    assertEquals(result.raw.failure, 'malformed_payload')
    assertTrue(!/No emergency detected/i.test(result.message), 'must not wear clinical clothing')
    assertEquals(stageOf('guardrail').recent_failures, 1, 'malformed 200 must revoke breaker success')
  } finally {
    empty.restore()
    resetN8nBreakers()
  }
})

Deno.test('P0-08 AC3: schema-shaped interview with question keeps source n8n', async () => {
  resetN8nBreakers()
  const shaped = stubFetch(() => okResponse({
    next_question: 'Where is the pain worst?',
    options: ['Chest', 'Arm', 'Back', 'Neck'],
    ready_for_report: false,
    target_slot: 'location',
    slot_updates: {},
    missing_slots: ['location'],
    input_relevance: 'clinical',
  }))
  try {
    const result = await runInterview([], {}, {}, ['location'], 'location', 4, 'interviewing', 'consultation-1')
    assertEquals(result.source, 'n8n')
    assertEquals(result.next_question, 'Where is the pain worst?')
    assertEquals(stageOf('interview').state, 'closed')
  } finally {
    shaped.restore()
    resetN8nBreakers()
  }
})

Deno.test('runDiagnosis separates "withheld a report" from "never got to ask"', async () => {
  resetN8nBreakers()
  const withheld = stubFetch(() => okResponse({ valid_report: false, differential_diagnosis: [] }))
  try {
    const result = await runDiagnosis([], {}, consultationRow(), {})
    assertEquals(result.valid, false, 'an empty differential is not valid')
    assertEquals(result.unavailable, false, 'the workflow answered, so it was not unavailable')
  } finally {
    withheld.restore()
  }

  const broken = stubFetch(() => failResponse(500))
  try {
    const result = await runDiagnosis([], {}, consultationRow(), {})
    assertEquals(result.unavailable, true, 'a transport failure must be flagged as unavailable')
  } finally {
    broken.restore()
    resetN8nBreakers()
  }
})

// -------------------------------------------------------------------- §safety
// The guardrail fail-safe is a safety decision, not a reliability one.
// P0-11 AC2 + the P0-14 dependency.

Deno.test('§safety P0-11 AC2: an open guardrail breaker does NOT suppress the deterministic screen', async () => {
  resetN8nBreakers()
  await failStage(GUARDRAIL_WEBHOOK, N8N_BREAKER.failureThreshold)
  assertEquals(stageOf('guardrail').state, 'open', 'precondition: guardrail breaker is open')

  // A fetch that would report "no emergency" if it were ever consulted. It must
  // not be, and the verdict must still be a force-end.
  // P0-15a: shadow (when flag on) is scheduled from saveSafetyEvent, not from
  // runGuardrail — so acted-on path still requires zero fetch before return.
  const fetchLog = stubFetch(() => okResponse({ status: 'pass', risk_level: 'low' }))
  try {
    const verdict = await runGuardrail('I have crushing chest pain and pain radiating to my left arm', [], {}, {})
    assertEquals(fetchLog.calls.length, 0, 'acted-on path: zero transport required before return')
    assertEquals(verdict.force_end, true, 'a textbook ACS presentation must force-end with n8n unreachable')
    assertEquals(verdict.status, 'force_end', 'status must be force_end')
    assertEquals(verdict.is_emergency, true, 'must be flagged as an emergency')
    assertEquals(verdict.source, 'edge_deterministic', 'the edge screen is the source')
    assertEquals(verdict.risk_level, 'emergency', 'risk level must be emergency')
    assertEquals(verdict.care_setting, 'call_911', 'care setting must be emergency services')
  } finally {
    fetchLog.restore()
    resetN8nBreakers()
  }
})

Deno.test('§safety P0-11 AC2: an open guardrail breaker fails CAUTIOUS, never to "no risk"', async () => {
  resetN8nBreakers()
  await failStage(GUARDRAIL_WEBHOOK, N8N_BREAKER.failureThreshold)

  const fetchLog = stubFetch(() => okResponse({ status: 'pass', risk_level: 'low' }))
  try {
    // A message the deterministic screen does not match, so the n8n leg is the
    // only thing that could have produced a verdict — and it is unavailable.
    const verdict = await runGuardrail('I have had a mild sore throat since Tuesday', [], {}, {})
    assertEquals(fetchLog.calls.length, 0, 'no request may be issued while the breaker is open')
    assertEquals(verdict.status, 'high_risk_continue', 'an unavailable guardrail must fail cautious')
    assertEquals(verdict.source, 'error_fail_cautious', 'the fail-cautious path must be attributable')
    assertEquals(verdict.crisis_type, 'guardrail_unavailable', 'the reason must be recorded, not hidden')
    // The three ways a "reliability improvement" could silently downgrade safety:
    assertTrue(verdict.status !== 'pass', 'must never downgrade to a pass')
    assertTrue(verdict.risk_level !== 'low', 'must never downgrade to low risk')
    assertTrue(
      !['n8n', 'no_free_text_to_screen'].includes(verdict.source),
      'must never be recorded as though a screen had run',
    )
  } finally {
    fetchLog.restore()
    resetN8nBreakers()
  }
})

Deno.test('§safety the guardrail is never skipped because of another stage being down', async () => {
  resetN8nBreakers()
  await failStage(INTERVIEW_WEBHOOK, N8N_BREAKER.failureThreshold)
  await failStage(GUARDRAIL_WEBHOOK, N8N_BREAKER.failureThreshold)

  const fetchLog = stubFetch(() => failResponse(503))
  try {
    for (const message of [
      'I cannot breathe and my lips are turning blue',
      'the worst headache of my life started ten minutes ago',
      'my tongue swelling started right after the injection',
    ]) {
      const verdict = await runGuardrail(message, [], {}, {})
      assertEquals(verdict.force_end, true, `must still force-end with every breaker open: ${message.slice(0, 24)}`)
      assertEquals(verdict.source, 'edge_deterministic', 'decided in-process, no transport')
    }
    assertEquals(fetchLog.calls.length, 0, 'a total n8n outage must not cost a single emergency detection')
  } finally {
    fetchLog.restore()
    resetN8nBreakers()
  }
})

Deno.test('§safety negated phrasings still do not fire with every breaker open', async () => {
  resetN8nBreakers()
  await failStage(GUARDRAIL_WEBHOOK, N8N_BREAKER.failureThreshold)
  const fetchLog = stubFetch(() => failResponse(503))
  try {
    for (const message of ['I have no chest pain at all', 'my father had chest pain last year']) {
      const verdict = await runGuardrail(message, [], {}, {})
      assertEquals(verdict.force_end, false, `must not force-end on a negated phrasing: ${message}`)
      // Still cautious rather than a pass, because nothing actually screened it.
      assertEquals(verdict.status, 'high_risk_continue', 'unscreened must remain cautious')
    }
  } finally {
    fetchLog.restore()
    resetN8nBreakers()
  }
})

// -------------------------------------------- P0-11 client holding contract
// Remaining client half: parse / classify / retry exemption / cooldown bounds.
// React wiring is proven by source query in tickets/P0-11/04-implementation.md.

const LANDED_HOLDING_BODY = {
  holding: true,
  severity: 'technical',
  retryable: true,
  retry_after_ms: 45_000,
  next_question: null,
  message: HOLDING_FALLBACK_MESSAGE,
}

function functionsHttpError(status: number, body: unknown) {
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  }
}

Deno.test('P0-11 client AC1: holding payload survives FunctionsHttpError wrapper', async () => {
  const parsed = await parseHoldingFromFunctionsError(functionsHttpError(503, LANDED_HOLDING_BODY))
  assertTrue(parsed !== null, 'recognized holding must parse')
  assertEquals(parsed!.holding, true, 'holding flag')
  assertEquals(parsed!.severity, 'technical', 'severity')
  assertEquals(parsed!.message, HOLDING_FALLBACK_MESSAGE, 'calm message')
  assertEquals(parsed!.retry_after_ms, 45_000, 'retry_after_ms')
})

Deno.test('P0-11 client AC1: empty message still holds with landed calm fallback', () => {
  const empty = classifyHoldingPayload(503, { holding: true, severity: 'technical', message: '', retry_after_ms: 1_000 })
  assertTrue(empty !== null, 'empty message must still classify as holding')
  assertEquals(empty!.message, HOLDING_FALLBACK_MESSAGE, 'fallback copy')

  const missing = classifyHoldingPayload(503, { holding: true, severity: 'technical', retry_after_ms: 1_000 })
  assertTrue(missing !== null, 'missing message must still classify as holding')
  assertEquals(missing!.message, HOLDING_FALLBACK_MESSAGE, 'fallback copy')
})

Deno.test('P0-11 client AC1: fail closed when discriminators are missing', async () => {
  const cases: Array<{ label: string; status: number; body: unknown }> = [
    { label: 'non-503', status: 500, body: LANDED_HOLDING_BODY },
    { label: 'holding false', status: 503, body: { ...LANDED_HOLDING_BODY, holding: false } },
    { label: 'holding absent', status: 503, body: { severity: 'technical', message: 'x' } },
    { label: 'wrong severity', status: 503, body: { ...LANDED_HOLDING_BODY, severity: 'caution' } },
    { label: 'malformed body', status: 503, body: 'not-json-object' },
    { label: 'null body', status: 503, body: null },
  ]
  for (const entry of cases) {
    assertEquals(
      classifyHoldingPayload(entry.status, entry.body),
      null,
      `must fail closed: ${entry.label}`,
    )
  }

  const unreadable = {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: {
      status: 503,
      json: async () => {
        throw new Error('body already consumed')
      },
    },
  }
  assertEquals(await parseHoldingFromFunctionsError(unreadable), null, 'unreadable body fails closed')
  assertEquals(await parseHoldingFromFunctionsError(new Error('network')), null, 'plain error fails closed')
})

Deno.test('P0-11 client AC2: recognized holding is never retryable; ordinary 5xx still is', async () => {
  const holdingError = functionsHttpError(503, LANDED_HOLDING_BODY)
  const holding = await parseHoldingFromFunctionsError(holdingError)
  assertTrue(holding !== null, 'precondition: holding recognized')
  assertEquals(
    isRetryableCareProxyFailure(holdingError, holding),
    false,
    'holding 503 must bypass the ordinary >=500 retry policy',
  )

  const table: Array<{ label: string; error: unknown; holding: typeof holding; expectRetry: boolean }> = [
    { label: 'holding 503', error: holdingError, holding, expectRetry: false },
    { label: 'plain 503 non-holding', error: { context: { status: 503 } }, holding: null, expectRetry: true },
    { label: '500', error: { context: { status: 500 } }, holding: null, expectRetry: true },
    { label: '408', error: { context: { status: 408 } }, holding: null, expectRetry: true },
    { label: '429', error: { context: { status: 429 } }, holding: null, expectRetry: true },
    { label: '409', error: { context: { status: 409 } }, holding: null, expectRetry: false },
    { label: '403', error: { context: { status: 403 } }, holding: null, expectRetry: false },
    { label: 'no status (network)', error: new Error('fetch failed'), holding: null, expectRetry: true },
  ]
  for (const entry of table) {
    assertEquals(
      isRetryableCareProxyFailure(entry.error, entry.holding),
      entry.expectRetry,
      `retryability: ${entry.label}`,
    )
  }

  // retryable:true on the body alone must not force a retry classification.
  const spoof = classifyHoldingPayload(503, { ...LANDED_HOLDING_BODY, retryable: true })
  assertTrue(spoof !== null, 'holding still recognized')
  assertEquals(
    isRetryableCareProxyFailure(functionsHttpError(503, { ...LANDED_HOLDING_BODY, retryable: true }), spoof),
    false,
    'server retryable:true is not an auto-retry signal',
  )
})

Deno.test('P0-11 client AC3: selected calm copy never equals Supabase FunctionsHttpError text', () => {
  const noise = 'Edge Function returned a non-2xx status code'
  const withMessage = classifyHoldingPayload(503, {
    holding: true,
    severity: 'technical',
    message: HOLDING_FALLBACK_MESSAGE,
    retry_after_ms: 0,
  })
  const emptyMessage = classifyHoldingPayload(503, {
    holding: true,
    severity: 'technical',
    message: '   ',
    retry_after_ms: 0,
  })
  assertTrue(withMessage !== null && emptyMessage !== null, 'both must classify')
  assertTrue(withMessage!.message !== noise, 'server message must not be FunctionsHttpError text')
  assertEquals(emptyMessage!.message, HOLDING_FALLBACK_MESSAGE, 'fallback is calm landed copy')
  assertTrue(!HOLDING_FALLBACK_MESSAGE.toLowerCase().includes('restate'), 'no restate copy')
  assertTrue(!HOLDING_FALLBACK_MESSAGE.toLowerCase().includes('edge function'), 'no internal Functions string')
})

Deno.test('P0-11 client AC4: normalizeRetryAfterMs bounds (Q1)', () => {
  const cases: Array<{ raw: unknown; expected: number; label: string }> = [
    { raw: undefined, expected: RETRY_AFTER_MS_DEFAULT, label: 'undefined' },
    { raw: null, expected: RETRY_AFTER_MS_DEFAULT, label: 'null' },
    { raw: '60000', expected: RETRY_AFTER_MS_DEFAULT, label: 'string' },
    { raw: Number.NaN, expected: RETRY_AFTER_MS_DEFAULT, label: 'NaN' },
    { raw: Number.POSITIVE_INFINITY, expected: RETRY_AFTER_MS_DEFAULT, label: 'Infinity' },
    { raw: -1, expected: RETRY_AFTER_MS_DEFAULT, label: 'negative' },
    { raw: 0, expected: 0, label: 'finite 0 unlocks immediately' },
    { raw: 1, expected: 1, label: 'small positive' },
    { raw: 60_000, expected: 60_000, label: 'default cooldown' },
    { raw: RETRY_AFTER_MS_MAX, expected: RETRY_AFTER_MS_MAX, label: 'at max' },
    { raw: RETRY_AFTER_MS_MAX + 1, expected: RETRY_AFTER_MS_MAX, label: 'above max clamps' },
  ]
  for (const entry of cases) {
    assertEquals(normalizeRetryAfterMs(entry.raw), entry.expected, entry.label)
  }
})

Deno.test('P0-11 client AC5: holding branch restores draft contract without assistant rendering', () => {
  // Pure-contract: classification never invents an assistant transcript payload.
  const holding = classifyHoldingPayload(503, LANDED_HOLDING_BODY)
  assertTrue(holding !== null, 'holding recognized')
  assertEquals((holding as { next_question?: unknown }).next_question, undefined, 'classifier does not carry next_question')
  assertTrue(typeof holding!.message === 'string' && holding!.message.length > 0, 'technical notice copy present')
  assertTrue(!/restate|type (it|that) again|enter your symptom again/i.test(holding!.message), 'no restate ask')
  assertEquals(statusFromFunctionsError(functionsHttpError(503, LANDED_HOLDING_BODY)), 503, 'status readable from wrapper')
})

// -------------------------------------------------------------- P0-07 AC3 / D1

const PHI_LOG_KEYS = new Set(['message', 'history', 'slots', 'filled_slots', 'body', 'patient', 'content'])

function spyConsoleLog(): { lines: Array<{ label: string; payload: Record<string, unknown> }>; restore: () => void } {
  const lines: Array<{ label: string; payload: Record<string, unknown> }> = []
  const original = console.log
  console.log = (...args: unknown[]) => {
    const label = typeof args[0] === 'string' ? args[0] : ''
    const payload = args[1] && typeof args[1] === 'object' && !Array.isArray(args[1])
      ? args[1] as Record<string, unknown>
      : {}
    if (label === 'LibertyMD n8n call') lines.push({ label, payload })
  }
  return { lines, restore: () => { console.log = original } }
}

function headerMap(init?: RequestInit): Record<string, string> {
  const raw = init?.headers
  if (!raw) return {}
  if (raw instanceof Headers) {
    const out: Record<string, string> = {}
    raw.forEach((value, key) => { out[key.toLowerCase()] = value })
    return out
  }
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.map(([k, v]) => [String(k).toLowerCase(), String(v)]))
  }
  return Object.fromEntries(
    Object.entries(raw as Record<string, string>).map(([k, v]) => [k.toLowerCase(), String(v)]),
  )
}

Deno.test('P0-07 AC3: postJson success logs PHI-free correlation, target, status, duration', async () => {
  resetN8nBreakers()
  const correlationId = '11111111-2222-4333-8444-555555555555'
  const logs = spyConsoleLog()
  const original = globalThis.fetch
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const headers = headerMap(init)
    assertEquals(headers['x-libertymd-correlation-id'], correlationId, 'D1 header on fetch')
    // Body must not be mutated with the correlation id.
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    assertTrue(!('client_message_id' in body) && !('correlation_id' in body), 'no n8n body mutation')
    return Promise.resolve(okResponse({ next_question: 'Where is the pain?' }))
  }) as typeof fetch
  try {
    await postJson(INTERVIEW_WEBHOOK, { turn_count: 2 }, 1_000, undefined, { correlationId })
    assertEquals(logs.lines.length, 1, 'exactly one structured call log')
    const payload = logs.lines[0].payload
    assertEquals(payload.correlation_id, correlationId, 'correlation_id')
    assertEquals(payload.target, 'interview', 'target is stage label')
    assertEquals(payload.status, 'ok', 'status ok')
    assertTrue(typeof payload.duration_ms === 'number' && (payload.duration_ms as number) >= 0, 'duration_ms')
    assertTrue(typeof payload.payload_bytes === 'number' && (payload.payload_bytes as number) > 0, 'payload_bytes')
    for (const key of Object.keys(payload)) {
      assertTrue(!PHI_LOG_KEYS.has(key), `must not log PHI field: ${key}`)
    }
  } finally {
    globalThis.fetch = original
    logs.restore()
    resetN8nBreakers()
  }
})

Deno.test('P0-07 AC3: http_N / timeout / breaker_open outcomes are logged', async () => {
  resetN8nBreakers()
  const logs = spyConsoleLog()

  const httpFetch = stubFetch(() => failResponse(503))
  try {
    await postJson(INTERVIEW_WEBHOOK, {}, 1_000, undefined, { correlationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }).catch(() => undefined)
  } finally {
    httpFetch.restore()
  }
  const httpLine = logs.lines.find((line) => line.payload.status === 'http_503')
  assertTrue(httpLine !== undefined, 'http_503 status logged')
  assertEquals(httpLine!.payload.correlation_id, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')

  logs.lines.length = 0
  const abortFetch = stubFetch(() => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    throw err
  })
  try {
    await postJson(INTERVIEW_WEBHOOK, {}, 1_000, undefined, { correlationId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff' }).catch(() => undefined)
  } finally {
    abortFetch.restore()
  }
  const timeoutLine = logs.lines.find((line) => line.payload.status === 'timeout')
  assertTrue(timeoutLine !== undefined, 'timeout status logged')

  logs.lines.length = 0
  await failStage(INTERVIEW_WEBHOOK, N8N_BREAKER.failureThreshold)
  logs.lines.length = 0
  try {
    await postJson(INTERVIEW_WEBHOOK, {}, 25_000, undefined, { correlationId: 'cccccccc-dddd-4eee-8fff-000000000000' }).catch(() => undefined)
  } finally {
    resetN8nBreakers()
  }
  const breakerLine = logs.lines.find((line) => line.payload.status === 'breaker_open')
  assertTrue(breakerLine !== undefined, 'breaker_open logged on reject')
  assertEquals(breakerLine!.payload.target, 'interview')
  assertTrue((breakerLine!.payload.duration_ms as number) < 1_000, 'breaker reject is near-zero duration')
  logs.restore()
})

Deno.test('P0-07 AC3: shadow path logs guardrail_shadow without tripping breaker', async () => {
  resetN8nBreakers()
  const logs = spyConsoleLog()
  const fetchLog = stubFetch(() => okResponse({ status: 'pass', risk_level: 'low' }))
  try {
    await postJson(
      GUARDRAIL_WEBHOOK,
      { shadow_llm: true, skip_deterministic: true },
      1_000,
      null,
      { correlationId: 'dddddddd-eeee-4fff-8000-111111111111', shadowLlm: true },
    )
    assertEquals(n8nCallTarget(GUARDRAIL_WEBHOOK, null, { shadowLlm: true }), 'guardrail_shadow')
    const line = logs.lines.find((entry) => entry.payload.target === 'guardrail_shadow')
    assertTrue(line !== undefined, 'shadow target logged')
    assertEquals(line!.payload.shadow_llm, true, 'shadow_llm flag')
    assertEquals(line!.payload.status, 'ok')
    assertEquals(stageOf('guardrail').state, 'closed', 'shadow must not trip guardrail breaker')
    assertEquals(stageOf('guardrail').recent_failures, 0, 'shadow failures must not accumulate on stage breaker')
  } finally {
    fetchLog.restore()
    logs.restore()
    resetN8nBreakers()
  }
})

Deno.test('P0-07 D1: holding / failure JSON may echo client_message_id without breaking classifier', () => {
  // Q2: client holding parser ignores unknown fields; echo must not break recognition.
  const withEcho = classifyHoldingPayload(503, {
    ...LANDED_HOLDING_BODY,
    client_message_id: 'eeeeeeee-ffff-4111-8222-333333333333',
  })
  assertTrue(withEcho !== null, 'holding still recognized with client_message_id echo')
  assertEquals(withEcho!.severity, 'technical')
  assertEquals(withEcho!.holding, true)
})

Deno.test('P5-DDX: a differential outage does not open guardrail or interview', async () => {
  // The differential is optional; the guardrail and interview are not. Its
  // breaker is separate precisely so a flaky optional stage can never degrade
  // the two stages a consult cannot proceed without.
  resetN8nBreakers()
  await failStage(DIFFERENTIAL_WEBHOOK, N8N_BREAKER.failureThreshold)
  const snapshot = n8nBreakerSnapshot()
  const byStage = Object.fromEntries(snapshot.map((row) => [row.stage, row.state]))
  assertEquals(byStage.differential, 'open', 'differential breaker opens on its own failures')
  assertEquals(byStage.guardrail, 'closed', 'guardrail unaffected')
  assertEquals(byStage.interview, 'closed', 'interview unaffected')
})
