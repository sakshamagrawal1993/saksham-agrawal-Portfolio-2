/**
 * P2-09 / P2-16 — pure PDF helpers: two docs, headers, non-clinical filenames,
 * mangled omit, no numeric %, delivery telemetry shape, professional template
 * layout/logo contracts.
 *
 * Run: `npm run test:libertymd:report-pdf`
 */
import {
  __setLibertyMdTrackForTests,
  emitReportDeliveryRequested,
  libertyMdEventName,
} from '../../components/LibertyMD/libertymd-analytics.ts'
import {
  buildPatientPdfDoc,
  buildPdfFilename,
  buildSoapPdfDoc,
  flattenPdfDocText,
  formatPdfUtcDate,
  getPdfTemplateContract,
  PDF_CHROME_COLORS,
  PDF_LOGO_ASSET_REPO_PATH,
  PDF_LOGO_MAX_HEIGHT_PT,
  PDF_MARGIN_PT,
  PDF_TYPE_PT,
  planPdfLogoEmbed,
  resolvePdfLogoBytes,
  type LibertyMdPdfCopy,
} from '../../components/LibertyMD/libertymd-report-pdf.ts'
import { normalizeReportData } from '../../components/LibertyMD/libertymd-report.ts'
import {
  MANGLED_REPORT_DATA,
  MUNDANE_FULL_REPORT_DATA,
} from './fixtures/report-data.ts'

declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readFile(path: string): Promise<Uint8Array>
}

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function assertTrue(cond: unknown, msg?: string) {
  if (!cond) throw new Error(msg ?? 'Expected truthy')
}

const PDF_COPY: LibertyMdPdfCopy = {
  patientTitle: 'Patient summary',
  soapTitle: 'Physician SOAP note',
  summaryHeading: 'Summary',
  aiGenerated: 'AI-generated — not a diagnosis.',
  noClinicianReview: 'For licensed clinician review.',
  generatedLabel: 'Generated',
  sections: {
    sessionSummary: 'Session summary',
    patientSummary: 'Patient summary',
    triage: 'Recommended care setting',
    nextStep: 'What to do now',
    differential: 'Possible causes',
    assessmentAndPlan: 'Assessment and plan',
    redFlags: 'Red flags to watch',
    soap: 'SOAP note',
    plan: 'Plan',
    selfCare: 'Self-care',
    clinicalAssessment: 'Clinical assessment',
    investigations: 'Diagnostic investigations',
    aboutCondition: 'About this condition',
    whyConsidered: 'Why it is being considered',
    soapSubjective: 'Subjective',
    soapObjective: 'Objective',
    soapAssessment: 'Assessment',
    soapPlan: 'Plan',
  },
  ordinal: {
    high: 'Most likely',
    low: 'Possible',
    minimal: 'Less likely',
  },
  serious: 'Serious',
  meta: {
    patientName: 'Patient name:',
    gender: 'Gender:',
    age: 'Age:',
    date: 'Date:',
    anonymous: 'Anonymous guest',
    notSpecified: 'Not specified',
    page: 'Page',
    footer: 'AI-generated clinical summary — not a diagnosis · For licensed clinician review',
  },
  triageLabels: {
    home: 'Home care',
    telehealth: 'Telehealth',
    urgent_care: 'Urgent care',
    emergency_department: 'Emergency room',
    call_911: 'Call emergency services',
    crisis_line: 'Crisis support line',
    unknown: 'Care setting unavailable',
  },
}

const WHEN = new Date(Date.UTC(2026, 6, 31, 15, 30, 0))

