/**
 * P1-12 — Draft and optimistic persistence: pure store + Chat/proxy source contracts.
 *
 * AC5 live browser network-kill = DoD+ / CANNOT RUN (unit/contract closes AC5).
 *
 * Run focused: `deno test --no-config --no-check --sloppy-imports --allow-read tests/libertymd/draft-persistence.test.ts`
 * Wired into `test:libertymd:ci` via `test:libertymd:draft-persistence`.
 */
declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

import {
  clearLibertyMdConsultClientState,
  CLIENT_PERSISTENCE_TTL_MS,
  draftKey,
  libertyMdConsultClientKeys,
  mergePendingIntoMessages,
  nextComposerInputAfterPendingHydrate,
  persistPendingOutbound,
  readDraft,
  readPendingOutbound,
  readScroll,
  reconcilePendingWithServer,
  scrollKey,
  shouldClearClientPhiForPhase,
  writeDraft,
  writeScroll,
  type DraftStorage,
} from '../../components/LibertyMD/libertymd-draft-persistence.ts'
import {
  offlineQueueKey,
  readOfflineQueue,
} from '../../components/LibertyMD/libertymd-failure-taxonomy.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function memoryStorage(): DraftStorage & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    setItem: (key, value) => { store.set(key, value) },
    removeItem: (key) => { store.delete(key) },
  }
}

const CHAT_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDChat.tsx',
  import.meta.url,
)
const PERSIST_SOURCE = new URL(
  '../../components/LibertyMD/libertymd-draft-persistence.ts',
  import.meta.url,
)
const CONSULTATIONS_SOURCE = new URL(
  '../../supabase/functions/libertymd-care-proxy/lib/consultations.ts',
  import.meta.url,
)
const SCROLL_SOURCE = new URL(
  '../../components/LibertyMD/LibertyMDChatScroll.tsx',
  import.meta.url,
)

// ---------------------------------------------------------------------------
// AC1 — draft round-trip + consult isolation + durable (localStorage keys)
// ---------------------------------------------------------------------------

Deno.test('P1-12 AC1: draft round-trip for consult A', () => {
  const storage = memoryStorage()
  writeDraft('consult-a', 'mild chest tightness since morning', storage, 1_000)
  const read = readDraft('consult-a', storage, 1_000)
  assert(read !== null, 'draft must survive simulated reload')
  assertEquals(read.text, 'mild chest tightness since morning', 'draft text')
  assertEquals(read.consultationId, 'consult-a', 'keyed to consult')
})

Deno.test('P1-12 AC1: consult B is isolated from A', () => {
  const storage = memoryStorage()
  writeDraft('consult-a', 'draft A', storage, 1_000)
  writeDraft('consult-b', 'draft B', storage, 1_000)
  assertEquals(readDraft('consult-a', storage, 1_000)?.text, 'draft A', 'A intact')
  assertEquals(readDraft('consult-b', storage, 1_000)?.text, 'draft B', 'B intact')
  assertEquals(readDraft('consult-c', storage, 1_000), null, 'C empty')
})

Deno.test('P1-12 AC1: empty draft clears key (no stale PHI)', () => {
  const storage = memoryStorage()
  writeDraft('consult-a', 'temp', storage, 1_000)
  writeDraft('consult-a', '   ', storage, 1_001)
  assertEquals(storage.getItem(draftKey('consult-a')), null, 'blank clears')
})

Deno.test('P1-12 AC1: TTL expires orphan drafts', () => {
  const storage = memoryStorage()
  writeDraft('consult-a', 'stale', storage, 1_000)
  assertEquals(
    readDraft('consult-a', storage, 1_000 + CLIENT_PERSISTENCE_TTL_MS + 1),
    null,
    'TTL backstop',
  )
})

Deno.test('P1-12 AC1: draft keys are localStorage-shaped (not session-only)', () => {
  assert(draftKey('x').startsWith('libertymd:draft:'), 'draft prefix')
  assert(scrollKey('x').startsWith('libertymd:scroll:'), 'scroll prefix')
  assert(offlineQueueKey('x').startsWith('libertymd:offline-queue:'), 'offline prefix')
})

// ---------------------------------------------------------------------------
// AC2 — pending survive reload; reconcile by client_message_id; merge bubble
// ---------------------------------------------------------------------------

Deno.test('P1-12 AC2: pending outbound survives simulated reload (S2)', () => {
  const storage = memoryStorage()
  persistPendingOutbound({
    consultationId: 'consult-a',
    message: 'pain radiates to left arm',
    clientMessageId: 'cccccccc-dddd-4eee-8fff-000000000001',
  }, storage, 2_000)
  const pending = readPendingOutbound('consult-a', storage, 2_000)
  assert(pending !== null, 'pending must exist')
  assertEquals(pending.clientMessageId, 'cccccccc-dddd-4eee-8fff-000000000001', 'same id')
  assertEquals(pending.message, 'pain radiates to left arm', 'message intact')
  // Same writer as offline queue (Q1C)
  const queued = readOfflineQueue('consult-a', storage, 2_000)
  assertEquals(queued?.clientMessageId, pending.clientMessageId, 'single outbound writer')
})

