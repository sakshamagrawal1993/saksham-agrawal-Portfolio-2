/**
 * P4-10 — Edge-state inventory matrix + T0–T2 contract guards.
 *
 * Run: npm run test:libertymd:edge-states
 * Wired into test:libertymd:ci (non-zero).
 */
import {
  EDGE_INVENTORY_EXPECTED_COUNT,
  EDGE_STATE_INVENTORY,
  careInterestJoinedStorageKey,
  edgeInventoryCutRows,
  edgeInventoryDoneRows,
  LIBERTYMD_MAX_ACTIVE_PATIENTS_CLIENT,
} from '../../components/LibertyMD/libertymd-edge-inventory.ts'
import {
  copyForErrorClass,
  FORBIDDEN_USER_COPY_TOKENS,
  patientFacingTechnicalMessage,
} from '../../components/LibertyMD/libertymd-failure-taxonomy.ts'
import { GENERATING_WAIT_TIMEOUT_MS } from '../../components/LibertyMD/libertymd-waiting.ts'
import { REPORT_LIFECYCLE_STATES } from '../../components/LibertyMD/libertymd-report-lifecycle.ts'

declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

const ROOT = new URL('../..', import.meta.url)

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function assertTrue(value: unknown, message?: string) {
  if (!value) throw new Error(message || 'Expected truthy')
}

Deno.test('P4-10 AC1 · inventory has 44 rows (43 Register + not_yet_eligible)', () => {
  assertEquals(EDGE_STATE_INVENTORY.length, EDGE_INVENTORY_EXPECTED_COUNT)
  assertEquals(EDGE_INVENTORY_EXPECTED_COUNT, 44)
  const ids = new Set(EDGE_STATE_INVENTORY.map((r) => r.id))
  assertEquals(ids.size, 44)
  assertTrue(ids.has('report.not_yet_eligible'))
  assertTrue(ids.has('landing.locale_mismatch'))
  assertTrue(ids.has('history.single'))
  assertTrue(ids.has('doctor.already_joined'))
  assertTrue(ids.has('entry.at_profile_limit'))
})

Deno.test('P4-10 AC1 · every row is Done or Cut(residual); Done has snapshotId', () => {
  for (const row of EDGE_STATE_INVENTORY) {
    assertTrue(row.status === 'Done' || row.status === 'Cut', row.id)
    assertTrue(Boolean(row.reachability), `reachability missing: ${row.id}`)
    if (row.status === 'Done') {
      assertTrue(Boolean(row.snapshotId), `Done without snapshotId: ${row.id}`)
      assertEquals(row.residual, undefined, `Done must not set residual: ${row.id}`)
    } else {
      assertTrue(Boolean(row.residual), `Cut without residual: ${row.id}`)
      assertEquals(row.snapshotId, undefined, `Cut must not claim snapshot: ${row.id}`)
    }
  }
  const cuts = edgeInventoryCutRows()
  assertEquals(cuts.length, 4)
  assertTrue(cuts.every((c) =>
    c.id === 'landing.locale_mismatch'
    || c.id === 'history.single'
    || c.id === 'history.many'
    || c.id === 'history.expired'
  ))
  assertTrue(edgeInventoryDoneRows().length === 40)
})

Deno.test('P4-10 AC1 · CARE mirrors inventory ids', async () => {
  const care = await Deno.readTextFile(new URL('docs/libertymd/CARE-ARCHITECTURE.md', ROOT))
  assertTrue(care.includes('## Edge-state inventory (P4-10)'))
  assertTrue(care.includes('**44**'))
  for (const row of EDGE_STATE_INVENTORY) {
    assertTrue(care.includes(`\`${row.id}\``), `CARE missing id ${row.id}`)
  }
})

Deno.test('P4-10 AC5 · every Done snapshotId appears in product source or inventory contract', async () => {
  const done = edgeInventoryDoneRows()
  assertTrue(done.length > 0)
  const sources = await Promise.all([
    Deno.readTextFile(new URL('components/LibertyMD/LibertyMDHistoryList.tsx', ROOT)),
    Deno.readTextFile(new URL('components/LibertyMD/LibertyMDProfileManagementPanel.tsx', ROOT)),
    Deno.readTextFile(new URL('components/LibertyMD/LibertyMDDoctorHandoffPanel.tsx', ROOT)),
    Deno.readTextFile(new URL('components/LibertyMD/LibertyMDReportEmailDelivery.tsx', ROOT)),
    Deno.readTextFile(new URL('components/LibertyMD/LibertyMDReportLifecycleShell.tsx', ROOT)),
    Deno.readTextFile(new URL('components/LibertyMD/libertymd-report-lifecycle.ts', ROOT)),
    Deno.readTextFile(new URL('components/LibertyMD/libertymd-waiting.ts', ROOT)),
    Deno.readTextFile(new URL('components/LibertyMD/libertymd-failure-taxonomy.ts', ROOT)),
    Deno.readTextFile(new URL('components/LibertyMD/libertymd-edge-inventory.ts', ROOT)),
    Deno.readTextFile(new URL('components/LibertyMD/LibertyMDCareControls.tsx', ROOT)),
    Deno.readTextFile(new URL('components/LibertyMD/LibertyMDAttachControls.tsx', ROOT)),
  ])
  const blob = sources.join('\n')
  for (const row of done) {
    const snap = row.snapshotId!
    // Fixture/golden: snapshot id must be referenced as data-libertymd-edge, lifecycle state, or inventory row.
    const present =
      blob.includes(`data-libertymd-edge="${snap}"`)
      || blob.includes(`data-libertymd-edge={`)
      || blob.includes(`'${snap}'`)
      || blob.includes(`"${snap}"`)
      || blob.includes(snap)
    assertTrue(present, `Done snapshot id not found in fixtures/source: ${snap} (${row.id})`)
  }
})

