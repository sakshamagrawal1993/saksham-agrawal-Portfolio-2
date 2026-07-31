/**
 * P2-12 — libertymd_care_interest: proxy-only write, null-email intent, upsert,
 * column allow-list, no profiles.email merge, no delivery-token dual-write.
 *
 * Run: `deno test --no-config --no-check --allow-env --allow-read --sloppy-imports tests/libertymd/care-interest.mts`
 */
import {
  RECORD_CARE_INTEREST_ACTION,
  recordCareInterestBody,
} from '../../components/LibertyMD/libertymd-care-proxy-client.ts'
import { handleRecordCareInterest } from '../../supabase/functions/libertymd-care-proxy/actions/record-care-interest.ts'
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
  '../../supabase/migrations/20260731250000_libertymd_care_interest_p2_12.sql',
  import.meta.url,
)
const DELIVERY_MIGRATION = new URL(
  '../../supabase/migrations/20260731230000_libertymd_report_delivery_tokens_p2_08.sql',
  import.meta.url,
)
const INDEX = new URL('../../supabase/functions/libertymd-care-proxy/index.ts', import.meta.url)
const ACTION = new URL(
  '../../supabase/functions/libertymd-care-proxy/actions/record-care-interest.ts',
  import.meta.url,
)
const CLIENT = new URL('../../components/LibertyMD/libertymd-care-proxy-client.ts', import.meta.url)
const CARE = new URL('../../docs/libertymd/CARE-ARCHITECTURE.md', import.meta.url)
const PROFILES = new URL(
  '../../supabase/functions/libertymd-care-proxy/lib/profiles.ts',
  import.meta.url,
)
const DELIVERY_ACTION = new URL(
  '../../supabase/functions/libertymd-care-proxy/actions/report-email-delivery.ts',
  import.meta.url,
)

const ALLOWED_COLUMNS = new Set([
  'id',
  'user_id',
  'consultation_id',
  'contact_email',
  'triage_tier',
  'created_at',
  'retention_expires_at',
])

Deno.test('P2-12 AC1 · migration RLS + revoke client DML + grant service_role', async () => {
  const migration = await Deno.readTextFile(MIGRATION)
  assertTrue(/create\s+table[\s\S]*libertymd_care_interest/i.test(migration), 'create table')
  assertTrue(/enable\s+row\s+level\s+security/i.test(migration), 'RLS enabled')
  assertTrue(
    /revoke\s+all\s+on\s+table\s+public\.libertymd_care_interest\s+from\s+public,\s*anon,\s*authenticated/i.test(
      migration,
    ),
    'revoke client DML',
  )
  assertTrue(
    /grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+table\s+public\.libertymd_care_interest\s+to\s+service_role/i.test(
      migration,
    ),
    'grant service_role',
  )
  assertTrue(/on\s+delete\s+cascade/i.test(migration), 'CASCADE')
  assertTrue(/consultation_id\s+uuid\s+not\s+null\s+unique/i.test(migration), 'unique consult')
  assertEquals(/\bmarketing_consent\b/i.test(migration) && /marketing_consent\s+[a-z]/i.test(migration), false)
  // contact_email must be nullable (no NOT NULL on that column).
  assertEquals(
    /contact_email\s+text\s+not\s+null/i.test(migration),
    false,
    'contact_email nullable',
  )

  const index = await Deno.readTextFile(INDEX)
  assertTrue(index.includes("'record_care_interest'"), 'HANDLER registered')
  assertTrue(index.includes('handleRecordCareInterest'), 'handler import')
})

