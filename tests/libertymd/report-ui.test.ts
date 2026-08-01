/**
 * P2-02 — Full report UI: mapper, triage matrix, telemetry shape, visibility wire,
 * mangled/mundane fixtures, Chat/App shared component contracts.
 *
 * Run: `deno test --no-config --no-check --allow-env --allow-read --sloppy-imports tests/libertymd/report-ui.test.ts`
 */
import {
  __setLibertyMdTrackForTests,
  emitReportScrollDepth,
  emitReportSectionExpanded,
  emitSampleReportViewed,
  libertyMdEventName,
} from '../../components/LibertyMD/libertymd-analytics.ts'
import {
  clearReportSections,
  isEmergencyTriageTier,
  LIBERTYMD_REPORT_STICKY_MIN_SCROLLER_PX,
  mapCareSettingToTriage,
  mapDifferentialOrdinal,
  mergeReportSectionOpen,
  newlyReachedScrollBuckets,
  normalizeReportData,
  omitDosingLines,
  parseConfidenceScore,
  readReportSections,
  reportSectionsKey,
  reportScrollDepthPct,
  shouldEnableReportSticky,
  writeReportSections,
  type ReportScrollBucket,
} from '../../components/LibertyMD/libertymd-report.ts'
import {
  CARD_DOSING_REPORT_DATA,
  CARD_FULL_SERIOUS_REPORT_DATA,
  CARD_LENGTH_FIVE_REPORT_DATA,
  CARD_LENGTH_ONE_REPORT_DATA,
  CARD_NAME_ONLY_REPORT_DATA,
  CARD_REASON_ONLY_REPORT_DATA,
  MANGLED_REPORT_DATA,
  MUNDANE_FULL_REPORT_DATA,
  PARTIAL_NO_DIFFERENTIAL_REPORT_DATA,
  PARTIAL_NO_NEXT_STEP_REPORT_DATA,
  PARTIAL_NO_SOAP_REPORT_DATA,
  PARTIAL_TRIAGE_ONLY_REPORT_DATA,
  TRIAGE_MATRIX_FIXTURES,
  triageMatrixReport,
} from './fixtures/report-data.ts'
import { handleGetConsultation } from '../../supabase/functions/libertymd-care-proxy/actions/reads.ts'
import {
  assertEquals,
  assertTrue,
  consultationRow,
  createFakeContext,
  opsFor,
} from './support/proxy-doubles.mts'

declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const CHAT = new URL('../../components/LibertyMD/LibertyMDChat.tsx', import.meta.url)
const APP = new URL('../../components/LibertyMD/LibertyMDApp.tsx', import.meta.url)
const VIEW = new URL('../../components/LibertyMD/LibertyMDReportView.tsx', import.meta.url)
const SAMPLE_SHELL = new URL('../../components/LibertyMD/LibertyMDSampleReport.tsx', import.meta.url)
const SAMPLE_CATALOG = new URL('../../components/LibertyMD/libertymd-sample-report.ts', import.meta.url)
const CARD = new URL('../../components/LibertyMD/LibertyMDDiagnosisCard.tsx', import.meta.url)
const HANDOFF_CTA = new URL('../../components/LibertyMD/LibertyMDDoctorHandoffCta.tsx', import.meta.url)
const HANDOFF_PANEL = new URL('../../components/LibertyMD/LibertyMDDoctorHandoffPanel.tsx', import.meta.url)
const DOCTOR_CTA_CONFIG = new URL('../../components/LibertyMD/libertymd-doctor-cta-config.ts', import.meta.url)
const MAPPER = new URL('../../components/LibertyMD/libertymd-report.ts', import.meta.url)
const ANALYTICS = new URL('../../components/LibertyMD/libertymd-analytics.ts', import.meta.url)
const EN_I18N = new URL('../../i18n/locales/en.json', import.meta.url)
const SEND = new URL(
  '../../supabase/functions/libertymd-care-proxy/actions/send-message.ts',
  import.meta.url,
)
const READS = new URL(
  '../../supabase/functions/libertymd-care-proxy/actions/reads.ts',
  import.meta.url,
)
const CONSULTATIONS = new URL(
  '../../supabase/functions/libertymd-care-proxy/lib/consultations.ts',
  import.meta.url,
)

function assertNoUndefinedLiteral(value: unknown, path = 'root') {
  if (value === undefined) throw new Error(`${path} is undefined`)
  if (typeof value === 'string' && value.includes('undefined')) {
    throw new Error(`${path} string contains "undefined": ${value}`)
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoUndefinedLiteral(item, `${path}[${i}]`))
    return
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      assertNoUndefinedLiteral(v, `${path}.${k}`)
    }
  }
}

Deno.test('P2-02 AC2 · mangled fixture normalizes without throw / undefined literals', () => {
  const view = normalizeReportData(MANGLED_REPORT_DATA)
  assertNoUndefinedLiteral(view)
  assertEquals(view.headline, undefined)
  assertEquals(view.patientSummary, undefined)
  assertEquals(view.triageTier, 'unknown')
  assertEquals(view.differentials.length, 1)
  assertEquals(view.differentials[0].name, 'Tension-type headache')
  assertEquals(view.soap, undefined)
  // self_care partial list still surfaces when present
  assertTrue(view.assessmentAndPlan, 'A&P present from self_care')
  assertEquals(view.assessmentAndPlan?.selfCare.includes('Rest and hydrate'), true)
  assertEquals(view.redFlags.length, 0)
})

Deno.test('P2-02 DoD+ · mundane full report maps all major sections; no patient confidence', () => {
  const view = normalizeReportData(MUNDANE_FULL_REPORT_DATA)
  assertEquals(view.headline?.includes('viral'), true)
  assertTrue(view.patientSummary)
  assertEquals(view.triageTier, 'home')
  assertTrue(view.nextStep)
  assertTrue(view.assessmentAndPlan)
  assertEquals(view.differentials.length, 2)
  // P2-04 Q7 · common_name first
  assertEquals(view.differentials[0].name, 'Common cold')
  assertEquals(view.differentials[0].ordinal, 'most_likely')
  assertEquals(view.differentials[1].name, 'Hay fever')
  assertEquals(view.differentials[1].ordinal, 'possible')
  assertEquals(view.redFlags.length, 4)
  assertTrue(view.soap?.subjective)
  const blob = JSON.stringify(view)
  assertEquals(blob.includes('78'), false, 'patient differential must omit numeric confidence')
  assertEquals(blob.includes('87%'), false)
  assertEquals(blob.includes('%'), false, 'no % on patient normalized report')
})

Deno.test('P2-02 AC3 · triage matrix covers 5 tiers + crisis + unknown', () => {
  const seen = new Set<string>()
  for (const row of TRIAGE_MATRIX_FIXTURES) {
    const view = normalizeReportData(triageMatrixReport(row.care_setting))
    assertEquals(view.triageTier, row.label as typeof view.triageTier)
    seen.add(view.triageTier)
    if (row.label === 'emergency_department' || row.label === 'call_911') {
      assertEquals(isEmergencyTriageTier(view.triageTier), true)
    }
    if (row.label === 'crisis_line' || row.label === 'unknown') {
      assertEquals(view.triageTier === 'home', false, 'crisis/unknown ≠ home')
    }
  }
  for (const required of [
    'home',
    'telehealth',
    'urgent_care',
    'emergency_department',
    'call_911',
    'crisis_line',
    'unknown',
  ]) {
    assertTrue(seen.has(required), `missing tier ${required}`)
  }
  assertEquals(mapCareSettingToTriage('home_care'), 'home')
  assertEquals(TRIAGE_MATRIX_FIXTURES.length >= 7, true)
})

Deno.test('P2-02 AC5/AC6 · expand + scroll-depth emit safe categorical props', () => {
  const events: Array<{ name: string; props: Record<string, unknown> }> = []
  __setLibertyMdTrackForTests((name, props) => {
    events.push({ name, props })
  })
  try {
    emitReportSectionExpanded('differential')
    emitReportSectionExpanded('soap')
    emitReportScrollDepth(0)
    emitReportScrollDepth(50)
    emitReportScrollDepth(100)
    assertEquals(events.length, 5)
    assertEquals(events[0].name, libertyMdEventName('report_section_expanded'))
    assertEquals(events[0].props.section, 'differential')
    assertEquals(events[2].name, libertyMdEventName('report_scroll_depth'))
    assertEquals(events[2].props.pct_bucket, 0)
    assertEquals(events[4].props.pct_bucket, 100)
    for (const event of events) {
      const keys = Object.keys(event.props)
      assertEquals(
        keys.every((k) => k === 'section' || k === 'pct_bucket' || k === 'locale'),
        true,
        `unexpected props ${keys.join(',')}`,
      )
    }
  } finally {
    __setLibertyMdTrackForTests(null)
  }
})

