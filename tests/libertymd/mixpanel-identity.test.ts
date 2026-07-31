/**
 * P1-17 — Mixpanel client identity stitch + wrapper / PHI contracts.
 *
 * Mocked identify doubles — never hit live Mixpanel in CI.
 * Run focused: `deno test --no-config --allow-read --sloppy-imports tests/libertymd/mixpanel-identity.test.ts`
 * Wired into `test:libertymd:ci` via `test:libertymd:mixpanel-identity`.
 */
declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

import {
  __setLibertyMdTrackForTests,
  emitIdentityLinked,
  emitTurnCompletedTtft,
  emitTurnFailed,
  libertyMdEventName,
  LIBERTYMD_CLIENT_PHI_FORBIDDEN_KEYS,
  LIBERTYMD_EVENT_PREFIX,
  trackLibertyMd,
} from '../../components/LibertyMD/libertymd-analytics.ts'
import {
  __setLibertyMdDeviceIdReaderForTests,
  __setLibertyMdIdentifyForTests,
  identifyLibertyMdUser,
  isForbiddenLibertyMdIdentifyTarget,
} from '../../components/LibertyMD/libertymd-mixpanel-identity.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

const ANALYTICS_SOURCE = new URL(
  '../../components/LibertyMD/libertymd-analytics.ts',
  import.meta.url,
)
const IDENTITY_SOURCE = new URL(
  '../../components/LibertyMD/libertymd-mixpanel-identity.ts',
  import.meta.url,
)
const SERVICES_ANALYTICS = new URL('../../services/analytics.ts', import.meta.url)
const CHAT_SOURCE = new URL('../../components/LibertyMD/LibertyMDChat.tsx', import.meta.url)
const APP_SOURCE = new URL('../../components/LibertyMD/LibertyMDApp.tsx', import.meta.url)
const LEXICON_SOURCE = new URL('../../docs/libertymd/MIXPANEL-LEXICON.md', import.meta.url)
const CARE_SOURCE = new URL('../../docs/libertymd/CARE-ARCHITECTURE.md', import.meta.url)

Deno.test('P1-17 AC5: libertyMdEventName always applies LibertyMd prefix', () => {
  assertEquals(libertyMdEventName('identity_linked'), `${LIBERTYMD_EVENT_PREFIX}identity_linked`, 'suffix')
  assertEquals(
    libertyMdEventName(`${LIBERTYMD_EVENT_PREFIX}identity_linked`),
    `${LIBERTYMD_EVENT_PREFIX}identity_linked`,
    'idempotent',
  )
  assertEquals(libertyMdEventName(''), '', 'empty')
})

Deno.test('P1-17 AC5: trackLibertyMd routes through wrapper (mocked)', () => {
  const calls: Array<{ name: string; props: Record<string, unknown> }> = []
  __setLibertyMdTrackForTests((name, props) => {
    calls.push({ name, props })
  })
  try {
    trackLibertyMd('identity_linked', { was_merge: false, emit_origin: 'client' })
    assertEquals(calls.length, 1, 'one track')
    assertEquals(calls[0].name, 'LibertyMd identity_linked', 'prefixed')
    assertEquals(calls[0].props.emit_origin, 'client', 'origin')
  } finally {
    __setLibertyMdTrackForTests(null)
  }
})

Deno.test('P1-17 AC3: emitIdentityLinked closed success schema + emit_origin client', () => {
  const calls: Array<{ name: string; props: Record<string, unknown> }> = []
  __setLibertyMdTrackForTests((name, props) => {
    calls.push({ name, props })
  })
  try {
    emitIdentityLinked({
      was_merge: true,
      merge_outcome: 'success',
      method: 'account_merge',
    })
    emitIdentityLinked({
      was_merge: false,
      merge_outcome: 'success',
      method: 'google_link',
    })
    assertEquals(calls.length, 2, 'two emits')
    assertEquals(calls[0].name, 'LibertyMd identity_linked', 'name')
    assertEquals(calls[0].props.was_merge, true, 'merge true')
    assertEquals(calls[0].props.merge_outcome, 'success', 'outcome')
    assertEquals(calls[0].props.method, 'account_merge', 'method merge')
    assertEquals(calls[0].props.emit_origin, 'client', 'origin')
    assertEquals(calls[1].props.was_merge, false, 'merge false')
    assertEquals(calls[1].props.method, 'google_link', 'method link')
    assertEquals(calls[1].props.emit_origin, 'client', 'origin link')
  } finally {
    __setLibertyMdTrackForTests(null)
  }
})

Deno.test('P1-17 Q9: turn_failed / turn_completed carry emit_origin client', () => {
  const calls: Array<{ name: string; props: Record<string, unknown> }> = []
  __setLibertyMdTrackForTests((name, props) => {
    calls.push({ name, props })
  })
  try {
    emitTurnFailed({ retry_count: 1, resolved_silently: true })
    emitTurnCompletedTtft({ latency_bucket: '1-2s' })
    assertEquals(calls[0].props.emit_origin, 'client', 'turn_failed origin')
    assertEquals(calls[0].props.retry_count, 1, 'retry preserved')
    assertEquals(calls[1].props.emit_origin, 'client', 'turn_completed origin')
    assertEquals(calls[1].props.latency_bucket_source, 'client_ttft', 'ttft discriminator')
  } finally {
    __setLibertyMdTrackForTests(null)
  }
})

