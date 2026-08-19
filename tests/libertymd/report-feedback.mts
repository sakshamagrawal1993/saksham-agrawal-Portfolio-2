/**
 * P2-10 — report feedback: proxy store, one-submit, Mixpanel PHI ban, join contract,
 * insert-once non-clobber.
 *
 * Run: `deno test --no-config --no-check --allow-env --allow-read --sloppy-imports tests/libertymd/report-feedback.mts`
 */
import {
  __setLibertyMdTrackForTests,
  emitFeedbackSubmitted,
  LIBERTYMD_CLIENT_PHI_FORBIDDEN_KEYS,
  libertyMdEventName,
} from '../../components/LibertyMD/libertymd-analytics.ts'
import {
  REPORT_FEEDBACK_COMMENT_MAX,
  submitReportFeedbackBody,
  SUBMIT_REPORT_FEEDBACK_ACTION,
} from '../../components/LibertyMD/libertymd-care-proxy-client.ts'
import { handleSubmitReportFeedback } from '../../supabase/functions/libertymd-care-proxy/actions/submit-report-feedback.ts'
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

const MIGRATION = new URL(
  '../../supabase/migrations/20260731240000_libertymd_report_feedback_p2_10.sql',
  import.meta.url,
)
const TELEMETRY = new URL(
  '../../supabase/functions/libertymd-care-proxy/lib/telemetry.ts',
  import.meta.url,
)
const INDEX = new URL('../../supabase/functions/libertymd-care-proxy/index.ts', import.meta.url)
const FEEDBACK_UI = new URL('../../components/LibertyMD/LibertyMDReportFeedback.tsx', import.meta.url)
const VIEW = new URL('../../components/LibertyMD/LibertyMDReportView.tsx', import.meta.url)
const ANALYTICS = new URL('../../components/LibertyMD/libertymd-analytics.ts', import.meta.url)
const CLIENT = new URL('../../components/LibertyMD/libertymd-care-proxy-client.ts', import.meta.url)
const ACTION = new URL(
  '../../supabase/functions/libertymd-care-proxy/actions/submit-report-feedback.ts',
  import.meta.url,
)
const LEXICON = new URL('../../docs/libertymd/MIXPANEL-LEXICON.md', import.meta.url)
const CARE = new URL('../../docs/libertymd/CARE-ARCHITECTURE.md', import.meta.url)

Deno.test('P2-10 AC3 · proxy stores comment in libertymd_report_feedback; never reports clinical columns', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({ id: 'consultation-1', status: 'completed', turn_count: 8 }),
  })
  const res = await handleSubmitReportFeedback(ctx, {
    action: 'submit_report_feedback',
    consultation_id: 'consultation-1',
    helpful: false,
    comment: 'Missing dosing guidance',
  })
  assertEquals(res.status, 200, '200 ok')
  const body = await res.json() as Record<string, unknown>
  assertEquals(body.ok, true, 'ok')
  assertEquals(body.has_comment, true, 'has_comment')
  assertEquals(body.helpful, false, 'helpful')

  const inserts = opsFor(ops, 'libertymd_report_feedback', 'insert')
  assertEquals(inserts.length, 1, 'feedback insert recorded')
  const payload = (Array.isArray(inserts[0].payload)
    ? inserts[0].payload[0]
    : inserts[0].payload) as Record<string, unknown>
  assertEquals(payload.consultation_id, 'consultation-1', 'consultation_id')
  assertEquals(payload.user_id, 'user-1', 'user_id from JWT')
  assertEquals(payload.helpful, false, 'helpful stored')
  assertEquals(payload.comment, 'Missing dosing guidance', 'comment stored clinically')

  assertEquals(opsFor(ops, 'libertymd_reports', 'insert').length, 0, 'no report insert')
  assertEquals(opsFor(ops, 'libertymd_reports', 'update').length, 0, 'no report update')
  assertEquals(opsFor(ops, 'libertymd_reports', 'upsert').length, 0, 'no report upsert')
})

Deno.test('P2-10 AC2 · empty comment → has_comment false; helpful alone succeeds', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({ id: 'consultation-1', status: 'report_pending_auth' }),
  })
  const res = await handleSubmitReportFeedback(ctx, {
    action: 'submit_report_feedback',
    consultation_id: 'consultation-1',
    helpful: true,
    comment: '   ',
  })
  assertEquals(res.status, 200, '200 ok')
  const body = await res.json() as Record<string, unknown>
  assertEquals(body.has_comment, false, 'has_comment false')
  const inserts = opsFor(ops, 'libertymd_report_feedback', 'insert')
  const payload = (Array.isArray(inserts[0].payload)
    ? inserts[0].payload[0]
    : inserts[0].payload) as Record<string, unknown>
  assertEquals(payload.comment, null, 'null comment stored')
})