Deno.test('P2-02 AC6 · scroll depth helper + monotonic buckets', () => {
  assertEquals(
    reportScrollDepthPct({
      scrollTop: 0,
      clientHeight: 500,
      reportOffsetTop: 0,
      reportHeight: 1000,
    }),
    50,
    'half scrolled through report',
  )
  assertEquals(
    reportScrollDepthPct({
      scrollTop: 500,
      clientHeight: 500,
      reportOffsetTop: 0,
      reportHeight: 1000,
    }),
    100,
    'fully scrolled',
  )
  const emitted = new Set<ReportScrollBucket>()
  assertEquals(JSON.stringify(newlyReachedScrollBuckets(10, emitted)), JSON.stringify([0]), 'first bucket 0')
  emitted.add(0)
  assertEquals(JSON.stringify(newlyReachedScrollBuckets(10, emitted)), JSON.stringify([]), 'no re-emit')
  assertEquals(JSON.stringify(newlyReachedScrollBuckets(50, emitted)), JSON.stringify([25, 50]), '25+50')
  emitted.add(25)
  emitted.add(50)
  assertEquals(JSON.stringify(newlyReachedScrollBuckets(100, emitted)), JSON.stringify([75, 100]), '75+100')
})

Deno.test('P2-02 AC11 · get_consultation returns withheld report_data', async () => {
  const reportPayload = { headline: 'Withheld soft-gate report', patient_summary: 'Visible under soft gate.' }
  const consultation = consultationRow({
    id: 'consult-withheld-1',
    status: 'report_pending_auth',
    user_id: 'user-1',
  })
  const { ctx, ops } = createFakeContext({
    userId: 'user-1',
    consultation,
    report: {
      report_data: reportPayload,
      confidence_score: 80,
      access_status: 'withheld',
    },
  })
  const response = await handleGetConsultation(ctx, {
    action: 'get_consultation',
    consultation_id: consultation.id,
  })
  assertEquals(response.status, 200, 'status')
  const body = await response.json() as Record<string, unknown>
  assertEquals(JSON.stringify(body.report), JSON.stringify(reportPayload), 'report_data returned')
  const reportSelects = opsFor(ops, 'libertymd_reports', 'select')
  assertTrue(reportSelects.length >= 1, 'report select ran')
  assertTrue(
    reportSelects.some((op) =>
      op.filters.some((f) =>
        f.column === 'access_status'
        && Array.isArray(f.value)
        && f.value.includes('withheld')
      )
    ),
    'access_status filter must include withheld',
  )
})

Deno.test('P2-02 AC1/AC5/AC8/AC9 · shared view + Chat/App wire; no clinical fallbacks', async () => {
  const [chat, app, view, mapper, analytics, send, reads, consultations] = await Promise.all([
    Deno.readTextFile(CHAT),
    Deno.readTextFile(APP),
    Deno.readTextFile(VIEW),
    Deno.readTextFile(MAPPER),
    Deno.readTextFile(ANALYTICS),
    Deno.readTextFile(SEND),
    Deno.readTextFile(READS),
    Deno.readTextFile(CONSULTATIONS),
  ])

  assertTrue(chat.includes("from './LibertyMDReportView'"), 'Chat imports shared view')
  assertTrue(app.includes("from './LibertyMDReportView'"), 'App imports shared view')
  assertTrue(chat.includes('normalizeReportData'), 'Chat uses shared mapper')
  assertTrue(app.includes('normalizeReportData'), 'App uses shared mapper')
  assertTrue(chat.includes('scrollParentRef={scrollRef}'), 'Chat wires scroll parent')
  assertTrue(app.includes('scrollParentRef={scrollRef}'), 'App wires scroll parent')
  assertTrue(app.includes('footerSlot'), 'App keeps doctor CTA slot')

  // Clinical fallback strings must be gone from Chat/App report paths.
  for (const [label, src] of [['Chat', chat], ['App', app]] as const) {
    assertEquals(
      src.includes('Monitor your symptoms and follow up with a licensed clinician'),
      false,
      `${label} must not invent care-plan fallback`,
    )
    assertEquals(
      src.includes('Seek urgent care for trouble breathing, chest pain, confusion, fainting'),
      false,
      `${label} must not invent red-flag fallback`,
    )
    assertEquals(
      src.includes('No vitals or physical exam were directly measured'),
      false,
      `${label} must not invent SOAP objective fallback`,
    )
    assertEquals(
      src.includes('Clinical consideration'),
      false,
      `${label} must not invent differential name fallback`,
    )
  }

  assertTrue(view.includes("emitReportSectionExpanded"), 'view emits expand')
  assertTrue(view.includes('emitReportScrollDepth'), 'view emits scroll depth')
  assertTrue(view.includes("data-report-section={sectionId}"), 'section data attrs')
  assertTrue(
    view.includes('DEFAULT_REPORT_SECTION_OPEN') || mapper.includes('differential: true'),
    'differential default open',
  )
  assertTrue(view.includes('report.aiFraming'), 'AI framing i18n')
  assertTrue(view.includes('aria-expanded'), 'collapsible a11y')
  assertTrue(view.includes('<h2'), 'section heading h2')
  assertTrue(view.includes('<h3'), 'section heading h3')
  assertTrue(view.includes('break-words'), '320px soap overflow mitigation')
  assertTrue(view.includes('grid-cols-1'), 'SOAP stacks at narrow widths')

  assertTrue(analytics.includes("trackLibertyMd('report_section_expanded'"), 'analytics expand helper')
  assertTrue(analytics.includes("trackLibertyMd('report_scroll_depth'"), 'analytics scroll helper')
  assertTrue(mapper.includes('omit') || mapper.includes('Never invent') || mapper.includes('never invent'), 'mapper docs omit')

  // Soft-gate visibility: send_message returns report_data for anonymous complete (P2-02 AC11 / P2-07 insert-once).
  assertTrue(
    send.includes('report: diagnosis.raw') || send.includes('report: storedReport.report_data'),
    'anonymous send returns report',
  )
  assertEquals(send.includes('report: isAnonymous ? undefined'), false, 'must not omit anonymous report')
  assertTrue(reads.includes("'withheld'"), 'reads includes withheld')
  assertTrue(consultations.includes("'withheld'"), 'replay includes withheld')
  assertTrue(consultations.includes('reportReady'), 'replay uses reportReady for pending auth')
})

// ─── P2-03 · Report information ordering / hierarchy ─────────────────────────

/** Marker index helper — omit-absent: missing marker yields -1 and is skipped. */
function markerIndex(src: string, needle: string): number {
  return src.indexOf(needle)
}

function assertAscendingPresent(indices: Array<{ label: string; index: number }>) {
  const present = indices.filter((row) => row.index >= 0)
  for (let i = 1; i < present.length; i++) {
    assertTrue(
      present[i - 1].index < present[i].index,
      `${present[i - 1].label} (@${present[i - 1].index}) must precede ${present[i].label} (@${present[i].index})`,
    )
  }
}

Deno.test('P2-03 AC1 · four-pack DOM marker order + collapse defaults', async () => {
  const view = await Deno.readTextFile(VIEW)

  const triage = markerIndex(view, 'data-libertymd-report-triage')
  const nextStep = markerIndex(view, 'data-libertymd-report-next-step')
  const differential = markerIndex(view, 'sectionId="differential"')
  const soap = markerIndex(view, 'sectionId="soap"')

  assertTrue(triage >= 0, 'triage marker present')
  assertTrue(nextStep >= 0, 'next-step marker present')
  assertTrue(differential >= 0, 'differential section present')
  assertTrue(soap >= 0, 'soap section present')
  assertAscendingPresent([
    { label: 'triage', index: triage },
    { label: 'nextStep', index: nextStep },
    { label: 'differential', index: differential },
    { label: 'soap', index: soap },
  ])

  // A&P / red flags stay between differential and SOAP (Q6)
  const ap = markerIndex(view, 'sectionId="assessment_and_plan"')
  const redFlags = markerIndex(view, 'sectionId="red_flags"')
  assertTrue(differential < ap && ap < redFlags && redFlags < soap, 'A&P/red flags between dx and SOAP')

  // Differential default-open; SOAP/A&P/red flags collapsed (P2-05 section map defaults)
  const mapper = await Deno.readTextFile(MAPPER)
  assertTrue(mapper.includes('differential: true'), 'differential default open')
  assertTrue(mapper.includes('soap: false'), 'SOAP starts collapsed')
  assertTrue(mapper.includes('assessment_and_plan: false'), 'A&P starts collapsed')
  assertTrue(mapper.includes('red_flags: false'), 'red flags collapsed')
})

