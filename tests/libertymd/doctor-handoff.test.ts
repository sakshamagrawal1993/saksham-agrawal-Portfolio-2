/**
 * P2-11 — thin doctor handoff suite: config modes, claim-gate matrix,
 * telemetry props, optional-email join body, mock-roster ban.
 *
 * Run: npm run test:libertymd:doctor-handoff
 */
import {
  __resetDoctorCtaViewedForTests,
  __setLibertyMdTrackForTests,
  emitDoctorCtaClicked,
  emitDoctorCtaViewed,
  emitWaitlistJoined,
  libertyMdEventName,
  LIBERTYMD_CLIENT_PHI_FORBIDDEN_KEYS,
} from '../../components/LibertyMD/libertymd-analytics.ts'
import {
  RECORD_CARE_INTEREST_ACTION,
  isRecordCareInterestActionMissing,
  recordCareInterestBody,
} from '../../components/LibertyMD/libertymd-care-proxy-client.ts'
import {
  doctorHandoffProminence,
  isMockDoctorRosterReachable,
  readDoctorCtaConfig,
  shouldShowDoctorHandoff,
} from '../../components/LibertyMD/libertymd-doctor-cta-config.ts'

declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function assertTrue(value: unknown, message?: string) {
  if (!value) throw new Error(message || 'Expected truthy')
}

const APP = new URL('../../components/LibertyMD/LibertyMDApp.tsx', import.meta.url)
const PANEL = new URL('../../components/LibertyMD/LibertyMDDoctorHandoffPanel.tsx', import.meta.url)
const CTA = new URL('../../components/LibertyMD/LibertyMDDoctorHandoffCta.tsx', import.meta.url)
const CONFIG = new URL('../../components/LibertyMD/libertymd-doctor-cta-config.ts', import.meta.url)
const CLIENT = new URL('../../components/LibertyMD/libertymd-care-proxy-client.ts', import.meta.url)
const ANALYTICS = new URL('../../components/LibertyMD/libertymd-analytics.ts', import.meta.url)
const LEXICON = new URL('../../docs/libertymd/MIXPANEL-LEXICON.md', import.meta.url)
const TELEMETRY = new URL(
  '../../supabase/functions/libertymd-care-proxy/lib/telemetry.ts',
  import.meta.url,
)

Deno.test('P2-11 AC1 · one config mode reader — waitlist default / booking flip', () => {
  const waitlist = readDoctorCtaConfig({})
  assertEquals(waitlist.mode, 'waitlist')
  assertEquals(waitlist.paymentLive, false)
  assertEquals(waitlist.refundLive, false)
  assertEquals(waitlist.availabilityLive, false)
  assertEquals(waitlist.bookingLive, false)

  const booking = readDoctorCtaConfig({ VITE_LIBERTYMD_DOCTOR_CTA_MODE: 'booking' })
  assertEquals(booking.mode, 'booking')

  const junk = readDoctorCtaConfig({ VITE_LIBERTYMD_DOCTOR_CTA_MODE: 'other' })
  assertEquals(junk.mode, 'waitlist')
})

Deno.test('P2-11 AC3/AC4 · claim strings from config; independent LIVE gates', () => {
  const off = readDoctorCtaConfig({
    VITE_LIBERTYMD_DOCTOR_CTA_MODE: 'booking',
    VITE_LIBERTYMD_CLAIM_PRICE: '€49',
    VITE_LIBERTYMD_CLAIM_AVAILABILITY: 'within 15 minutes',
    VITE_LIBERTYMD_CLAIM_REFUND: 'money-back',
  })
  assertEquals(off.claims.priceLabel, '€49')
  assertEquals(off.claims.availabilityLabel, 'within 15 minutes')
  assertEquals(off.claims.refundLabel, 'money-back')
  assertEquals(off.paymentLive, false)
  assertEquals(off.refundLive, false)
  assertEquals(off.availabilityLive, false)

  const matrix = [
    { payment: true, refund: false, availability: false },
    { payment: false, refund: true, availability: false },
    { payment: false, refund: false, availability: true },
    { payment: true, refund: true, availability: true },
  ]
  for (const row of matrix) {
    const cfg = readDoctorCtaConfig({
      VITE_LIBERTYMD_DOCTOR_CTA_MODE: 'booking',
      VITE_LIBERTYMD_PAYMENT_LIVE: row.payment ? 'true' : 'false',
      VITE_LIBERTYMD_REFUND_LIVE: row.refund ? '1' : '0',
      VITE_LIBERTYMD_AVAILABILITY_LIVE: row.availability ? 'yes' : '',
    })
    assertEquals(cfg.paymentLive, row.payment)
    assertEquals(cfg.refundLive, row.refund)
    assertEquals(cfg.availabilityLive, row.availability)
  }

  // CTA component must not be the sole hardcode source of $39
  // (reads config.claims.priceLabel when gated on)
})

