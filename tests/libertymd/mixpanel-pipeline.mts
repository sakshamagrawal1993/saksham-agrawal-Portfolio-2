/**
 * P1-16 — Mixpanel server fan-out: name-map, supers, PHI projection,
 * fire-and-forget / soft-fail, collision discriminators.
 *
 * Never hits live Mixpanel — fetch is stubbed. Token via MIXPANEL_TOKEN only.
 */
import { LIBERTYMD_APP_VERSION } from '../../supabase/functions/libertymd-care-proxy/lib/config.ts'
import {
  LIBERTYMD_EVENT_PREFIX,
  MIXPANEL_TRACK_URL,
  flushMixpanelFanOutForTests,
  mixpanelSoftFailCounts,
  resetMixpanelSoftFailCountsForTests,
} from '../../supabase/functions/libertymd-care-proxy/lib/mixpanel.ts'
import {
  addProductEvent,
  projectMixpanelProperties,
  toMixpanelEventName,
} from '../../supabase/functions/libertymd-care-proxy/lib/telemetry.ts'
import {
  assertEquals,
  assertTrue,
  createFakeContext,
} from './support/proxy-doubles.mts'

declare const Deno: {
  test: (name: string, fn: () => unknown | Promise<unknown>) => void
  env: { set: (k: string, v: string) => void; delete: (k: string) => void }
}

const FORBIDDEN_MIXPANEL_KEYS = [
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
  'evidence_score',
  'confidence_score',
  'profile_count',
  'latency_bucket_source',
  'latency_bucket',
] as const

type TrackedCall = {
  event: string
  properties: Record<string, unknown>
}

function parseMixpanelBody(body: unknown): TrackedCall | null {
  let raw = ''
  if (typeof body === 'string') {
    raw = body
  } else if (body instanceof URLSearchParams) {
    raw = body.toString()
  } else if (body != null) {
    raw = String(body)
  }
  if (!raw) return null
  try {
    const params = new URLSearchParams(raw)
    const data = params.get('data')
    if (!data) return null
    const parsed = JSON.parse(data) as Array<{ event?: string; properties?: Record<string, unknown> }>
    const first = parsed[0]
    if (!first?.event) return null
    return { event: first.event, properties: first.properties || {} }
  } catch {
    return null
  }
}

function stubMixpanelFetch(options?: {
  reject?: boolean
  status?: number
}): { calls: TrackedCall[]; restore: () => void } {
  const original = globalThis.fetch
  const calls: TrackedCall[] = []
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input)
    if (!url.includes('api.mixpanel.com')) {
      return Promise.resolve(new Response('ok', { status: 200 }))
    }
    const parsed = parseMixpanelBody(init?.body ?? null)
    if (parsed) calls.push(parsed)
    if (options?.reject) {
      return Promise.reject(new TypeError('network down'))
    }
    return Promise.resolve(new Response(options?.status && options.status >= 400 ? 'err' : '1', {
      status: options?.status ?? 200,
    }))
  }) as typeof fetch
  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

function assertNoForbiddenKeys(props: Record<string, unknown>, label: string) {
  for (const key of FORBIDDEN_MIXPANEL_KEYS) {
    assertEquals(Object.prototype.hasOwnProperty.call(props, key), false, `${label}: forbidden ${key}`)
  }
}

function assertSupers(props: Record<string, unknown>, label: string) {
  assertEquals(props.app_surface, 'libertymd', `${label}: app_surface`)
  assertEquals(props.app_surface === 'jivi', false, `${label}: never jivi`)
  assertEquals(typeof props.is_anonymous, 'boolean', `${label}: is_anonymous`)
  assertEquals(props.locale, 'en', `${label}: locale`)
  assertEquals(props.device_class, 'unknown', `${label}: device_class`)
  assertEquals(props.app_version, LIBERTYMD_APP_VERSION, `${label}: app_version`)
  assertEquals(props.emit_origin, 'server', `${label}: emit_origin`)
  assertEquals(Object.prototype.hasOwnProperty.call(props, 'profile_count'), false, `${label}: omit profile_count`)
}

Deno.test('P1-16 AC1 · name-map remaps + default prefix', () => {
  assertEquals(toMixpanelEventName('consultation_started'), `${LIBERTYMD_EVENT_PREFIX}consult_started`)
  assertEquals(toMixpanelEventName('inference_failed'), `${LIBERTYMD_EVENT_PREFIX}turn_failed`)
  assertEquals(toMixpanelEventName('report_released_guest'), `${LIBERTYMD_EVENT_PREFIX}report_released`)
  assertEquals(toMixpanelEventName('report_saved_google'), `${LIBERTYMD_EVENT_PREFIX}report_released`)
  assertEquals(toMixpanelEventName('report_gate_reached'), `${LIBERTYMD_EVENT_PREFIX}report_gate_reached`)
  assertEquals(toMixpanelEventName('question_served'), `${LIBERTYMD_EVENT_PREFIX}question_served`)
  assertEquals(LIBERTYMD_EVENT_PREFIX, 'LibertyMd ')
})