Deno.test('P2-10 AC6 · second submit UNIQUE conflict → 409', async () => {
  const { ctx } = createFakeContext({
    consultation: consultationRow({ id: 'consultation-1', status: 'completed' }),
    feedbackInsertConflict: true,
  })
  const res = await handleSubmitReportFeedback(ctx, {
    action: 'submit_report_feedback',
    consultation_id: 'consultation-1',
    helpful: true,
  })
  assertEquals(res.status, 409, '409 conflict')
  const body = await res.json() as Record<string, unknown>
  assertEquals(body.code, 'feedback_already_submitted', 'conflict code')
})

Deno.test('P2-10 Q4 · comment over 500 rejected', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({ id: 'consultation-1', status: 'completed' }),
  })
  const res = await handleSubmitReportFeedback(ctx, {
    action: 'submit_report_feedback',
    consultation_id: 'consultation-1',
    helpful: true,
    comment: 'x'.repeat(REPORT_FEEDBACK_COMMENT_MAX + 1),
  })
  assertEquals(res.status, 400, '400 too long')
  const body = await res.json() as Record<string, unknown>
  assertEquals(body.code, 'comment_too_long', 'code')
  assertEquals(opsFor(ops, 'libertymd_report_feedback', 'insert').length, 0, 'no insert')
})

Deno.test('P2-10 T1 · emitFeedbackSubmitted props are categoricals only; PHI keys banned', () => {
  const seen: Array<{ name: string; props: Record<string, unknown> }> = []
  __setLibertyMdTrackForTests((name, props) => {
    seen.push({ name, props })
  })
  try {
    emitFeedbackSubmitted({ helpful: true, has_comment: true })
    assertEquals(seen.length, 1, 'one emit')
    assertEquals(seen[0].name, libertyMdEventName('feedback_submitted'), 'Spec name')
    assertEquals(seen[0].props.helpful, true, 'helpful')
    assertEquals(seen[0].props.has_comment, true, 'has_comment')
    assertEquals(seen[0].props.emit_origin, 'client', 'emit_origin')
    assertEquals('comment' in seen[0].props, false, 'no comment prop')
    assertEquals('feedback_comment' in seen[0].props, false, 'no feedback_comment prop')
    assertTrue(
      (LIBERTYMD_CLIENT_PHI_FORBIDDEN_KEYS as readonly string[]).includes('comment'),
      'comment in PHI ban',
    )
    assertTrue(
      (LIBERTYMD_CLIENT_PHI_FORBIDDEN_KEYS as readonly string[]).includes('feedback_comment'),
      'feedback_comment in PHI ban',
    )
  } finally {
    __setLibertyMdTrackForTests(null)
  }
})

Deno.test('P2-10 AC3 · client helper never includes free text in Mixpanel path; typed body only', () => {
  const body = submitReportFeedbackBody({
    consultation_id: 'c-1',
    helpful: false,
    comment: 'secret clinical dump',
  })
  assertEquals(body.action, SUBMIT_REPORT_FEEDBACK_ACTION, 'action')
  assertEquals(body.comment, 'secret clinical dump', 'comment for proxy only')
  const seen: Array<Record<string, unknown>> = []
  __setLibertyMdTrackForTests((_name, props) => {
    seen.push(props)
  })
  try {
    emitFeedbackSubmitted({ helpful: false, has_comment: true })
    assertEquals(Object.keys(seen[0]).sort().join(','), 'emit_origin,has_comment,helpful,locale', 'props only')
  } finally {
    __setLibertyMdTrackForTests(null)
  }
})

Deno.test('P2-10 AC5 · migration UNIQUE FK + join contract; CARE documents join keys', async () => {
  const sql = await Deno.readTextFile(MIGRATION)
  assertTrue(/create table if not exists public\.libertymd_report_feedback/i.test(sql), 'table')
  assertTrue(/consultation_id uuid not null unique/i.test(sql), 'UNIQUE consultation_id')
  assertTrue(/references public\.libertymd_consultations/i.test(sql), 'FK consultations')
  assertTrue(/enable row level security/i.test(sql), 'RLS on')
  assertTrue(
    /revoke all on table public\.libertymd_report_feedback from public, anon, authenticated/i.test(sql),
    'revoke client DML',
  )
  assertTrue(/char_length\(comment\) <= 500/i.test(sql), '500 cap')

  const care = await Deno.readTextFile(CARE)
  assertTrue(/libertymd_report_feedback/i.test(care), 'CARE names store')
  assertTrue(/turn_count/i.test(care) && /triage_tier/i.test(care), 'CARE join keys')
  assertTrue(/submit_report_feedback/i.test(care), 'CARE action')
  assertTrue(/PRODUCT_EVENT_NAMES/i.test(care), 'CARE mentions PRODUCT_EVENT_NAMES')
})