Deno.test('P2-11 AC8 · mock roster unreachable until bookingLive', async () => {
  assertEquals(
    isMockDoctorRosterReachable(readDoctorCtaConfig({ VITE_LIBERTYMD_DOCTOR_CTA_MODE: 'waitlist' })),
    false,
  )
  assertEquals(
    isMockDoctorRosterReachable(readDoctorCtaConfig({ VITE_LIBERTYMD_DOCTOR_CTA_MODE: 'booking' })),
    false,
  )
  assertEquals(
    isMockDoctorRosterReachable(
      readDoctorCtaConfig({
        VITE_LIBERTYMD_DOCTOR_CTA_MODE: 'booking',
        VITE_LIBERTYMD_BOOKING_LIVE: 'true',
      }),
    ),
    true,
  )

  const [app, panel] = await Promise.all([
    Deno.readTextFile(APP),
    Deno.readTextFile(PANEL),
  ])
  assertEquals(app.includes('Dr. Elena Rostova'), false)
  assertEquals(app.includes('Start visit'), false)
  assertEquals(panel.includes('Start visit'), false)
  assertEquals(/Elena|Rajiv|Barry/.test(panel), false)
})

Deno.test('P2-11 AC6 · prominence + emergency/crisis hide', () => {
  assertEquals(shouldShowDoctorHandoff('home'), true)
  assertEquals(shouldShowDoctorHandoff('telehealth'), true)
  assertEquals(shouldShowDoctorHandoff('urgent_care'), true)
  assertEquals(shouldShowDoctorHandoff('unknown'), true)
  assertEquals(shouldShowDoctorHandoff('emergency_department'), false)
  assertEquals(shouldShowDoctorHandoff('call_911'), false)
  assertEquals(shouldShowDoctorHandoff('crisis_line'), false)

  assertEquals(doctorHandoffProminence('home'), 'optional')
  assertEquals(doctorHandoffProminence('unknown'), 'optional')
  assertEquals(doctorHandoffProminence('telehealth'), 'recommended')
  assertEquals(doctorHandoffProminence('urgent_care'), 'recommended')
})

Deno.test('P2-11 AC7 · record_care_interest body — email optional / null intent', () => {
  const without = recordCareInterestBody({ consultation_id: 'c-1' })
  assertEquals(without.action, RECORD_CARE_INTEREST_ACTION)
  assertEquals(without.consultation_id, 'c-1')
  assertEquals(without.contact_email, null)

  const blank = recordCareInterestBody({ consultation_id: 'c-1', contact_email: '  ' })
  assertEquals(blank.contact_email, null)

  const withEmail = recordCareInterestBody({
    consultation_id: 'c-1',
    contact_email: ' wait@example.com ',
  })
  assertEquals(withEmail.contact_email, 'wait@example.com')
  // Never client-trusted triage
  assertEquals('triage_tier' in withEmail, false)
})

Deno.test('P2-11 AC7 · join error class — unknown-action/missing-handler → local ack; live 400s → fail', async () => {
  // Unknown / missing handler → local-ack fallback OK
  assertEquals(
    isRecordCareInterestActionMissing(400, { error: 'Invalid action' }),
    true,
    'dispatch Invalid action → missing',
  )
  assertEquals(
    isRecordCareInterestActionMissing(400, { error: 'Unknown action' }),
    true,
    'unknown action wording → missing',
  )
  assertEquals(
    isRecordCareInterestActionMissing(404, null),
    true,
    'platform empty 404 → missing handler',
  )
  assertEquals(
    isRecordCareInterestActionMissing(404, { error: 'Requested function was not found' }),
    true,
    'platform function 404 → missing',
  )

  // Live P2-12 validation / ownership — must NOT false-ack (no waitlist_joined success path)
  assertEquals(
    isRecordCareInterestActionMissing(400, {
      error: 'Enter a valid email address.',
      code: 'invalid_email',
      severity: 'technical',
    }),
    false,
    'invalid_email 400 must surface technical error',
  )
  assertEquals(
    isRecordCareInterestActionMissing(400, { error: 'Missing consultation id' }),
    false,
    'missing consult id 400 must fail',
  )
  assertEquals(
    isRecordCareInterestActionMissing(404, { error: 'Consultation not found' }),
    false,
    'consult ownership 404 must fail',
  )
  assertEquals(
    isRecordCareInterestActionMissing(409, {
      error: 'Report is not ready',
      code: 'report_not_ready',
    }),
    false,
    'report_not_ready must fail',
  )
  // Broad action-name mention must not alone trigger local ack (old false-ack bug)
  assertEquals(
    isRecordCareInterestActionMissing(400, {
      error: 'record_care_interest rejected: bad email',
      code: 'invalid_email',
    }),
    false,
    'record_care_interest text + invalid_email must not local-ack',
  )
  // Blanket status alone is never enough
  assertEquals(
    isRecordCareInterestActionMissing(400, { error: 'something else' }),
    false,
    'blanket 400 without Invalid action → not missing',
  )

  const panel = await Deno.readTextFile(PANEL)
  assertTrue(
    panel.includes('isRecordCareInterestActionMissing'),
    'panel must use narrow action-missing classifier',
  )
  assertEquals(
    /status\s*===\s*400/.test(panel),
    false,
    'panel must not blanket-treat HTTP 400 as action missing',
  )
  assertEquals(
    /record_care_interest\/i/.test(panel) || /\/record_care_interest\//.test(panel),
    false,
    'panel must not match broad record_care_interest error-text for local ack',
  )
})

