/**
 * P0-15a — observational LLM shadow on edge_deterministic force_end.
 *
 * Imported by `n8n-breaker.mts` so it rides `--allow-env` / `--allow-net`
 * without a package.json script change (same pattern as safety-audit.mts).
 *
 * Hang wall-clock budget (AC3): force_end HTTP must return within
 * SHADOW_HANG_BUDGET_MS of an edge-only baseline — well below
 * N8N_TIMEOUT_MS.guardrail (10_000 ms). Written beside the assert: < 200 ms
 * above edge-only baseline.
 */
import { handleStartConsultation } from '../../supabase/functions/libertymd-care-proxy/actions/start-consultation.ts'
import {
  GUARDRAIL_WEBHOOK,
  N8N_TIMEOUT_MS,
} from '../../supabase/functions/libertymd-care-proxy/lib/config.ts'
import {
  n8nBreakerSnapshot,
  postJson,
  resetN8nBreakers,
} from '../../supabase/functions/libertymd-care-proxy/lib/n8n-client.ts'
import {
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

declare const Deno: {
  test: (name: string, fn: () => unknown | Promise<unknown>) => void
  env: { set: (k: string, v: string) => void; delete: (k: string) => void }
}

const ACS_MESSAGE = 'I have crushing chest pain and pain radiating to my left arm.'

/** AC3 hang budget for full start_consultation: ≪ N8N_TIMEOUT_MS.guardrail. */
const SHADOW_HANG_ACTION_BUDGET_MS = 500
/** Edge-only runGuardrail wall: < 200 ms above baseline. */
const SHADOW_HANG_EDGE_BUDGET_MS = 200

function withShadowFlagOn<T>(fn: () => Promise<T>): Promise<T> {
  Deno.env.set('LIBERTYMD_GUARDRAIL_SHADOW_LLM', 'true')
  return fn().finally(() => {
    Deno.env.delete('LIBERTYMD_GUARDRAIL_SHADOW_LLM')
  })
}

function withShadowFlagOff<T>(fn: () => Promise<T>): Promise<T> {
  Deno.env.delete('LIBERTYMD_GUARDRAIL_SHADOW_LLM')
  return fn()
}

async function flushMicrotasks(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve()
  }
}

async function settleShadow(ms = 50) {
  await flushMicrotasks()
  await new Promise((resolve) => setTimeout(resolve, ms))
  await flushMicrotasks()
}

Deno.test('P0-15a AC6 · flag off → zero shadow network on ACS force_end', async () => {
  await withShadowFlagOff(async () => {
    resetN8nBreakers()
    const fetchLog = stubFetch(() => okResponse({
      status: 'force_end',
      force_end: true,
      crisis_type: 'acs_chest_pain',
      care_setting: 'call_911',
      source: 'llm',
    }))
    try {
      const { ctx } = createFakeContext({ consultation: consultationRow() })
      const verdict = await runGuardrail(ACS_MESSAGE, [], {}, {})
      assertEquals(verdict.source, 'edge_deterministic', 'acted-on source')
      assertEquals(verdict.force_end, true, 'acted-on force_end')
      await saveSafetyEvent(ctx, consultationRow(), verdict, 1, {
        message: ACS_MESSAGE,
        history: [],
        patient: {},
      })
      await settleShadow()
      assertEquals(fetchLog.calls.length, 0, 'default-off must issue zero shadow fetches')
    } finally {
      fetchLog.restore()
      resetN8nBreakers()
    }
  })
})

