/**
 * P1-19 — landing attribution client contracts (allow-list + raw-query ban).
 */
import {
  FORBIDDEN_RAW_QUERY_PARAMS,
  parseLandingQueryParams,
  sanitizeLandingAttributionBag,
} from '../../components/LibertyMD/libertymd-landing-attribution.ts'

declare const Deno: {
  test: (name: string, fn: () => unknown | Promise<unknown>) => void
  readTextFileSync: (path: string) => string
}

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function assertTrue(value: unknown, message?: string) {
  if (!value) throw new Error(message || 'Expected truthy')
}

Deno.test('P1-19 AC2 · allow-listed UTM + keyword_id persist', () => {
  const parsed = parseLandingQueryParams(
    'utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_content=ad1&keyword_id=kw_sore_throat&topic=sore-throat&q=fever%20and%20cough',
  )
  assertEquals(parsed.utm_source, 'google')
  assertEquals(parsed.utm_medium, 'cpc')
  assertEquals(parsed.utm_campaign, 'spring')
  assertEquals(parsed.utm_content, 'ad1')
  assertEquals(parsed.keyword_id, 'kw_sore_throat')
  assertEquals(parsed.matched_topic_slug, 'sore-throat')
  assertEquals((parsed as Record<string, unknown>).q, undefined, 'raw q never lands')
})

Deno.test('P1-19 AC2 · raw q= / query / search never become keyword_id', () => {
  for (const banned of FORBIDDEN_RAW_QUERY_PARAMS) {
    const parsed = parseLandingQueryParams(`${banned}=fever+and+cough+help`)
    assertEquals(parsed.keyword_id, undefined, `${banned} must not mint keyword_id`)
    assertEquals(parsed.matched_topic_slug, undefined, `${banned} must not mint topic`)
    assertEquals(Object.keys(parsed).length, 0, `${banned}-only query yields empty attribution`)
  }
})

Deno.test('P1-19 AC2 · free-text / symptom-like values fail shape check', () => {
  const parsed = parseLandingQueryParams(
    'keyword_id=I%20have%20chest%20pain%20please%20help&utm_campaign=this%20is%20a%20sentence%20with%20spaces',
  )
  assertEquals(parsed.keyword_id, undefined)
  assertEquals(parsed.utm_campaign, undefined)
})

Deno.test('P1-19 AC2 · sanitizeLandingAttributionBag drops forbidden keys', () => {
  const cleaned = sanitizeLandingAttributionBag({
    anon_session_key: '00000000-0000-4000-8000-0000000000aa',
    keyword_id: 'kw_cough',
    q: 'fever and cough',
    query: 'shortness of breath',
    search: 'help',
  } as Record<string, unknown>)
  assertEquals(cleaned.keyword_id, 'kw_cough')
  assertEquals(cleaned.anon_session_key, '00000000-0000-4000-8000-0000000000aa')
  assertEquals((cleaned as Record<string, unknown>).q, undefined)
  assertEquals((cleaned as Record<string, unknown>).query, undefined)
})

Deno.test('P3-06 AC2 · client charset still forwards opaque ids; server coerce is SoT', () => {
  // Client may forward charset-valid unknowns; proxy resolveKeywordAttribution nulls them.
  const cleaned = sanitizeLandingAttributionBag({
    keyword_id: 'kw-chest',
    matched_topic_slug: 'chest-pain',
  })
  assertEquals(cleaned.keyword_id, 'kw-chest')
  assertEquals(cleaned.matched_topic_slug, 'chest-pain')
})

Deno.test('P1-19 AC3 · session key required shape is UUID — not user_id field', () => {
  const cleaned = sanitizeLandingAttributionBag({
    anon_session_key: 'not-a-uuid',
    user_id: '00000000-0000-4000-8000-0000000000bb',
  } as Record<string, unknown>)
  assertEquals(cleaned.anon_session_key, undefined)
  assertEquals((cleaned as Record<string, unknown>).user_id, undefined, 'user_id never forwarded')
})

Deno.test('P1-19 AC6 · rates SQL artifact shape (not a view)', () => {
  const sql = Deno.readTextFileSync('scripts/sql/libertymd-landing-attribution-rates.sql')
  assertTrue(sql.includes('utm_campaign'), 'groups by utm_campaign')
  assertTrue(sql.includes('keyword_id'), 'groups by keyword_id')
  assertTrue(sql.includes('completed_rate'), 'defines completed_rate')
  assertTrue(sql.includes("c.status = 'completed'"), 'completed filter')
  assertTrue(sql.includes('landing_session_id = l.id'), 'FK join')
  assertTrue(sql.includes('direct_or_unknown'), 'null campaign/keyword label')
  assertTrue(!/\bcreate\s+(materialized\s+)?view\b/i.test(sql), 'must not create a view')
})

Deno.test('P1-19 AC1 · migration RLS write-only posture (grep)', () => {
  const migration = Deno.readTextFileSync(
    'supabase/migrations/20260731170000_libertymd_landing_sessions_p1_19.sql',
  )
  assertTrue(migration.includes('libertymd_landing_sessions'), 'creates table')
  assertTrue(migration.includes('enable row level security'), 'RLS on')
  assertTrue(migration.includes('revoke all'), 'revoke client access')
  assertTrue(migration.includes('landing_session_id'), 'consult FK')
  assertTrue(migration.includes('on delete set null'), 'SET NULL for P1-23')
  assertTrue(migration.includes('retention_expires_at'), 'retention stub')
  assertTrue(migration.includes('P1-23'), 'P1-23 follow-on comment')
  assertTrue(!/create policy/i.test(migration), 'no client policies')
  const createMatch = migration.match(
    /create table if not exists public\.libertymd_landing_sessions\s*\(([\s\S]*?)\)\s*;/i,
  )
  assertTrue(createMatch, 'landing create table present')
  assertTrue(!/\buser_id\b/i.test(createMatch?.[1] || ''), 'landing columns have no user_id')
})
