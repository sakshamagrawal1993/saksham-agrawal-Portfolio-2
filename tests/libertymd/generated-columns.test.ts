/**
 * P1-21 — Generated STORED columns + turn_facts preference (DDL / grep contracts; no live Postgres).
 */
declare const Deno: {
  test: (name: string, fn: () => unknown | Promise<unknown>) => void
  readTextFileSync: (path: string) => string
}

const MIGRATION = 'supabase/migrations/20260731190000_libertymd_generated_columns_p1_21.sql'
const P1_20_MIGRATION = 'supabase/migrations/20260731180000_libertymd_turn_facts_p1_20.sql'
const CARE = 'docs/libertymd/CARE-ARCHITECTURE.md'
const PACKAGE_JSON = 'package.json'

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function assertTrue(value: unknown, message?: string) {
  if (!value) throw new Error(message || 'Expected truthy')
}

function extractViewBody(migration: string): string {
  const match = migration.match(
    /create(?:\s+or\s+replace)?\s+view\s+public\.libertymd_turn_facts\s+as([\s\S]*?);[\s\n]*comment\s+on\s+view/i,
  )
  assertTrue(match, 'CREATE VIEW body present')
  return match?.[1] || ''
}

/** Strip SQL comments so ban-list greps do not false-positive on COMMENT / -- notes. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
}

Deno.test('P1-21 AC1 · three GENERATED ALWAYS AS (…) STORED columns', () => {
  const migration = Deno.readTextFileSync(MIGRATION)
  assertTrue(
    /libertymd_reports[\s\S]*?triage_tier\s+text\s+generated\s+always\s+as\s*\([\s\S]*?\)\s+stored/i.test(migration),
    'reports.triage_tier STORED',
  )
  assertTrue(
    /libertymd_diagnostic_runs[\s\S]*?top_dx_confidence\s+numeric\s+generated\s+always\s+as\s*\([\s\S]*?\)\s+stored/i.test(migration),
    'diagnostic_runs.top_dx_confidence STORED',
  )
  assertTrue(
    /libertymd_consultations[\s\S]*?filled_slot_count\s+smallint\s+generated\s+always\s+as\s*\([\s\S]*?\)\s+stored/i.test(migration),
    'consultations.filled_slot_count STORED',
  )
  assertEquals(/virtual/i.test(migration), false, 'no VIRTUAL (Q4A)')
})

Deno.test('P1-21 AC2 · JSONB SoT; GENERATED ALWAYS only (no dual-write plain cols)', () => {
  const migration = Deno.readTextFileSync(MIGRATION)
  assertTrue(/generated\s+always\s+as/i.test(migration), 'GENERATED ALWAYS')
  assertTrue(/jsonb remains sot|remains sot/i.test(migration), 'SoT comment')
  // Every named add must be followed by GENERATED ALWAYS AS (… ) STORED (multiline OK)
  for (const col of ['triage_tier', 'top_dx_confidence', 'filled_slot_count']) {
    const re = new RegExp(
      `add\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?${col}\\s+\\w+[\\s\\S]*?generated\\s+always\\s+as[\\s\\S]*?\\)\\s+stored`,
      'i',
    )
    assertTrue(re.test(migration), `${col} must be GENERATED STORED`)
  }
  assertEquals(/\binsert\s+into\b/i.test(migration), false, 'migration does not INSERT into generated cols')
  assertEquals(/\bupdate\s+.*set\s+(triage_tier|top_dx_confidence|filled_slot_count)\b/i.test(migration), false, 'no UPDATE dual-write')
})

Deno.test('P1-21 AC3 · Q5 hybrid indexes present', () => {
  const migration = Deno.readTextFileSync(MIGRATION)
  assertTrue(
    /on\s+public\.libertymd_reports\s*\(\s*triage_tier\s*\)\s*where\s+triage_tier\s+is\s+not\s+null/i.test(migration),
    'partial triage_tier index',
  )
  assertTrue(
    /on\s+public\.libertymd_consultations\s*\(\s*filled_slot_count\s*\)/i.test(migration),
    'filled_slot_count index',
  )
  assertTrue(
    /on\s+public\.libertymd_diagnostic_runs\s*\(\s*top_dx_confidence\s*\)\s*where\s+top_dx_confidence\s+is\s+not\s+null/i.test(
      migration,
    ),
    'partial top_dx_confidence index',
  )
})

Deno.test('P1-21 AC4 · null-safe expression text (typeof, percent parse, CORE_SLOTS)', () => {
  const migration = Deno.readTextFileSync(MIGRATION)
  // Q1A triage
  assertTrue(/jsonb_typeof\s*\(\s*report_data\s*#>\s*'\{triage,care_setting\}'\s*\)\s*=\s*'string'/i.test(migration), 'nested typeof string')
  assertTrue(/report_data\s*#>>\s*'\{triage,care_setting\}'/i.test(migration), 'nested path')
  assertTrue(/jsonb_typeof\s*\(\s*report_data\s*->\s*'care_setting'\s*\)\s*=\s*'string'/i.test(migration), 'top-level typeof')
  // Q2A percent-string null-safe (must not use bare ::numeric on confidence text)
  assertTrue(/"70%"|70%|percent/i.test(migration), 'percent-string documented')
  assertTrue(/regexp_match\s*\(/i.test(migration), 'regexp_match present')
  assertTrue(/\(\\d\{1,3\}\(\?:\\\.\\d\+\)\?\)/i.test(migration), 'digit/percent capture pattern')
  assertTrue(/differential_diagnosis\s*->\s*0/i.test(migration), 'array[0] extract')
  assertTrue(/->>'confidence'|->>\s*'confidence'/i.test(migration), 'prefer confidence')
  assertTrue(/->>'confidence_score'|->>\s*'confidence_score'/i.test(migration), 'fallback confidence_score')
  // Bare cast of confidence text would raise on "70%" — forbid in generation expr region
  const dxBlock = migration.match(
    /top_dx_confidence\s+numeric\s+generated\s+always\s+as\s*\(([\s\S]*?)\)\s+stored/i,
  )
  assertTrue(dxBlock, 'top_dx expression block')
  assertEquals(
    /\(differential_diagnosis\s*->\s*0\s*->>\s*'confidence'\)\s*::\s*numeric/i.test(dxBlock?.[1] || ''),
    false,
    'no bare ::numeric on confidence text',
  )
  // Q3A CORE_SLOTS
  for (const slot of [
    'onset',
    'duration',
    'severity',
    'associated_symptoms',
    'red_flag_negatives',
    'relevant_history',
  ]) {
    assertTrue(new RegExp(`filled_slots\\s*\\?\\s*'${slot}'`, 'i').test(migration), `CORE_SLOT ${slot}`)
  }
})

Deno.test('P1-21 AC5 · turn_facts Q6B projects generated cols; no reports join; re-REVOKE', () => {
  const migration = Deno.readTextFileSync(MIGRATION)
  const body = stripSqlComments(extractViewBody(migration))
  assertTrue(/\bfilled_slot_count\b/i.test(body), 'projects filled_slot_count')
  assertTrue(/\btop_dx_confidence\b/i.test(body), 'projects top_dx_confidence')
  assertTrue(/\bconfidence_score\b/i.test(body), 'keeps confidence_score')
  assertEquals(/\btriage_tier\b/i.test(body), false, 'no triage_tier on turn_facts (Q6B)')
  assertEquals(/libertymd_reports/i.test(body), false, 'no reports join')
  // No competing JSONB re-extract for the same scalars in the view body
  assertEquals(/\bfilled_slots\b/i.test(body), false, 'no filled_slots extract in view')
  assertEquals(/\bdifferential_diagnosis\b/i.test(body), false, 'no differential_diagnosis extract in view')
  assertEquals(/\breport_data\b/i.test(body), false, 'no report_data extract in view')
  // Preserve P1-20 spine / revoke
  assertTrue(/generate_series\s*\(\s*1\s*,\s*greatest\s*\(\s*c\.turn_count\s*,\s*1\s*\)\s*\)/i.test(migration), 'series spine')
  assertTrue(/revoke\s+all\s+on\s+table\s+public\.libertymd_turn_facts\s+from\s+anon,\s*authenticated/i.test(migration), 're-REVOKE anon/auth')
  assertTrue(/revoke\s+all\s+on\s+table\s+public\.libertymd_turn_facts\s+from\s+public/i.test(migration), 're-REVOKE public')
  assertEquals(/grant\s+select\s+on\s+.*libertymd_turn_facts/i.test(migration), false, 'no GRANT SELECT')
})

Deno.test('P1-21 AC6 · no Mixpanel / FE / n8n creep in CARE + package wire', () => {
  const care = Deno.readTextFileSync(CARE)
  assertTrue(/Generated columns for hot JSONB scalars \(P1-21\)/i.test(care), 'CARE section')
  assertTrue(/triage_tier/i.test(care), 'documents triage_tier')
  assertTrue(/top_dx_confidence/i.test(care), 'documents top_dx_confidence')
  assertTrue(/filled_slot_count/i.test(care), 'documents filled_slot_count')
  assertTrue(/CORE_SLOTS|calculateMissingSlots/i.test(care), 'slot definition')
  assertTrue(/70%|percent|regexp_match/i.test(care), 'percent null-safety')
  assertTrue(/confidence_score/i.test(care), 'coexistence documented')
  assertTrue(/partial.*triage_tier|triage_tier.*partial|WHERE triage_tier IS NOT NULL/i.test(care), 'index plan')
  assertTrue(/no reports join|join.*libertymd_reports.*directly/i.test(care), 'Q6B documented')
  assertEquals(/create\s+materialized\s+view/i.test(Deno.readTextFileSync(MIGRATION)), false, 'no matview')

  const pkg = Deno.readTextFileSync(PACKAGE_JSON)
  assertTrue(/test:libertymd:generated-columns/i.test(pkg), 'focused script')
  assertTrue(/test:libertymd:generated-columns/.test(pkg) && /test:libertymd:ci/.test(pkg), 'script exists')
  assertTrue(
    /test:libertymd:turn-facts\s*&&\s*npm run test:libertymd:generated-columns|test:libertymd:generated-columns\s*&&\s*npm run test:libertymd:/.test(
      pkg,
    ) || /test:libertymd:ci[\s\S]*test:libertymd:generated-columns/.test(pkg),
    'wired into :ci',
  )
})

Deno.test('P1-21 · proxy/FE must not insert generated column names; P1-20 ban list still historical', () => {
  const proxyPaths = [
    'supabase/functions/libertymd-care-proxy/lib/consultations.ts',
    'supabase/functions/libertymd-care-proxy/actions/send-message.ts',
  ]
  for (const path of proxyPaths) {
    const text = Deno.readTextFileSync(path)
    // Ban writes into GENERATED columns — not read/projection of report.triage_tier
    // into history DTOs (P4-03 AccountDrawer enrichment may select/return them).
    const insertOrUpdateBlocks = [
      ...text.matchAll(/\.insert\(\s*\{([\s\S]*?)\}\s*\)/g),
      ...text.matchAll(/\.update\(\s*\{([\s\S]*?)\}\s*\)/g),
      ...text.matchAll(/\.upsert\(\s*\{([\s\S]*?)\}\s*\)/g),
    ].map((m) => m[1] || '')
    for (const block of insertOrUpdateBlocks) {
      assertEquals(/\btriage_tier\s*:/.test(block), false, `${path} must not write triage_tier`)
      assertEquals(/\btop_dx_confidence\s*:/.test(block), false, `${path} must not write top_dx_confidence`)
      assertEquals(/\bfilled_slot_count\s*:/.test(block), false, `${path} must not write filled_slot_count`)
    }
  }
  const fePaths = [
    'components/LibertyMD/LibertyMDApp.tsx',
    'components/LibertyMD/LibertyMDChat.tsx',
    'components/LibertyMD/libertymd-care-proxy-client.ts',
  ]
  for (const path of fePaths) {
    const text = Deno.readTextFileSync(path)
    assertEquals(/from\(\s*['"]libertymd_(reports|consultations|diagnostic_runs)['"]\s*\)/.test(text), false, `${path} no clinical .from`)
  }
  // Historical P1-20 migration still has no stubs (Q6A of P1-20)
  const p120Body = stripSqlComments(extractViewBody(Deno.readTextFileSync(P1_20_MIGRATION)))
  assertEquals(/\bfilled_slot_count\b/i.test(p120Body), false, 'P1-20 migration unchanged (no stubs)')
  assertEquals(/\btop_dx_confidence\b/i.test(p120Body), false, 'P1-20 migration unchanged')
})