Deno.test('P0-15a AC1/AC2 · flag on → shadow UPDATE with bypass flags; acted-on unchanged', async () => {
  await withShadowFlagOn(async () => {
    resetN8nBreakers()
    const fetchLog = stubFetch((url) => {
      if (url === GUARDRAIL_WEBHOOK) {
        return okResponse({
          status: 'force_end',
          force_end: true,
          crisis_type: 'acs_chest_pain',
          care_setting: 'call_911',
          message: 'LLM would also force-end — must NOT appear in acted-on columns',
          source: 'llm',
        })
      }
      return okResponse({})
    })
    try {
      const { ctx, ops } = createFakeContext({ consultation: consultationRow() })
      const verdict = await runGuardrail(ACS_MESSAGE, [], {}, {})
      assertEquals(verdict.source, 'edge_deterministic', 'acted-on source before shadow')
      assertEquals(verdict.force_end, true, 'acted-on force_end before shadow')
      assertEquals(verdict.crisis_type, 'acs_chest_pain', 'acted-on crisis_type')

      await saveSafetyEvent(ctx, consultationRow(), verdict, 1, {
        message: ACS_MESSAGE,
        history: [{ role: 'user', content: ACS_MESSAGE }],
        patient: { age: 44 },
      })
      await settleShadow(80)

      assertTrue(fetchLog.calls.length >= 1, 'shadow must call the guardrail webhook')
      const shadowBody = fetchLog.calls[0].body as Record<string, unknown>
      assertEquals(shadowBody.shadow_llm, true, 'AC2: shadow_llm bypass flag')
      assertEquals(shadowBody.skip_deterministic, true, 'AC2: skip_deterministic bypass flag')
      assertEquals(typeof shadowBody.message, 'string', 'shadow carries message for LLM')

      const inserts = opsFor(ops, 'libertymd_safety_events', 'insert')
      assertEquals(inserts.length, 1, 'one acted-on insert')
      const insertRow = inserts[0].payload as Record<string, unknown>
      assertEquals(insertRow.source, 'edge_deterministic', 'acted-on insert source')
      assertEquals(insertRow.force_end, true, 'acted-on insert force_end')
      assertEquals(insertRow.crisis_type, 'acs_chest_pain', 'acted-on insert crisis_type')
      const insertRaw = insertRow.raw_result as Record<string, unknown>
      assertEquals(insertRaw.shadow_llm, undefined, 'insert must not carry shadow yet')

      const updates = opsFor(ops, 'libertymd_safety_events', 'update')
      assertTrue(updates.length >= 1, 'shadow must UPDATE raw_result')
      const updatePayload = updates[0].payload as Record<string, unknown>
      const updatedRaw = updatePayload.raw_result as Record<string, unknown>
      const shadow = updatedRaw.shadow_llm as Record<string, unknown>
      assertTrue(shadow, 'raw_result.shadow_llm present after update')
      assertEquals(shadow.force_end, true, 'shadow force_end')
      assertEquals(shadow.status, 'force_end', 'shadow status')
      assertEquals(shadow.crisis_type, 'acs_chest_pain', 'shadow crisis_type')
      assertEquals(shadow.care_setting, 'call_911', 'shadow care_setting')
      assertEquals(shadow.outcome, 'completed', 'shadow outcome')
      assertEquals(shadow.shadow_llm_status, 'agreed_force_end', 'AC7 shadow_llm_status')
      assertEquals(shadow.message, undefined, 'PHI: no LLM message in shadow')

      // Acted-on columns on the UPDATE must not rewrite clinical authority.
      assertEquals(updatePayload.source, undefined, 'update must not rewrite source column')
      assertEquals(updatePayload.force_end, undefined, 'update must not rewrite force_end column')
      assertEquals(updatePayload.crisis_type, undefined, 'update must not rewrite crisis_type')
      assertEquals(updatePayload.status, undefined, 'update must not rewrite status')
    } finally {
      fetchLog.restore()
      resetN8nBreakers()
    }
  })
})

