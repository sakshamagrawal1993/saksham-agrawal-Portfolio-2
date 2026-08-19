/**
 * P4-03 — History drawer enrichment contracts.
 *
 * Asserts: enriched historySummary shape (no report_data), withhold/expired omit,
 * anon empty, guest TTL future retention, inactive-inclusive labels, UI empty/single/many
 * + grouping + report-first Chat contracts. No new PRODUCT_EVENT names.
 *
 * Run focused:
 *   deno test --no-config --no-check --allow-env --allow-read tests/libertymd/history-drawer.mts
 * Wired into `test:libertymd:ci` via `test:libertymd:history-drawer`.
 */
import { historySummary, headlineScalarFromReportData } from '../../supabase/functions/libertymd-care-proxy/lib/consultations.ts'
import { handleGetHistory } from '../../supabase/functions/libertymd-care-proxy/actions/reads.ts'
import {
  assertEquals,
  assertTrue,
  createFakeContext,
} from './support/proxy-doubles.mts'

declare const Deno: {
  test: (name: string, fn: () => unknown | Promise<unknown>) => void
  readTextFile: (path: string | URL) => Promise<string>
}

function linkedCtx(options: Parameters<typeof createFakeContext>[0] = {}) {
  const { ctx, ops } = createFakeContext({
    isAnonymous: false,
    profile: { user_id: 'user-1', age: 44, sex_at_birth: 'male', is_anonymous: false },
    ...options,
  })
  Object.assign(ctx, { isAnonymous: false })
  Object.assign(ctx.user, {
    email: 'linked@example.com',
    is_anonymous: false,
    app_metadata: { provider: 'google' },
    user_metadata: { full_name: 'Linked User' },
  })
  return { ctx, ops }
}

const FUTURE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

Deno.test('P4-03 AC3: anonymous historySummary is empty', async () => {
  const { ctx } = createFakeContext({
    isAnonymous: true,
    historyConsultations: [{ id: 'c1', status: 'completed', chief_complaint: 'x', created_at: '2026-07-01' }],
  })
  const rows = await historySummary(ctx)
  assertEquals(rows.length, 0)
  const response = await handleGetHistory(ctx)
  assertEquals(response.status, 200)
  const body = await response.json() as { account_required?: boolean; history?: unknown[] }
  assertEquals(body.account_required, true)
  assertEquals(Array.isArray(body.history) && body.history.length === 0, true)
})

Deno.test('P4-03 AC1/AC3: enriched saved row has triage/headline/patient; no report_data', async () => {
  const { ctx } = linkedCtx({
    historyConsultations: [
      {
        id: 'c-saved',
        status: 'completed',
        chief_complaint: 'sore throat for three days with fever',
        turn_count: 8,
        report_gate: 'reached',
        created_at: '2026-07-20T10:00:00.000Z',
        updated_at: '2026-07-20T11:00:00.000Z',
        completed_at: '2026-07-20T11:00:00.000Z',
        patient_id: 'patient-self',
      },
    ],
    historyReports: [
      {
        consultation_id: 'c-saved',
        access_status: 'saved',
        retention_expires_at: null,
        triage_tier: 'telehealth',
        report_data: { headline: 'Likely viral pharyngitis', triage: { care_setting: 'telehealth' } },
      },
    ],
    patients: [
      {
        id: 'patient-self',
        owner_user_id: 'user-1',
        relationship: 'self',
        display_label: 'Me',
        is_active: true,
      },
    ],
  })
  const rows = await historySummary(ctx) as Array<Record<string, unknown>>
  assertEquals(rows.length, 1)
  assertEquals(rows[0].headline, 'Likely viral pharyngitis')
  assertEquals(rows[0].triage_tier, 'telehealth')
  assertEquals(rows[0].patient_id, 'patient-self')
  assertEquals(rows[0].patient_display_label, 'Me')
  assertEquals(rows[0].retention_expires_at, null)
  assertEquals('report_data' in rows[0], false)
  assertEquals('access_status' in rows[0], false)
})

