/**
 * P1-03 — profile-aware demographics skip / picker-first.
 *
 * Asserts: sole complete+current skips; multi without patient_id rejects;
 * explicit pick binds snapshot; partial gates; non-current consent gates with
 * prefill; skip_reaffirm ledger + consent_recorded; profile_selected on pick;
 * no demographics_saved on pure skip.
 *
 * Run focused: `deno test --no-config --no-check --allow-env tests/libertymd/demographics-skip.mts`
 * Wired into `test:libertymd:ci` via `test:libertymd:demographics-skip`.
 */
import {
  DIAGNOSIS_WEBHOOK,
  GUARDRAIL_WEBHOOK,
  INTERVIEW_WEBHOOK,
  CONSENT_VERSION,
} from '../../supabase/functions/libertymd-care-proxy/lib/config.ts'
import { handleBootstrap } from '../../supabase/functions/libertymd-care-proxy/actions/bootstrap.ts'
import { handleStartConsultation } from '../../supabase/functions/libertymd-care-proxy/actions/start-consultation.ts'
import {
  assertEquals,
  assertTrue,
  createFakeContext,
  okResponse,
  opsFor,
  stubFetch,
} from './support/proxy-doubles.mts'

declare const Deno: { test: (name: string, fn: () => unknown | Promise<unknown>) => void }

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
    risk_level: 'low',
    crisis_type: 'none',
    force_end: false,
    is_emergency: false,
    care_setting: 'telehealth',
    message: '',
    red_flags: [],
    source: 'n8n',
  })
}

function stubInference() {
  return stubFetch((url) => {
    if (url.includes(GUARDRAIL_WEBHOOK) || url.includes('guardrail')) return guardrailPass()
    if (url.includes(INTERVIEW_WEBHOOK) || url.includes('interview')) return interviewPass()
    if (url.includes(DIAGNOSIS_WEBHOOK) || url.includes('diagnosis')) {
      return okResponse({ differentials: [], confidence: 0 })
    }
    return okResponse({})
  })
}

function productEvents(ops: ReturnType<typeof createFakeContext>['ops']) {
  return opsFor(ops, 'libertymd_product_events', 'insert').map((op) => {
    const payload = Array.isArray(op.payload) ? op.payload[0] : op.payload
    return payload as { event_name?: string; properties?: Record<string, unknown> }
  })
}

function consentInserts(ops: ReturnType<typeof createFakeContext>['ops']) {
  return opsFor(ops, 'libertymd_consent_events', 'insert').map((op) => op.payload)
}

const COMPLETE_SELF = {
  id: 'patient-self',
  owner_user_id: 'user-1',
  relationship: 'self',
  display_label: 'Me',
  age: 34,
  sex_at_birth: 'female',
  is_active: true,
}

const COMPLETE_DEPENDENT = {
  id: 'patient-dep',
  owner_user_id: 'user-1',
  relationship: 'dependent',
  display_label: 'Parent',
  age: 62,
  sex_at_birth: 'male',
  is_active: true,
}

const PARTIAL_SELF = {
  ...COMPLETE_SELF,
  age: 34,
  sex_at_birth: null,
}