Deno.test('P0-15a AC4 · shadow never acts — LLM pass cannot demote edge force_end', async () => {
  await withShadowFlagOn(async () => {
    resetN8nBreakers()
    const fetchLog = stubFetch((url) => {
      if (url === GUARDRAIL_WEBHOOK) {
        return okResponse({
          status: 'pass',
          force_end: false,
          crisis_type: 'none',
          care_setting: 'home',
          message: 'LLM would pass — must not demote',
          source: 'llm',
        })
      }
      return okResponse({})
    })
    try {
      const { ctx, ops } = createFakeContext({ consultation: consultationRow() })
      const response = await handleStartConsultation(ctx, {
        action: 'start_consultation',
        message: ACS_MESSAGE,
        region: 'US',
      })
      await settleShadow(80)
      const body = await response.json() as Record<string, unknown>
      assertEquals(body.emergency, true, 'HTTP still emergency')
      const safety = body.safety as Record<string, unknown>
      assertEquals(safety.source, 'edge_deterministic', 'HTTP safety source')
      assertEquals(safety.force_end, true, 'HTTP safety force_end')
      assertEquals(safety.crisis_type, 'acs_chest_pain', 'HTTP crisis_type stays edge')
      assertTrue(!('shadow_llm' in (safety.raw as object || {})), 'HTTP safety.raw has no shadow')

      const consultUpdates = opsFor(ops, 'libertymd_consultations', 'update')
      const emergencyUpdate = consultUpdates.find((op) => {
        const p = op.payload as Record<string, unknown>
        return p.status === 'emergency_stopped'
      })
      assertTrue(emergencyUpdate, 'consult must emergency_stop')
      const safetyState = (emergencyUpdate!.payload as Record<string, unknown>).safety_state as Record<string, unknown>
      assertEquals(safetyState.source, 'edge_deterministic', 'safety_state source')
      assertEquals(safetyState.shadow_llm, undefined, 'safety_state has no shadow_llm')

      const inserts = opsFor(ops, 'libertymd_safety_events', 'insert')
      assertEquals(inserts[0].payload && (inserts[0].payload as Record<string, unknown>).source, 'edge_deterministic')
      assertEquals((inserts[0].payload as Record<string, unknown>).force_end, true)
      assertEquals((inserts[0].payload as Record<string, unknown>).crisis_type, 'acs_chest_pain')

      const updates = opsFor(ops, 'libertymd_safety_events', 'update')
      assertTrue(updates.length >= 1, 'shadow UPDATE still lands')
      const shadow = ((updates[0].payload as Record<string, unknown>).raw_result as Record<string, unknown>)
        .shadow_llm as Record<string, unknown>
      assertEquals(shadow.force_end, false, 'shadow recorded disagreement')
      assertEquals(shadow.shadow_llm_status, 'disagreed', 'AC7 disagreed status')
    } finally {
      fetchLog.restore()
      resetN8nBreakers()
    }
  })
})

Deno.test('P0-15a AC3 · hang stub cannot delay force_end or trip guardrail breaker', async () => {
  await withShadowFlagOn(async () => {
    resetN8nBreakers()
    const before = n8nBreakerSnapshot().find((s) => s.stage === 'guardrail')!
    assertEquals(before.state, 'closed', 'precondition: breaker closed')
    assertEquals(before.trips, 0, 'precondition: zero trips')

    // Hang indefinitely — never resolves. Shadow must not await this on the path.
    const hangLog = stubFetch(() => new Promise<Response>(() => {}))
    try {
      const { ctx, ops } = createFakeContext({ consultation: consultationRow() })
      const t0 = performance.now()
      const response = await handleStartConsultation(ctx, {
        action: 'start_consultation',
        message: ACS_MESSAGE,
        region: 'US',
      })
      const elapsed = performance.now() - t0
      const body = await response.json() as Record<string, unknown>

      assertEquals(body.emergency, true, 'hang must not block emergency HTTP')
      const safety = body.safety as Record<string, unknown>
      assertEquals(safety.source, 'edge_deterministic', 'hang: edge source')
      assertEquals(safety.force_end, true, 'hang: force_end')
      assertTrue(
        elapsed < SHADOW_HANG_ACTION_BUDGET_MS,
        `hang wall budget < ${SHADOW_HANG_ACTION_BUDGET_MS} ms (elapsed=${Math.round(elapsed)} ms; ≪ N8N_TIMEOUT_MS.guardrail=${N8N_TIMEOUT_MS.guardrail}; edge-only baseline budget ${SHADOW_HANG_EDGE_BUDGET_MS} ms)`,
      )

      const consultUpdates = opsFor(ops, 'libertymd_consultations', 'update')
      assertTrue(
        consultUpdates.some((op) => (op.payload as Record<string, unknown>).status === 'emergency_stopped'),
        'emergency_stopped still persisted',
      )
      const productEvents = opsFor(ops, 'libertymd_product_events', 'insert')
        .map((op) => op.payload as { event_name?: string })
        .filter((row) => row.event_name === 'emergency_stopped')
      assertEquals(productEvents.length, 1, 'emergency_stopped product event still emitted')

      const afterHang = n8nBreakerSnapshot().find((s) => s.stage === 'guardrail')!
      assertEquals(afterHang.state, 'closed', 'hang must not open guardrail breaker')
      assertEquals(afterHang.trips, before.trips, 'hang must not increment trips')
    } finally {
      hangLog.restore()
    }

    // Subsequent benign acted-on postJson must still be admitted (breaker isolation).
    const benignLog = stubFetch(() => okResponse({ status: 'pass', risk_level: 'low', force_end: false }))
    try {
      const benign = await postJson(GUARDRAIL_WEBHOOK, { message: 'mild sore throat' }, 5_000)
      assertTrue(benign, 'benign guardrail call still admitted after shadow hang')
      assertEquals(benignLog.calls.length, 1, 'benign call reached transport')
    } finally {
      benignLog.restore()
      resetN8nBreakers()
    }
  })
})