Deno.test('P4-03 AC3/Q1A: withheld and expired rows omitted from historySummary', async () => {
  const { ctx } = linkedCtx({
    historyConsultations: [
      {
        id: 'c-withheld',
        status: 'report_pending_auth',
        chief_complaint: 'chest discomfort',
        created_at: '2026-07-21T10:00:00.000Z',
        patient_id: 'patient-self',
      },
      {
        id: 'c-expired',
        status: 'completed',
        chief_complaint: 'old guest visit',
        created_at: '2026-07-10T10:00:00.000Z',
        patient_id: 'patient-self',
      },
      {
        id: 'c-incomplete',
        status: 'abandoned',
        chief_complaint: 'still talking',
        created_at: '2026-07-22T10:00:00.000Z',
        patient_id: 'patient-self',
      },
    ],
    historyReports: [
      {
        consultation_id: 'c-withheld',
        access_status: 'withheld',
        retention_expires_at: FUTURE,
        triage_tier: 'urgent_care',
        report_data: { headline: 'should not list' },
      },
      {
        consultation_id: 'c-expired',
        access_status: 'guest_released',
        retention_expires_at: PAST,
        triage_tier: 'home',
        report_data: { headline: 'expired body' },
      },
    ],
    patients: [
      { id: 'patient-self', owner_user_id: 'user-1', relationship: 'self', display_label: 'Me', is_active: true },
    ],
  })
  const rows = await historySummary(ctx) as Array<Record<string, unknown>>
  assertEquals(rows.length, 1)
  assertEquals(rows[0].id, 'c-incomplete')
  assertEquals(rows[0].headline, 'still talking')
  assertEquals(rows[0].triage_tier, null)
})

Deno.test('P4-03 AC4: future guest retention appears; past does not', async () => {
  const { ctx } = linkedCtx({
    historyConsultations: [
      {
        id: 'c-guest',
        status: 'completed',
        chief_complaint: 'guest visit',
        created_at: '2026-07-28T10:00:00.000Z',
        patient_id: 'patient-self',
      },
    ],
    historyReports: [
      {
        consultation_id: 'c-guest',
        access_status: 'guest_released',
        retention_expires_at: FUTURE,
        triage_tier: 'home',
        report_data: { headline: 'Guest released visit' },
      },
    ],
    patients: [
      { id: 'patient-self', owner_user_id: 'user-1', relationship: 'self', display_label: 'Me', is_active: true },
    ],
  })
  const rows = await historySummary(ctx) as Array<Record<string, unknown>>
  assertEquals(rows.length, 1)
  assertEquals(rows[0].retention_expires_at, FUTURE)
})

Deno.test('P4-03 AC6/S5: inactive patient label still attributable', async () => {
  const { ctx } = linkedCtx({
    historyConsultations: [
      {
        id: 'c-mom',
        status: 'completed',
        chief_complaint: 'mom visit',
        created_at: '2026-07-15T10:00:00.000Z',
        patient_id: 'patient-mom',
      },
    ],
    historyReports: [
      {
        consultation_id: 'c-mom',
        access_status: 'saved',
        retention_expires_at: null,
        triage_tier: 'telehealth',
        report_data: { headline: 'Mom telehealth visit' },
      },
    ],
    patients: [
      {
        id: 'patient-mom',
        owner_user_id: 'user-1',
        relationship: 'other',
        display_label: 'Mom',
        is_active: false,
      },
    ],
  })
  const rows = await historySummary(ctx) as Array<Record<string, unknown>>
  assertEquals(rows.length, 1)
  assertEquals(rows[0].patient_display_label, 'Mom')
})

Deno.test('P4-03 S2: headline scalar extracts; falls back when missing', () => {
  assertEquals(
    headlineScalarFromReportData({ headline: '  Viral URI  ' }),
    'Viral URI',
  )
  assertEquals(headlineScalarFromReportData({ differential_diagnosis: [] }), null)
  assertEquals(headlineScalarFromReportData(null), null)
})

Deno.test('P4-03 UI: CareControls hosts HistoryList; no FE libertymd_reports reads', async () => {
  const care = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDCareControls.tsx', import.meta.url),
  )
  const list = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDHistoryList.tsx', import.meta.url),
  )
  const chat = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDChat.tsx', import.meta.url),
  )
  assertTrue(care.includes('LibertyMDHistoryList'), 'drawer hosts HistoryList')
  assertTrue(!care.includes("from('libertymd_reports')"), 'CareControls no report table read')
  assertTrue(!list.includes("from('libertymd_reports')"), 'HistoryList no report table read')
  assertTrue(!chat.includes("from('libertymd_reports')"), 'Chat no report table read')
  assertTrue(list.includes('data-libertymd-history-state'), 'empty/single/many data-attrs')
  assertTrue(list.includes('groupHistoryByProfile'), 'grouping helper present')
  assertTrue(list.includes('historyRetentionRemaining'), 'TTL i18n key')
  assertTrue(list.includes('formatRetentionRemaining'), 'reuses lifecycle TTL formatter')
})