Deno.test('P1-12 AC2: reconcile drops pending when server has client_message_id', () => {
  const storage = memoryStorage()
  const id = 'cccccccc-dddd-4eee-8fff-000000000002'
  persistPendingOutbound({
    consultationId: 'consult-a',
    message: 'confirmed on server',
    clientMessageId: id,
  }, storage, 3_000)
  const remaining = reconcilePendingWithServer(
    'consult-a',
    [{ id: 'row-1', client_message_id: id, role: 'user' }],
    storage,
    3_000,
  )
  assertEquals(remaining, null, 'reconciled away')
  assertEquals(readPendingOutbound('consult-a', storage, 3_000), null, 'cleared')
})

Deno.test('P1-12 AC2: unconfirmed pending remounts via mergePendingIntoMessages', () => {
  const storage = memoryStorage()
  const id = 'cccccccc-dddd-4eee-8fff-000000000003'
  const pending = persistPendingOutbound({
    consultationId: 'consult-a',
    message: 'still in flight',
    clientMessageId: id,
  }, storage, 4_000)
  const kept = reconcilePendingWithServer(
    'consult-a',
    [{ id: 'row-other', client_message_id: 'other-id', role: 'user' }],
    storage,
    4_000,
  )
  assert(kept !== null, 'must remain retryable')
  const merged = mergePendingIntoMessages(
    [{ id: 'ai-1', sender: 'ai' as const, text: 'Tell me more' }],
    pending,
  )
  assertEquals(merged.length, 2, 'pending bubble appended')
  assertEquals(merged[1].clientMessageId, id, 'clientMessageId on bubble')
  assertEquals(merged[1].text, 'still in flight', 'text intact')
})

Deno.test('P1-12 AC2: merge is idempotent when clientMessageId already present', () => {
  const id = 'cccccccc-dddd-4eee-8fff-000000000004'
  const pending = {
    v: 1 as const,
    consultationId: 'consult-a',
    message: 'dup',
    clientMessageId: id,
    enqueuedAt: 1,
  }
  const merged = mergePendingIntoMessages(
    [{ id: 'u1', sender: 'user' as const, text: 'dup', clientMessageId: id }],
    pending,
  )
  assertEquals(merged.length, 1, 'no duplicate bubble')
})

Deno.test('P1-12 Q2C: composer free when draft equals pending / empty', () => {
  assertEquals(
    nextComposerInputAfterPendingHydrate('', 'sent text'),
    '',
    'empty → free',
  )
  assertEquals(
    nextComposerInputAfterPendingHydrate('sent text', 'sent text'),
    '',
    'same as pending → free',
  )
  assertEquals(
    nextComposerInputAfterPendingHydrate('new mid-wait note', 'sent text'),
    'new mid-wait note',
    'distinct mid-wait draft kept',
  )
})

// ---------------------------------------------------------------------------
// AC3 — scroll persist + restore shape
// ---------------------------------------------------------------------------

Deno.test('P1-12 AC3: scroll round-trip near-bottom flag', () => {
  const storage = memoryStorage()
  writeScroll('consult-a', 420, true, storage, 5_000)
  const read = readScroll('consult-a', storage, 5_000)
  assert(read !== null, 'scroll must survive reload')
  assertEquals(read.scrollTop, 420, 'scrollTop')
  assertEquals(read.wasNearBottom, true, 'wasNearBottom')
})

Deno.test('P1-12 AC3: scroll exact top when not near bottom', () => {
  const storage = memoryStorage()
  writeScroll('consult-a', 88, false, storage, 5_000)
  const read = readScroll('consult-a', storage, 5_000)
  assertEquals(read?.wasNearBottom, false, 'unpin path')
  assertEquals(read?.scrollTop, 88, 'exact top')
})

// ---------------------------------------------------------------------------
// AC4 — shared clear + key inventory + phase triggers
// ---------------------------------------------------------------------------

Deno.test('P1-12 AC4: clearLibertyMdConsultClientState clears draft+scroll+offline', () => {
  const storage = memoryStorage()
  writeDraft('consult-a', 'phi draft', storage, 6_000)
  writeScroll('consult-a', 10, false, storage, 6_000)
  persistPendingOutbound({
    consultationId: 'consult-a',
    message: 'phi pending',
    clientMessageId: 'cccccccc-dddd-4eee-8fff-000000000005',
  }, storage, 6_000)
  clearLibertyMdConsultClientState('consult-a', storage)
  for (const key of libertyMdConsultClientKeys('consult-a')) {
    assertEquals(storage.getItem(key), null, `cleared ${key}`)
  }
})

Deno.test('P1-12 AC4: clear is consult-scoped (B untouched)', () => {
  const storage = memoryStorage()
  writeDraft('consult-a', 'A', storage, 6_000)
  writeDraft('consult-b', 'B', storage, 6_000)
  clearLibertyMdConsultClientState('consult-a', storage)
  assertEquals(readDraft('consult-a', storage, 6_000), null, 'A cleared')
  assertEquals(readDraft('consult-b', storage, 6_000)?.text, 'B', 'B kept')
})

