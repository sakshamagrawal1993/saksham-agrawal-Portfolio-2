/**
 * P1-20 — libertymd_turn_facts DDL / grant / allow-list contracts (no live Postgres).
 */
declare const Deno: {
  test: (name: string, fn: () => unknown | Promise<unknown>) => void
  readTextFileSync: (path: string) => string
}

const MIGRATION = 'supabase/migrations/20260731180000_libertymd_turn_facts_p1_20.sql'
const ANALYSES = 'scripts/sql/libertymd-turn-facts-analyses.sql'
const CARE = 'docs/libertymd/CARE-ARCHITECTURE.md'

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
    /create\s+or\s+replace\s+view\s+public\.libertymd_turn_facts\s+as([\s\S]*?);[\s\n]*comment\s+on\s+view/i,
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

Deno.test('P1-20 AC1 · migration creates plain VIEW over four clinical tables', () => {
  const migration = Deno.readTextFileSync(MIGRATION)
  assertTrue(/create\s+or\s+replace\s+view\s+public\.libertymd_turn_facts/i.test(migration), 'CREATE VIEW')
  assertTrue(!/create\s+materialized\s+view/i.test(migration), 'no matview (Q4)')
  assertTrue(/generate_series\s*\(\s*1\s*,\s*greatest\s*\(\s*c\.turn_count\s*,\s*1\s*\)\s*\)/i.test(migration), 'Q1B series spine')
  assertTrue(/libertymd_consultations/i.test(migration), 'joins consultations')
  assertTrue(/libertymd_messages/i.test(migration), 'joins messages')
  assertTrue(/libertymd_safety_events/i.test(migration), 'joins safety_events')
  assertTrue(/libertymd_diagnostic_runs/i.test(migration), 'joins diagnostic_runs')
  assertTrue(/distinct\s+on\s*\(\s*consultation_id\s*,\s*turn_count\s*\)/i.test(migration), 'Q2A DISTINCT ON')
  assertTrue(/is_speculative\s+asc/i.test(migration), 'prefer non-speculative dx')
  assertTrue(/order by consultation_id, turn_count, created_at desc/i.test(migration), 'safety latest')
})

Deno.test('P1-20 AC2+AC3 · patient_id and landing_session_id projected', () => {
  const body = stripSqlComments(extractViewBody(Deno.readTextFileSync(MIGRATION)))
  assertTrue(/\bpatient_id\b/i.test(body), 'patient_id in view')
  assertTrue(/\blanding_session_id\b/i.test(body), 'landing_session_id in view')
  assertTrue(/\bturn_index\b/i.test(body), 'turn_index present')
  assertTrue(/\bis_speculative\b/i.test(body), 'is_speculative exposed')
  assertTrue(/\bclinical_evidence_score\b/i.test(body), 'clinical_evidence_score scalar')
  assertTrue(/\bconfidence_score\b/i.test(body), 'confidence_score scalar')
  assertTrue(/\bevidence_score\b/i.test(body), 'evidence_score scalar')
})

Deno.test('P1-20 AC4 · Q7A ban list absent from view SELECT body', () => {
  const body = stripSqlComments(extractViewBody(Deno.readTextFileSync(MIGRATION)))
  const banned = [
    'content',
    'slot_updates',
    'filled_slots',
    'missing_slots',
    'chief_complaint',
    'red_flags',
    'raw_result',
    'clinical_summary',
    'clinical_reasoning',
    'differential_diagnosis',
    'input_snapshot',
    'options',
    'metadata',
    'validation_reason',
    'patient_snapshot',
    'safety_state',
    'intermediate_diagnoses',
    'display_name',
    'email',
    'avatar_url',
    'triage_tier',
    'top_dx_confidence',
    'filled_slot_count',
  ]
  for (const col of banned) {
    const re = new RegExp(`\\b${col}\\b`, 'i')
    assertEquals(re.test(body), false, `banned column ${col} must not appear in view body`)
  }
  // safety.message is banned; do not confuse with message_target_slot alias
  assertEquals(/\bmessage\b/i.test(body), false, 'safety message / bare message banned')
  assertTrue(/\btarget_slot\b/i.test(body), 'slot name target_slot allowed')
})

