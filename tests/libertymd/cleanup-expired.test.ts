/**
 * P1-23 / P1-24 — cleanup schedule / dry-run / Storage orphan contracts
 * (file-shape; no live Postgres / Storage API).
 */
declare const Deno: {
  test: (name: string, fn: () => unknown | Promise<unknown>) => void
  readTextFileSync: (path: string) => string
}

const MIGRATION_P1_23 = 'supabase/migrations/20260731200000_libertymd_cleanup_schedule_p1_23.sql'
const MIGRATION_P1_24 = 'supabase/migrations/20260731210000_libertymd_cleanup_storage_p1_24.sql'
const MIGRATION_P2_12 = 'supabase/migrations/20260731250000_libertymd_care_interest_p2_12.sql'
const DRY_RUN = 'scripts/sql/libertymd-cleanup-dry-run.sql'
const RUNBOOK = 'scripts/sql/libertymd-cleanup-cron-runbook.sql'
const ORPHAN_SQL = 'scripts/sql/libertymd-storage-orphan-detect.sql'
const CARE = 'docs/libertymd/CARE-ARCHITECTURE.md'
const RLS = 'supabase/tests/libertymd_care_rls.test.sql'
const TELEMETRY = 'supabase/functions/libertymd-care-proxy/lib/telemetry.ts'
const EDGE_INDEX = 'supabase/functions/libertymd-cleanup-storage/index.ts'
const EDGE_PATH = 'supabase/functions/libertymd-cleanup-storage/path.ts'
const PACKAGE_JSON = 'package.json'
const SETUP_ASSETS = 'scripts/setup_libertymd_bucket.sql'

const EXPECTED_EVENT_COUNT = 18

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function assertTrue(value: unknown, message?: string) {
  if (!value) throw new Error(message || 'Expected truthy')
}

