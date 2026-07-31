/**
 * P1-19 — proxy landing upsert + start FK link (doubles).
 */
import {
  GUARDRAIL_WEBHOOK,
  INTERVIEW_WEBHOOK,
} from '../../supabase/functions/libertymd-care-proxy/lib/config.ts'
import { handleBootstrap } from '../../supabase/functions/libertymd-care-proxy/actions/bootstrap.ts'
import { handleStartConsultation } from '../../supabase/functions/libertymd-care-proxy/actions/start-consultation.ts'
import {
  FORBIDDEN_RAW_QUERY_PARAMS,
  sanitizeLandingAttribution,
} from '../../supabase/functions/libertymd-care-proxy/lib/landing-sessions.ts'
import {
  assertEquals,
  assertTrue,
  createFakeContext,
  okResponse,
  opsFor,
  stubFetch,
} from './support/proxy-doubles.mts'

declare const Deno: {
  test: (name: string, fn: () => unknown | Promise<unknown>) => void
  readTextFile: (path: string) => Promise<string>
}

const ANON_KEY = '00000000-0000-4000-8000-0000000000aa'
const LANDING_ID = '11111111-1111-4111-8111-111111111111'

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

function interviewPass() {
  return okResponse({
    next_question: 'When did this start?',
    options: ['Today', 'Yesterday'],
    ready_for_report: false,
    target_slot: 'onset',
    slot_updates: {},
    missing_slots: ['onset'],
    input_relevance: 'clinical',
    input_relevance_reason: 'clinical',
    source: 'n8n',
  })
}

async function readJson(response: Response) {
  return await response.json() as Record<string, unknown>
}

Deno.test('P1-19 AC2 · server sanitize drops raw q= and free-text', () => {
  const cleaned = sanitizeLandingAttribution({
    anon_session_key: ANON_KEY,
    keyword_id: 'fever and cough please',
    q: 'chest pain radiating',
    query: 'help',
    utm_campaign: 'spring-sale',
    matched_topic_slug: 'chest-pain',
  })
  assertEquals(cleaned.keyword_id, undefined, 'prose keyword dropped')
  assertEquals((cleaned as Record<string, unknown>).q, undefined, 'q dropped')
  assertEquals(cleaned.utm_campaign, 'spring-sale', 'utm kept')
  // P3-06 — unknown slug not in catalog → null both (tighten beyond charset)
  assertEquals(cleaned.matched_topic_slug, undefined, 'unknown slug nulled')
  assertEquals(cleaned.anon_session_key, ANON_KEY, 'session key kept')
  for (const banned of FORBIDDEN_RAW_QUERY_PARAMS) {
    assertEquals((cleaned as Record<string, unknown>)[banned], undefined, `${banned} dropped`)
  }
})

Deno.test('P3-06 AC2 · unknown keyword_id → null both on server sanitize', () => {
  const cleaned = sanitizeLandingAttribution({
    anon_session_key: ANON_KEY,
    keyword_id: 'kw-1',
    matched_topic_slug: 'made-up',
  })
  assertEquals(cleaned.keyword_id, undefined)
  assertEquals(cleaned.matched_topic_slug, undefined)
})

Deno.test('P3-06 AC2 · catalog keyword_id persists pair; mismatched slug overwritten', () => {
  const cleaned = sanitizeLandingAttribution({
    anon_session_key: ANON_KEY,
    keyword_id: 'kw_sore_throat',
    matched_topic_slug: 'wrong-slug',
  })
  assertEquals(cleaned.keyword_id, 'kw_sore_throat')
  assertEquals(cleaned.matched_topic_slug, 'sore-throat')
})

Deno.test('P3-06 AC2 · path-derived topic fills catalog pair', () => {
  const cleaned = sanitizeLandingAttribution({
    anon_session_key: ANON_KEY,
    landing_path: '/liberty-md/t/headache',
  })
  assertEquals(cleaned.keyword_id, 'kw_headache')
  assertEquals(cleaned.matched_topic_slug, 'headache')
})

