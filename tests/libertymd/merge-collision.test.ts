/**
 * P4-05 — Merge collision rule source contracts (CARE Paths 0–2, UI, Lexicon fence).
 *
 * Run focused: `deno test --no-config --allow-read tests/libertymd/merge-collision.test.ts`
 * Wired into `test:libertymd:ci` via `test:libertymd:merge-collision`.
 */
declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const CARE_DOC = new URL('../../docs/libertymd/CARE-ARCHITECTURE.md', import.meta.url)
const IDENTITY_SOURCE = new URL(
  '../../supabase/functions/libertymd-care-proxy/actions/identity.ts',
  import.meta.url,
)
const MIGRATION = new URL(
  '../../supabase/migrations/20260731261000_libertymd_merge_collision_rule.sql',
  import.meta.url,
)
const CHAT_SOURCE = new URL('../../components/LibertyMD/LibertyMDChat.tsx', import.meta.url)
const CARE_CONTROLS = new URL('../../components/LibertyMD/LibertyMDCareControls.tsx', import.meta.url)
const CLIENT_SOURCE = new URL(
  '../../components/LibertyMD/libertymd-care-proxy-client.ts',
  import.meta.url,
)
const ANALYTICS_SOURCE = new URL('../../components/LibertyMD/libertymd-analytics.ts', import.meta.url)
const EN_I18N = new URL('../../i18n/locales/en.json', import.meta.url)
const RLS_TEST = new URL('../../supabase/tests/libertymd_care_rls.test.sql', import.meta.url)

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

Deno.test('P4-05 AC1: CARE documents Paths 0–2 + match + fail-closed + collision_path', async () => {
  const care = await Deno.readTextFile(CARE_DOC)
  assert(care.includes('P4-05 · Merge collision rule'), 'CARE owns collision rule')
  assert(care.includes('Path 0'), 'Path 0 documented')
  assert(care.includes('Path 1'), 'Path 1 documented')
  assert(care.includes('Path 2'), 'Path 2 documented')
  assert(care.includes('matched_self'), 'matched_self greppable')
  assert(care.includes('distinct_profile'), 'distinct_profile greppable')
  assert(care.includes('fail closed') || care.includes('fail-closed') || care.includes('fail **closed**'), 'fail closed')
  assert(care.includes('createPatient'), 'createPatient parity')
  assert(care.includes('collision_path'), 'collision_path documented')
  assert(care.includes("'success'` only") || care.includes('merge_outcome'), 'Lexicon success left alone')
  assert(care.includes('LIBERTYMD_MIN_PATIENT_AGE'), 'SQL↔TS age-18 lockstep')
  assert(care.includes('18.1'), '18.1 default')
})

Deno.test('P4-05 AC2/AC3: migration bans age/sex coalesce; adults-only 18; fail-closed message', async () => {
  const sql = await Deno.readTextFile(MIGRATION)
  assert(sql.includes("resolved_path := 'matched_self'"), 'Path 1 branch')
  assert(sql.includes("resolved_path := 'distinct_profile'"), 'Path 2 branch')
  assert(sql.includes("'other'"), 'other patient relationship')
  assert(sql.includes("'Saved from guest visit'"), 'system label')
  assert(sql.includes('source_age < 18'), 'adults-only 18 hardcoded')
  assert(sql.includes("source_sex not in ('female', 'male')"), 'createPatient sex parity')
  assert(sql.includes('Account transfer could not save this visit safely'), 'fail-closed message')
  assert(!sql.includes('age = coalesce(target.age'), 'no profile/patient age coalesce')
  assert(!sql.includes('sex_at_birth = coalesce(target.sex_at_birth'), 'no sex coalesce')
  assert(sql.includes('collision_path'), 'metadata collision_path')
  assert(sql.includes('service_role'), 'service_role execute')
  assert(sql.includes('revoke all') || sql.includes('REVOKE'), 'revoke non-service')
})