Deno.test('P1-17 AC7: identity_linked / turn helpers have no PHI keys', () => {
  const calls: Array<Record<string, unknown>> = []
  __setLibertyMdTrackForTests((_name, props) => {
    calls.push(props)
  })
  try {
    emitIdentityLinked({
      was_merge: false,
      merge_outcome: 'success',
      method: 'google_link',
    })
    emitTurnFailed({ retry_count: 2, resolved_silently: false })
    emitTurnCompletedTtft({ latency_bucket: '2-5s' })
    for (const props of calls) {
      for (const key of LIBERTYMD_CLIENT_PHI_FORBIDDEN_KEYS) {
        assert(!(key in props), `forbidden PHI key present: ${key}`)
      }
    }
  } finally {
    __setLibertyMdTrackForTests(null)
  }
})

Deno.test('P1-17 AC1/AC2: identify stitch is id-only; device id readable via double', () => {
  const identified: string[] = []
  __setLibertyMdIdentifyForTests((id) => {
    identified.push(id)
  })
  __setLibertyMdDeviceIdReaderForTests(() => 'device-abc')
  try {
    const anonId = '11111111-1111-1111-1111-111111111111'
    const linkedId = anonId // same-id Google link
    identifyLibertyMdUser(anonId)
    identifyLibertyMdUser(linkedId)
    assertEquals(identified.length, 2, 'two identifies')
    assertEquals(identified[0], anonId, 'anon')
    assertEquals(identified[1], linkedId, 'linked same id')
  } finally {
    __setLibertyMdIdentifyForTests(null)
    __setLibertyMdDeviceIdReaderForTests(null)
  }
})

Deno.test('P1-17 AC4: three profiles → one distinct_id (no identify profile_id)', () => {
  const identified: string[] = []
  __setLibertyMdIdentifyForTests((id) => {
    identified.push(id)
  })
  try {
    const accountId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const profileIds = [
      'profile:p1',
      'profile:p2',
      'profile:p3',
      'patient:x',
    ]
    identifyLibertyMdUser(accountId)
    for (const pid of profileIds) {
      assert(isForbiddenLibertyMdIdentifyTarget(pid), `must forbid ${pid}`)
      identifyLibertyMdUser(pid) // no-op
    }
    assertEquals(identified.length, 1, 'exactly one identify')
    assertEquals(identified[0], accountId, 'account id only')
  } finally {
    __setLibertyMdIdentifyForTests(null)
  }
})

Deno.test('P1-17 AC8: Chat/App wire identify + identity_linked on success paths only', async () => {
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  const app = await Deno.readTextFile(APP_SOURCE)
  for (const [label, source] of [['Chat', chat], ['App', app]] as const) {
    assert(source.includes('identifyLibertyMdUser'), `${label} must call identifyLibertyMdUser`)
    assert(source.includes('emitIdentityLinked'), `${label} must emit identity_linked`)
    assert(source.includes("method: 'google_link'"), `${label} google_link schema`)
  }
  assert(chat.includes("method: 'account_merge'"), 'Chat must emit account_merge on complete_account_merge')
  assert(chat.includes('complete_account_merge'), 'Chat merge path present')
  assert(!chat.includes("identifyLibertyMdUser(profile"), 'Chat must not identify profile')
  assert(!app.includes("identifyLibertyMdUser(profile"), 'App must not identify profile')
  // No clinical lifecycle client emits
  assert(!chat.includes("trackLibertyMd('consult_started'"), 'no client consult_started')
  assert(!chat.includes("trackLibertyMd('profile_selected'"), 'no client profile_selected lifecycle')
})

Deno.test('P1-17 AC5: no hand-typed LibertyMd prefix outside wrapper module', async () => {
  const chat = await Deno.readTextFile(CHAT_SOURCE)
  const app = await Deno.readTextFile(APP_SOURCE)
  const identity = await Deno.readTextFile(IDENTITY_SOURCE)
  for (const [label, source] of [
    ['Chat', chat],
    ['App', app],
    ['identity', identity],
  ] as const) {
    // Allow comments mentioning the prefix; forbid string literals used as event names.
    const handTyped = source.match(/['"]LibertyMd /g)
    assert(!handTyped, `${label} must not hand-type 'LibertyMd ' event names`)
  }
  const analytics = await Deno.readTextFile(ANALYTICS_SOURCE)
  assert(analytics.includes("LIBERTYMD_EVENT_PREFIX = 'LibertyMd '"), 'wrapper owns prefix constant')
})

Deno.test('P1-17: services/analytics exposes device-id helpers; identify email optional', async () => {
  const source = await Deno.readTextFile(SERVICES_ANALYTICS)
  assert(source.includes('getDeviceId'), 'getDeviceId')
  assert(source.includes('ensureDeviceId'), 'ensureDeviceId')
  assert(source.includes("get_property?.('$device_id')") || source.includes("get_property('$device_id')"), 'reads $device_id')
  assert(source.includes('identify: (id: string, email?: string)'), 'email optional')
  assert(source.includes('if (email)'), 'People set only when email provided')
})

Deno.test('P1-17 Q10: Lexicon Client section + profile_selected live-server; CARE residual note', async () => {
  const lexicon = await Deno.readTextFile(LEXICON_SOURCE)
  const care = await Deno.readTextFile(CARE_SOURCE)
  assert(lexicon.includes('# Client section'), 'Client section present')
  assert(lexicon.includes('identity_linked'), 'identity_linked documented')
  assert(lexicon.includes('Live-server') || lexicon.includes('live-server') || lexicon.includes('**Live-server**'), 'profile_selected live')
  assert(!lexicon.match(/profile_selected.*emit deferred/i), 'stale deferred profile_selected removed')
  assert(care.includes('Client identity stitch') || care.includes('identity stitch'), 'CARE identity stitch')
  assert(
    care.includes('P1-15 residual') || care.includes('Postgres product-event emit still deferred'),
    'CARE notes Postgres identity_linked residual open',
  )
})
