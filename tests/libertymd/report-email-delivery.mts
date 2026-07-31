/**
 * P2-08 — report email delivery: TTL, subject/preview, no body/attachment,
 * bearer redeem, expiry/unavailable, storage principles, mocked sync send failure.
 *
 * Run: `deno test --no-config --no-check --allow-env --allow-read --allow-net tests/libertymd/report-email-delivery.mts`
 */
import {
  handleRedeemReportLink,
  handleRequestReportEmail,
} from '../../supabase/functions/libertymd-care-proxy/actions/report-email-delivery.ts'
import {
  __setReportEmailSenderForTests,
  assertEmailContainsNoClinicalLeak,
  buildReportDeliveryEmail,
  REPORT_DELIVERY_EMAIL_PREHEADER,
  REPORT_DELIVERY_EMAIL_SUBJECT,
  REPORT_DELIVERY_TTL_MS,
  REPORT_DELIVERY_TTL_SECONDS,
} from '../../supabase/functions/libertymd-care-proxy/lib/report-email-delivery.ts'
import { sha256 } from '../../supabase/functions/libertymd-care-proxy/lib/utils.ts'
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

const CLINICAL_MARKERS = [
  'myocardial infarction',
  'differential_diagnosis',
  'pneumonia',
  'acs_chest_pain',
  'SOAP note body',
]

const WITHHELD_REPORT = {
  id: 'report-1',
  consultation_id: 'consultation-1',
  user_id: 'user-1',
  access_status: 'withheld',
  report_data: {
    differential_diagnosis: [{ name: 'myocardial infarction', confidence: 0.9 }],
    patient_summary: 'pneumonia concern',
  },
  confidence_score: 88,
}

function parseJson(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>
}

Deno.test('P2-08 AC2/AC3 · email builder is link-only with allow-listed subject/preview', () => {
  const content = buildReportDeliveryEmail('https://example.com/liberty-md/report?t=abc.def')
  assertEquals(content.subject, REPORT_DELIVERY_EMAIL_SUBJECT)
  assertEquals(content.preheader, REPORT_DELIVERY_EMAIL_PREHEADER)
  assertTrue(content.text.includes('https://example.com/liberty-md/report?t=abc.def'))
  assertTrue(content.html.includes('https://example.com/liberty-md/report?t=abc.def'))
  assertEmailContainsNoClinicalLeak(content, CLINICAL_MARKERS)
  assertEquals(REPORT_DELIVERY_TTL_MS, 24 * 60 * 60 * 1000)
  assertEquals(REPORT_DELIVERY_TTL_SECONDS, 86_400)
})

Deno.test('P2-08 AC5/Q4 · mint under withheld stores delivery token; no clinical report write', async () => {
  __setReportEmailSenderForTests(async () => ({ ok: true }))
  try {
    const { ctx, ops } = createFakeContext({
      consultation: consultationRow({
        status: 'report_pending_auth',
        user_id: 'user-1',
      }),
      report: WITHHELD_REPORT,
    })
    const response = await handleRequestReportEmail(ctx, {
      action: 'request_report_email',
      consultation_id: 'consultation-1',
      contact_email: 'guest@example.com',
    })
    assertEquals(response.status, 200)
    const body = await parseJson(response)
    assertEquals(body.ok, true)
    assertEquals(body.expires_in_seconds, REPORT_DELIVERY_TTL_SECONDS)

    const tokenInserts = opsFor(ops, 'libertymd_report_delivery_tokens', 'insert')
    assertEquals(tokenInserts.length, 1)
    const payload = tokenInserts[0].payload as Record<string, unknown>
    assertEquals(payload.contact_email, 'guest@example.com')
    assertTrue(typeof payload.token_hash === 'string' && String(payload.token_hash).length === 64)
    assertEquals(payload.report_id, 'report-1')
    const reportUpdates = opsFor(ops, 'libertymd_reports', 'update')
    assertEquals(reportUpdates.length, 0)
    const reportInserts = opsFor(ops, 'libertymd_reports', 'insert')
    assertEquals(reportInserts.length, 0)
  } finally {
    __setReportEmailSenderForTests(null)
  }
})

