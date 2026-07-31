/**
 * P1-22 — Funnel dashboard ops pack contracts (docs/SQL/grep; no live Mixpanel/Postgres).
 */
declare const Deno: {
  test: (name: string, fn: () => unknown | Promise<unknown>) => void
  readTextFileSync: (path: string) => string
  readFileSync: (path: string) => Uint8Array
}

const FUNNEL_DOC = 'docs/libertymd/FUNNEL-DASHBOARD.md'
const FUNNEL_XLSX = 'docs/libertymd/FUNNEL-DASHBOARD.xlsx'
const FUNNEL_SQL = 'scripts/sql/libertymd-funnel-dashboard.sql'
const LEXICON = 'docs/libertymd/MIXPANEL-LEXICON.md'
const CARE = 'docs/libertymd/CARE-ARCHITECTURE.md'
const DECISIONS = 'tickets/DECISIONS.md'
const TELEMETRY = 'supabase/functions/libertymd-care-proxy/lib/telemetry.ts'
const PACKAGE_JSON = 'package.json'

/** Closed Postgres allow-list cardinality (P1-15). */
const EXPECTED_PRODUCT_EVENT_COUNT = 18

/** Allow-listed Mixpanel display suffixes used as funnel steps in the ops pack. */
const ALLOWED_FUNNEL_STEP_SUFFIXES = new Set([
  'consult_started',
  'demographics_saved',
  'question_served',
  'turn_completed',
  'report_ready',
  'report_released',
  'turn_failed',
  'diagnosis_attempted',
  'report_section_expanded', // optional client-only honesty step
  'report_delivery_requested', // optional client-only honesty step (P2-08/09)
  'feedback_submitted', // optional client-only honesty step (P2-10)
  'sample_report_viewed', // optional client-only honesty step (P3-02) — not Postgres
  'doctor_cta_viewed', // optional client-only honesty step (P2-11)
  'doctor_cta_clicked', // optional client-only honesty step (P2-11)
  'waitlist_joined', // optional client-only honesty step (P2-11)
  'emergency_stopped',
])

/** Dark / forbidden invent names that must NOT appear as live Mixpanel funnel steps. */
const FORBIDDEN_INVENTED_STEPS = [
  'landing_viewed',
  'consult_cta_clicked',
  'doctor_cta_shown', // Spec = viewed; never invent shown
]

/** PHI-ish property keys banned from documented Mixpanel funnel props. */
const FORBIDDEN_PHI_PROPS = [
  'symptom_text',
  'chief_complaint',
  'exact_age',
  'email',
  'display_name',
  'diagnosis_name',
  'report_body',
  'slot_value',
  'evidence_score',
  'confidence_score',
]

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function assertTrue(value: unknown, message?: string) {
  if (!value) throw new Error(message || 'Expected truthy')
}

function stripMarkdownCode(md: string): string {
  return md.replace(/```[\s\S]*?```/g, ' ')
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
}