Deno.test('P1-16 AC3 / AC7 / AC8 · projection supers + PHI strip + collisions', () => {
  const { ctx } = createFakeContext()
  const consultStarted = projectMixpanelProperties(
    'consultation_started',
    'consultation-1',
    { region: 'US', is_anonymous: true, evidence_score: 72, email: 'leak@example.com', locale: 'en' },
    ctx,
  )
  assertEquals(toMixpanelEventName('consultation_started'), 'LibertyMd consult_started')
  assertSupers(consultStarted, 'consult_started')
  assertEquals(consultStarted.consultation_id, 'consultation-1')
  assertEquals(consultStarted.evidence_bucket, '65-79')
  assertEquals(Object.prototype.hasOwnProperty.call(consultStarted, 'evidence_score'), false)
  assertEquals(Object.prototype.hasOwnProperty.call(consultStarted, 'email'), false)
  assertNoForbiddenKeys(consultStarted, 'consult_started')

  const turnFailed = projectMixpanelProperties(
    'inference_failed',
    'consultation-1',
    { stage: 'guardrail', error_class: 'timeout', outcome: 'fail_cautious' },
    ctx,
  )
  assertEquals(toMixpanelEventName('inference_failed'), 'LibertyMd turn_failed')
  assertSupers(turnFailed, 'turn_failed')
  assertEquals(turnFailed.emit_origin, 'server')
  assertEquals(turnFailed.stage, 'guardrail')
  assertNoForbiddenKeys(turnFailed, 'turn_failed')

  const turnCompleted = projectMixpanelProperties(
    'turn_completed',
    'consultation-1',
    { turn_index: 2, target_slot: 'onset', latency_bucket_source: 'client_ttft', latency_bucket: '<500' },
    ctx,
  )
  assertEquals(toMixpanelEventName('turn_completed'), 'LibertyMd turn_completed')
  assertEquals(turnCompleted.emit_origin, 'server')
  assertEquals(Object.prototype.hasOwnProperty.call(turnCompleted, 'latency_bucket_source'), false, 'no TTFT claim')
  assertEquals(Object.prototype.hasOwnProperty.call(turnCompleted, 'latency_bucket'), false, 'no TTFT bucket')

  const reportReleased = projectMixpanelProperties(
    'report_released_guest',
    'consultation-1',
    { access_status: 'guest_released' },
    ctx,
  )
  assertEquals(toMixpanelEventName('report_released_guest'), 'LibertyMd report_released')
  assertEquals(reportReleased.method, 'guest')
  assertNoForbiddenKeys(reportReleased, 'report_released')
})

Deno.test('P1-16 AC4 / AC5 · Mixpanel reject does not fail addProductEvent', async () => {
  resetMixpanelSoftFailCountsForTests()
  Deno.env.set('MIXPANEL_TOKEN', 'test-token-not-real')
  const fetchLog = stubMixpanelFetch({ reject: true })
  const { ctx } = createFakeContext()
  try {
    await addProductEvent(ctx, 'consultation_started', 'consultation-1', { region: 'US' })
    await flushMixpanelFanOutForTests()
    assertTrue(fetchLog.calls.length >= 1 || mixpanelSoftFailCounts.network >= 1, 'soft-fail path exercised')
    assertTrue(mixpanelSoftFailCounts.network >= 1, 'network soft-fail counted')
  } finally {
    fetchLog.restore()
    Deno.env.delete('MIXPANEL_TOKEN')
    resetMixpanelSoftFailCountsForTests()
  }
})

Deno.test('P1-16 AC4 · missing MIXPANEL_TOKEN is no-op soft path', async () => {
  resetMixpanelSoftFailCountsForTests()
  Deno.env.delete('MIXPANEL_TOKEN')
  const fetchLog = stubMixpanelFetch()
  const { ctx } = createFakeContext()
  try {
    await addProductEvent(ctx, 'inference_failed', 'consultation-1', {
      stage: 'interview',
      error_class: 'timeout',
    })
    await flushMixpanelFanOutForTests()
    assertEquals(fetchLog.calls.length, 0, 'no Mixpanel HTTP without token')
    assertTrue(mixpanelSoftFailCounts.missing_token >= 1, 'missing_token countable')
  } finally {
    fetchLog.restore()
    resetMixpanelSoftFailCountsForTests()
  }
})

Deno.test('P1-16 AC1 / AC2 / AC3 · happy path track payload', async () => {
  resetMixpanelSoftFailCountsForTests()
  Deno.env.set('MIXPANEL_TOKEN', 'test-token-not-real')
  const fetchLog = stubMixpanelFetch()
  const { ctx } = createFakeContext()
  try {
    await addProductEvent(ctx, 'guardrail_evaluated', 'consultation-1', {
      status: 'pass',
      risk_level: 'low',
      source: 'n8n',
      turn_index: 1,
      shadow_llm_status: 'disabled',
    })
    await flushMixpanelFanOutForTests()
    assertEquals(fetchLog.calls.length, 1, 'one track')
    const call = fetchLog.calls[0]
    assertEquals(call.event, 'LibertyMd guardrail_evaluated')
    assertEquals(call.properties.shadow_llm_status, 'disabled')
    assertSupers(call.properties, 'guardrail track')
    assertEquals(call.properties.token, 'test-token-not-real')
    assertEquals(typeof call.properties.distinct_id, 'string')
    assertTrue(String(MIXPANEL_TRACK_URL).includes('mixpanel.com'), 'track URL constant')
  } finally {
    fetchLog.restore()
    Deno.env.delete('MIXPANEL_TOKEN')
    resetMixpanelSoftFailCountsForTests()
  }
})

Deno.test('P1-16 AC1 · prefix lives in helper constant only (spot-check)', () => {
  // Action files must not hand-type the prefix; helper owns it.
  assertEquals(LIBERTYMD_EVENT_PREFIX.startsWith('LibertyMd'), true)
  assertEquals(toMixpanelEventName('report_ready').startsWith(LIBERTYMD_EVENT_PREFIX), true)
})
