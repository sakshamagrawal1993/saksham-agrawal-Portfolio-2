/**
 * P3-06 — keyword content catalog + client↔server set equality + unmatched.
 */
import {
  KEYWORD_CONTENT_CATALOG,
  KEYWORD_IDS,
  KEYWORD_TOPIC_SLUGS,
  findClusterByKeywordId,
  findClusterByTopicSlug,
  resolveKeywordAttribution,
  topicSlugFromLandingPath,
} from '../../supabase/functions/libertymd-care-proxy/lib/keyword-content-map.ts'
import {
  LIBERTYMD_KEYWORD_CONTENT_CATALOG,
  LIBERTYMD_KEYWORD_IDS,
  LIBERTYMD_KEYWORD_TOPIC_SLUGS,
  opaqueFieldsFromTopicPath,
  resolveKeywordLandingCluster,
  topicSlugFromPathname,
} from '../../components/LibertyMD/libertymd-keyword-content.ts'
import { FORBIDDEN_RAW_QUERY_PARAMS } from '../../components/LibertyMD/libertymd-landing-attribution.ts'

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

Deno.test('P3-06 AC1 · catalog length exactly 10', () => {
  assertEquals(KEYWORD_CONTENT_CATALOG.length, 10, 'server catalog')
  assertEquals(LIBERTYMD_KEYWORD_CONTENT_CATALOG.length, 10, 'client catalog')
  assertEquals(KEYWORD_IDS.size, 10)
  assertEquals(KEYWORD_TOPIC_SLUGS.size, 10)
})

Deno.test('P3-06 AC3 · client↔server keyword_id set equality', () => {
  assertEquals(KEYWORD_IDS.size, LIBERTYMD_KEYWORD_IDS.size)
  for (const id of KEYWORD_IDS) {
    assertTrue(LIBERTYMD_KEYWORD_IDS.has(id), `client missing ${id}`)
  }
  for (const id of LIBERTYMD_KEYWORD_IDS) {
    assertTrue(KEYWORD_IDS.has(id), `server missing ${id}`)
  }
  for (const slug of KEYWORD_TOPIC_SLUGS) {
    assertTrue(LIBERTYMD_KEYWORD_TOPIC_SLUGS.has(slug), `client missing slug ${slug}`)
  }
})

Deno.test('P3-06 AC1 · framing keys distinct from generic hero', () => {
  const en = JSON.parse(Deno.readTextFileSync('i18n/locales/en.json')) as {
    hero: { title: string; subtitle: string }
    keywordLanding: Record<string, { title: string; subtitle: string }>
  }
  assertTrue(typeof en.hero.title === 'string' && en.hero.title.length > 0)
  for (const cluster of LIBERTYMD_KEYWORD_CONTENT_CATALOG) {
    const framing = en.keywordLanding[cluster.framingKeySlug]
    assertTrue(framing, `missing keywordLanding.${cluster.framingKeySlug}`)
    assertTrue(framing.title !== en.hero.title, `${cluster.framingKeySlug} title must differ from generic`)
    assertTrue(framing.subtitle.length > 0, `${cluster.framingKeySlug} subtitle`)
    assertTrue(!/%\s*accur|Pulse|Jivi|HIPAA|\$39/i.test(`${framing.title} ${framing.subtitle}`), 'no accuracy/HIPAA/$39 invent')
  }
})

Deno.test('P3-06 AC2 · matched keyword_id writes catalog pair; slug overwrite', () => {
  const resolved = resolveKeywordAttribution({
    keyword_id: 'kw_sore_throat',
    matched_topic_slug: 'wrong-slug',
  })
  assertEquals(resolved.keyword_id, 'kw_sore_throat')
  assertEquals(resolved.matched_topic_slug, 'sore-throat')
})

Deno.test('P3-06 AC2 · slug-only resolve fills both from catalog', () => {
  const resolved = resolveKeywordAttribution({ matched_topic_slug: 'cough' })
  assertEquals(resolved.keyword_id, 'kw_cough')
  assertEquals(resolved.matched_topic_slug, 'cough')
})

Deno.test('P3-06 AC2 · path-derived slug resolve', () => {
  assertEquals(topicSlugFromLandingPath('/liberty-md/t/fever'), 'fever')
  const resolved = resolveKeywordAttribution({ landing_path: '/liberty-md/t/fever' })
  assertEquals(resolved.keyword_id, 'kw_fever')
  assertEquals(resolved.matched_topic_slug, 'fever')
})