Deno.test('P2-03 AC2 · Q1 type/token hierarchy roles (ATF UNTESTABLE)', async () => {
  const view = await Deno.readTextFile(VIEW)

  // Triage answer: card-title + bold
  assertTrue(
    view.includes('data-libertymd-report-triage')
      && view.includes('libertymd-type-card-title')
      && /data-libertymd-report-triage[\s\S]{0,400}libertymd-type-card-title[\s\S]{0,200}font-bold/.test(view),
    'triage answer uses .libertymd-type-card-title + bold',
  )

  // Next-step body: lead + bold; label: type-label
  assertTrue(
    /data-libertymd-report-next-step[\s\S]{0,300}libertymd-type-label[\s\S]{0,200}libertymd-type-lead[\s\S]{0,120}font-bold/.test(view),
    'next-step label=type-label; body=type-lead + bold',
  )

  // Headline demoted to body (not text-2xl / text-3xl / subsection+)
  assertTrue(view.includes('libertymd-type-body'), 'headline uses type-body')
  assertEquals(view.includes('text-2xl'), false, 'headline must not use text-2xl')
  assertEquals(view.includes('text-3xl'), false, 'headline must not use text-3xl')
  assertEquals(view.includes('libertymd-type-subsection-title'), false, 'no subsection for triage/headline')
  assertEquals(view.includes('libertymd-type-section-title'), false, 'no section-title on report')
  assertEquals(view.includes('libertymd-type-display'), false, 'no display on report')

  // Summary / framing / eyebrow roles
  assertTrue(view.includes('libertymd-type-body-small'), 'summary/body-small present')
  assertTrue(
    /report\.aiFraming[\s\S]{0,80}|libertymd-type-label[\s\S]{0,120}report\.aiFraming|report\.aiFraming/.test(view)
      && view.includes('report.aiFraming'),
    'AI framing retained',
  )
  // Eyebrow + framing use type-label
  const framingBlock = view.slice(
    view.indexOf('report.eyebrow') - 200,
    view.indexOf('report.aiFraming') + 80,
  )
  assertTrue(framingBlock.includes('libertymd-type-label'), 'eyebrow/framing use type-label')

  // Collapsible titles ≤ body; dx names ≤ body-small (card extract)
  assertTrue(
    /className="libertymd-type-body flex w-full min-h-11/.test(view),
    'collapsible titles use type-body (≤ triage/next-step)',
  )
  const card = await Deno.readTextFile(CARD)
  assertTrue(
    card.includes('libertymd-type-body-small mt-[var(--libertymd-space-xs)] font-bold text-libertymd-ink')
      || card.includes('libertymd-type-body-small') && card.includes('font-bold text-libertymd-ink'),
    'dx name rows use body-small',
  )

  // ATF honesty: no harness claim — documented for QA (source-only).
  // Estimated hero stack @375 (compressed preamble, no footerSlot in hero):
  //   pad 24 + eyebrow ~18 + framing ~18 + headline ~28 + summary clamp3 ~54
  //   + triage ~40 + next-step ~88 ≈ ~270 CSS px ≪ 667. ATF portion UNTESTABLE without harness.
})

Deno.test('P2-03 AC3 · differential remains before SOAP + default-open', async () => {
  const view = await Deno.readTextFile(VIEW)
  const differential = markerIndex(view, 'sectionId="differential"')
  const soap = markerIndex(view, 'sectionId="soap"')
  assertTrue(differential >= 0 && soap >= 0 && differential < soap, 'differential before SOAP')
  // P2-05 · defaults live on DEFAULT_REPORT_SECTION_OPEN / merge helper
  assertTrue(
    view.includes('DEFAULT_REPORT_SECTION_OPEN') || view.includes("differential: true"),
    'dx default open via section map defaults',
  )
  const mapper = await Deno.readTextFile(MAPPER)
  assertTrue(mapper.includes('differential: true'), 'mapper default differential open')
  assertTrue(mapper.includes('assessment_and_plan: false'), 'A&P default closed')
})

Deno.test('P2-03 AC4 · omit-not-stub partial matrix + relative four-pack order', () => {
  const full = normalizeReportData(MUNDANE_FULL_REPORT_DATA)
  assertTrue(full.nextStep, 'full has nextStep')
  assertEquals(full.differentials.length > 0, true)
  assertTrue(full.soap, 'full has soap')

  const noNext = normalizeReportData(PARTIAL_NO_NEXT_STEP_REPORT_DATA)
  assertEquals(noNext.nextStep, undefined, 'no next step omitted')
  assertEquals(noNext.differentials.length > 0, true, 'dx still present')
  assertTrue(noNext.soap, 'soap still present')
  assertEquals(noNext.triageTier, 'home')

  const noDx = normalizeReportData(PARTIAL_NO_DIFFERENTIAL_REPORT_DATA)
  assertEquals(noDx.differentials.length, 0, 'dx omitted')
  assertTrue(noDx.nextStep, 'next step present')
  assertTrue(noDx.soap, 'soap present')
  assertEquals(noDx.triageTier, 'telehealth')

  const noSoap = normalizeReportData(PARTIAL_NO_SOAP_REPORT_DATA)
  assertEquals(noSoap.soap, undefined, 'soap omitted')
  assertTrue(noSoap.nextStep, 'next step present')
  assertEquals(noSoap.differentials.length > 0, true)
  assertEquals(noSoap.triageTier, 'urgent_care')

  const triageOnly = normalizeReportData(PARTIAL_TRIAGE_ONLY_REPORT_DATA)
  assertEquals(triageOnly.triageTier, 'home')
  assertEquals(triageOnly.nextStep, undefined)
  assertEquals(triageOnly.differentials.length, 0)
  assertEquals(triageOnly.soap, undefined)
  assertEquals(triageOnly.assessmentAndPlan, undefined)

  // No invented clinical strings in partials
  for (const [label, raw] of [
    ['no-next', PARTIAL_NO_NEXT_STEP_REPORT_DATA],
    ['no-dx', PARTIAL_NO_DIFFERENTIAL_REPORT_DATA],
    ['no-soap', PARTIAL_NO_SOAP_REPORT_DATA],
    ['triage-only', PARTIAL_TRIAGE_ONLY_REPORT_DATA],
  ] as const) {
    const view = normalizeReportData(raw)
    assertNoUndefinedLiteral(view, label)
  }
})

Deno.test('P2-03 AC4/Q4 · source omit matrix — present markers never reorder', async () => {
  const view = await Deno.readTextFile(VIEW)

  // Canonical presence order among four: triage ≼ nextStep ≼ differential ≼ soap
  // (footerSlot between nextStep and differential per Q5)
  const triage = markerIndex(view, 'data-libertymd-report-triage')
  const nextStep = markerIndex(view, 'data-libertymd-report-next-step')
  const footerSlot = markerIndex(view, 'data-libertymd-report-footer-slot')
  const differential = markerIndex(view, 'sectionId="differential"')
  const soap = markerIndex(view, 'sectionId="soap"')

  assertAscendingPresent([
    { label: 'triage', index: triage },
    { label: 'nextStep', index: nextStep },
    { label: 'footerSlot', index: footerSlot },
    { label: 'differential', index: differential },
    { label: 'soap', index: soap },
  ])

  // Conditional omit (no reserved stubs): sections gated on show* / report.nextStep
  assertTrue(view.includes('{showTriage ?'), 'triage omitted when absent')
  assertTrue(view.includes('{report.nextStep ?'), 'nextStep omitted when absent')
  assertTrue(view.includes('{showDifferentials ?'), 'differential omitted when absent')
  assertTrue(view.includes('{showSoap ?'), 'soap omitted when absent')
  // No empty placeholder headings for missing four-pack members
  assertEquals(view.includes('data-libertymd-report-next-step-stub'), false)
})