Deno.test('P2-12 AC2 · null-email intent succeeds; optional email also succeeds', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({ id: 'consultation-1', status: 'completed' }),
    report: {
      id: 'report-1',
      consultation_id: 'consultation-1',
      user_id: 'user-1',
      triage_tier: 'primary_care',
    },
  })
  const res = await handleRecordCareInterest(ctx, {
    action: 'record_care_interest',
    consultation_id: 'consultation-1',
  })
  assertEquals(res.status, 200, '200 null email')
  const body = await res.json() as Record<string, unknown>
  assertEquals(body.ok, true)
  assertEquals(body.has_contact_email, false)
  assertEquals(body.triage_tier, 'primary_care')

  const upserts = opsFor(ops, 'libertymd_care_interest', 'upsert')
  assertEquals(upserts.length, 1, 'care_interest upsert')
  const payload = (Array.isArray(upserts[0].payload)
    ? upserts[0].payload[0]
    : upserts[0].payload) as Record<string, unknown>
  assertEquals(payload.contact_email, null, 'null email stored')
  assertEquals(payload.user_id, 'user-1', 'JWT user_id')
  assertEquals(payload.triage_tier, 'primary_care', 'server tier')
  assertTrue(typeof payload.retention_expires_at === 'string', 'retention set')

  // Optional non-null email
  const { ctx: ctx2, ops: ops2 } = createFakeContext({
    consultation: consultationRow({ id: 'consultation-2', status: 'completed' }),
    report: {
      id: 'report-2',
      consultation_id: 'consultation-2',
      user_id: 'user-1',
      triage_tier: 'urgent_care',
    },
  })
  const res2 = await handleRecordCareInterest(ctx2, {
    action: 'record_care_interest',
    consultation_id: 'consultation-2',
    contact_email: '  Wait@Example.COM ',
  })
  assertEquals(res2.status, 200, '200 with email')
  const body2 = await res2.json() as Record<string, unknown>
  assertEquals(body2.has_contact_email, true)
  const payload2 = (Array.isArray(opsFor(ops2, 'libertymd_care_interest', 'upsert')[0].payload)
    ? (opsFor(ops2, 'libertymd_care_interest', 'upsert')[0].payload as unknown[])[0]
    : opsFor(ops2, 'libertymd_care_interest', 'upsert')[0].payload) as Record<string, unknown>
  assertEquals(payload2.contact_email, 'wait@example.com', 'normalized email')
})

Deno.test('P2-12 C3 · upsert re-join updates contact without duplicating demand', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({ id: 'consultation-1', status: 'completed' }),
    report: {
      id: 'report-1',
      consultation_id: 'consultation-1',
      user_id: 'user-1',
      triage_tier: 'er',
    },
    careInterest: {
      id: 'care-interest-existing',
      consultation_id: 'consultation-1',
      user_id: 'user-1',
      contact_email: null,
      triage_tier: 'er',
      created_at: '2026-07-01T00:00:00.000Z',
    },
  })
  const res = await handleRecordCareInterest(ctx, {
    action: 'record_care_interest',
    consultation_id: 'consultation-1',
    contact_email: 'later@example.com',
  })
  assertEquals(res.status, 200)
  const body = await res.json() as Record<string, unknown>
  assertEquals(body.updated, true)
  assertEquals(body.has_contact_email, true)
  const upserts = opsFor(ops, 'libertymd_care_interest', 'upsert')
  assertEquals(upserts.length, 1, 'single upsert — no duplicate insert path')
  assertEquals(opsFor(ops, 'libertymd_care_interest', 'insert').length, 0, 'no plain insert')
})

Deno.test('P2-12 AC4/L5 · reject when report / triage_tier absent; no client tier trust', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({ id: 'consultation-1', status: 'interviewing' }),
    report: null,
  })
  const res = await handleRecordCareInterest(ctx, {
    action: 'record_care_interest',
    consultation_id: 'consultation-1',
  })
  assertEquals(res.status, 409)
  const body = await res.json() as Record<string, unknown>
  assertEquals(body.code, 'report_not_ready')
  assertEquals(opsFor(ops, 'libertymd_care_interest', 'upsert').length, 0)

  const { ctx: ctx2, ops: ops2 } = createFakeContext({
    consultation: consultationRow({ id: 'consultation-1', status: 'completed' }),
    report: {
      id: 'report-1',
      consultation_id: 'consultation-1',
      user_id: 'user-1',
      triage_tier: null,
    },
  })
  const res2 = await handleRecordCareInterest(ctx2, {
    action: 'record_care_interest',
    consultation_id: 'consultation-1',
    // @ts-expect-error — client must not supply triage; ignored if present
    triage_tier: 'client_forged_tier',
  } as { action: 'record_care_interest'; consultation_id: string })
  assertEquals(res2.status, 409)
  assertEquals(opsFor(ops2, 'libertymd_care_interest', 'upsert').length, 0)
})

Deno.test('P2-12 AC4 · column allow-list on upsert payload; no clinical blobs', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({ id: 'consultation-1', status: 'completed' }),
    report: {
      id: 'report-1',
      consultation_id: 'consultation-1',
      user_id: 'user-1',
      triage_tier: 'primary_care',
      report_data: { differential_diagnosis: [{ name: 'secret' }] },
    },
  })
  await handleRecordCareInterest(ctx, {
    action: 'record_care_interest',
    consultation_id: 'consultation-1',
  })
  const payload = (Array.isArray(opsFor(ops, 'libertymd_care_interest', 'upsert')[0].payload)
    ? (opsFor(ops, 'libertymd_care_interest', 'upsert')[0].payload as unknown[])[0]
    : opsFor(ops, 'libertymd_care_interest', 'upsert')[0].payload) as Record<string, unknown>
  for (const key of Object.keys(payload)) {
    assertTrue(ALLOWED_COLUMNS.has(key), `unexpected column ${key}`)
  }
  assertEquals('report_data' in payload, false)
  assertEquals('filled_slots' in payload, false)
  assertEquals('comment' in payload, false)
})