Deno.test('P0-15a AC8 · shadow_llm never on client sinks; toClientSafety strips', async () => {
  await withShadowFlagOn(async () => {
    resetN8nBreakers()
    const fetchLog = stubFetch(() => okResponse({
      status: 'force_end',
      force_end: true,
      crisis_type: 'acs_chest_pain',
      care_setting: 'call_911',
      message: 'secret llm copy',
      source: 'llm',
    }))
    try {
      const { ctx, ops } = createFakeContext({ consultation: consultationRow() })
      const response = await handleStartConsultation(ctx, {
        action: 'start_consultation',
        message: ACS_MESSAGE,
        region: 'US',
      })
      await settleShadow(80)
      const body = await response.json() as Record<string, unknown>
      const safety = body.safety as Record<string, unknown>
      assertEquals(safety.shadow_llm, undefined, 'HTTP safety has no shadow_llm')
      assertTrue(!JSON.stringify(safety).includes('shadow_llm'), 'HTTP safety JSON omits shadow_llm')
      assertTrue(!JSON.stringify(safety).includes('secret llm copy'), 'HTTP omits LLM message')

      const consultUpdates = opsFor(ops, 'libertymd_consultations', 'update')
      for (const op of consultUpdates) {
        const serialized = JSON.stringify(op.payload)
        assertTrue(!serialized.includes('shadow_llm'), 'safety_state update omits shadow_llm')
      }

      const productEvents = opsFor(ops, 'libertymd_product_events', 'insert')
      for (const op of productEvents) {
        const payload = (Array.isArray(op.payload) ? op.payload[0] : op.payload) as {
          event_name?: string
          properties?: Record<string, unknown>
        }
        assertEquals(payload.properties?.shadow_llm, undefined, 'product events omit shadow_llm object')
        // P1-16 CARE carve-out: categorical shadow_llm_status is allowed on guardrail_evaluated.
        if (payload.event_name === 'guardrail_evaluated') {
          assertEquals(payload.properties?.shadow_llm_status, 'disabled', 'sync path default disabled')
        }
      }

      const verdict = await runGuardrail(ACS_MESSAGE, [], {}, {})
      const poisoned = {
        ...verdict,
        raw: { ...verdict.raw, shadow_llm: { status: 'pass', force_end: false } },
      }
      const client = toClientSafety(poisoned)
      assertEquals(client.raw.shadow_llm, undefined, 'toClientSafety strips shadow_llm')
      assertEquals(client.match, undefined, 'toClientSafety still strips match')
    } finally {
      fetchLog.restore()
      resetN8nBreakers()
    }
  })
})

Deno.test('P0-15a AC9 · runGuardrail ACS still zero-fetch-before-return with flag on', async () => {
  await withShadowFlagOn(async () => {
    resetN8nBreakers()
    const fetchLog = stubFetch(() => okResponse({ status: 'pass' }))
    try {
      const t0 = performance.now()
      const verdict = await runGuardrail(ACS_MESSAGE, [], {}, {})
      const elapsed = performance.now() - t0
      assertEquals(fetchLog.calls.length, 0, 'acted-on path: zero transport before return')
      assertEquals(verdict.source, 'edge_deterministic')
      assertEquals(verdict.force_end, true)
      assertTrue(elapsed < SHADOW_HANG_EDGE_BUDGET_MS, `edge-only baseline wall < ${SHADOW_HANG_EDGE_BUDGET_MS} ms`)
    } finally {
      fetchLog.restore()
      resetN8nBreakers()
    }
  })
})