Deno.test('P2-03 Q3/Q5 · framing order kept; footerSlot before differential', async () => {
  const view = await Deno.readTextFile(VIEW)

  const framing = markerIndex(view, 'report.aiFraming')
  const headline = markerIndex(view, '<h2')
  const triage = markerIndex(view, 'data-libertymd-report-triage')
  const nextStep = markerIndex(view, 'data-libertymd-report-next-step')
  const footerSlot = markerIndex(view, 'data-libertymd-report-footer-slot')
  const differential = markerIndex(view, 'sectionId="differential"')

  assertTrue(framing >= 0 && framing < headline, 'framing before headline')
  assertTrue(headline < triage, 'headline before triage')
  assertTrue(triage < nextStep, 'triage before next step')
  assertTrue(nextStep < footerSlot, 'next step before footerSlot')
  assertTrue(footerSlot < differential, 'footerSlot before differential (body start)')

  // footerSlot prop API retained; placed in body before differential
  assertTrue(view.includes('data-libertymd-report-footer-slot'), 'footerSlot marker in body')
  assertTrue(view.includes('footerSlot && showDoctorHandoff') || view.includes('{footerSlot ?'), 'footerSlot prop API retained')
})

Deno.test('P2-03 R2 · collision fence — soft-gate chrome absent from ReportView (P2-06 owns CareControls)', async () => {
  const view = await Deno.readTextFile(VIEW)
  assertEquals(view.includes('soft-gate') || view.includes('softGate') || view.includes('soft_gate'), false, 'ReportView must not absorb soft-gate chrome')
})

// ─── P2-04 · Per-diagnosis detail cards ───────────────────────────────────────

const FORBIDDEN_CTA_SUBSTRINGS = [
  '$39',
  '€39',
  '30 minute',
  '30 min',
  'available now',
  'doctor ready',
  'Start visit',
  'full refund',
  ' mins',
]

Deno.test('P2-04 Q1 · mapDifferentialOrdinal rank / confidence / omit', () => {
  assertEquals(mapDifferentialOrdinal({ rank: 1 }), 'most_likely')
  assertEquals(mapDifferentialOrdinal({ rank: 2 }), 'possible')
  assertEquals(mapDifferentialOrdinal({ rank: 3 }), 'possible')
  assertEquals(mapDifferentialOrdinal({ rank: 4 }), 'less_likely')
  assertEquals(mapDifferentialOrdinal({ rank: 5 }), 'less_likely')
  // Rank wins over confidence
  assertEquals(mapDifferentialOrdinal({ rank: 2, confidence: 90 }), 'possible')
  // Confidence fallback
  assertEquals(mapDifferentialOrdinal({ confidence: 70 }), 'most_likely')
  assertEquals(mapDifferentialOrdinal({ confidence: '70%' }), 'most_likely')
  assertEquals(mapDifferentialOrdinal({ confidence: 40 }), 'possible')
  assertEquals(mapDifferentialOrdinal({ confidence: 39 }), 'less_likely')
  assertEquals(mapDifferentialOrdinal({ confidence: 'not-a-score' }), undefined)
  assertEquals(mapDifferentialOrdinal({}), undefined)
  assertEquals(parseConfidenceScore('70%'), 70)
  assertEquals(parseConfidenceScore(78), 78)
  assertEquals(parseConfidenceScore(''), undefined)
})

Deno.test('P2-04 AC1/AC2/AC3/Q7 · full+serious / reason-only / name-only mapper', () => {
  const full = normalizeReportData(CARD_FULL_SERIOUS_REPORT_DATA)
  assertEquals(full.differentials.length, 2)
  assertEquals(full.differentials[0].name, 'Common cold')
  assertEquals(full.differentials[0].ordinal, 'most_likely')
  assertEquals(full.differentials[0].isSerious, undefined)
  assertTrue(full.differentials[0].furtherInvestigations?.length)
  assertTrue(full.differentials[0].symptomaticTreatment?.length)
  assertTrue(full.differentials[0].supportiveTreatment?.length)
  assertEquals(full.differentials[1].name, 'Sinus infection')
  assertEquals(full.differentials[1].ordinal, 'less_likely')
  assertEquals(full.differentials[1].isSerious, true)
  const blob = JSON.stringify(full.differentials)
  assertEquals(blob.includes('78'), false)
  assertEquals(blob.includes('%'), false)

  const reasonOnly = normalizeReportData(CARD_REASON_ONLY_REPORT_DATA)
  assertEquals(reasonOnly.differentials.length, 1)
  assertEquals(reasonOnly.differentials[0].name, 'Tension headache')
  assertEquals(reasonOnly.differentials[0].ordinal, 'possible')
  assertEquals(reasonOnly.differentials[0].reason?.includes('consistent'), true)
  assertEquals(reasonOnly.differentials[0].furtherInvestigations, undefined)
  assertEquals(reasonOnly.differentials[0].symptomaticTreatment, undefined)

  const nameOnly = normalizeReportData(CARD_NAME_ONLY_REPORT_DATA)
  assertEquals(nameOnly.differentials.length, 1)
  assertEquals(nameOnly.differentials[0].name, 'Unspecified consideration')
  assertEquals(nameOnly.differentials[0].ordinal, undefined)
  assertEquals(nameOnly.differentials[0].isSerious, undefined)
})

Deno.test('P2-04 AC5/Q6 · dosing lines omitted; guidance framing in card source', async () => {
  assertEquals(
    JSON.stringify(omitDosingLines(['Acetaminophen 500 mg every 6 hours', 'Saline rinses as needed'])),
    JSON.stringify(['Saline rinses as needed']),
  )
  const view = normalizeReportData(CARD_DOSING_REPORT_DATA)
  const tx = view.differentials[0].symptomaticTreatment || []
  assertEquals(tx.some((line) => /500\s*mg/i.test(line)), false, '500 mg absent')
  assertEquals(tx.includes('Saline rinses as needed'), true)
  assertTrue(view.differentials[0].supportiveTreatment?.includes('Rest and fluids'))

  const card = await Deno.readTextFile(CARD)
  assertTrue(card.includes('report.card.treatmentGuidance'), 'guidance framing i18n')
  assertTrue(card.includes('data-treatment-guidance'), 'guidance marker')
})

Deno.test('P2-04 AC6 · length 1 and 5; sixth dropped', () => {
  const one = normalizeReportData(CARD_LENGTH_ONE_REPORT_DATA)
  assertEquals(one.differentials.length, 1)
  assertEquals(one.differentials[0].ordinal, 'most_likely')

  const five = normalizeReportData(CARD_LENGTH_FIVE_REPORT_DATA)
  assertEquals(five.differentials.length, 5)
  assertEquals(five.differentials.map((d) => d.name).includes('Cause six dropped'), false)
  assertEquals(five.differentials[0].ordinal, 'most_likely')
  assertEquals(five.differentials[1].ordinal, 'possible')
  assertEquals(five.differentials[3].ordinal, 'less_likely')
  assertEquals(five.differentials[4].ordinal, 'less_likely')
})

Deno.test('P2-04 AC1–AC5 · shared card chrome + waitlist CTA + badge pair', async () => {
  const [view, card, app, chat, enRaw, handoffCta] = await Promise.all([
    Deno.readTextFile(VIEW),
    Deno.readTextFile(CARD),
    Deno.readTextFile(APP),
    Deno.readTextFile(CHAT),
    Deno.readTextFile(EN_I18N),
    Deno.readTextFile(HANDOFF_CTA),
  ])
  const en = JSON.parse(enRaw) as {
    report: {
      card: { doctorCta: string; ordinal: Record<string, string>; serious: string }
      doctor: { ctaWaitlist: string }
    }
  }

  assertTrue(view.includes("from './LibertyMDDiagnosisCard'"), 'view imports diagnosis card')
  assertTrue(view.includes('data-libertymd-diagnosis-cards'), 'cards list marker')
  assertTrue(view.includes('<LibertyMDDiagnosisCard'), 'renders card component')
  assertTrue(card.includes('data-libertymd-diagnosis-card'), 'card root marker')
  assertTrue(card.includes('data-ordinal-badge'), 'ordinal badge')
  assertTrue(card.includes('data-confidence-badge'), 'confidence-badge alias for AC2')
  assertTrue(card.includes('data-serious-badge'), 'serious badge')
  assertTrue(card.includes("data-badge-pair={"), 'badge pair attribute')
  assertTrue(card.includes("'most-likely-serious'"), 'composed most-likely-serious')
  assertTrue(card.includes("'serious-less-likely'"), 'serious-less-likely pair')
  assertTrue(card.includes('LibertyMDDoctorHandoffCta'), 'card uses shared doctor handoff CTA')
  assertTrue(handoffCta.includes('data-diagnosis-doctor-cta'), 'per-card doctor CTA marker on shared CTA')
  assertTrue(card.includes('useState(false)'), 'detail default collapsed')
  assertEquals(card.includes('emitReportSectionExpanded'), false, 'no nested expand telemetry')
  assertEquals(card.includes('trackLibertyMd'), false, 'no hand-typed Mixpanel on card')

  const cta = en.report.doctor.ctaWaitlist
  assertTrue(cta.toLowerCase().includes('notify') || cta.toLowerCase().includes('waitlist'), 'waitlist-honest CTA')
  for (const forbidden of FORBIDDEN_CTA_SUBSTRINGS) {
    assertEquals(
      cta.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `CTA must not include "${forbidden}"`,
    )
    assertEquals(
      card.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `card source must not include "${forbidden}"`,
    )
  }
  assertEquals(en.report.card.ordinal.most_likely, 'Most likely')
  assertEquals(en.report.card.ordinal.possible, 'Possible')
  assertEquals(en.report.card.ordinal.less_likely, 'Less likely')
  assertEquals(en.report.card.serious, 'Serious')

  // Chat + App share handoff wiring (P2-11 parity)
  assertTrue(chat.includes('<LibertyMDReportView'), 'Chat still renders shared report')
  assertTrue(chat.includes('onDoctorCta'), 'Chat wires onDoctorCta')
  assertTrue(chat.includes('footerSlot'), 'Chat wires footerSlot')
  assertTrue(app.includes('onDoctorCta'), 'App wires onDoctorCta')
  assertTrue(view.includes('onDoctorCta'), 'view accepts onDoctorCta')
  assertEquals(app.includes('Continue to a licensed doctor'), false, 'dishonest footer copy removed')
  assertTrue(app.includes('LibertyMDDoctorHandoffCta') || app.includes('LibertyMDDoctorHandoffPanel'), 'App uses shared handoff')
})