Deno.test('P3-06 AC2 · unknown id/slug → null both', () => {
  const byId = resolveKeywordAttribution({ keyword_id: 'kw_unknown', matched_topic_slug: 'not-a-topic' })
  assertEquals(byId.keyword_id, undefined)
  assertEquals(byId.matched_topic_slug, undefined)

  const half = resolveKeywordAttribution({ keyword_id: 'kw-chest' })
  assertEquals(half.keyword_id, undefined)
  assertEquals(half.matched_topic_slug, undefined)

  assertEquals(findClusterByKeywordId('kw_unknown'), null)
  assertEquals(findClusterByTopicSlug('not-a-topic'), null)
})

Deno.test('P3-06 AC4 · unmatched path/id → generic (null cluster)', () => {
  assertEquals(resolveKeywordLandingCluster({ pathname: '/liberty-md/t/not-a-topic' }), null)
  assertEquals(resolveKeywordLandingCluster({ keyword_id: 'kw_unknown' }), null)
  assertEquals(opaqueFieldsFromTopicPath('/liberty-md/t/not-a-topic'), null)
  assertEquals(topicSlugFromPathname('/liberty-md/t/not-a-topic'), 'not-a-topic')
  assertEquals(opaqueFieldsFromTopicPath('/liberty-md/t/headache')?.keyword_id, 'kw_headache')
})

Deno.test('P3-06 AC2 · forbidden raw-query params still banned (never mint keyword)', () => {
  for (const banned of FORBIDDEN_RAW_QUERY_PARAMS) {
    assertTrue(typeof banned === 'string')
  }
  assertEquals(FORBIDDEN_RAW_QUERY_PARAMS.includes('q' as never), true)
  // Resolver must ignore prose-like bags — no keyword from empty allow-list fields.
  const cleaned = resolveKeywordAttribution({} as { keyword_id?: string })
  assertEquals(cleaned.keyword_id, undefined)
  assertEquals(cleaned.matched_topic_slug, undefined)
})

Deno.test('P3-06 AC6 · rates SQL still groups by keyword_id', () => {
  const sql = Deno.readTextFileSync('scripts/sql/libertymd-landing-attribution-rates.sql')
  assertTrue(sql.includes('keyword_id'), 'groups by keyword_id')
  assertTrue(sql.includes('completed_rate'), 'defines completed_rate')
  assertTrue(sql.includes('landing_session_id = l.id'), 'FK join')
})

Deno.test('P3-06 AC8 · App route + framing markers present; no accuracy mount', () => {
  const app = Deno.readTextFileSync('App.tsx')
  assertTrue(app.includes('/liberty-md/t/:topicSlug'), 'topic route')
  const landing = Deno.readTextFileSync('components/LibertyMD/LibertyMDApp.tsx')
  assertTrue(landing.includes('data-libertymd-keyword-framing'), 'framing marker')
  // BO 2026-08-01 — complaint chips removed from the hero, so there is no chip
  // left to highlight. Keyword framing itself must still render.
  // P3-04 mount none on keyword delta — framing keys / resolve path must not add accuracy %.
  assertTrue(!/keywordLanding\.[^"']*accuracy|diagnostic.?accuracy|%\s*accurate/i.test(landing), 'no accuracy % in keyword framing path')
  const en = Deno.readTextFileSync('i18n/locales/en.json')
  const keywordBlock = en.match(/"keywordLanding"\s*:\s*\{[\s\S]*?\n  \}/)?.[0] || ''
  assertTrue(keywordBlock.includes('"sore-throat"'), 'keywordLanding block present')
  assertTrue(!/%\s*(accurate|accuracy)|Pulse|Jivi|sens(?:itivity)?\s*\/\s*spec/i.test(keywordBlock), 'no accuracy invent in keywordLanding EN')
})

/**
 * BO 2026-08-01 — with the chips removed the landing can no longer originate a
 * `chip` entry at all, which makes the original invariant ("a keyword visit must
 * not invent entry_type chip") strictly easier to hold. Assert the strong form:
 * the landing emits freetext only.
 */
Deno.test('P3-06 Q4 · keyword visit does not invent entry_type chip', () => {
  const landing = Deno.readTextFileSync('components/LibertyMD/LibertyMDApp.tsx')
  assertTrue(!landing.includes("entry_type: 'chip'"), 'landing no longer originates a chip entry')
  assertTrue(landing.includes("entry_type: 'freetext'"), 'freetext path preserved')
})