Deno.test('P1-03 AC1/AC5: sole complete + current consent → skip interviewing + skip_reaffirm', async () => {
  const fetchLog = stubInference()
  try {
    const { ctx, ops } = createFakeContext({
      isAnonymous: false,
      patient: COMPLETE_SELF,
      patients: [COMPLETE_SELF],
      profile: {
        user_id: 'user-1',
        consent_version: CONSENT_VERSION,
        age: 34,
        sex_at_birth: 'female',
        is_anonymous: false,
      },
    })
    Object.assign(ctx, { isAnonymous: false })

    const response = await handleStartConsultation(ctx, {
      action: 'start_consultation',
      message: 'I have a headache',
    })
    assertEquals(response.status, 200, 'skip start must succeed')
    const body = await response.json() as Record<string, unknown>
    assertEquals(body.state, 'interviewing', 'must skip awaiting_demographics')
    assertEquals(body.demographics_skipped, true, 'demographics_skipped flag')
    assertTrue(typeof body.next_question === 'string' && String(body.next_question).length > 0, 'first question present')

    const snapshot = body.patient_snapshot as Record<string, unknown>
    assertEquals(snapshot.patient_id, 'patient-self', 'snapshot id')
    assertEquals(snapshot.age, 34, 'snapshot age')
    assertEquals(snapshot.sex_at_birth, 'female', 'snapshot sex')

    const inserts = opsFor(ops, 'libertymd_consultations', 'insert')
    assertEquals(inserts.length, 1, 'one consult insert')
    const insertPayload = (Array.isArray(inserts[0].payload) ? inserts[0].payload[0] : inserts[0].payload) as Record<string, unknown>
    const slots = insertPayload.filled_slots as Record<string, unknown>
    assertEquals(slots.age, 34, 'seeded age slot')
    assertEquals(slots.sex_at_birth, 'female', 'seeded sex slot')

    const consentPayload = consentInserts(ops)
    assertEquals(consentPayload.length, 1, 'one consent insert batch')
    const rows = consentPayload[0] as Array<Record<string, unknown>>
    assertEquals(rows.length, 3, 'three consent ledger rows')
    assertTrue(rows.every((row) => row.source === 'skip_reaffirm'), 'skip_reaffirm source')

    const events = productEvents(ops)
    assertTrue(events.some((e) => e.event_name === 'consent_recorded' && e.properties?.method === 'skip_reaffirm'), 'consent_recorded skip_reaffirm')
    assertEquals(events.some((e) => e.event_name === 'demographics_saved'), false, 'no demographics_saved on pure skip')
    assertEquals(events.some((e) => e.event_name === 'profile_selected'), false, 'sole path does not emit profile_selected')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P1-03 AC2: activeOwnedCount > 1 without patient_id → patient_selection_required', async () => {
  const { ctx } = createFakeContext({
    isAnonymous: false,
    patients: [COMPLETE_SELF, COMPLETE_DEPENDENT],
    profile: { user_id: 'user-1', consent_version: CONSENT_VERSION, is_anonymous: false },
  })
  Object.assign(ctx, { isAnonymous: false })

  const response = await handleStartConsultation(ctx, {
    action: 'start_consultation',
    message: 'I have a headache',
  })
  assertEquals(response.status, 400, 'multi unbound start must reject')
  const body = await response.json() as Record<string, unknown>
  assertEquals(body.code, 'patient_selection_required')
  assertEquals(body.severity, 'technical')
  assertTrue(Array.isArray(body.patients) && (body.patients as unknown[]).length === 2, 'echo patients list')
})

Deno.test('P1-03 AC2/AC6: explicit pick binds selected patient + emits profile_selected', async () => {
  const fetchLog = stubInference()
  try {
    const { ctx, ops } = createFakeContext({
      isAnonymous: false,
      patients: [COMPLETE_SELF, COMPLETE_DEPENDENT],
      profile: { user_id: 'user-1', consent_version: CONSENT_VERSION, is_anonymous: false },
    })
    Object.assign(ctx, { isAnonymous: false })

    const response = await handleStartConsultation(ctx, {
      action: 'start_consultation',
      message: 'I have a headache',
      patient_id: 'patient-dep',
      selection_source: 'picker',
    })
    assertEquals(response.status, 200, 'explicit pick must succeed')
    const body = await response.json() as Record<string, unknown>
    assertEquals(body.state, 'interviewing', 'complete dependent + current consent skips')
    const snapshot = body.patient_snapshot as Record<string, unknown>
    assertEquals(snapshot.patient_id, 'patient-dep', 'snapshot matches selected')
    assertEquals(snapshot.relationship, 'dependent')
    assertEquals(snapshot.age, 62)
    assertEquals(snapshot.sex_at_birth, 'male')

    const events = productEvents(ops)
    const selected = events.find((e) => e.event_name === 'profile_selected')
    assertTrue(Boolean(selected), 'profile_selected emitted')
    assertEquals(selected?.properties?.relationship, 'dependent')
    assertEquals(selected?.properties?.selection_source, 'picker')
    assertEquals('patient_id' in (selected?.properties || {}), false, 'no patient_id in props')
    assertEquals('display_label' in (selected?.properties || {}), false, 'no label in props')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P1-03 AC3: first-time / incomplete anonymous self → awaiting_demographics', async () => {
  const fetchLog = stubInference()
  try {
    const emptySelf = {
      id: 'patient-self',
      owner_user_id: 'user-1',
      relationship: 'self',
      display_label: 'Me',
      age: null,
      sex_at_birth: null,
      is_active: true,
    }
    const { ctx } = createFakeContext({
      isAnonymous: true,
      patient: emptySelf,
      patients: [emptySelf],
      profile: { user_id: 'user-1', consent_version: null, is_anonymous: true },
    })

    const response = await handleStartConsultation(ctx, {
      action: 'start_consultation',
      message: 'I have a headache',
    })
    assertEquals(response.status, 200)
    const body = await response.json() as Record<string, unknown>
    assertEquals(body.state, 'awaiting_demographics')
    assertEquals(body.demographics_skipped, false)
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P1-03 AC4: partial age without sex → gate', async () => {
  const fetchLog = stubInference()
  try {
    const { ctx } = createFakeContext({
      isAnonymous: false,
      patient: PARTIAL_SELF,
      patients: [PARTIAL_SELF],
      profile: { user_id: 'user-1', consent_version: CONSENT_VERSION, is_anonymous: false },
    })
    Object.assign(ctx, { isAnonymous: false })

    const response = await handleStartConsultation(ctx, {
      action: 'start_consultation',
      message: 'I have a headache',
    })
    assertEquals(response.status, 200)
    const body = await response.json() as Record<string, unknown>
    assertEquals(body.state, 'awaiting_demographics', 'partial must gate')
    assertEquals(body.demographics_skipped, false)
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P1-03 AC5: skip-eligible but consent not current → gate + prefill', async () => {
  const fetchLog = stubInference()
  try {
    const { ctx, ops } = createFakeContext({
      isAnonymous: false,
      patient: COMPLETE_SELF,
      patients: [COMPLETE_SELF],
      profile: {
        user_id: 'user-1',
        consent_version: 'stale-consent-v0',
        age: 34,
        sex_at_birth: 'female',
        is_anonymous: false,
      },
    })
    Object.assign(ctx, { isAnonymous: false })

    const response = await handleStartConsultation(ctx, {
      action: 'start_consultation',
      message: 'I have a headache',
    })
    assertEquals(response.status, 200)
    const body = await response.json() as Record<string, unknown>
    assertEquals(body.state, 'awaiting_demographics')
    assertEquals(body.demographics_skipped, false)
    const prefill = body.prefill as Record<string, unknown>
    assertEquals(prefill.age, 34)
    assertEquals(prefill.sex_at_birth, 'female')
    assertEquals(consentInserts(ops).length, 0, 'no skip_reaffirm when consent not current')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P1-03 Q2A: incomplete self + complete dependent still requires picker', async () => {
  const { ctx } = createFakeContext({
    isAnonymous: false,
    patients: [PARTIAL_SELF, COMPLETE_DEPENDENT],
    profile: { user_id: 'user-1', consent_version: CONSENT_VERSION, is_anonymous: false },
  })
  Object.assign(ctx, { isAnonymous: false })

  const response = await handleStartConsultation(ctx, {
    action: 'start_consultation',
    message: 'I have a headache',
  })
  assertEquals(response.status, 400)
  const body = await response.json() as Record<string, unknown>
  assertEquals(body.code, 'patient_selection_required')
})

Deno.test('P1-03 Q8A: bootstrap returns patients[] with completeness flags', async () => {
  const { ctx } = createFakeContext({
    isAnonymous: false,
    patient: COMPLETE_SELF,
    patients: [COMPLETE_SELF, COMPLETE_DEPENDENT],
    profile: {
      user_id: 'user-1',
      display_name: 'Linked',
      consent_version: CONSENT_VERSION,
      is_anonymous: false,
    },
  })
  Object.assign(ctx, { isAnonymous: false })
  Object.assign(ctx.user, {
    email: 'linked@example.com',
    is_anonymous: false,
    app_metadata: { provider: 'google' },
    user_metadata: { full_name: 'Linked User' },
  })

  const response = await handleBootstrap(ctx)
  assertEquals(response.status, 200)
  const body = await response.json() as { patients?: Array<Record<string, unknown>> }
  assertTrue(Array.isArray(body.patients) && body.patients.length === 2, 'patients[] length')
  const row = body.patients![0]
  assertTrue(typeof row.id === 'string', 'id present')
  assertTrue('has_age' in row && 'has_sex' in row && 'is_complete' in row, 'completeness flags')
  assertEquals('age' in row, false, 'raw age not shipped')
  assertEquals('sex_at_birth' in row, false, 'raw sex not shipped')
})