Deno.test('P2-04 R2 · collision fence — card no sticky / soft-gate; P2-11 via shared CTA', async () => {
  const [view, card] = await Promise.all([
    Deno.readTextFile(VIEW),
    Deno.readTextFile(CARD),
  ])
  assertEquals(/sticky|position:\s*sticky/.test(card), false, 'card no sticky')
  assertEquals(view.includes('soft-gate') || view.includes('softGate') || view.includes('soft_gate'), false, 'ReportView no soft-gate')
  assertEquals(card.includes('$39') || card.includes('full refund'), false, 'no supply claims on card')
})

Deno.test('P2-11 AC2/AC8 · App doctors destination honest — mock roster unreachable', async () => {
  const [app, panel, enRaw] = await Promise.all([
    Deno.readTextFile(APP),
    Deno.readTextFile(HANDOFF_PANEL),
    Deno.readTextFile(EN_I18N),
  ])
  assertTrue(app.includes('data-libertymd-doctors-destination'), 'honest doctors destination marker')
  assertTrue(app.includes('LibertyMDDoctorHandoffPanel'), 'destination uses handoff panel')
  assertEquals(app.includes('Dr. Elena Rostova'), false, 'mock Elena unreachable')
  assertEquals(app.includes('Dr. Rajiv Patel'), false, 'mock Rajiv unreachable')
  assertEquals(app.includes('Dr. Barry Pevner'), false, 'mock Barry unreachable')
  assertEquals(app.includes('Start visit'), false, 'Start visit unreachable on App handoff path')
  assertEquals(app.includes("t('app.availableIn'"), false, 'availableIn wait mock unused')
  for (const forbidden of ['$39', '€39', 'Start visit', ' mins']) {
    assertEquals(
      panel.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `panel must not hardcode "${forbidden}"`,
    )
  }
  const en = JSON.parse(enRaw) as { report: { doctor: Record<string, string> }; app: { handoffTitle: string } }
  assertTrue(en.report.doctor.networkComing.length > 0, 'network coming copy')
  assertTrue(en.report.doctor.notifyInvite.length > 0, 'notify invite copy')
  assertEquals(en.app.handoffTitle.toLowerCase().includes('notify') || en.app.handoffTitle.toLowerCase().includes('available'), true)
})

Deno.test('P2-11 AC5/AC6 · ReportView hide emergency + prominence + Chat parity', async () => {
  const [view, chat, config] = await Promise.all([
    Deno.readTextFile(VIEW),
    Deno.readTextFile(CHAT),
    Deno.readTextFile(DOCTOR_CTA_CONFIG),
  ])
  assertTrue(view.includes('shouldShowDoctorHandoff'), 'ReportView gates handoff visibility')
  assertTrue(view.includes('doctorHandoffProminence'), 'ReportView passes prominence')
  assertTrue(view.includes('showDoctorCta={showDoctorHandoff}'), 'cards gated on emergency/crisis')
  assertTrue(view.includes('footerSlot && showDoctorHandoff'), 'footerSlot gated')
  assertTrue(config.includes("tier !== 'crisis_line'"), 'crisis_line hide')
  assertTrue(chat.includes('LibertyMDDoctorHandoffPanel'), 'Chat mounts handoff panel')
  assertTrue(chat.includes('shouldShowDoctorHandoff'), 'Chat respects hide contract')
})

// ─── P2-05 · Sticky triage header + progressive disclosure ───────────────────

function memoryStorage(): {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
} {
  const map = new Map<string, string>()
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => { map.set(k, v) },
    removeItem: (k) => { map.delete(k) },
  }
}

Deno.test('P2-05 AC5 · shouldEnableReportSticky height gate', () => {
  assertEquals(LIBERTYMD_REPORT_STICKY_MIN_SCROLLER_PX, 500)
  assertEquals(shouldEnableReportSticky(499), false)
  assertEquals(shouldEnableReportSticky(500), true)
  assertEquals(shouldEnableReportSticky(720), true)
  assertEquals(shouldEnableReportSticky(Number.NaN), false)
})

Deno.test('P2-05 AC1/AC2 · sticky twin + overflow path + clearance + no fixed', async () => {
  const view = await Deno.readTextFile(VIEW)
  assertTrue(view.includes('data-libertymd-report-sticky'), 'sticky twin marker')
  assertTrue(view.includes('sticky top-0'), 'position sticky class')
  assertTrue(view.includes('data-libertymd-report-sticky-clearance'), 'clearance marker')
  assertTrue(view.includes('shouldEnableReportSticky'), 'height gate wired')
  assertTrue(view.includes('scrollPaddingTop'), 'scroll-padding clearance')
  assertTrue(view.includes('aria-hidden="true"'), 'sticky decorative a11y')
  assertTrue(view.includes('line-clamp-2'), 'next-step clamp')
  // Overflow trap fixed: report root must not clip sticky path
  const rootClassMatch = view.match(/data-libertymd-report[\s\S]*?className="([^"]+)"/)
  assertTrue(rootClassMatch, 'report root className')
  assertEquals(
    rootClassMatch![1].includes('overflow-hidden'),
    false,
    'report root must not overflow-hidden (sticky trap)',
  )
  assertEquals(view.includes('position: fixed') || view.includes('fixed top-0'), false, 'no fixed sticky')
  // Physical stick geometry = UNTESTABLE without viewport harness
})

Deno.test('P2-05 AC3 · collapsed teasers + i18n chrome', async () => {
  const [view, enRaw] = await Promise.all([
    Deno.readTextFile(VIEW),
    Deno.readTextFile(EN_I18N),
  ])
  assertTrue(view.includes('data-report-section-teaser'), 'teaser marker')
  assertTrue(view.includes('report.teasers.differential'), 'differential teaser key')
  assertTrue(view.includes('report.teasers.redFlags'), 'red flags teaser key')
  assertTrue(view.includes('report.teasers.soapSubjective'), 'SOAP chip keys')
  const en = JSON.parse(enRaw) as { report: { teasers: Record<string, string> } }
  assertTrue(en.report.teasers.differential.includes('{count}'), 'count interpolation')
  assertEquals(en.report.teasers.soapPlan, 'Plan')
  assertTrue(view.includes('!open && teaser'), 'teaser only when collapsed')
})