Deno.test('P1-20 AC6 · Q8A safety turn_count index present', () => {
  const migration = Deno.readTextFileSync(MIGRATION)
  assertTrue(
    /libertymd_safety_events\s*\(\s*consultation_id\s*,\s*turn_count\s*,\s*created_at\s+desc\s*\)/i.test(migration),
    'safety (consultation_id, turn_count, created_at DESC)',
  )
})

Deno.test('P1-20 AC · Q3A revoke-all; no client GRANT SELECT', () => {
  const migration = Deno.readTextFileSync(MIGRATION)
  assertTrue(/revoke\s+all\s+on\s+table\s+public\.libertymd_turn_facts\s+from\s+anon,\s*authenticated/i.test(migration), 'revoke anon/authenticated')
  assertTrue(/revoke\s+all\s+on\s+table\s+public\.libertymd_turn_facts\s+from\s+public/i.test(migration), 'revoke public')
  assertEquals(/grant\s+select\s+on\s+.*libertymd_turn_facts/i.test(migration), false, 'no GRANT SELECT')
  assertEquals(/create\s+policy/i.test(migration), false, 'no client policies')
})

Deno.test('P1-20 AC5 · analyses SQL shape (four one-query sections)', () => {
  const sql = Deno.readTextFileSync(ANALYSES)
  assertTrue(/libertymd_turn_facts/i.test(sql), 'queries the view')
  assertTrue(/survival_rate/i.test(sql), '(a) survival')
  assertTrue(/stalled_consults/i.test(sql), '(b) stall')
  assertTrue(/distinct\s+on\s*\(\s*consultation_id\s*\)/i.test(sql), '(b) last turn DISTINCT ON')
  assertTrue(/safety_status/i.test(sql), '(c) guardrail verdicts')
  assertTrue(/avg_confidence_score/i.test(sql), '(d) confidence')
  assertTrue(/patient_id/i.test(sql), '(d) patient grain')
  assertTrue(/user_id/i.test(sql), '(d) user grain')
  assertTrue(!/\bcreate\s+(materialized\s+)?view\b/i.test(sql), 'analyses must not create a view')
  assertTrue(
    /'abandoned'[\s\S]*'interviewing'[\s\S]*'high_risk'[\s\S]*'awaiting_demographics'[\s\S]*'clinical_review_needed'[\s\S]*'report_pending_auth'/i.test(sql),
    'stall status filter (Q5A)',
  )
})

Deno.test('P1-20 · CARE documents grain / allow-list / consumers / P1-21 follow-on', () => {
  const care = Deno.readTextFileSync(CARE)
  assertTrue(/libertymd_turn_facts/i.test(care), 'CARE names the view')
  assertTrue(/generate_series|turn_index/i.test(care), 'grain')
  assertTrue(/DISTINCT ON|is_speculative/i.test(care), 'dedup')
  assertTrue(/REVOKE ALL|service_role|ops SQL/i.test(care), 'consumers Q3A')
  assertTrue(/P1-21/i.test(care), 'P1-21 alter-later')
  assertTrue(/target_slot/i.test(care), 'stall / slot semantics')
})

Deno.test('P1-20 AC7 · frontend must not .from(libertymd_turn_facts)', () => {
  const paths = [
    'components/LibertyMD/LibertyMDApp.tsx',
    'components/LibertyMD/LibertyMDChat.tsx',
    'components/LibertyMD/libertymd-care-proxy-client.ts',
  ]
  for (const path of paths) {
    const text = Deno.readTextFileSync(path)
    assertEquals(
      /from\(\s*['"]libertymd_turn_facts['"]\s*\)/.test(text),
      false,
      `${path} must not select turn_facts`,
    )
    assertEquals(
      /from\(\s*['"]libertymd_consultations['"]\s*\)/.test(text),
      false,
      `${path} must not write clinical tables`,
    )
  }
})