Deno.test('P1-19 AC1 · bootstrap upserts landing via proxy (no client table writer)', async () => {
  const { ctx, ops } = createFakeContext({
    landingSession: { id: LANDING_ID, anon_session_key: ANON_KEY },
  })
  const response = await handleBootstrap(ctx, {
    action: 'bootstrap',
    anon_session_key: ANON_KEY,
    utm_campaign: 'spring',
    keyword_id: 'kw_cough',
    matched_topic_slug: 'cough',
    landing_path: '/liberty-md',
  })
  assertEquals(response.status, 200, 'bootstrap 200')
  const body = await readJson(response)
  assertEquals(body.landing_session_id, LANDING_ID, 'returns opaque id')
  const upserts = opsFor(ops, 'libertymd_landing_sessions', 'upsert')
  assertEquals(upserts.length, 1, 'one landing upsert')
  const payload = upserts[0].payload as Record<string, unknown>
  assertEquals(payload.anon_session_key, ANON_KEY, 'session key')
  assertEquals(payload.utm_campaign, 'spring', 'utm')
  assertEquals(payload.keyword_id, 'kw_cough', 'catalog keyword')
  assertEquals(payload.matched_topic_slug, 'cough', 'catalog slug')
  assertTrue(typeof payload.retention_expires_at === 'string', 'retention stub set')
  assertEquals(payload.q, undefined, 'no raw q')
})

Deno.test('P1-19 AC4 · start with attribution sets landing_session_id FK', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === INTERVIEW_WEBHOOK) return interviewPass()
    if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
    return okResponse({})
  })
  try {
    const { ctx, ops } = createFakeContext({
      landingSession: { id: LANDING_ID, anon_session_key: ANON_KEY },
    })
    const response = await handleStartConsultation(ctx, {
      action: 'start_consultation',
      message: 'I have a mild headache for two days',
      landing_session_id: LANDING_ID,
      anon_session_key: ANON_KEY,
      utm_campaign: 'spring',
    })
    assertEquals(response.status, 200, 'start 200')
    const inserts = opsFor(ops, 'libertymd_consultations', 'insert')
    assertEquals(inserts.length, 1, 'one consult insert')
    const row = (Array.isArray(inserts[0].payload) ? inserts[0].payload[0] : inserts[0].payload) as Record<string, unknown>
    assertEquals(row.landing_session_id, LANDING_ID, 'FK set')

    const events = opsFor(ops, 'libertymd_product_events', 'insert')
      .map((op) => {
        const payload = Array.isArray(op.payload) ? op.payload[0] : op.payload
        return payload as { event_name?: string; properties?: Record<string, unknown> }
      })
    const started = events.find((e) => e.event_name === 'consultation_started')
    assertTrue(started, 'consultation_started emitted')
    assertEquals(started?.properties?.landing_session_id, LANDING_ID, 'opaque id on event')
    assertEquals(started?.properties?.utm_campaign, undefined, 'no UTM on event')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P1-19 AC4 · start without attribution leaves FK null (no error)', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === INTERVIEW_WEBHOOK) return interviewPass()
    if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
    return okResponse({})
  })
  try {
    const { ctx, ops } = createFakeContext()
    const response = await handleStartConsultation(ctx, {
      action: 'start_consultation',
      message: 'I have a mild headache for two days',
    })
    assertEquals(response.status, 200, 'start 200')
    const inserts = opsFor(ops, 'libertymd_consultations', 'insert')
    const row = (Array.isArray(inserts[0].payload) ? inserts[0].payload[0] : inserts[0].payload) as Record<string, unknown>
    assertEquals(row.landing_session_id, null, 'FK null')
    assertEquals(opsFor(ops, 'libertymd_landing_sessions', 'upsert').length, 0, 'no landing upsert')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P1-19 AC4 · invalid landing_session_id falls back / null — never 500', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === INTERVIEW_WEBHOOK) return interviewPass()
    if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
    return okResponse({})
  })
  try {
    const { ctx, ops } = createFakeContext({
      landingSession: null,
    })
    const response = await handleStartConsultation(ctx, {
      action: 'start_consultation',
      message: 'I have a mild headache for two days',
      landing_session_id: '99999999-9999-4999-8999-999999999999',
    })
    assertEquals(response.status, 200, 'start 200')
    const inserts = opsFor(ops, 'libertymd_consultations', 'insert')
    const row = (Array.isArray(inserts[0].payload) ? inserts[0].payload[0] : inserts[0].payload) as Record<string, unknown>
    assertEquals(row.landing_session_id, null, 'unknown id → null FK')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P1-19 AC1 · client modules must not .from(libertymd_landing_sessions)', async () => {
  const paths = [
    'components/LibertyMD/libertymd-landing-attribution.ts',
    'components/LibertyMD/LibertyMDApp.tsx',
    'components/LibertyMD/LibertyMDChat.tsx',
  ]
  for (const path of paths) {
    const text = await Deno.readTextFile(path)
    assertEquals(
      /from\(\s*['"]libertymd_landing_sessions['"]\s*\)/.test(text),
      false,
      `${path} must not write landing table`,
    )
    assertEquals(
      /from\(\s*['"]libertymd_consultations['"]\s*\)/.test(text),
      false,
      `${path} must not write clinical tables`,
    )
  }
})