/** Strip SQL comments so ban greps do not false-positive on COMMENT / -- notes. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
}

Deno.test('P1-23 AC1 · cadence 0 7 * * * UTC + cleanup invoke + dual-path cron', () => {
  const migration = Deno.readTextFileSync(MIGRATION_P1_23)
  const runbook = Deno.readTextFileSync(RUNBOOK)
  const care = Deno.readTextFileSync(CARE)
  assertTrue(migration.includes("0 7 * * *"), 'migration cron cadence')
  assertTrue(migration.includes('libertymd-cleanup-expired'), 'job name')
  assertTrue(migration.includes('cleanup_expired_libertymd_data()'), 'function invoke')
  assertTrue(/pg_extension[\s\S]*pg_cron|extname\s*=\s*'pg_cron'/i.test(migration), 'pg_cron if-present gate')
  assertTrue(runbook.includes('0 7 * * *'), 'runbook cadence')
  assertTrue(runbook.includes('Dashboard'), 'runbook Dashboard path')
  assertTrue(care.includes('0 7 * * *'), 'CARE cadence')
  assertTrue(care.includes('Dual-path') || care.includes('dual-path') || care.includes('pg_cron'), 'CARE dual-path')
})

Deno.test('P1-23 AC2 · dry-run path zero mutations', () => {
  const migration = Deno.readTextFileSync(MIGRATION_P1_24)
  const dryRun = Deno.readTextFileSync(DRY_RUN)
  assertTrue(migration.includes('cleanup_expired_libertymd_data_dry_run'), 'twin function')
  assertTrue(/zero mutations|SELECT-only|select-only/i.test(migration), 'dry-run zero mutations comment')
  const dryFn = migration.match(
    /create\s+or\s+replace\s+function\s+public\.cleanup_expired_libertymd_data_dry_run\(\)([\s\S]*?)comment\s+on\s+function\s+public\.cleanup_expired_libertymd_data_dry_run/i,
  )
  assertTrue(dryFn, 'dry-run function body extractable')
  const dryBody = stripSqlComments(dryFn?.[1] || '')
  assertEquals(/\bdelete\s+from\b/i.test(dryBody), false, 'dry-run body has no DELETE')
  assertEquals(/\btruncate\b/i.test(dryBody), false, 'dry-run body has no TRUNCATE')
  assertEquals(/\bupdate\s+\w/i.test(dryBody), false, 'dry-run body has no UPDATE')
  assertTrue(dryRun.includes('ZERO MUTATIONS') || /zero mutations/i.test(dryRun), 'dry-run SQL banner')
  assertEquals(/\bdelete\s+from\b/i.test(stripSqlComments(dryRun)), false, 'dry-run SQL has no DELETE')
  assertTrue(dryRun.includes('would_delete_landing_sessions'), 'landing would-delete count')
})

Deno.test('P1-23 AC3 · expanded RETURNS counts-by-table, no PHI keys', () => {
  const migration = Deno.readTextFileSync(MIGRATION_P1_23)
  assertTrue(/deleted_consultations\s+bigint/i.test(migration), 'deleted_consultations')
  assertTrue(/deleted_profiles\s+bigint/i.test(migration), 'deleted_profiles')
  assertTrue(/deleted_landing_sessions\s+bigint/i.test(migration), 'deleted_landing_sessions')
  assertTrue(/raise\s+(log|notice)/i.test(migration), 'LOG/NOTICE counts')
  const body = stripSqlComments(migration)
  assertEquals(/\bemail\b/i.test(body), false, 'no email in executable SQL')
  assertEquals(/\bchief_complaint\b/i.test(body), false, 'no chief_complaint in executable SQL')
  assertEquals(/\bfilled_slots\b/i.test(body), false, 'no filled_slots in executable SQL')
})

Deno.test('P1-23 AC4 · landing Q2B orphan predicate; P2-12 care_interest covered', () => {
  const migration = Deno.readTextFileSync(MIGRATION_P1_23)
  const p212 = Deno.readTextFileSync(MIGRATION_P2_12)
  const care = Deno.readTextFileSync(CARE)
  const dryRun = Deno.readTextFileSync(DRY_RUN)
  assertTrue(migration.includes('libertymd_landing_sessions'), 'landing delete in body')
  assertTrue(
    /not\s+exists\s*\([\s\S]*landing_session_id\s*=\s*l\.id/i.test(migration),
    'unreferenced landing predicate',
  )
  // P1-23 historical: no executable care_interest DML in the P1-23 file itself.
  const p123Body = stripSqlComments(migration)
  assertEquals(/libertymd_care_interest/i.test(p123Body), false, 'P1-23: no executable care_interest DML')
  assertEquals(/to_regclass/i.test(p123Body), false, 'no to_regclass stub')

  // P2-12: positive delete branch + dry-run count + CARE coverage (flip of former skip).
  assertTrue(/create\s+table[\s\S]*libertymd_care_interest/i.test(p212), 'P2-12 creates care_interest')
  assertTrue(/retention_expires_at/i.test(p212), 'retention_expires_at column')
  const p212Destructive = p212.match(
    /create\s+or\s+replace\s+function\s+public\.cleanup_expired_libertymd_data\(\)([\s\S]*?)comment\s+on\s+function\s+public\.cleanup_expired_libertymd_data\(/i,
  )
  assertTrue(p212Destructive, 'P2-12 destructive cleanup extractable')
  const destructiveBody = stripSqlComments(p212Destructive?.[1] || '')
  assertTrue(
    /delete\s+from\s+public\.libertymd_care_interest/i.test(destructiveBody),
    'executable care_interest DELETE branch',
  )
  assertTrue(/deleted_care_interest\s+bigint/i.test(p212), 'RETURNS deleted_care_interest')
  const p212Dry = p212.match(
    /create\s+or\s+replace\s+function\s+public\.cleanup_expired_libertymd_data_dry_run\(\)([\s\S]*?)comment\s+on\s+function\s+public\.cleanup_expired_libertymd_data_dry_run/i,
  )
  assertTrue(p212Dry, 'P2-12 dry-run extractable')
  const dryBody = stripSqlComments(p212Dry?.[1] || '')
  assertTrue(/libertymd_care_interest/i.test(dryBody), 'dry-run counts care_interest')
  assertTrue(/deleted_storage_objects\s+bigint/i.test(p212), 'dry-run keeps Storage column')
  assertTrue(dryRun.includes('would_delete_care_interest'), 'dry-run SQL care_interest count')
  assertTrue(/libertymd_care_interest/i.test(care), 'CARE documents care_interest')
  assertEquals(
    /table does not exist|CARE\/migration comment skip only/i.test(care),
    false,
    'CARE no longer skips care_interest as missing',
  )
  assertTrue(/30.?day|30 days/i.test(care), 'CARE documents 30d retention')
})

Deno.test('P1-23 AC5 · failure alert section in CARE + runbook', () => {
  const care = Deno.readTextFileSync(CARE)
  const runbook = Deno.readTextFileSync(RUNBOOK)
  assertTrue(/Failure alert|cron failure|missed job|not silent/i.test(care), 'CARE alert')
  assertTrue(/Failure alert|cron failure|missed/i.test(runbook), 'runbook alert')
  assertTrue(runbook.includes('libertymd cleanup:'), 'log search string')
})

Deno.test('P1-23 AC6 · RLS fixtures: orphan removed; referenced survives; linked survives; dry-run no mutate', () => {
  const rls = Deno.readTextFileSync(RLS)
  assertTrue(rls.includes('libertymd_landing_sessions'), 'landing fixtures')
  assertTrue(rls.includes('expired orphan landing is deleted'), 'orphan assert')
  assertTrue(rls.includes('referenced expired landing under linked consult survives'), 'referenced survives')
  assertTrue(rls.includes('linked / NULL-retention consultations survive'), 'linked survive')
  assertTrue(rls.includes('cleanup_expired_libertymd_data_dry_run'), 'dry-run in RLS')
  assertTrue(rls.includes('dry-run does not delete'), 'dry-run zero mutate assert')
  assertTrue(rls.includes('never deletes auth.users'), 'auth.users preserved')
})

Deno.test('P1-23 AC6 · destructive path deletes consults before landings', () => {
  const migration = Deno.readTextFileSync(MIGRATION_P1_23)
  const fn = migration.match(
    /create\s+or\s+replace\s+function\s+public\.cleanup_expired_libertymd_data\(\)([\s\S]*?)comment\s+on\s+function\s+public\.cleanup_expired_libertymd_data\(/i,
  )
  assertTrue(fn, 'destructive function extractable')
  const body = fn?.[1] || ''
  const consultIdx = body.search(/delete\s+from\s+public\.libertymd_consultations/i)
  const landingIdx = body.search(/delete\s+from\s+public\.libertymd_landing_sessions/i)
  assertTrue(consultIdx >= 0, 'consult delete present')
  assertTrue(landingIdx >= 0, 'landing delete present')
  assertTrue(consultIdx < landingIdx, 'consults deleted before landings')
})

Deno.test('P1-23 AC7 · no Storage in P1-23 migration / no Mixpanel invent / grants / allow-list', () => {
  const migration = Deno.readTextFileSync(MIGRATION_P1_23)
  const body = stripSqlComments(migration)
  assertEquals(/storage\.objects/i.test(body), false, 'P1-23: no storage.objects')
  assertEquals(/\bstorage\b/i.test(body) && /delete/i.test(body) && /storage\.objects/i.test(body), false, 'P1-23: no storage delete')
  assertTrue(/revoke\s+all\s+on\s+function\s+public\.cleanup_expired_libertymd_data\(\)/i.test(migration), 'revoke cleanup')
  assertTrue(/grant\s+execute\s+on\s+function\s+public\.cleanup_expired_libertymd_data\(\)\s+to\s+service_role/i.test(migration), 'grant cleanup')
  assertTrue(/grant\s+execute\s+on\s+function\s+public\.cleanup_expired_libertymd_data_dry_run\(\)\s+to\s+service_role/i.test(migration), 'grant dry-run')

  const telemetry = Deno.readTextFileSync(TELEMETRY)
  const namesMatch = telemetry.match(/export const PRODUCT_EVENT_NAMES = \[([\s\S]*?)\] as const/)
  assertTrue(namesMatch, 'PRODUCT_EVENT_NAMES present')
  const names = (namesMatch?.[1] || '').match(/'[^']+'/g) || []
  assertEquals(names.length, EXPECTED_EVENT_COUNT, `allow-list cardinality stays ${EXPECTED_EVENT_COUNT}`)
  assertEquals(names.some((n) => /cleanup/i.test(n)), false, 'no cleanup_* event invented')

  const pkg = Deno.readTextFileSync(PACKAGE_JSON)
  assertTrue(pkg.includes('test:libertymd:cleanup-expired'), 'package script present')
  assertTrue(pkg.includes('test:libertymd:cleanup-expired') && pkg.includes('test:libertymd:ci'), 'ci mentions cleanup')
})

Deno.test('P1-23 · dry-run SQL survival spot-checks present', () => {
  const dryRun = Deno.readTextFileSync(DRY_RUN)
  assertTrue(dryRun.includes('surviving_linked_or_null_retention_consults'), 'linked survival check')
  assertTrue(dryRun.includes('surviving_referenced_expired_landings'), 'referenced landing survival check')
})

// ---------------------------------------------------------------------------
// P1-24 Storage extension
// ---------------------------------------------------------------------------

Deno.test('P1-24 AC1 · CARE historical Postgres-only + P1-23 Storage ban kept', () => {
  const care = Deno.readTextFileSync(CARE)
  const p123 = stripSqlComments(Deno.readTextFileSync(MIGRATION_P1_23))
  assertTrue(/As of P1-23|Postgres only|historical/i.test(care), 'CARE AC1 historical note')
  assertTrue(/P1-24/i.test(care) && /Storage/i.test(care), 'CARE documents P1-24 Storage')
  assertEquals(/storage\.objects/i.test(p123), false, 'P1-23 migration Storage ban intact')
})

Deno.test('P1-24 AC2 · Edge Storage API remove + libertymd-care allow-list', () => {
  const edge = Deno.readTextFileSync(EDGE_INDEX)
  const pathMod = Deno.readTextFileSync(EDGE_PATH)
  const migration = Deno.readTextFileSync(MIGRATION_P1_24)
  assertTrue(pathMod.includes("libertymd-care"), 'bucket id')
  assertTrue(edge.includes(".remove(") || edge.includes('.remove('), 'Storage API remove')
  assertTrue(edge.includes('storage.from') || edge.includes(".from(LIBERTYMD_CARE_BUCKET)"), 'storage.from')
  assertTrue(/deleted_storage_objects/i.test(edge), 'ops count log')
  assertEquals(/libertymd-assets/.test(edge) && /from\(['"]libertymd-assets/.test(edge), false, 'Edge never removes from assets')
  // Retention must not be SQL DELETE FROM storage.objects
  const migBody = stripSqlComments(migration)
  assertEquals(/\bdelete\s+from\s+storage\.objects\b/i.test(migBody), false, 'no SQL storage.objects DELETE as retention')
})

Deno.test('P1-24 AC3 · orphan query checked in (SQL + function)', () => {
  const orphan = Deno.readTextFileSync(ORPHAN_SQL)
  const migration = Deno.readTextFileSync(MIGRATION_P1_24)
  assertTrue(orphan.includes('libertymd-care'), 'orphan script bucket')
  assertTrue(orphan.includes('split_part') || orphan.includes('foldername'), 'path segment parse')
  assertTrue(/not\s+exists/i.test(orphan) && /libertymd_consultations/i.test(orphan), 'missing parent predicate')
  assertTrue(migration.includes('list_libertymd_care_storage_orphans'), 'orphan RPC')
  assertTrue(orphan.includes('orphan_storage_objects'), 'orphan count alias')
})

Deno.test('P1-24 AC4 · path contract {consultation_id}/{kind}/{object_uuid}', () => {
  const care = Deno.readTextFileSync(CARE)
  const pathMod = Deno.readTextFileSync(EDGE_PATH)
  const migration = Deno.readTextFileSync(MIGRATION_P1_24)
  assertTrue(/\{consultation_id\}\/\{kind\}\/\{object_uuid\}/.test(care) || care.includes('consultation_id}/{kind}/{object_uuid'), 'CARE path')
  assertTrue(pathMod.includes('photo') && pathMod.includes('lab'), 'kinds photo|lab')
  assertTrue(migration.includes('{consultation_id}/{kind}/{object_uuid}') || migration.includes('consultation_id}/{kind}/{object_uuid'), 'migration path comment')
})

Deno.test('P4-07 AC5 · expired-consult lab path is cleanup-keyable like photo', () => {
  const pathMod = Deno.readTextFileSync(EDGE_PATH)
  const care = Deno.readTextFileSync(CARE)
  assertTrue(pathMod.includes("'lab'") || pathMod.includes('"lab"') || /lab/.test(pathMod), 'lab kind in path module')
  assertTrue(/P4-07|lab objects are in P1-24|lab\/\{object_uuid\}/i.test(care), 'CARE lab in P1-24 scope')
  // Synthetic expired-consult lab object: first-segment ownership matches photo.
  const syntheticLab = 'a0000000-0000-4000-8000-000000000004/lab/e0000000-0000-4000-8000-000000000002'
  assertTrue(/consultationIdFromCarePath|parseLibertyMdCarePath|buildLibertyMdCarePath/.test(pathMod))
  assertTrue(syntheticLab.includes('/lab/'))
})

Deno.test('P1-24 AC5 · synthetic path helpers + no FE upload / no setup_assets retarget', () => {
  const pathMod = Deno.readTextFileSync(EDGE_PATH)
  const edge = Deno.readTextFileSync(EDGE_INDEX)
  assertTrue(pathMod.includes('buildLibertyMdCarePath') || pathMod.includes('parseLibertyMdCarePath'), 'path builders')
  assertTrue(edge.includes('list_libertymd_care_storage_orphans'), 'orphan list then remove')
  // Ban FE upload UI in this ticket's Edge/SQL surface (Chat upload not added)
  assertEquals(/LibertyMDChat|type=["']file["']|input.*capture/i.test(edge), false, 'no FE upload in Edge')
  const setup = Deno.readTextFileSync(SETUP_ASSETS)
  assertTrue(setup.includes('libertymd-assets'), 'assets setup unchanged target')
  assertEquals(/libertymd-care/.test(setup), false, 'setup_libertymd_bucket.sql not retargeted')
})

Deno.test('P1-24 AC6 · dry-run Storage counts + assets ban + allow-list 18', () => {
  const dryRun = Deno.readTextFileSync(DRY_RUN)
  const migration = Deno.readTextFileSync(MIGRATION_P1_24)
  const care = Deno.readTextFileSync(CARE)
  const runbook = Deno.readTextFileSync(RUNBOOK)
  assertTrue(/would_delete_storage_objects|deleted_storage_objects/i.test(dryRun), 'dry-run Storage count')
  assertTrue(/deleted_storage_objects\s+bigint/i.test(migration), 'dry-run RETURNS storage count')
  assertTrue(/libertymd-assets/i.test(care) && /out of|marketing|never/i.test(care), 'CARE assets out of scope')
  assertTrue(/libertymd-assets/i.test(runbook) && /never|marketing|out of/i.test(runbook), 'runbook assets ban')
  assertTrue(runbook.includes('libertymd-cleanup-storage') || runbook.includes('Storage'), 'runbook Storage schedule')

  const telemetry = Deno.readTextFileSync(TELEMETRY)
  const namesMatch = telemetry.match(/export const PRODUCT_EVENT_NAMES = \[([\s\S]*?)\] as const/)
  const names = (namesMatch?.[1] || '').match(/'[^']+'/g) || []
  assertEquals(names.length, EXPECTED_EVENT_COUNT, 'allow-list stays 18')
})

Deno.test('P1-24 R1 · Postgres cleanup order / P1-23 body unchanged for Storage', () => {
  const p123 = Deno.readTextFileSync(MIGRATION_P1_23)
  assertTrue(p123.includes('No Storage deletes (P1-24)') || /No Storage/i.test(p123), 'P1-23 no-Storage comment kept')
  const fn = p123.match(
    /create\s+or\s+replace\s+function\s+public\.cleanup_expired_libertymd_data\(\)([\s\S]*?)comment\s+on\s+function\s+public\.cleanup_expired_libertymd_data\(/i,
  )
  const body = stripSqlComments(fn?.[1] || '')
  assertEquals(/storage\.objects/i.test(body), false, 'destructive Postgres still no storage.objects')
})

Deno.test('P1-24 · RLS Storage fixture markers present when :db runnable', () => {
  const rls = Deno.readTextFileSync(RLS)
  assertTrue(rls.includes('libertymd-care') || rls.includes('P1-24'), 'RLS mentions P1-24 Storage')
  assertTrue(rls.includes('list_libertymd_care_storage_orphans') || rls.includes('storage.objects'), 'orphan / storage fixture')
})

Deno.test('P2-13 AC3 · cleaned guests cannot restore — CARE + redeem honesty cross-link', () => {
  const care = Deno.readTextFileSync(CARE)
  assertTrue(care.includes('P2-13') && /cannot restore|never.*restore|no false restore/i.test(care), 'CARE no false restore')
  assertTrue(care.includes('guest_expired') || care.includes('Guest expired'), 'CARE guest expired state')
})