Deno.test('P4-03 AC2/AC5: Chat report-first + transcript one-tap; App navigate-only', async () => {
  const chat = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDChat.tsx', import.meta.url),
  )
  const app = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDApp.tsx', import.meta.url),
  )
  assertTrue(chat.includes('transcriptCollapsed'), 'report-first collapse state')
  assertTrue(chat.includes('data-libertymd-view-conversation'), 'one-tap reveal control')
  assertTrue(chat.includes("consultStatus === 'completed'"), 'completed-only gate')
  assertTrue(chat.includes('setTranscriptCollapsed'), 'collapse setter')
  assertTrue(
    !chat.includes("report_pending_auth") || chat.includes("consultStatus === 'completed'"),
    'report_pending_auth not forced report-first',
  )
  assertTrue(
    app.includes("navigate(`/liberty-md/chat?consultationId="),
    'App loadConsultation navigates to Chat',
  )
  // App must not implement its own transcript collapse / report-first hydrate.
  assertTrue(!app.includes('transcriptCollapsed'), 'App has no report-first hydrate')
})

Deno.test('P4-03 AC5/S7: i18n sibling keys for history + transcript control', async () => {
  const locales = ['en', 'es', 'es-ES', 'de', 'fr', 'hi', 'pt']
  for (const locale of locales) {
    const raw = await Deno.readTextFile(
      new URL(`../../i18n/locales/${locale}.json`, import.meta.url),
    )
    const data = JSON.parse(raw) as {
      careControls?: Record<string, string>
      chatx?: Record<string, string>
    }
    // es-ES is a partial override — require keys present when careControls has history section
    // or fall through to en; assert explicit keys we added.
    if (locale === 'es-ES') {
      assertTrue(Boolean(data.careControls?.historyHeading), `${locale} historyHeading`)
      assertTrue(Boolean(data.chatx?.viewConversation), `${locale} viewConversation`)
      continue
    }
    assertTrue(Boolean(data.careControls?.historyHeading), `${locale} historyHeading`)
    assertTrue(Boolean(data.careControls?.historyLoading), `${locale} historyLoading`)
    assertTrue(Boolean(data.careControls?.historyGroupHeading), `${locale} historyGroupHeading`)
    assertTrue(Boolean(data.careControls?.historyRetentionRemaining), `${locale} historyRetentionRemaining`)
    assertTrue(Boolean(data.careControls?.emptyHistory), `${locale} emptyHistory`)
    assertTrue(Boolean(data.chatx?.viewConversation), `${locale} viewConversation`)
  }
})

Deno.test('P4-03 AC7/S6: no new PRODUCT_EVENT / Mixpanel Lexicon lifecycle in ticket files', async () => {
  const consultations = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-care-proxy/lib/consultations.ts', import.meta.url),
  )
  const list = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDHistoryList.tsx', import.meta.url),
  )
  assertTrue(!consultations.includes('PRODUCT_EVENT_NAMES'), 'historySummary adds no event names')
  assertTrue(!list.includes('track(') && !list.includes('emitEvent'), 'history UI has no telemetry')
})

Deno.test('P4-03 CARE documents AC3 surface table + report-first', async () => {
  const care = await Deno.readTextFile(
    new URL('../../docs/libertymd/CARE-ARCHITECTURE.md', import.meta.url),
  )
  assertTrue(care.includes('P4-03 · History drawer enrichment'), 'CARE section present')
  assertTrue(care.includes('Row omitted'), 'AC3 list omit language')
  assertTrue(care.includes('Report-first reopen'), 'report-first documented')
  assertTrue(care.includes('**no** new PRODUCT_EVENT / Mixpanel / Lexicon names'), 'no telemetry lock')
})

/**
 * Regression — the report page opened the AccountDrawer without `history` /
 * `loading`. For a linked account the drawer takes the history branch, and
 * `history.length` on `undefined` threw during render, unmounting the whole
 * React tree: the app went blank to the `#F5F2EB` body background ("yellow
 * screen") instead of opening the side menu.
 */
Deno.test('Report page drawer: passes history + loading; HistoryList tolerates neither', async () => {
  const report = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDReportPage.tsx', import.meta.url),
  )
  const drawerProps = report.slice(
    report.indexOf('<LibertyMDAccountDrawer'),
    report.indexOf('/>', report.indexOf('<LibertyMDAccountDrawer')),
  )
  assertTrue(drawerProps.length > 0, 'report page renders the AccountDrawer')
  assertTrue(drawerProps.includes('history={'), 'drawer receives history')
  assertTrue(drawerProps.includes('loading={'), 'drawer receives loading')
  assertTrue(
    report.includes("action: 'get_history'"),
    'report page fetches history from the care proxy',
  )
  // The history branch is linked-only; `identityStatus` starts at 'loading',
  // so the guest panel must cover every not-yet-linked state.
  assertTrue(drawerProps.includes('isAnonymous={!isLinked}'), 'guest panel unless linked')

  const list = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDHistoryList.tsx', import.meta.url),
  )
  assertTrue(
    list.includes('Array.isArray(rawHistory) ? rawHistory : []'),
    'HistoryList degrades to empty instead of throwing on a missing history prop',
  )
})
