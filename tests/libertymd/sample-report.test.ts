/**
 * P3-02 — Sample report catalog / Lexicon / AC6 prohibitory honesty.
 * Prefer also covered by `report-ui.test.ts` (in `:ci`). This file is a focused
 * companion for catalog allow-list + docs promotion; run via report-ui or:
 *   deno test --no-config --no-check --allow-env --allow-read --sloppy-imports \
 *     tests/libertymd/sample-report.test.ts
 */
import {
  __setLibertyMdTrackForTests,
  emitSampleReportViewed,
  libertyMdEventName,
} from '../../components/LibertyMD/libertymd-analytics.ts'
import { normalizeReportData } from '../../components/LibertyMD/libertymd-report.ts'
import {
  getSampleReportData,
  isLibertyMdSampleClusterId,
  LIBERTYMD_SAMPLE_CLUSTER_IDS,
  URI_MUNDANE_SAMPLE_COMPLAINT,
  URI_MUNDANE_SAMPLE_REPORT_DATA,
} from '../../components/LibertyMD/libertymd-sample-report.ts'

declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const LEXICON = new URL('../../docs/libertymd/MIXPANEL-LEXICON.md', import.meta.url)
const EN_I18N = new URL('../../i18n/locales/en.json', import.meta.url)
const SAMPLE_SHELL = new URL('../../components/LibertyMD/LibertyMDSampleReport.tsx', import.meta.url)
const SAMPLE_CATALOG = new URL('../../components/LibertyMD/libertymd-sample-report.ts', import.meta.url)

function assertTrue(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

function assertEquals(a: unknown, b: unknown, msg?: string) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

Deno.test('P3-02 · sample catalog allow-list is uri_mundane only', () => {
  assertEquals(LIBERTYMD_SAMPLE_CLUSTER_IDS.length, 1)
  assertEquals(LIBERTYMD_SAMPLE_CLUSTER_IDS[0], 'uri_mundane')
  assertTrue(isLibertyMdSampleClusterId('uri_mundane'), 'allow-listed')
  assertEquals(isLibertyMdSampleClusterId('sore_throat'), false, 'chip id ≠ cluster')
  assertEquals(isLibertyMdSampleClusterId('strep'), false, 'no diagnosis-as-id')
  const data = getSampleReportData('uri_mundane')
  assertEquals(data, URI_MUNDANE_SAMPLE_REPORT_DATA)
  assertEquals(URI_MUNDANE_SAMPLE_COMPLAINT, 'Sore throat')
  const view = normalizeReportData(data)
  assertEquals(view.triageTier, 'home')
  assertEquals(view.differentials.length, 3, 'exactly three differentials present')
})

Deno.test('FULL-REPORT · public sample is complete in English, Spanish, Hindi, and Hinglish', () => {
  for (const language of ['en', 'es', 'hi', 'hi-Latn']) {
    const view = normalizeReportData(getSampleReportData('uri_mundane', language))
    assertTrue(Boolean(view.headline), `${language}: session summary`)
    assertTrue(Boolean(view.patientSummary), `${language}: patient summary`)
    assertEquals(view.differentials.length, 3, `${language}: exactly three differentials`)
    for (const differential of view.differentials) {
      assertTrue(Boolean(differential.description), `${language}: differential description`)
      assertTrue(Boolean(differential.reason), `${language}: differential reasoning`)
    }
    assertTrue(Boolean(view.assessmentAndPlan.assessment), `${language}: clinical assessment`)
    assertTrue(view.assessmentAndPlan.plan.length > 0, `${language}: action plan`)
    assertTrue(view.assessmentAndPlan.selfCare.length > 0, `${language}: self care`)
    assertTrue(view.assessmentAndPlan.diagnosticInvestigations.length > 0, `${language}: investigations`)
    assertTrue(view.redFlags.length > 0, `${language}: red flags`)
    assertTrue(Boolean(view.soap.subjective), `${language}: SOAP subjective`)
    assertTrue(Boolean(view.soap.objective), `${language}: SOAP objective`)
    assertTrue(Boolean(view.soap.assessment), `${language}: SOAP assessment`)
    assertTrue(Boolean(view.soap.plan), `${language}: SOAP plan`)
  }
})

Deno.test('P3-02 · Lexicon promotes sample_report_viewed; EN sample chrome keys', async () => {
  const lexicon = await Deno.readTextFile(LEXICON)
  assertTrue(/`sample_report_viewed`/.test(lexicon), 'event row')
  assertTrue(/emitSampleReportViewed/.test(lexicon), 'helper')
  assertTrue(/condition_cluster_id/.test(lexicon), 'cluster prop')
  assertTrue(/scroll_depth_bucket/.test(lexicon), 'bucket prop')
  assertTrue(!/Landing \/ sample-report Register rows remain \*\*reserved\*\*/.test(lexicon), 'reserved note cleared')

  const en = JSON.parse(await Deno.readTextFile(EN_I18N)) as {
    sampleReport: Record<string, string>
  }
  assertTrue(en.sampleReport.entry.includes('sample report'), 'entry copy')
  assertTrue(/example|sample/i.test(en.sampleReport.badge), 'badge')
  assertTrue(!/%/.test(JSON.stringify(en.sampleReport)), 'no accuracy %')
  assertTrue(!/\$39|HIPAA|waitlist|book now|30 minutes/i.test(JSON.stringify(en.sampleReport)), 'AC6 prohibitory')
})

Deno.test('P3-02 · shell + catalog source contracts', async () => {
  const shell = await Deno.readTextFile(SAMPLE_SHELL)
  const catalog = await Deno.readTextFile(SAMPLE_CATALOG)
  assertTrue(shell.includes('data-libertymd-sample-report'), 'shell marker')
  assertTrue(shell.includes('emitSampleReportViewed'), 'telemetry owner')
  assertTrue(/Synthetic|synthetic/.test(catalog), 'provenance')
  assertTrue(!/consultation_id/.test(catalog), 'no consult id in catalog module')

  const events: Array<{ name: string; props: Record<string, unknown> }> = []
  __setLibertyMdTrackForTests((name, props) => {
    events.push({ name, props: { ...(props || {}) } })
  })
  try {
    emitSampleReportViewed({ condition_cluster_id: 'uri_mundane', scroll_depth_bucket: 0 })
    assertEquals(events[0].name, libertyMdEventName('sample_report_viewed'))
    assertEquals(Object.keys(events[0].props).sort().join(','), 'condition_cluster_id,emit_origin,locale,scroll_depth_bucket')
  } finally {
    __setLibertyMdTrackForTests(null)
  }
})