Deno.test('P4-05 AC7: identity.ts shapes collision_path; does not set merge_outcome Path enums', async () => {
  const identity = await Deno.readTextFile(IDENTITY_SOURCE)
  const completeStart = identity.indexOf('export async function handleCompleteAccountMerge')
  assert(completeStart >= 0, 'complete handler')
  const completeEnd = identity.indexOf('export async function handleSyncIdentity', completeStart)
  const complete = identity.slice(completeStart, completeEnd > completeStart ? completeEnd : completeStart + 2500)
  assert(complete.includes('collision_path'), 'returns collision_path')
  assert(complete.includes("'matched_self'") && complete.includes("'distinct_profile'"), 'Path enums')
  assert(!complete.includes("merge_outcome: 'matched_self'"), 'no Lexicon Path overload')
  assert(!complete.includes("merge_outcome: 'distinct_profile'"), 'no Lexicon Path overload')
})

Deno.test('P4-05 AC5: i18n + CareControls/Chat outcome chrome; no mid-consult mount', async () => {
  const en = JSON.parse(await Deno.readTextFile(EN_I18N)) as {
    careControls: Record<string, string>
  }
  assert(typeof en.careControls.mergeOutcomeMatchedSelf === 'string', 'matched copy')
  assert(typeof en.careControls.mergeOutcomeDistinctProfile === 'string', 'mismatch copy')
  assert(typeof en.careControls.mergeOutcomeFailed === 'string', 'fail copy')
  assert(typeof en.careControls.mergeOutcomeAcknowledge === 'string', 'ack copy')
  for (const key of [
    'mergeOutcomeMatchedSelf',
    'mergeOutcomeDistinctProfile',
    'mergeOutcomeFailed',
    'mergeOutcomeAcknowledge',
  ]) {
    const text = en.careControls[key]
    assert(!/@|rpc|libertymd_|patient_id|email/i.test(text), `${key} must not leak internals/PHI patterns`)
  }
  const care = await Deno.readTextFile(CARE_CONTROLS)
  assert(care.includes('LibertyMDMergeCollisionOutcome') || care.includes('collisionPath'), 'outcome slot')
  assert(care.includes('data-libertymd-merge-collision-outcome'), 'outcome marker')
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  assert(chat.includes('mergeCollisionPath'), 'Chat holds collision state')
  assert(chat.includes('LibertyMDMergeCollisionOutcome'), 'Chat mounts outcome on report_ready')
  assert(chat.includes("merge_outcome: 'success'"), 'Lexicon success preserved on merge')
  assert(!chat.includes("merge_outcome: 'matched_self'"), 'no Path-enum merge_outcome')
  // Outcome must not appear under intake/emergency exclusive mounts.
  const intakeMount = chat.includes("phase === 'intake' && mergeCollisionPath")
  assert(!intakeMount, 'no intake collision chrome')
})

Deno.test('P4-05 AC4: RLS fixtures split match vs mismatch + fail-closed', async () => {
  const rls = await Deno.readTextFile(RLS_TEST)
  assert(rls.includes('P4-05 Path 1'), 'match fixture')
  assert(rls.includes('P4-05 Path 2'), 'mismatch fixture')
  assert(rls.includes('collision_path matched_self') || rls.includes("'matched_self'"), 'match path assert')
  assert(rls.includes('distinct_profile'), 'mismatch path assert')
  assert(rls.includes('prefer_not_to_say'), 'illegal create fixture')
  assert(rls.includes('fail-closed'), 'fail-closed asserts')
  assert(rls.includes('target profile age untouched') || rls.includes('profile age untouched'), 'Q1A profile ban')
})

Deno.test('P4-05 AC7: parseCollisionPath helper + analytics Lexicon success untouched', async () => {
  const client = await Deno.readTextFile(CLIENT_SOURCE)
  assert(client.includes('parseCollisionPath'), 'client parse helper')
  assert(client.includes("'matched_self'") && client.includes("'distinct_profile'"), 'closed set')
  const analytics = await Deno.readTextFile(ANALYTICS_SOURCE)
  assert(analytics.includes("merge_outcome: 'success'"), 'emitIdentityLinked still success-only')
  assert(!analytics.includes("merge_outcome: 'matched_self'"), 'analytics no Path enum')
})