Deno.test('P2-09 AC4 · filename UTC pattern; no clinical content', () => {
  assertEquals(formatPdfUtcDate(WHEN), '2026-07-31')
  assertEquals(buildPdfFilename('patient', WHEN), 'LibertyMD-patient-2026-07-31.pdf')
  assertEquals(buildPdfFilename('soap', WHEN), 'LibertyMD-soap-2026-07-31.pdf')

  const view = normalizeReportData(MUNDANE_FULL_REPORT_DATA)
  const patient = buildPatientPdfDoc(view, PDF_COPY, WHEN)
  const soap = buildSoapPdfDoc(view, PDF_COPY, WHEN)
  const ban = [
    view.headline,
    view.patientSummary,
    ...(view.differentials.map((d) => d.name)),
    view.soap?.subjective,
    'URI',
    'cold',
    'sore throat',
  ].filter(Boolean) as string[]

  for (const name of [patient.filename, soap.filename]) {
    assertTrue(/^LibertyMD-(patient|soap)-\d{4}-\d{2}-\d{2}\.pdf$/.test(name), `pattern ${name}`)
    for (const fragment of ban) {
      assertEquals(
        name.toLowerCase().includes(fragment.toLowerCase()),
        false,
        `filename must not contain clinical fragment: ${fragment}`,
      )
    }
  }
})

Deno.test('P2-09 AC1/AC3 · two doc kinds + shared AI / no-clinician headers', () => {
  const view = normalizeReportData(MUNDANE_FULL_REPORT_DATA)
  const patient = buildPatientPdfDoc(view, PDF_COPY, WHEN)
  const soap = buildSoapPdfDoc(view, PDF_COPY, WHEN)

  assertEquals(patient.kind, 'patient')
  assertEquals(soap.kind, 'soap')
  assertTrue(patient.sections.length > 0, 'patient has sections')
  assertTrue(soap.sections.length > 0, 'soap has SOAP sections')

  for (const doc of [patient, soap]) {
    const text = flattenPdfDocText(doc)
    assertTrue(text.includes('2026-07-31'), 'date in header')
    assertTrue(text.includes(PDF_COPY.aiGenerated), 'AI-generated header')
    assertTrue(text.includes(PDF_COPY.noClinicianReview), 'no clinician review')
    assertEquals(text.toLowerCase().includes('hipaa'), false, 'no HIPAA claim')
  }

  const soapText = flattenPdfDocText(soap)
  assertEquals(soapText.includes('Possible causes'), false, 'SOAP omits differential dump')
  assertTrue(soap.sections.some((s) => s.heading === 'Subjective'), 'SOAP S')
  assertTrue(soap.sections.some((s) => s.heading === 'Plan'), 'SOAP P')
})

Deno.test('P2-09 AC5 · mangled partial omits; no undefined; no numeric %', () => {
  const view = normalizeReportData(MANGLED_REPORT_DATA)
  const patient = buildPatientPdfDoc(view, PDF_COPY, WHEN)
  const soap = buildSoapPdfDoc(view, PDF_COPY, WHEN)

  assertEquals(soap.sections.length, 0, 'null SOAP → empty physician doc sections')
  const patientText = flattenPdfDocText(patient)
  const soapText = flattenPdfDocText(soap)
  assertEquals(patientText.includes('undefined'), false)
  assertEquals(soapText.includes('undefined'), false)
  // Ordinal labels OK; raw confidence % from fixture must not appear
  assertEquals(/\b\d{1,3}%\b/.test(patientText), false, 'no raw % confidence on patient PDF')
  assertEquals(/\b\d{1,3}%\b/.test(soapText), false, 'no raw % confidence on SOAP PDF')
  assertTrue(
    patient.sections.some((s) => s.bodyLines.some((l) => l.includes('Tension-type headache'))),
    'present differential retained',
  )
})

Deno.test('P2-09 AC7 · emitReportDeliveryRequested method download only; no PHI props', () => {
  const seen: Array<{ name: string; props: Record<string, unknown> }> = []
  __setLibertyMdTrackForTests((name, props) => {
    seen.push({ name, props })
  })
  try {
    emitReportDeliveryRequested({ method: 'download' })
    assertEquals(seen.length, 1)
    assertEquals(seen[0].name, libertyMdEventName('report_delivery_requested'))
    assertEquals(seen[0].props.method, 'download')
    assertEquals(seen[0].props.emit_origin, 'client')
    assertEquals('email' in seen[0].props, false)
    assertEquals('report' in seen[0].props, false)
    assertEquals('diagnosis' in seen[0].props, false)

    emitReportDeliveryRequested({ method: 'email' })
    assertEquals(seen[1].props.method, 'email')
  } finally {
    __setLibertyMdTrackForTests(null)
  }
})