Deno.test('P2-05 AC4 · section persistence write/restore/isolation · no PHI', () => {
  const storage = memoryStorage()
  const a = 'consult-aaa-1111-2222-3333'
  const b = 'consult-bbb-1111-2222-3333'
  writeReportSections(a, { differential: false, soap: true }, storage)
  writeReportSections(b, { red_flags: true }, storage)

  const readA = mergeReportSectionOpen(readReportSections(a, storage))
  assertEquals(readA.differential, false)
  assertEquals(readA.soap, true)
  assertEquals(readA.assessment_and_plan, false, 'default closed when absent')
  assertEquals(readA.red_flags, false)

  const readB = mergeReportSectionOpen(readReportSections(b, storage))
  assertEquals(readB.red_flags, true)
  assertEquals(readB.differential, true, 'B keeps default open')

  const raw = storage.getItem(reportSectionsKey(a))!
  assertEquals(raw.includes('Viral'), false)
  assertEquals(raw.includes('chest'), false)
  assertEquals(raw.includes('Subjective'), false)
  const parsed = JSON.parse(raw) as { v: number; consultationId: string; sections: Record<string, boolean> }
  assertEquals(parsed.v, 1)
  assertEquals(parsed.consultationId, a)
  for (const v of Object.values(parsed.sections)) {
    assertEquals(typeof v, 'boolean')
  }

  clearReportSections(a, storage)
  assertEquals(readReportSections(a, storage), null)
  assertTrue(readReportSections(b, storage), 'B untouched')
})

Deno.test('P2-05 AC4 · draft inventory + PHI clear preserves sections; full clear drops', async () => {
  const {
    clearLibertyMdConsultClientPhi,
    clearLibertyMdConsultClientState,
    libertyMdConsultClientKeys,
    writeDraft,
    draftKey,
  } = await import('../../components/LibertyMD/libertymd-draft-persistence.ts')
  const storage = memoryStorage()
  writeDraft('consult-a', 'phi draft', storage, 6_000)
  writeReportSections('consult-a', { soap: true }, storage)
  assertTrue(
    libertyMdConsultClientKeys('consult-a').includes(reportSectionsKey('consult-a')),
    'inventory lists report-sections',
  )
  clearLibertyMdConsultClientPhi('consult-a', storage)
  assertEquals(storage.getItem(draftKey('consult-a')), null, 'PHI draft cleared')
  assertEquals(readReportSections('consult-a', storage)?.soap, true, 'sections survive PHI clear')
  clearLibertyMdConsultClientState('consult-a', storage)
  assertEquals(readReportSections('consult-a', storage), null, 'full clear drops sections')
})

Deno.test('P2-05 R2 · Chat/App pass consultationId; soft-gate absent from ReportView; card detail ephemeral', async () => {
  const [view, chat, app, card] = await Promise.all([
    Deno.readTextFile(VIEW),
    Deno.readTextFile(CHAT),
    Deno.readTextFile(APP),
    Deno.readTextFile(CARD),
  ])
  assertTrue(view.includes('consultationId'), 'ReportView accepts consultationId')
  assertTrue(chat.includes('consultationId={consultationId'), 'Chat passes consultationId')
  assertTrue(app.includes('consultationId={sessionId'), 'App passes consultationId')
  assertEquals(view.includes('soft-gate') || view.includes('softGate') || view.includes('soft_gate'), false)
  assertTrue(card.includes('useState(false)'), 'card detailOpen stays ephemeral')
  assertEquals(card.includes('report-sections'), false, 'no card section persistence')
})

// ─── P2-06 · Soft gate chrome + dismiss-once + expired omit ───────────────────

const CARE = new URL('../../components/LibertyMD/LibertyMDCareControls.tsx', import.meta.url)
const SOFT_GATE = new URL('../../components/LibertyMD/libertymd-soft-gate.ts', import.meta.url)
const CONTINUATION = new URL('../../components/LibertyMD/LibertyMDContinuationActionBar.tsx', import.meta.url)

function memorySoftGateStorage(): {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
} {
  const map = new Map<string, string>()
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => { map.set(k, v) },
    removeItem: (k) => { map.delete(k) },
  }
}

Deno.test('P2-06 AC2/AC5/AC8 · CareControls soft-gate benefits + h-14 Continue-as-guest; ReportView fence', async () => {
  const [care, view, enRaw] = await Promise.all([
    Deno.readTextFile(CARE),
    Deno.readTextFile(VIEW),
    Deno.readTextFile(EN_I18N),
  ])
  const en = JSON.parse(enRaw) as {
    reportGate: Record<string, string>
  }
  assertTrue(care.includes("t('reportGate.benefitKeep')"), 'benefit keep i18n')
  assertTrue(care.includes("t('reportGate.benefitHistory')"), 'benefit history i18n')
  assertTrue(care.includes("t('reportGate.benefitFamily')"), 'benefit family i18n')
  assertTrue(care.includes("t('reportGate.skip')"), 'Continue-as-guest uses reportGate.skip')
  assertTrue(care.includes('data-libertymd-soft-gate-continue-guest'), 'guest control marker')
  assertTrue(
    care.includes('h-14 w-full') && care.includes('border-libertymd-blue-600') && care.includes('data-libertymd-soft-gate-continue-guest'),
    'Continue-as-guest h-14 outline contract',
  )
  assertEquals(care.includes('$39') || care.includes('Free 24/7 care'), false, 'no $39 / legacy benefit chips')
  assertEquals(en.reportGate.skip, 'Continue as guest')
  assertEquals(en.reportGate.benefitKeep, 'Keep past 7 days')
  assertEquals(view.includes('soft-gate') || view.includes('reportGate'), false, 'ReportView has no soft-gate chrome')
})

Deno.test('P2-06 AC3/R3 · dismiss-once helper + Chat/App wire; Unlock copy gone', async () => {
  const {
    isSoftGateDismissed,
    markSoftGateDismissed,
    shouldOpenSoftGate,
    softGateKey,
  } = await import('../../components/LibertyMD/libertymd-soft-gate.ts')
  const storage = memorySoftGateStorage()
  assertEquals(shouldOpenSoftGate(true, 'c1', storage), true)
  markSoftGateDismissed('c1', storage)
  assertEquals(storage.getItem(softGateKey('c1')), 'true')
  assertEquals(isSoftGateDismissed('c1', storage), true)
  assertEquals(shouldOpenSoftGate(true, 'c1', storage), false)
  assertEquals(shouldOpenSoftGate(false, 'c1', storage), false)

  const [chat, app, soft, continuation] = await Promise.all([
    Deno.readTextFile(CHAT),
    Deno.readTextFile(APP),
    Deno.readTextFile(SOFT_GATE),
    Deno.readTextFile(CONTINUATION),
  ])
  assertTrue(soft.includes('sessionStorage') || soft.includes('SOFT_GATE_PREFIX'), 'sessionStorage helper')
  assertTrue(chat.includes('markSoftGateDismissed') && chat.includes('shouldOpenSoftGate'), 'Chat dismiss-once')
  assertTrue(app.includes('markSoftGateDismissed') && app.includes('shouldOpenSoftGate'), 'App dismiss-once')
  assertTrue(chat.includes('softGateDismissed') && app.includes('softGateDismissed'), 'hosts gate continuation reopen')
  assertTrue(continuation.includes('P2-06'), 'continuation bar documents no re-nag')
  assertEquals(app.includes('Unlock your report'), false, 'App Unlock placeholder gone')
  assertTrue(app.includes("t('chatx.phReportGate')"), 'App uses soft placeholder')
})

Deno.test('P2-06 AC7 · expired retention omits report body; NULL never omits', async () => {
  const reportPayload = { headline: 'Expired guest report', patient_summary: 'Should be omitted.' }
  const consultation = consultationRow({
    id: 'consult-expired-1',
    status: 'completed',
    user_id: 'user-1',
  })
  const past = new Date(Date.now() - 60_000).toISOString()
  const { ctx: expiredCtx } = createFakeContext({
    userId: 'user-1',
    consultation,
    report: {
      report_data: reportPayload,
      confidence_score: 80,
      access_status: 'guest_released',
      retention_expires_at: past,
    },
  })
  const expiredRes = await handleGetConsultation(expiredCtx, {
    action: 'get_consultation',
    consultation_id: consultation.id,
  })
  assertEquals(expiredRes.status, 200)
  const expiredBody = await expiredRes.json() as Record<string, unknown>
  assertEquals(expiredBody.report, null, 'expired → report null')

  const { ctx: nullCtx } = createFakeContext({
    userId: 'user-1',
    consultation,
    report: {
      report_data: reportPayload,
      confidence_score: 80,
      access_status: 'saved',
      retention_expires_at: null,
    },
  })
  const nullRes = await handleGetConsultation(nullCtx, {
    action: 'get_consultation',
    consultation_id: consultation.id,
  })
  const nullBody = await nullRes.json() as Record<string, unknown>
  assertEquals(JSON.stringify(nullBody.report), JSON.stringify(reportPayload), 'NULL retention never omits')

  const future = new Date(Date.now() + 86_400_000).toISOString()
  const { ctx: liveCtx } = createFakeContext({
    userId: 'user-1',
    consultation: consultationRow({
      id: 'consult-withheld-live',
      status: 'report_pending_auth',
      user_id: 'user-1',
    }),
    report: {
      report_data: reportPayload,
      confidence_score: 80,
      access_status: 'withheld',
      retention_expires_at: future,
    },
  })
  const liveRes = await handleGetConsultation(liveCtx, {
    action: 'get_consultation',
    consultation_id: 'consult-withheld-live',
  })
  const liveBody = await liveRes.json() as Record<string, unknown>
  assertEquals(JSON.stringify(liveBody.report), JSON.stringify(reportPayload), 'unexpired withheld still returned')

  const reads = await Deno.readTextFile(READS)
  const consultations = await Deno.readTextFile(CONSULTATIONS)
  // P2-13 may route omit via reportReadLifecycleMeta → reportDataIfNotExpired.
  assertTrue(reads.includes('retention_expires_at'), 'get_consultation selects retention')
  assertTrue(
    reads.includes('reportDataIfNotExpired') || reads.includes('reportReadLifecycleMeta'),
    'get_consultation omit',
  )
  assertTrue(consultations.includes('retention_expires_at') && consultations.includes('reportDataIfNotExpired'), 'replay omit')
})

