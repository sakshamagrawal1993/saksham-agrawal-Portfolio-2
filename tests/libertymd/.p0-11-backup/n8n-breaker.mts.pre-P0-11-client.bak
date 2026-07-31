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
import {
  GUARDRAIL_TIMEOUT_FLOOR_MS,
  GUARDRAIL_WEBHOOK,
  INTERVIEW_WEBHOOK,
  N8N_BREAKER,
  N8N_TIMEOUT_MS,
} from '../../supabase/functions/libertymd-care-proxy/lib/config.ts'
import {
  isN8nStageAvailable,
  isN8nStageUnavailable,
  n8nBreakerSnapshot,
  n8nStageForUrl,
  postJson,
  resetN8nBreakers,
  runDiagnosis,
  runInterview,
} from '../../supabase/functions/libertymd-care-proxy/lib/n8n-client.ts'
import { runGuardrail } from '../../supabase/functions/libertymd-care-proxy/lib/safety.ts'
import {
  assertEquals,
  assertRejects,
  assertTrue,
  consultationRow,
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
  assertEquals(snapshot.length, 3, 'all three stages must be reported')
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

Deno.test('runInterview reports breaker_open, distinct from an ordinary one-off failure', async () => {
  resetN8nBreakers()
  const single = stubFetch(() => failResponse(500))
  let result
  try {
    result = await runInterview([], {}, {}, ['onset'], 'onset', 4, 'interviewing', 'consultation-1')
  } finally {
    single.restore()
  }
  assertEquals(result.source, 'fallback', 'a single failure is a plain fallback')

  await failStage(INTERVIEW_WEBHOOK, N8N_BREAKER.failureThreshold)
  const blocked = stubFetch(() => okResponse({ next_question: 'never asked' }))
  try {
    const degraded = await runInterview([], {}, {}, ['onset'], 'onset', 4, 'interviewing', 'consultation-1')
    assertEquals(degraded.source, 'breaker_open', 'an open breaker must be distinguishable from a fallback')
    assertEquals(blocked.calls.length, 0, 'no interview request may be issued')
  } finally {
    blocked.restore()
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
  const fetchLog = stubFetch(() => okResponse({ status: 'pass', risk_level: 'low' }))
  try {
    const verdict = await runGuardrail('I have crushing chest pain and pain radiating to my left arm', [], {}, {})
    assertEquals(fetchLog.calls.length, 0, 'the deterministic screen must decide before any transport')
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