Deno.test('P2-16 AC1/AC7 · template layout constants + token-cited chrome', () => {
  const contract = getPdfTemplateContract()
  assertEquals(contract.marginPt, PDF_MARGIN_PT)
  assertEquals(contract.marginPt, 48)
  assertEquals(contract.fontFamily, 'helvetica')
  assertEquals(contract.logoPages, 'first_only')
  assertEquals(contract.sharedChrome, true)
  assertEquals(contract.legalTierBelowTitle, true)

  // Type hierarchy: title > section > body > legal (distinct tiers)
  assertTrue(PDF_TYPE_PT.title > PDF_TYPE_PT.section, 'title > section')
  assertTrue(PDF_TYPE_PT.section > PDF_TYPE_PT.body, 'section > body')
  assertTrue(PDF_TYPE_PT.body > PDF_TYPE_PT.legal, 'body > legal')

  // Chrome hex must match token-cited values (no invent / no Saksham warm tones)
  assertEquals(PDF_CHROME_COLORS.accent, '#2563EB') // libertymd.color.primary.blue-600
  assertEquals(PDF_CHROME_COLORS.ink, '#111827') // libertymd.color.neutral.ink-900
  assertEquals(PDF_CHROME_COLORS.section, '#334155') // libertymd.color.neutral.slate-700
  assertEquals(PDF_CHROME_COLORS.legal, '#64748B') // libertymd.color.neutral.slate-500
  assertEquals(PDF_CHROME_COLORS.rule, '#CBD5E1') // libertymd.color.neutral.slate-300
  assertEquals(PDF_CHROME_COLORS.accent.toLowerCase().includes('c4'), false, 'no Saksham gold')
})

Deno.test('P2-16 AC2 · logo asset path + height constant + committed PNG exists', async () => {
  const contract = getPdfTemplateContract()
  assertEquals(contract.logoAssetRepoPath, PDF_LOGO_ASSET_REPO_PATH)
  assertEquals(contract.logoAssetPath, '/images/libertymd-logo-mark.png')
  assertTrue(
    PDF_LOGO_MAX_HEIGHT_PT >= 28 && PDF_LOGO_MAX_HEIGHT_PT <= 32,
    `logo max height 28–32 pt, got ${PDF_LOGO_MAX_HEIGHT_PT}`,
  )
  const bytes = await Deno.readFile(PDF_LOGO_ASSET_REPO_PATH)
  assertTrue(bytes.byteLength > 100, 'committed PNG non-empty')
  // PNG magic
  assertEquals(bytes[0], 0x89)
  assertEquals(bytes[1], 0x50)
  assertEquals(bytes[2], 0x4e)
  assertEquals(bytes[3], 0x47)
})

Deno.test('P2-16 AC2/AC3 · logo embed plan for both kinds; legal headers retained', async () => {
  const view = normalizeReportData(MUNDANE_FULL_REPORT_DATA)
  const patient = buildPatientPdfDoc(view, PDF_COPY, WHEN)
  const soap = buildSoapPdfDoc(view, PDF_COPY, WHEN)
  const logoBytes = await Deno.readFile(PDF_LOGO_ASSET_REPO_PATH)
  const resolved = await resolvePdfLogoBytes({ logoBytes })
  assertTrue(resolved != null && resolved.byteLength > 0, 'logo bytes resolve')

  // Shared chrome: both doc kinds plan first-page embed (jsPDF addImage is browser-gated)
  const patientPlan = planPdfLogoEmbed(resolved, 'patient')
  const soapPlan = planPdfLogoEmbed(resolved, 'soap')
  assertEquals(patientPlan.logoEmbedded, true)
  assertEquals(soapPlan.logoEmbedded, true)
  assertEquals(patientPlan.maxHeightPt, PDF_LOGO_MAX_HEIGHT_PT)
  assertEquals(soapPlan.maxHeightPt, PDF_LOGO_MAX_HEIGHT_PT)
  assertEquals(patientPlan.kind, 'patient')
  assertEquals(soapPlan.kind, 'soap')

  // Fixture docs still non-empty under template builders
  assertTrue(patient.sections.length > 0)
  assertTrue(soap.sections.length > 0)

  for (const doc of [patient, soap]) {
    const text = flattenPdfDocText(doc)
    assertTrue(text.includes(PDF_COPY.aiGenerated), 'AI-generated legal tier')
    assertTrue(text.includes(PDF_COPY.noClinicianReview), 'no clinician legal tier')
    assertEquals(text.toLowerCase().includes('hipaa'), false)
  }
})