Deno.test('P2-09 AC1/AC8 · delivery-actions slot + Download chooser; no silent dual click; soft-gate fence', async () => {
  const view = await Deno.readTextFile(VIEW)
  const en = JSON.parse(await Deno.readTextFile(EN_I18N)) as {
    report: { download: string; pdf: Record<string, string>; share: string; aiFraming: string }
  }

  assertTrue(view.includes('data-libertymd-report-delivery-actions'), 'shared delivery slot')
  assertTrue(view.includes('data-libertymd-report-download'), 'Download control')
  assertTrue(view.includes('data-libertymd-report-pdf-chooser'), 'chooser')
  assertTrue(view.includes('data-libertymd-report-pdf-choice="patient"'), 'patient choice')
  assertTrue(view.includes('data-libertymd-report-pdf-choice="soap"'), 'soap choice')
  assertTrue(view.includes('data-libertymd-report-pdf-choice="both"'), 'both choice')
  assertTrue(view.includes('data-libertymd-report-pdf-soap-second-tap'), 'gesture-safe SOAP second tap')
  assertTrue(view.includes('data-libertymd-report-pdf-ready-links'), 'ready links path')
  assertTrue(view.includes('emitReportDeliveryRequested'), 'download telemetry call site')
  assertTrue(view.includes("method: 'download'"), 'method download only from PDF path')
  // Concurrent P2-08 may mount email in the same slot — Download must remain visible.
  assertTrue(view.includes('data-libertymd-report-download'), 'Download not hidden beside email')
  assertEquals(view.includes('soft-gate') || view.includes('softGate') || view.includes('soft_gate'), false)
  assertEquals(view.includes(".from('libertymd_"), false, 'no FE clinical writes')
  assertEquals(view.includes('window.print'), false, 'not print-only')
  // PDF helper owns jspdf dynamic import — not ReportView
  assertEquals(view.includes("import('jspdf')"), false, 'jspdf dynamic import stays in helper')

  // No silent dual auto-download in Both path — second tap / ready links required
  assertTrue(view.includes('gesture-safe'), 'Both path documents gesture-safe obtain')
  assertTrue(view.includes('Never silent dual auto-download'), 'Both path forbids silent dual download')
  assertTrue(view.includes('triggerPdfDownload'), 'uses triggerPdfDownload helper')
  // ReportView must not fire two sequential anchor clicks inside runPdfDownload
  const downloadFn = view.slice(view.indexOf('const runPdfDownload'), view.indexOf('const onSoapSecondTap'))
  assertEquals((downloadFn.match(/\.click\(\)/g) || []).length, 0, 'runPdfDownload has no direct dual a.click')
  assertTrue(view.includes('onSoapSecondTap'), 'second-tap handler for SOAP')

  assertEquals(en.report.download, 'Download report')
  assertTrue(Boolean(en.report.pdf?.aiGenerated), 'dedicated PDF AI i18n')
  assertTrue(Boolean(en.report.pdf?.noClinicianReview), 'dedicated no-clinician i18n')
  assertTrue(en.report.aiFraming.includes('not a diagnosis'), 'on-screen framing unchanged')
  assertEquals(en.report.share, 'Share with your doctor')
})

Deno.test('P2-09 AC2 · no proxy PDF / Storage PHI path; package has jspdf', async () => {
  const pkg = JSON.parse(
    await Deno.readTextFile(new URL('../../package.json', import.meta.url)),
  ) as { dependencies?: Record<string, string> }
  assertTrue(Boolean(pkg.dependencies?.jspdf), 'jspdf client dependency')

  const pdfHelper = await Deno.readTextFile(
    new URL('../../components/LibertyMD/libertymd-report-pdf.ts', import.meta.url),
  )
  assertTrue(pdfHelper.includes("import('jspdf')"), 'dynamic import')
  assertEquals(pdfHelper.includes('libertymd-care-proxy'), false)
  assertEquals(pdfHelper.includes('.from('), false)
  assertEquals(pdfHelper.includes('puppeteer'), false)

  const indexSrc = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-care-proxy/index.ts', import.meta.url),
  )
  assertEquals(/pdf_report|generate_pdf|render_pdf/i.test(indexSrc), false, 'no proxy PDF action')
})

Deno.test('P2-10 AC1/AC2/AC4 · feedback child near saved/guest note; optional comment; not footerSlot', async () => {
  const view = await Deno.readTextFile(VIEW)
  const feedback = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDReportFeedback.tsx', import.meta.url),
  )
  const en = JSON.parse(await Deno.readTextFile(EN_I18N)) as {
    report: { feedback: Record<string, string> }
  }

  assertTrue(view.includes('LibertyMDReportFeedback'), 'ReportView mounts feedback child')
  assertTrue(view.includes('data-libertymd-report-saved-guest-note'), 'saved/guest note marker')
  assertTrue(feedback.includes('data-libertymd-report-feedback-yes'), 'yes')
  assertTrue(feedback.includes('data-libertymd-report-feedback-no'), 'no')
  assertTrue(feedback.includes('data-libertymd-report-feedback-comment'), 'optional comment')
  assertTrue(feedback.includes('data-libertymd-report-feedback="thanks"'), 'inline ack')
  assertTrue(en.report.feedback?.prompt?.length > 0, 'i18n prompt')
  assertTrue(/optional/i.test(en.report.feedback.commentOptional), 'optional label')
  assertEquals(view.includes('soft-gate') || view.includes('softGate'), false, 'no soft-gate in ReportView')
  assertEquals(
    /data-libertymd-report-footer-slot[\s\S]{0,300}LibertyMDReportFeedback/.test(view),
    false,
    'not inside doctor CTA footer marker',
  )
  assertEquals(
    /data-libertymd-report-delivery-actions[\s\S]{0,800}LibertyMDReportFeedback/.test(view),
    false,
    'not inside delivery-actions',
  )
})

// ─── P2-08 · Email delivery CTA (non-gating) ─────────────────────────────────

Deno.test('P2-08 AC1/AC6 · email delivery CTA on report surface; sections not gated', async () => {
  const view = await Deno.readTextFile(VIEW)
  const emailUi = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDReportEmailDelivery.tsx', import.meta.url),
  )
  assertTrue(view.includes('emailDelivery'), 'emailDelivery prop')
  assertTrue(view.includes('LibertyMDReportEmailDelivery'), 'email child mount')
  assertTrue(emailUi.includes('data-libertymd-email-delivery-cta'), 'email CTA marker')
  assertTrue(view.includes('data-libertymd-report-delivery-actions'), 'shared delivery slot')
  // Soft-gate chrome remains outside ReportView.
  assertEquals(view.includes('soft-gate') || view.includes('softGate'), false)
  // Email capture must not blur/hide report body.
  assertEquals(/filter:\s*blur|backdrop-blur.*report|hidden.*report_data/i.test(emailUi), false)
})

// ─── P2-13 · Report lifecycle (matrix hooks + omit honesty) ───────────────────