Deno.test('P2-11 T1/AC9 · telemetry Spec names + props; once-per-position viewed; no PHI', () => {
  __resetDoctorCtaViewedForTests()
  const events: Array<{ name: string; props: Record<string, unknown> }> = []
  __setLibertyMdTrackForTests((name, props) => {
    events.push({ name, props })
  })

  emitDoctorCtaViewed({
    triage_tier: 'urgent_care',
    cta_mode: 'waitlist',
    position: 'footer',
    session_key: 'sess-1',
  })
  emitDoctorCtaViewed({
    triage_tier: 'urgent_care',
    cta_mode: 'waitlist',
    position: 'footer',
    session_key: 'sess-1',
  })
  emitDoctorCtaViewed({
    triage_tier: 'urgent_care',
    cta_mode: 'waitlist',
    position: 'card',
    session_key: 'sess-1',
  })
  emitDoctorCtaClicked({
    triage_tier: 'urgent_care',
    cta_mode: 'booking',
    position: 'card',
  })
  emitWaitlistJoined({
    triage_tier: 'home',
    cta_mode: 'waitlist',
    position: 'footer',
  })

  assertEquals(events.length, 4)
  assertEquals(events[0].name, libertyMdEventName('doctor_cta_viewed'))
  assertEquals(events[1].name, libertyMdEventName('doctor_cta_viewed'))
  assertEquals(events[0].props.position, 'footer')
  assertEquals(events[1].props.position, 'card')
  assertEquals(events[2].name, libertyMdEventName('doctor_cta_clicked'))
  assertEquals(events[2].props.cta_mode, 'booking')
  assertEquals(events[3].name, libertyMdEventName('waitlist_joined'))

  for (const ev of events) {
    for (const key of LIBERTYMD_CLIENT_PHI_FORBIDDEN_KEYS) {
      assertEquals(key in ev.props, false, `${ev.name} must not carry ${key}`)
    }
    assertEquals('email' in ev.props, false)
    assertEquals('contact_email' in ev.props, false)
    assertEquals('diagnosis' in ev.props, false)
  }

  __setLibertyMdTrackForTests(null)
  __resetDoctorCtaViewedForTests()
})

Deno.test('P2-11 T1 · Lexicon promote + no Postgres PRODUCT_EVENT_NAMES widen', async () => {
  const [lexicon, telemetry, analytics, client] = await Promise.all([
    Deno.readTextFile(LEXICON),
    Deno.readTextFile(TELEMETRY),
    Deno.readTextFile(ANALYTICS),
    Deno.readTextFile(CLIENT),
  ])
  assertTrue(lexicon.includes('doctor_cta_viewed'), 'Lexicon viewed')
  assertTrue(lexicon.includes('doctor_cta_clicked'), 'Lexicon clicked')
  assertTrue(lexicon.includes('waitlist_joined'), 'Lexicon waitlist_joined')
  assertEquals(lexicon.includes('| `doctor_cta_shown`'), false, 'no shown invent in Lexicon table')
  assertTrue(analytics.includes("trackLibertyMd('doctor_cta_viewed'"), 'emit viewed')
  assertEquals(analytics.includes('doctor_cta_shown'), false, 'no shown in analytics')
  assertEquals(/doctor_cta_viewed|waitlist_joined/.test(telemetry), false, 'no Postgres widen')
  assertTrue(client.includes("RECORD_CARE_INTEREST_ACTION = 'record_care_interest'"), 'P2-12 action name')
})

Deno.test('P2-11 AC1 · single shared control (not parallel throwaway)', async () => {
  const [cta, panel, config] = await Promise.all([
    Deno.readTextFile(CTA),
    Deno.readTextFile(PANEL),
    Deno.readTextFile(CONFIG),
  ])
  assertTrue(cta.includes('readDoctorCtaConfig'), 'CTA reads config')
  assertTrue(panel.includes('readDoctorCtaConfig'), 'panel reads config')
  assertTrue(config.includes('VITE_LIBERTYMD_DOCTOR_CTA_MODE'), 'mode env documented')
  assertTrue(config.includes('VITE_LIBERTYMD_PAYMENT_LIVE'), 'payment gate')
  assertTrue(config.includes('VITE_LIBERTYMD_REFUND_LIVE'), 'refund gate')
  assertTrue(config.includes('VITE_LIBERTYMD_AVAILABILITY_LIVE'), 'availability gate')
})