Deno.test('P2-16 AC2 · logo omit on load failure still plans emit-without-logo', async () => {
  const resolved = await resolvePdfLogoBytes({ logoBytes: null })
  assertEquals(resolved, null)
  const plan = planPdfLogoEmbed(resolved, 'patient')
  assertEquals(plan.logoEmbedded, false)
  // Prefer-zero: omit logo must not block download — builders still produce a doc
  const view = normalizeReportData(MUNDANE_FULL_REPORT_DATA)
  const patient = buildPatientPdfDoc(view, PDF_COPY, WHEN)
  assertTrue(patient.headerLines.length === 3)
  assertTrue(patient.sections.length > 0)
})

Deno.test('P2-16 AC6 · mangled partial under new layout; no branded invent', async () => {
  const view = normalizeReportData(MANGLED_REPORT_DATA)
  const patient = buildPatientPdfDoc(view, PDF_COPY, WHEN)
  const soap = buildSoapPdfDoc(view, PDF_COPY, WHEN)
  assertEquals(soap.sections.length, 0)

  const patientText = flattenPdfDocText(patient)
  const soapText = flattenPdfDocText(soap)
  assertEquals(patientText.includes('undefined'), false)
  assertEquals(soapText.includes('undefined'), false)
  assertEquals(/\b\d{1,3}%\b/.test(patientText), false)
  // Empty SOAP keeps shared header chrome only — no invented SOAP body
  assertEquals(soap.headerLines.length, 3)
  assertTrue(soap.headerLines.some((l) => l.includes(PDF_COPY.aiGenerated)))
  // Logo omit path still available for partial renders
  assertEquals(planPdfLogoEmbed(null, 'soap').logoEmbedded, false)
})

Deno.test('FULL-REPORT · patient PDF localizes headings and includes every component', () => {
  const view = normalizeReportData(MUNDANE_FULL_REPORT_DATA)
  const spanishCopy: LibertyMdPdfCopy = {
    ...PDF_COPY,
    patientTitle: 'Informe para revisión médica',
    sections: {
      ...PDF_COPY.sections,
      sessionSummary: 'Resumen de la sesión',
      patientSummary: 'Resumen del paciente',
      differential: 'Diagnóstico diferencial',
      assessmentAndPlan: 'Plan de acción recomendado',
      redFlags: 'Señales de alarma',
      soap: 'Nota SOAP',
      clinicalAssessment: 'Evaluación clínica',
      investigations: 'Estudios adicionales',
      aboutCondition: 'Acerca de esta afección',
      whyConsidered: 'Por qué se considera',
    },
  }
  const doc = buildPatientPdfDoc(view, spanishCopy, WHEN)
  const headings = doc.sections.map((section) => section.heading)
  assertEquals(doc.title, spanishCopy.patientTitle)
  for (const required of [
    'Resumen de la sesión',
    'Resumen del paciente',
    'Diagnóstico diferencial',
    'Plan de acción recomendado',
    'Señales de alarma',
    'Nota SOAP',
  ]) assertTrue(headings.includes(required), `missing localized section ${required}`)

  const text = flattenPdfDocText(doc)
  assertTrue(text.includes('Acerca de esta afección'), 'condition description label')
  assertTrue(text.includes('Por qué se considera'), 'case reasoning label')
  assertTrue(text.includes('Evaluación clínica'), 'clinical assessment narrative')
  assertTrue(text.includes('Estudios adicionales'), 'diagnostic investigations')
})