Deno.test('P2-12 AC6 · never updates profiles.email; no marketing_consent', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({ id: 'consultation-1', status: 'completed' }),
    report: {
      id: 'report-1',
      consultation_id: 'consultation-1',
      user_id: 'user-1',
      triage_tier: 'primary_care',
    },
  })
  await handleRecordCareInterest(ctx, {
    action: 'record_care_interest',
    consultation_id: 'consultation-1',
    contact_email: 'wait@example.com',
  })
  assertEquals(opsFor(ops, 'libertymd_profiles', 'update').length, 0, 'no profiles update')
  assertEquals(opsFor(ops, 'libertymd_profiles', 'upsert').length, 0, 'no profiles upsert')
  assertEquals(opsFor(ops, 'libertymd_reports', 'update').length, 0, 'no report clinical update')

  const actionSrc = await Deno.readTextFile(ACTION)
  // Ban executable profiles writes — comments may name the fence.
  const actionBody = actionSrc
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
  assertEquals(/from\(\s*['"]libertymd_profiles['"]\)/i.test(actionBody), false, 'action never .from profiles')
  assertEquals(/marketing_consent/i.test(actionSrc), false)

  const migration = await Deno.readTextFile(MIGRATION)
  assertEquals(/marketing_consent\s+[a-z]/i.test(migration), false)

  const care = await Deno.readTextFile(CARE)
  assertTrue(/≠.*profiles\.email|not.*profiles\.email|never.*profiles\.email/i.test(care), 'CARE non-merge')
  assertTrue(/marketing/i.test(care), 'CARE non-marketing')
})

Deno.test('P2-12 C1 · never writes delivery tokens; P2-08 table distinct', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({ id: 'consultation-1', status: 'completed' }),
    report: {
      id: 'report-1',
      consultation_id: 'consultation-1',
      user_id: 'user-1',
      triage_tier: 'primary_care',
    },
  })
  await handleRecordCareInterest(ctx, {
    action: 'record_care_interest',
    consultation_id: 'consultation-1',
    contact_email: 'wait@example.com',
  })
  assertEquals(opsFor(ops, 'libertymd_report_delivery_tokens', 'insert').length, 0)
  assertEquals(opsFor(ops, 'libertymd_report_delivery_tokens', 'upsert').length, 0)

  const deliveryMig = await Deno.readTextFile(DELIVERY_MIGRATION)
  assertEquals(/create table[\s\S]{0,80}libertymd_care_interest/i.test(deliveryMig), false)

  const deliveryAction = await Deno.readTextFile(DELIVERY_ACTION)
  assertEquals(/libertymd_care_interest/i.test(deliveryAction), false, 'email-me never inserts care_interest')
})

Deno.test('P2-12 C2 · no CTA / waitlist Mixpanel invent; client helper only', async () => {
  const client = await Deno.readTextFile(CLIENT)
  assertTrue(client.includes(RECORD_CARE_INTEREST_ACTION), 'typed helper')
  assertTrue(client.includes('recordCareInterestBody'), 'builder')
  assertEquals(/doctor_cta_|waitlist_joined|DiagnosisCard|FooterSlot/i.test(client), false)

  const action = await Deno.readTextFile(ACTION)
  assertEquals(/PRODUCT_EVENT_NAMES|emitEvent|doctor_cta_|waitlist_joined/i.test(action), false)

  const body = recordCareInterestBody({ consultation_id: 'c-1' })
  assertEquals(body.action, 'record_care_interest')
  assertEquals(body.contact_email, null)
  assertEquals('triage_tier' in body, false)

  const withEmail = recordCareInterestBody({
    consultation_id: 'c-1',
    contact_email: 'a@b.co',
  })
  assertEquals(withEmail.contact_email, 'a@b.co')
})

Deno.test('P2-12 · FE never .from care_interest', async () => {
  const client = await Deno.readTextFile(CLIENT)
  const clientBody = client
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
  assertEquals(/\.from\(\s*['"]libertymd_care_interest/i.test(clientBody), false)
  // profiles path remains identity-owned (unchanged)
  const profiles = await Deno.readTextFile(PROFILES)
  assertTrue(/email:\s*user\.email/i.test(profiles), 'profiles email still from auth identity')
})