Deno.test('P1-12 AC4: terminal phases clear; soft-leave phases do not', () => {
  assert(shouldClearClientPhiForPhase('report_ready'), 'report_ready')
  assert(shouldClearClientPhiForPhase('report_gate'), 'report_gate')
  assert(shouldClearClientPhiForPhase('emergency_end'), 'emergency_end')
  assert(shouldClearClientPhiForPhase('clinical_review_needed'), 'clinical_review_needed')
  assert(!shouldClearClientPhiForPhase('intake'), 'intake keeps')
  assert(!shouldClearClientPhiForPhase('demographics_required'), 'demographics keeps')
  assert(!shouldClearClientPhiForPhase('loading'), 'loading keeps')
})

// ---------------------------------------------------------------------------
// AC5 — send → fail offline → reload hydrate simulation
// ---------------------------------------------------------------------------

Deno.test('P1-12 AC5: persist-after-failed-send + reload hydrate preserves message+draft', () => {
  const storage = memoryStorage()
  const consultationId = 'consult-kill'
  const clientMessageId = 'cccccccc-dddd-4eee-8fff-00000000ac55'
  // S2: persist pending at optimistic append
  persistPendingOutbound({
    consultationId,
    message: 'sudden shortness of breath',
    clientMessageId,
  }, storage, 7_000)
  // Mid-wait draft typed while waiting (distinct)
  writeDraft(consultationId, 'also noting dizziness', storage, 7_001)
  writeScroll(consultationId, 200, true, storage, 7_001)

  // Simulated reload
  const pending = reconcilePendingWithServer(consultationId, [], storage, 7_002)
  assert(pending !== null, 'message must not silently vanish')
  assertEquals(pending.message, 'sudden shortness of breath', 'pending text')
  const draft = readDraft(consultationId, storage, 7_002)
  assertEquals(draft?.text, 'also noting dizziness', 'mid-wait draft intact')
  const composer = nextComposerInputAfterPendingHydrate(draft?.text ?? '', pending.message)
  assertEquals(composer, 'also noting dizziness', 'composer keeps distinct draft')
  const merged = mergePendingIntoMessages([], pending)
  assertEquals(merged[0]?.text, 'sudden shortness of breath', 'bubble remounted')
  assertEquals(readScroll(consultationId, storage, 7_002)?.wasNearBottom, true, 'scroll')
})

// ---------------------------------------------------------------------------
// Source contracts — Chat wiring + Q6A select + no clinical writers
// ---------------------------------------------------------------------------

Deno.test('P1-12 source: Chat wires hydrate helpers + shared clear + pending at append', async () => {
  const src = await Deno.readTextFile(CHAT_SOURCE)
  assert(src.includes('libertymd-draft-persistence'), 'imports persistence module')
  assert(src.includes('persistPendingOutbound'), 'S2 persist at append')
  assert(src.includes('reconcilePendingWithServer'), 'reconcile on hydrate')
  assert(src.includes('mergePendingIntoMessages'), 'merge pending')
  assert(src.includes('nextComposerInputAfterPendingHydrate'), 'Q2C composer rule')
  assert(src.includes('clearLibertyMdConsultClientState'), 'shared clear')
  assert(src.includes('shouldClearClientPhiForPhase'), 'Q4A phase clear')
  assert(src.includes('restoreScrollPosition'), 'Q3B scroll restore')
  assert(src.includes('clientPersistHydrated'), 'hydrate-then-flush gate')
  assert(src.includes('writeDraft'), 'draft persist')
  assert(!/\.from\(\s*['"]libertymd_/.test(src), 'no frontend clinical table writes')
})

Deno.test('P1-12 source: getHistory select includes id,client_message_id (Q6A)', async () => {
  const src = await Deno.readTextFile(CONSULTATIONS_SOURCE)
  assert(
    /select\(['"]id,client_message_id,role,content/.test(src)
      || /select\(\s*['"]id,client_message_id/.test(src),
    'getHistory must select id,client_message_id',
  )
})

Deno.test('P1-12 source: ChatScroll exports restoreScrollPosition', async () => {
  const src = await Deno.readTextFile(SCROLL_SOURCE)
  assert(src.includes('restoreScrollPosition'), 'restore API present')
  assert(src.includes('wasNearBottom'), 'Q3B near-bottom branch')
})

Deno.test('P1-12 source: persistence module never logs store contents', async () => {
  const src = await Deno.readTextFile(PERSIST_SOURCE)
  assert(!/console\.(log|info|debug|warn)\([^)]*JSON\.stringify/.test(src), 'no PHI log')
  assert(src.includes('Never log'), 'PHI ban documented')
})

Deno.test('P1-12 R1: Chat keeps nextComposerInputAfterRestore for in-session restore', async () => {
  const src = await Deno.readTextFile(CHAT_SOURCE)
  assert(src.includes('nextComposerInputAfterRestore'), 'P1-07 restore rule')
  assert(src.includes('composerSendLocked'), 'send lock while busy')
})