Deno.test('P1-22 AC1 · funnel doc has four named funnels + honesty', () => {
  const doc = Deno.readTextFileSync(FUNNEL_DOC)
  assertTrue(/Funnel 1 · Acquisition/i.test(doc), 'acquisition section')
  assertTrue(/Funnel 2 · Report value/i.test(doc), 'report value section')
  assertTrue(/Funnel 3 · Doctor demand/i.test(doc), 'doctor demand section')
  assertTrue(/Funnel 4 · Reliability/i.test(doc), 'reliability section')
  assertTrue(/app_surface/i.test(doc), 'app_surface filter')
  assertTrue(/emit_origin\s*=\s*'server'|emit_origin = `server`|emit_origin = 'server'|`emit_origin = 'server'`/i.test(doc)
    || /emit_origin.*server/i.test(doc), 'emit_origin server filter')
  assertTrue(/Dark gaps|dark until P3-05|Dark until/i.test(doc), 'dark-gap honesty')
  assertTrue(/DoD\+\s*\/\s*CANNOT RUN/i.test(doc), 'live Mixpanel DoD+')
  assertTrue(/Mixpanel UI paste checklist/i.test(doc), 'paste checklist')
  assertTrue(/FUNNEL-DASHBOARD\.xlsx/i.test(doc), 'spreadsheet twin linked')
  assertTrue(!/funnel sketch \(notes only/i.test(doc), 'not sketch-only')
})

Deno.test('P1-22 AC1 · funnel spreadsheet workbook present (xlsx)', () => {
  const bytes = Deno.readFileSync(FUNNEL_XLSX)
  assertTrue(bytes.length > 8_000, `xlsx too small: ${bytes.length}`)
  assertEquals(bytes[0], 0x50, 'PK zip magic[0]')
  assertEquals(bytes[1], 0x4b, 'PK zip magic[1]')
  // Sheet roster is documented in the markdown twin (xlsx is binary; do not parse zip in Deno :ci)
  const doc = Deno.readTextFileSync(FUNNEL_DOC)
  assertTrue(/Overview,\s*Funnel steps/i.test(doc), 'doc lists spreadsheet sheets')
})

Deno.test('P1-22 AC1 · funnel step suffixes stay on allow-list / Lexicon remaps', () => {
  const doc = stripMarkdownCode(Deno.readTextFileSync(FUNNEL_DOC))
  // Ordered-step bullets that look like LibertyMd display names
  const steps = [...doc.matchAll(/`LibertyMd\s+([a-z0-9_]+)`/gi)].map((m) => m[1].toLowerCase())
  assertTrue(steps.length >= 8, `expected non-zero step citations, got ${steps.length}`)
  for (const suffix of steps) {
    assertTrue(
      ALLOWED_FUNNEL_STEP_SUFFIXES.has(suffix),
      `unknown / invented funnel step suffix: ${suffix}`,
    )
  }
  for (const dark of FORBIDDEN_INVENTED_STEPS) {
    // May appear in dark-gap callouts; must not be listed as an ordered Mixpanel step line
    const asStep = new RegExp(
      `(?:ordered steps|Mixpanel ordered steps)[\\s\\S]{0,800}?LibertyMd\\s+${dark}\\b`,
      'i',
    )
    assertEquals(asStep.test(doc), false, `${dark} must not be an ordered Mixpanel step`)
  }
})

Deno.test('P1-22 AC2 · SQL pack survival + stall + emergency-by-source shape', () => {
  const sql = Deno.readTextFileSync(FUNNEL_SQL)
  assertTrue(/FUNNEL_SURVIVAL/i.test(sql), 'survival marker')
  assertTrue(/FUNNEL_STALL/i.test(sql), 'stall marker')
  assertTrue(/FUNNEL_EMERGENCY_BY_SOURCE/i.test(sql), 'emergency marker')
  assertTrue(/libertymd_turn_facts/i.test(sql), 'reuses turn_facts')
  assertTrue(/survival_rate/i.test(sql), 'survival_rate')
  assertTrue(/stalled_consults/i.test(sql), 'stalled_consults')
  assertTrue(/event_name\s*=\s*'emergency_stopped'/i.test(sql), 'Q3A product_events SoT')
  assertTrue(/properties->>'source'|properties\s*->>\s*'source'/i.test(sql), 'group by source prop')
  assertTrue(/emergency_rate_vs_all_consults/i.test(sql), 'denominator vs all consults')
  assertTrue(!/\bcreate\s+(materialized\s+)?view\b/i.test(sql), 'SQL file only — no view')
  assertTrue(!/\breplace\s+view\s+.*libertymd_turn_facts/i.test(sql), 'no turn_facts rebuild')
})

Deno.test('P1-22 AC3 · segments + chip entry_type live (P3-05)', () => {
  const doc = Deno.readTextFileSync(FUNNEL_DOC)
  assertTrue(/\bis_anonymous\b/i.test(doc), 'is_anonymous segment')
  assertTrue(/entry_type/i.test(doc) && /P3-05/i.test(doc), 'entry_type axis from P3-05')
  assertTrue(/Live \(P3-05\)|live \(P3-05\)/i.test(doc), 'chip axis live not dark')
  assertTrue(!/Dark until P3-05/i.test(doc), 'chip row no longer dark-until')
  assertTrue(/turn-count baselining|turn.count baselin/i.test(doc), 'ship-before-baseline note')
  assertTrue(/had_options/i.test(doc), 'rejects had_options proxy honesty')
  assertTrue(/P1-01/i.test(doc) && /P1-08/i.test(doc), 'cohort tickets')
  assertTrue(/2026-07-31/i.test(doc), 'cohort date')
  // P3-02 honesty — sample→start is client Mixpanel only
  assertTrue(/sample_report_viewed/i.test(doc) && /P3-02/i.test(doc), 'sample_report_viewed live axis')
  assertTrue(/Live \(P3-02\)|live client \(P3-02\)/i.test(doc), 'sample axis marked live')
})

Deno.test('P1-22 AC4 · reliability SQL + emit_origin Mixpanel mirror', () => {
  const sql = Deno.readTextFileSync(FUNNEL_SQL)
  const doc = Deno.readTextFileSync(FUNNEL_DOC)
  assertTrue(/FUNNEL_RELIABILITY/i.test(sql), 'reliability marker')
  assertTrue(/inference_failed/i.test(sql), 'inference_failed')
  assertTrue(/turn_completed/i.test(sql), 'turn_completed')
  assertTrue(/reliability_fail_rate/i.test(sql), 'fail rate alias')
  assertTrue(/properties->>'stage'|properties\s*->>\s*'stage'/i.test(sql), 'stage group')
  assertTrue(/properties->>'error_class'|properties\s*->>\s*'error_class'/i.test(sql), 'error_class group')
  assertTrue(/emit_origin/i.test(doc) && /server/i.test(doc), 'Mixpanel emit_origin=server')
  // Formula shape: failed / (failed + completed)
  assertTrue(
    /inference_failed[\s\S]{0,200}turn_completed|count\(\*\)\s*filter\s*\(\s*where\s*event_name\s*=\s*'inference_failed'/i.test(
      sql,
    ),
    'fail/(fail+complete) shape',
  )
})

Deno.test('P1-22 AC5 · P1-01 + P1-08 + P2-14 cohort dates in DECISIONS + funnel doc + SQL', () => {
  const decisions = Deno.readTextFileSync(DECISIONS)
  const doc = Deno.readTextFileSync(FUNNEL_DOC)
  const sql = Deno.readTextFileSync(FUNNEL_SQL)
  assertTrue(/P1-01/i.test(decisions) && /2026-07-31/i.test(decisions), 'P1-01 in DECISIONS')
  assertTrue(/P1-08/i.test(decisions) && /Speculative diagnosis cohort/i.test(decisions), 'P1-08 DECISIONS entry')
  assertTrue(/was_speculative/i.test(decisions) && /served_from_cache/i.test(decisions), 'P1-08 compare props')
  assertTrue(/P2-14/i.test(decisions) && /Diagnosis eligibility retune cohort/i.test(decisions), 'P2-14 DECISIONS cohort')
  assertTrue(/report_ready/i.test(decisions) && /outcome\s*=\s*'valid'|outcome = 'valid'/i.test(decisions), 'P2-14 completion + validity keys')
  assertTrue(/P1-01/i.test(doc) && /P1-08/i.test(doc) && /P2-14/i.test(doc) && /2026-07-31/i.test(doc), 'funnel cohort table')
  assertTrue(/FUNNEL_COHORT/i.test(sql), 'SQL cohort section')
  assertTrue(/was_speculative/i.test(sql) && /served_from_cache/i.test(sql), 'SQL speculative props')
  assertTrue(/P2-14/i.test(sql) && /report_ready/i.test(sql) && /outcome.*=.*valid|outcome' = 'valid'/i.test(sql), 'SQL P2-14 completion + validity')
  assertTrue(/2026-07-31/i.test(sql), 'SQL boundary date')
})

Deno.test('P1-22 AC6 · no new PRODUCT_EVENT_NAMES; Lexicon/CARE pointers; no invent', () => {
  const telemetry = Deno.readTextFileSync(TELEMETRY)
  const namesBlock = telemetry.match(/PRODUCT_EVENT_NAMES\s*=\s*\[([\s\S]*?)\]\s*as\s*const/)
  assertTrue(namesBlock, 'PRODUCT_EVENT_NAMES present')
  const names = [...(namesBlock?.[1] || '').matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1])
  assertEquals(names.length, EXPECTED_PRODUCT_EVENT_COUNT, `allow-list must stay at ${EXPECTED_PRODUCT_EVENT_COUNT}`)

  const lexicon = Deno.readTextFileSync(LEXICON)
  assertTrue(/FUNNEL-DASHBOARD\.md/i.test(lexicon), 'Lexicon points at funnel pack')
  assertTrue(!/Funnel sketch \(notes only/i.test(lexicon), 'sketch-only notes replaced')

  const care = Deno.readTextFileSync(CARE)
  assertTrue(/FUNNEL-DASHBOARD\.md/i.test(care), 'CARE points at funnel pack')
  assertTrue(/dashboard UI.*ops|ops artifact|ops pack|≠ this ops/i.test(care), 'CARE clarifies UI ≠ ops pack')
  // Funnel SQL must not implement cleanup cron (P1-23 out)
  assertEquals(
    /create\s+(or\s+replace\s+)?function|pg_cron|retention_expires/i.test(stripSqlComments(Deno.readTextFileSync(FUNNEL_SQL))),
    false,
    'no P1-23 cleanup in funnel SQL',
  )
})

Deno.test('P1-22 AC6 · PHI ban on documented Mixpanel props in funnel pack', () => {
  const doc = stripMarkdownCode(Deno.readTextFileSync(FUNNEL_DOC))
  const sql = stripSqlComments(Deno.readTextFileSync(FUNNEL_SQL))
  for (const key of FORBIDDEN_PHI_PROPS) {
    // Ban as documented Mixpanel property keys (backticked or ->>'key')
    const propRe = new RegExp(`(\`|->>>?'|properties->>'|"|'\\s*)${key}(\`|'|"|\\b)`, 'i')
    assertEquals(propRe.test(doc), false, `funnel doc must not document PHI prop ${key}`)
    // SQL may reference clinical tables but must not select free-text PHI columns
    if (['chief_complaint', 'report_body', 'symptom_text', 'slot_value', 'email', 'display_name', 'diagnosis_name'].includes(key)) {
      assertEquals(
        new RegExp(`\\b${key}\\b`, 'i').test(sql),
        false,
        `funnel SQL must not select PHI column ${key}`,
      )
    }
  }
  assertTrue(/No PHI|never put PHI|Forbidden on Mixpanel|no PHI/i.test(doc), 'PHI rule stated')
})

Deno.test('P1-22 AC6 · no FE clinical writers; no in-app analytics UI in ticket artifacts', () => {
  const fePaths = [
    'components/LibertyMD/LibertyMDApp.tsx',
    'components/LibertyMD/LibertyMDChat.tsx',
    'components/LibertyMD/libertymd-care-proxy-client.ts',
  ]
  for (const path of fePaths) {
    const text = Deno.readTextFileSync(path)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
    assertEquals(
      /\.from\(\s*['"]libertymd_/i.test(text),
      false,
      `${path} must not .from('libertymd_…')`,
    )
  }
  const doc = Deno.readTextFileSync(FUNNEL_DOC)
  assertTrue(/not an in-app React|in-app React analytics UI/i.test(doc), 'rejects in-app UI')
  // Ticket must not have shipped a React analytics component under components/LibertyMD
  assertEquals(
    /FunnelDashboard|AnalyticsChart|libertymd-funnel-ui/i.test(doc),
    false,
    'no React analytics component names as product surface',
  )
})

Deno.test('P1-22 · doctor-demand triage via SQL; package.json :ci wire', () => {
  const sql = Deno.readTextFileSync(FUNNEL_SQL)
  assertTrue(/FUNNEL_DOCTOR_DEMAND/i.test(sql), 'doctor demand section')
  assertTrue(/triage_tier/i.test(sql), 'reports.triage_tier')
  assertTrue(/libertymd_reports/i.test(sql), 'joins reports')

  const pkg = Deno.readTextFileSync(PACKAGE_JSON)
  assertTrue(/test:libertymd:funnel-dashboard/i.test(pkg), 'npm script present')
  assertTrue(
    /test:libertymd:ci[\s\S]*test:libertymd:funnel-dashboard/i.test(pkg),
    'wired into :ci',
  )
})

Deno.test('P2-12 AC5 · care_interest join-rate SQL marker; click-through ownership', () => {
  const sql = Deno.readTextFileSync(FUNNEL_SQL)
  const doc = Deno.readTextFileSync(FUNNEL_DOC)
  assertTrue(/FUNNEL_CARE_INTEREST_JOIN_RATE/i.test(sql), 'join-rate marker')
  assertTrue(/libertymd_care_interest/i.test(sql), 'joins care_interest')
  assertTrue(/join_rate/i.test(sql), 'join_rate alias')
  assertTrue(
    /coalesce\s*\(\s*nullif\s*\(\s*trim\s*\(/i.test(sql),
    'unknown bucket coalesce',
  )
  assertTrue(/FUNNEL_CARE_INTEREST_JOIN_RATE|join rate/i.test(doc), 'doc documents join-rate')
  // Click-through Mixpanel is P2-11-owned (may be lit concurrently). This ticket
  // must not invent PRODUCT_EVENT_NAMES / server emits for doctor_cta_*.
  assertTrue(
    /P2-11|deferred|CANNOT RUN|doctor_cta_clicked\s*\/\s*doctor_cta_viewed/i.test(doc),
    'click-through attributed to P2-11 or deferred honesty',
  )
  assertEquals(
    /(?:ordered steps|Mixpanel ordered steps)[\s\S]{0,800}?LibertyMd\s+doctor_cta_shown\b/i.test(
      stripMarkdownCode(doc),
    ),
    false,
    'doctor_cta_shown invent forbidden',
  )
})