Deno.test('P2-13 AC3/AC7 · proxy omit returns retention + omit reason; ReportView ready marker', async () => {
  const reportPayload = { headline: 'Lifecycle guest report', patient_summary: 'Visible until lapse.' }
  const past = new Date(Date.now() - 60_000).toISOString()
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const consult = consultationRow({
    id: 'consult-lifecycle-1',
    user_id: 'user-lifecycle-1',
    status: 'report_pending_auth',
  })

  const { ctx: expiredCtx } = createFakeContext({
    userId: 'user-lifecycle-1',
    consultation: consult,
    report: {
      report_data: reportPayload,
      confidence_score: 70,
      access_status: 'guest_released',
      retention_expires_at: past,
    },
  })
  const expiredRes = await handleGetConsultation(expiredCtx, {
    action: 'get_consultation',
    consultation_id: consult.id,
  })
  assertEquals(expiredRes.status, 200)
  const expiredBody = await expiredRes.json() as Record<string, unknown>
  assertEquals(expiredBody.report, null, 'expired → report null')
  assertEquals(expiredBody.report_omitted_reason, 'retention_expired')
  assertEquals(expiredBody.retention_expires_at, past)

  const { ctx: liveCtx } = createFakeContext({
    userId: 'user-lifecycle-1',
    consultation: consult,
    report: {
      report_data: reportPayload,
      confidence_score: 70,
      access_status: 'withheld',
      retention_expires_at: future,
    },
  })
  const liveRes = await handleGetConsultation(liveCtx, {
    action: 'get_consultation',
    consultation_id: consult.id,
  })
  const liveBody = await liveRes.json() as Record<string, unknown>
  assertEquals(liveBody.report_omitted_reason, null)
  assertEquals(liveBody.retention_expires_at, future)
  assertEquals(JSON.stringify(liveBody.report), JSON.stringify(reportPayload))

  const view = await Deno.readTextFile(VIEW)
  assertTrue(view.includes('data-libertymd-report-lifecycle="ready"'), 'ready lifecycle marker')
  assertTrue(view.includes('retentionExpiresAt'), 'retention prop for pre-lapse')
})

// ─── P3-02 · Sample report on landing ─────────────────────────────────────────

Deno.test('P3-02 AC3/AC4 · uri_mundane sample fixture mirrors mundane structure + framing', async () => {
  const { URI_MUNDANE_SAMPLE_REPORT_DATA } = await import(
    '../../components/LibertyMD/libertymd-sample-report.ts'
  )
  const sample = normalizeReportData(URI_MUNDANE_SAMPLE_REPORT_DATA)
  const mundane = normalizeReportData(MUNDANE_FULL_REPORT_DATA)
  assertEquals(sample.triageTier, mundane.triageTier)
  assertEquals(sample.differentials.length, mundane.differentials.length)
  assertTrue(sample.nextStep, 'next step present')
  assertTrue(sample.soap?.subjective, 'SOAP present')
  assertTrue(sample.assessmentAndPlan, 'A&P present')
  assertEquals(sample.headline, mundane.headline)

  const view = await Deno.readTextFile(VIEW)
  const en = JSON.parse(await Deno.readTextFile(EN_I18N)) as {
    report: { aiFraming: string }
  }
  assertTrue(view.includes('report.aiFraming'), 'AI framing i18n key')
  assertTrue(en.report.aiFraming.includes('not a diagnosis'), 'framing string')
  assertTrue(en.report.aiFraming.includes('not reviewed by a clinician'), 'not clinician-reviewed')
})

Deno.test('P3-02 AC9 · variant=sample hides delivery + guest note; suppresses real-report analytics', async () => {
  const view = await Deno.readTextFile(VIEW)
  assertTrue(view.includes("variant = 'default'"), 'default variant')
  assertTrue(view.includes("variant === 'sample'") || view.includes("isSample = variant === 'sample'"), 'sample variant')
  assertTrue(view.includes('data-libertymd-report-variant={variant}'), 'variant marker')
  assertTrue(
    /!isSample\s*\?\s*\([\s\S]*?data-libertymd-report-delivery-actions/.test(view),
    'delivery-actions gated by !isSample',
  )
  assertTrue(
    /!isSample\s*\?\s*\([\s\S]*?data-libertymd-report-saved-guest-note/.test(view),
    'guest/saved note gated by !isSample',
  )
  assertTrue(/if \(isSample\) return/.test(view), 'sample skips scroll-depth effect')
  assertTrue(
    /if \(nextOpen && !isSample\) emitReportSectionExpanded/.test(view),
    'sample suppresses section_expanded',
  )
  // Default path still has delivery + guest note for real consults
  assertTrue(view.includes('data-libertymd-report-delivery-actions'), 'delivery marker still in source')
  assertTrue(view.includes('data-libertymd-report-saved-guest-note'), 'guest note marker still in source')
})

Deno.test('P3-02 AC2/AC8 · sample catalog synthetic-only + emitSampleReportViewed props', async () => {
  const catalog = await Deno.readTextFile(SAMPLE_CATALOG)
  const shell = await Deno.readTextFile(SAMPLE_SHELL)
  assertTrue(catalog.includes('uri_mundane'), 'cluster id')
  assertTrue(/synthetic/i.test(catalog), 'synthetic provenance')
  assertTrue(
    !/functions\.invoke|get_consultation|from\(['"]libertymd_/.test(catalog),
    'no clinical-table / consult fetch in sample catalog',
  )
  assertTrue(shell.includes('emitSampleReportViewed'), 'shell owns sample telemetry')
  assertTrue(shell.includes('variant="sample"'), 'mounts sample variant')
  assertTrue(!shell.includes('scrollParentRef='), 'does not pass scrollParentRef')
  assertTrue(!shell.includes('onDoctorCta='), 'omits doctor CTA')
  assertTrue(!shell.includes('emailDelivery='), 'omits email')
  assertTrue(!shell.includes('footerSlot='), 'omits footerSlot')
  assertTrue(!/consultationId=\{/.test(shell), 'omits consultationId')
  assertTrue(shell.includes('data-libertymd-sample-badge'), 'persistent badge marker')
  assertTrue(shell.includes('data-libertymd-sample-cta'), 'primary CTA marker')

  const events: Array<{ name: string; props: Record<string, unknown> }> = []
  __setLibertyMdTrackForTests((name, props) => {
    events.push({ name, props: { ...(props || {}) } })
  })
  try {
    emitSampleReportViewed({
      condition_cluster_id: 'uri_mundane',
      scroll_depth_bucket: 0,
    })
    emitSampleReportViewed({
      condition_cluster_id: 'uri_mundane',
      scroll_depth_bucket: 50,
    })
    assertEquals(events.length, 2)
    assertEquals(events[0].name, libertyMdEventName('sample_report_viewed'))
    assertEquals(events[0].props.condition_cluster_id, 'uri_mundane')
    assertEquals(events[0].props.scroll_depth_bucket, 0)
    assertEquals(events[1].props.scroll_depth_bucket, 50)
    const blob = JSON.stringify(events)
    assertEquals(blob.includes('consultation_id'), false, 'no consult id')
    assertEquals(blob.includes('sore throat'), false, 'no clinical prose in props')
    assertEquals(blob.includes('%'), false)
  } finally {
    __setLibertyMdTrackForTests(null)
  }
})

Deno.test('P3-02 AC1/AC6/AC12 · landing entry + freetext CTA; chips preserved', async () => {
  const app = await Deno.readTextFile(APP)
  assertTrue(app.includes('LibertyMDSampleReport'), 'SampleReport mounted')
  assertTrue(app.includes('data-libertymd-sample-report-entry'), 'hero-adjacent entry')
  assertTrue(app.includes('handleSampleReportStart'), 'sample start handler')
  assertTrue(
    /beginConsultation\([\s\S]{0,80}entry_type:\s*'freetext'/.test(app) ||
      /beginConsultation\(complaint,\s*\{\s*entry_type:\s*'freetext'/.test(app),
    'sample CTA freetext',
  )
  assertTrue(!/entry_type:\s*'sample'/.test(app), 'no invent sample entry_type')
  // BO 2026-08-01 — P3-05 complaint chips removed from the hero. The sample-report
  // entry and the freetext CTA (the subject of this ticket) are unaffected; the
  // chip catalogue module and the proxy's chip contract are intentionally left in
  // place, so only the rendered chips are gone.
  assertTrue(!app.includes('data-libertymd-complaint-chip'), 'chips removed from hero')

  const shell = await Deno.readTextFile(SAMPLE_SHELL)
  assertTrue(shell.includes('URI_MUNDANE_SAMPLE_COMPLAINT'), 'sore-throat aligned complaint')
  assertTrue(shell.includes('LibertyMDOverlaySheet'), 'OverlaySheet host')
})