Deno.test('P2-08 AC7 · mocked sync send failure returns technical severity + retryable', async () => {
  __setReportEmailSenderForTests(async () => ({ ok: false, error: 'email_provider_rejected' }))
  try {
    const { ctx } = createFakeContext({
      consultation: consultationRow({ status: 'report_pending_auth' }),
      report: WITHHELD_REPORT,
    })
    const response = await handleRequestReportEmail(ctx, {
      action: 'request_report_email',
      consultation_id: 'consultation-1',
      contact_email: 'retry@example.com',
    })
    assertEquals(response.status, 502)
    const body = await parseJson(response)
    assertEquals(body.severity, 'technical')
    assertEquals(body.code, 'email_send_failed')
    assertEquals(body.retryable, true)
    assertTrue(String(body.error || '').length > 0)
  } finally {
    __setReportEmailSenderForTests(null)
  }
})

Deno.test('P2-08 AC4 · bearer redeem succeeds for fresh anon JWT (no owner match)', async () => {
  const rawToken = 'raw-token-for-redeem.part2'
  const tokenHash = await sha256(rawToken)
  const { ctx, ops } = createFakeContext({
    userId: 'fresh-anon-user',
    isAnonymous: true,
    report: {
      ...WITHHELD_REPORT,
      access_status: 'guest_released',
    },
    deliveryToken: {
      id: 'delivery-token-1',
      token_hash: tokenHash,
      consultation_id: 'consultation-1',
      report_id: 'report-1',
      contact_email: 'guest@example.com',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
  })
  const response = await handleRedeemReportLink(ctx, {
    action: 'redeem_report_link',
    delivery_token: rawToken,
  })
  assertEquals(response.status, 200)
  const body = await parseJson(response)
  assertEquals(body.status, 'ok')
  assertTrue(body.report && typeof body.report === 'object')
  const reportSelects = opsFor(ops, 'libertymd_reports', 'select')
  assertTrue(reportSelects.some((op) => op.filters.some((f) => f.column === 'id' && f.value === 'report-1')))
  assertEquals(
    reportSelects.some((op) => op.filters.some((f) => f.column === 'user_id')),
    false,
  )
})

Deno.test('P2-08 AC4 · expired token returns expired (no clinical body)', async () => {
  const rawToken = 'expired-token.part2'
  const tokenHash = await sha256(rawToken)
  const { ctx } = createFakeContext({
    userId: 'fresh-anon-user',
    report: WITHHELD_REPORT,
    deliveryToken: {
      token_hash: tokenHash,
      consultation_id: 'consultation-1',
      report_id: 'report-1',
      expires_at: new Date(Date.now() - 1_000).toISOString(),
    },
  })
  const response = await handleRedeemReportLink(ctx, {
    action: 'redeem_report_link',
    delivery_token: rawToken,
  })
  assertEquals(response.status, 410)
  const body = await parseJson(response)
  assertEquals(body.status, 'expired')
  assertEquals(body.report, undefined)
})

Deno.test('P2-08 AC4/S4 · missing report row returns unavailable (no false sign-in restore)', async () => {
  const rawToken = 'missing-report-token.part2'
  const tokenHash = await sha256(rawToken)
  const { ctx } = createFakeContext({
    userId: 'fresh-anon-user',
    report: null,
    deliveryToken: {
      token_hash: tokenHash,
      consultation_id: 'consultation-1',
      report_id: 'report-gone',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
  })
  const response = await handleRedeemReportLink(ctx, {
    action: 'redeem_report_link',
    delivery_token: rawToken,
  })
  assertEquals(response.status, 410)
  const body = await parseJson(response)
  assertEquals(body.status, 'unavailable')
  assertTrue(String(body.error || '').toLowerCase().includes('no longer available'))
  assertEquals(
    String(body.error || '').toLowerCase().includes('sign in to view'),
    false,
  )
})

Deno.test('P2-08 AC5 · migration has no marketing_consent / care_interest steal', async () => {
  const migration = await Deno.readTextFile(
    new URL('../../supabase/migrations/20260731230000_libertymd_report_delivery_tokens_p2_08.sql', import.meta.url),
  )
  assertTrue(migration.includes('libertymd_report_delivery_tokens'))
  assertTrue(migration.includes('token_hash'))
  assertTrue(migration.includes('contact_email'))
  assertTrue(migration.includes('expires_at'))
  // Comments may mention marketing_consent / care_interest as exclusions; no columns/tables.
  assertEquals(/\bmarketing_consent\b\s+[a-z]/i.test(migration), false)
  assertEquals(/create table[\s\S]{0,80}libertymd_care_interest/i.test(migration), false)
  assertTrue(/No marketing_consent|≠ marketing consent/i.test(migration))
  assertTrue(/revoke all on table public\.libertymd_report_delivery_tokens from public, anon, authenticated/i.test(migration))
})

Deno.test('P2-08 T1 · Lexicon promote; Postgres PRODUCT_EVENT_NAMES unchanged', async () => {
  const lexicon = await Deno.readTextFile(
    new URL('../../docs/libertymd/MIXPANEL-LEXICON.md', import.meta.url),
  )
  assertTrue(/report_delivery_requested/.test(lexicon))
  assertTrue(/emitReportDeliveryRequested/.test(lexicon))
  assertTrue(/method.*email/i.test(lexicon))

  const analytics = await Deno.readTextFile(
    new URL('../../components/LibertyMD/libertymd-analytics.ts', import.meta.url),
  )
  assertTrue(analytics.includes("trackLibertyMd('report_delivery_requested'"))
  assertTrue(analytics.includes('method: props.method'))

  const telemetry = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-care-proxy/lib/telemetry.ts', import.meta.url),
  )
  const namesBlock = telemetry.match(/PRODUCT_EVENT_NAMES\s*=\s*\[([\s\S]*?)\]\s*as\s*const/)
  assertTrue(Boolean(namesBlock))
  const names = [...(namesBlock?.[1] || '').matchAll(/\'([a-z0-9_]+)\'/g)].map((m) => m[1])
  assertEquals(names.length, 18)
  assertEquals(names.includes('report_delivery_requested'), false)
})

Deno.test('P2-08 AC1/AC6 · ReportView email CTA + Chat/App wire; soft-gate fence', async () => {
  const view = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDReportView.tsx', import.meta.url),
  )
  const emailUi = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDReportEmailDelivery.tsx', import.meta.url),
  )
  const chat = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDChat.tsx', import.meta.url),
  )
  const app = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDApp.tsx', import.meta.url),
  )
  const care = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDCareControls.tsx', import.meta.url),
  )

  assertTrue(emailUi.includes('data-libertymd-email-delivery-cta'))
  assertTrue(view.includes('emailDelivery'))
  assertTrue(view.includes('data-libertymd-report-delivery-actions'))
  assertTrue(chat.includes('emailDelivery=') && chat.includes('requestReportEmail'))
  assertTrue(app.includes('emailDelivery=') && app.includes('requestReportEmail'))
  assertTrue(chat.includes("emitReportDeliveryRequested({ method: 'email' })"))
  assertTrue(app.includes("emitReportDeliveryRequested({ method: 'email' })"))
  assertEquals(view.includes('soft-gate') || view.includes('softGate'), false)
  assertTrue(care.includes('data-libertymd-soft-gate-continue-guest') || care.includes('LibertyMDReportGate'))
  assertEquals(/blur-|opacity-0|hidden.*report_data|withhold/i.test(emailUi), false)
})

Deno.test('P2-08 · redeem deep-link route registered; honest unavailable copy keys', async () => {
  const appRouter = await Deno.readTextFile(new URL('../../App.tsx', import.meta.url))
  const redeem = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDReportRedeemPage.tsx', import.meta.url),
  )
  const en = JSON.parse(await Deno.readTextFile(new URL('../../i18n/locales/en.json', import.meta.url)))
  assertTrue(appRouter.includes('/liberty-md/report'))
  assertTrue(redeem.includes('data-libertymd-redeem-expired'))
  assertTrue(redeem.includes('data-libertymd-redeem-unavailable'))
  assertTrue(typeof en.report.emailDelivery.unavailableBody === 'string')
  assertTrue(en.report.emailDelivery.unavailableBody.includes('cannot restore'))
})