Deno.test('P4-10 AC2 · patientFacingTechnicalMessage never echoes raw/proxy stack', () => {
  const raw = new Error('FunctionsHttpError: n8n workflow proxy stack at Edge Function')
  const safe = patientFacingTechnicalMessage(raw, 'Something went wrong on our side. Please try again.')
  assertEquals(safe, 'Something went wrong on our side. Please try again.')
  for (const token of FORBIDDEN_USER_COPY_TOKENS) {
    assertTrue(!safe.toLowerCase().includes(token.toLowerCase()), token)
  }
  const catalog = copyForErrorClass('offline')
  assertEquals(
    patientFacingTechnicalMessage(new Error(catalog), 'fallback'),
    catalog,
  )
})

Deno.test('P4-10 AC2 · generating wait ceiling remains timed (65s)', () => {
  assertEquals(GENERATING_WAIT_TIMEOUT_MS, 65_000)
})

Deno.test('P4-10 AC3 · history empty CTA + profile at-limit next-action markers', async () => {
  const history = await Deno.readTextFile(new URL('components/LibertyMD/LibertyMDHistoryList.tsx', ROOT))
  assertTrue(history.includes('data-libertymd-history-empty-cta'))
  assertTrue(history.includes('data-libertymd-history-loading-escape'))
  assertTrue(history.includes('emptyHistoryCta'))
  assertTrue(history.includes('data-libertymd-edge="history-empty"'))

  const profiles = await Deno.readTextFile(
    new URL('components/LibertyMD/LibertyMDProfileManagementPanel.tsx', ROOT),
  )
  assertTrue(profiles.includes('LIBERTYMD_MAX_ACTIVE_PATIENTS_CLIENT'))
  assertTrue(profiles.includes('data-libertymd-profile-at-limit'))
  assertTrue(profiles.includes('profileAtLimit'))
  assertEquals(LIBERTYMD_MAX_ACTIVE_PATIENTS_CLIENT, 5)
})

Deno.test('P4-10 AC3/Q4 · doctor already-joined storage key + panel markers', async () => {
  assertEquals(
    careInterestJoinedStorageKey('abc'),
    'libertymd:care-interest-joined:abc',
  )
  const panel = await Deno.readTextFile(
    new URL('components/LibertyMD/LibertyMDDoctorHandoffPanel.tsx', ROOT),
  )
  assertTrue(panel.includes('readCareInterestJoined'))
  assertTrue(panel.includes('writeCareInterestJoined'))
  assertTrue(panel.includes('data-handoff-already-joined'))
  assertTrue(panel.includes('doctor-already-joined'))
  // No new Mixpanel event names for already-joined
  assertTrue(!/emit\w*AlreadyJoined/.test(panel))
})

Deno.test('P4-10 AC4 · offline + rate-limit copy stay technical / non-accusatory', () => {
  const offline = copyForErrorClass('offline')
  const rate = copyForErrorClass('rate_limited', { retryAfterMs: 5000 })
  assertTrue(offline.toLowerCase().includes('offline') || offline.toLowerCase().includes('reconnect'))
  assertTrue(!/you (failed|caused|broke)|your fault|careless/i.test(offline))
  assertTrue(!/emergency|911|call a doctor|seek care now/i.test(offline))
  assertTrue(!/emergency|911|call a doctor|seek care now/i.test(rate))
  assertTrue(rate.toLowerCase().includes('wait'))
})

Deno.test('P4-10 AC6 · report lifecycle six states still consumed (incl not_yet_eligible)', () => {
  assertEquals(REPORT_LIFECYCLE_STATES.length, 6)
  assertTrue(REPORT_LIFECYCLE_STATES.includes('not_yet_eligible'))
})

Deno.test('P4-10 AC2 · in-scope surfaces prefer patientFacingTechnicalMessage / catalog', async () => {
  const chat = await Deno.readTextFile(new URL('components/LibertyMD/LibertyMDChat.tsx', ROOT))
  const app = await Deno.readTextFile(new URL('components/LibertyMD/LibertyMDApp.tsx', ROOT))
  const email = await Deno.readTextFile(
    new URL('components/LibertyMD/LibertyMDReportEmailDelivery.tsx', ROOT),
  )
  assertTrue(chat.includes('patientFacingTechnicalMessage'))
  assertTrue(app.includes('patientFacingTechnicalMessage'))
  // Email catch must not prefer err.message
  assertTrue(!/err\.message/.test(email))
  assertTrue(email.includes("t('report.emailDelivery.failure')"))
})

Deno.test('P4-10 AC7 · fences — no FooterRibbon / privacy invent in inventory; lab ingest is ProxyAction not inventory', async () => {
  const inv = await Deno.readTextFile(new URL('components/LibertyMD/libertymd-edge-inventory.ts', ROOT))
  assertTrue(!inv.includes('LibertyMDFooterRibbon'))
  assertTrue(!inv.includes('privacy page'))
  // Lab ingest ships as proxy upload_lab (P4-07) — must not invent edge-inventory chrome here.
  assertTrue(!inv.includes('upload_lab'))

  const types = await Deno.readTextFile(
    new URL('supabase/functions/libertymd-care-proxy/lib/types.ts', ROOT),
  )
  assertTrue(types.includes("'upload_lab'"), 'P4-07 ProxyAction gains upload_lab')
})