Deno.test('P2-10 T1 · Lexicon closed-client + no PRODUCT_EVENT_NAMES widen; HANDLER registered', async () => {
  const lexicon = await Deno.readTextFile(LEXICON)
  assertTrue(/feedback_submitted/.test(lexicon), 'Lexicon row')
  assertTrue(/emitFeedbackSubmitted/.test(lexicon), 'helper named')
  assertTrue(/has_comment/.test(lexicon) && /helpful/.test(lexicon), 'props')

  const telemetry = await Deno.readTextFile(TELEMETRY)
  const namesBlock = telemetry.match(/PRODUCT_EVENT_NAMES\s*=\s*\[([\s\S]*?)\]\s*as\s*const/)
  assertTrue(Boolean(namesBlock), 'PRODUCT_EVENT_NAMES present')
  assertEquals(/feedback_submitted/.test(namesBlock![1]), false, 'must not widen Postgres allow-list')

  const index = await Deno.readTextFile(INDEX)
  assertTrue(/submit_report_feedback/.test(index), 'HANDLER registered')
  assertTrue(/handleSubmitReportFeedback/.test(index), 'handler import')
})

Deno.test('P2-10 AC1/AC4/R1 · UI source contracts: yes/no, optional comment, ack, not footerSlot/delivery', async () => {
  const ui = await Deno.readTextFile(FEEDBACK_UI)
  const view = await Deno.readTextFile(VIEW)
  // UPDATED 2026-08-19 — the binary yes/no was replaced by a 0-10 likelihood
  // scale in 1ee203d, and the single-line input by a bounded textarea. The old
  // assertions below asserted the pre-1ee203d design and had been failing on
  // main ever since, invisible because `:ci` is an && chain that halted at
  // visual-boundary (gate 45) long before this gate (58).
  //
  // Retired, kept for provenance:
  //   assertTrue(/data-libertymd-report-feedback-yes/.test(ui), 'yes control')
  //   assertTrue(/data-libertymd-report-feedback-no/.test(ui), 'no control')
  //   assertTrue(/type="text"/.test(ui) && !/textarea/i.test(ui), 'single-line input')
  //
  // Replaced with the CURRENT contract, so the gate still fails if the rating
  // surface or its helpful-derivation is removed. Deleting outright would have
  // left a live clinical surface with no source contract at all.
  assertTrue(/data-libertymd-feedback-score/.test(ui), 'likelihood scale rendered')
  assertTrue(/aria-pressed/.test(ui), 'scale buttons expose selected state')
  assertTrue(/selectedRating\s*>=\s*7/.test(ui), 'helpful derived from rating threshold')
  assertTrue(/data-libertymd-report-feedback-comment/.test(ui), 'optional comment')
  assertTrue(/data-libertymd-report-feedback="thanks"/.test(ui), 'inline ack')
  assertTrue(/REPORT_FEEDBACK_COMMENT_MAX/.test(ui), 'comment length is bounded')
  assertTrue(/emitFeedbackSubmitted/.test(ui), 'Mixpanel emit on success path')
  assertTrue(/submitReportFeedbackBody/.test(ui), 'typed proxy body')
  assertTrue(/functions\.invoke\('libertymd-care-proxy'/.test(ui), 'proxy invoke only')
  assertEquals(/\.from\(\s*['"]libertymd_/i.test(ui), false, 'no FE clinical write')

  assertTrue(/LibertyMDReportFeedback/.test(view), 'mounted from ReportView')
  assertTrue(/data-libertymd-report-saved-guest-note/.test(view), 'near saved/guest note')
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
  assertEquals(view.includes('soft-gate') || view.includes('softGate'), false, 'no soft-gate chrome')
})

Deno.test('P2-10 · action + analytics + client modules present on manifesto paths', async () => {
  const action = await Deno.readTextFile(ACTION)
  const analytics = await Deno.readTextFile(ANALYTICS)
  const client = await Deno.readTextFile(CLIENT)
  assertTrue(/handleSubmitReportFeedback/.test(action), 'action export')
  assertTrue(/libertymd_report_feedback/.test(action), 'table name')
  assertTrue(/23505/.test(action), 'unique conflict')
  assertTrue(/emitFeedbackSubmitted/.test(analytics), 'analytics helper')
  assertTrue(/'comment'/.test(analytics) && /'feedback_comment'/.test(analytics), 'PHI ban keys')
  assertTrue(/submitReportFeedbackBody/.test(client), 'typed helper')
})
