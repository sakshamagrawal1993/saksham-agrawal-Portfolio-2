/**
 * P1-18 — Session Replay clinical gate + autocapture input containment.
 *
 * Mocked Analytics doubles — never hit live Mixpanel / dashboard in CI.
 * Run focused: `npm run test:libertymd:session-replay`
 * Wired into `test:libertymd:ci`.
 */
declare const Deno: {
  test(name: string, fn: () => void | Promise<void>): void
  readTextFile(path: string | URL): Promise<string>
}

import {
  __isLibertyMdClinicalReplayActiveForTests,
  __resetLibertyMdSessionReplayStateForTests,
  __setLibertyMdSessionReplayAnalyticsForTests,
  isLibertyMdClinicalPath,
  LIBERTYMD_CLINICAL_AUTOCAPTURE,
  LIBERTYMD_NON_CLINICAL_RECORD_SESSIONS_PERCENT,
  LIBERTYMD_PORTFOLIO_AUTOCAPTURE,
  syncLibertyMdSessionReplayForPath,
  type LibertyMdSessionReplayAnalytics,
} from '../../components/LibertyMD/libertymd-session-replay.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

const REPLAY_SOURCE = new URL(
  '../../components/LibertyMD/libertymd-session-replay.ts',
  import.meta.url,
)
const SERVICES_ANALYTICS = new URL('../../services/analytics.ts', import.meta.url)
const APP_SOURCE = new URL('../../App.tsx', import.meta.url)
const CHAT_SOURCE = new URL('../../components/LibertyMD/LibertyMDChat.tsx', import.meta.url)
const CARE_SOURCE = new URL('../../docs/libertymd/CARE-ARCHITECTURE.md', import.meta.url)
const LEXICON_SOURCE = new URL('../../docs/libertymd/MIXPANEL-LEXICON.md', import.meta.url)

type MockCall = {
  stop: number
  start: number
  configs: Array<Record<string, unknown>>
}

function makeMock(): { analytics: LibertyMdSessionReplayAnalytics; calls: MockCall } {
  const calls: MockCall = { stop: 0, start: 0, configs: [] }
  const analytics: LibertyMdSessionReplayAnalytics = {
    stopSessionRecording: () => {
      calls.stop += 1
    },
    startSessionRecording: () => {
      calls.start += 1
    },
    setConfig: (config) => {
      calls.configs.push(config)
    },
  }
  return { analytics, calls }
}

function lastConfig(calls: MockCall): Record<string, unknown> | undefined {
  return calls.configs[calls.configs.length - 1]
}

Deno.test('P1-18 AC1: isLibertyMdClinicalPath covers /liberty-md prefix', () => {
  assertEquals(isLibertyMdClinicalPath('/liberty-md'), true, 'landing')
  assertEquals(isLibertyMdClinicalPath('/liberty-md/'), true, 'trailing slash')
  assertEquals(isLibertyMdClinicalPath('/liberty-md/chat'), true, 'chat')
  assertEquals(isLibertyMdClinicalPath('/liberty-md/chat?x=1'), true, 'query stripped')
  assertEquals(isLibertyMdClinicalPath('/liberty-md/future-report'), true, 'extensible')
  assertEquals(isLibertyMdClinicalPath('/'), false, 'home')
  assertEquals(isLibertyMdClinicalPath('/health-twin'), false, 'other product')
  assertEquals(isLibertyMdClinicalPath('/liberty-md-extra'), false, 'not a prefix match')
})

Deno.test('P1-18 AC1: clinical enter stops recording and sets sampling 0', () => {
  __resetLibertyMdSessionReplayStateForTests()
  const { analytics, calls } = makeMock()
  __setLibertyMdSessionReplayAnalyticsForTests(analytics)
  try {
    syncLibertyMdSessionReplayForPath('/liberty-md/chat')
    assertEquals(calls.stop, 1, 'stop once')
    assertEquals(calls.start, 0, 'no start while clinical')
    const cfg = lastConfig(calls)
    assert(cfg, 'set_config called')
    assertEquals(cfg.record_sessions_percent, 0, 'sampling 0')
    assertEquals(__isLibertyMdClinicalReplayActiveForTests(), true, 'gate active')
  } finally {
    __setLibertyMdSessionReplayAnalyticsForTests(null)
    __resetLibertyMdSessionReplayStateForTests()
  }
})

Deno.test('P1-18 AC1: clinical sync is idempotent (no restart while on prefix)', () => {
  __resetLibertyMdSessionReplayStateForTests()
  const { analytics, calls } = makeMock()
  __setLibertyMdSessionReplayAnalyticsForTests(analytics)
  try {
    syncLibertyMdSessionReplayForPath('/liberty-md')
    syncLibertyMdSessionReplayForPath('/liberty-md/chat')
    assertEquals(calls.stop >= 2, true, 'stop re-applied')
    assertEquals(calls.start, 0, 'never start on clinical nav')
    assertEquals(__isLibertyMdClinicalReplayActiveForTests(), true, 'still active')
  } finally {
    __setLibertyMdSessionReplayAnalyticsForTests(null)
    __resetLibertyMdSessionReplayStateForTests()
  }
})

Deno.test('P1-18 AC3: clinical autocapture sets input false and preserves other kinds', () => {
  __resetLibertyMdSessionReplayStateForTests()
  const { analytics, calls } = makeMock()
  __setLibertyMdSessionReplayAnalyticsForTests(analytics)
  try {
    syncLibertyMdSessionReplayForPath('/liberty-md')
    const cfg = lastConfig(calls)
    assert(cfg, 'config present')
    const ac = cfg.autocapture as Record<string, unknown>
    assert(ac && typeof ac === 'object', 'autocapture object')
    assertEquals(ac.input, false, 'input off')
    assertEquals(ac.click, true, 'click preserved')
    assertEquals(ac.scroll, true, 'scroll preserved')
    assertEquals(ac.submit, true, 'submit preserved')
    assertEquals(ac.pageview, 'full-url', 'pageview preserved')
    assertEquals(LIBERTYMD_CLINICAL_AUTOCAPTURE.input, false, 'const contract')
    // Must not satisfy AC3 via block_url_regexes alone
    assertEquals('block_url_regexes' in cfg, false, 'no block_url_regexes')
  } finally {
    __setLibertyMdSessionReplayAnalyticsForTests(null)
    __resetLibertyMdSessionReplayStateForTests()
  }
})

Deno.test('P1-18 Q3: leaving prefix restores sampling + autocapture input and restarts recording', () => {
  __resetLibertyMdSessionReplayStateForTests()
  const { analytics, calls } = makeMock()
  __setLibertyMdSessionReplayAnalyticsForTests(analytics)
  try {
    syncLibertyMdSessionReplayForPath('/liberty-md/chat')
    const stopBeforeLeave = calls.stop
    syncLibertyMdSessionReplayForPath('/')
    assertEquals(calls.start, 1, 'restart after leave')
    assertEquals(calls.stop, stopBeforeLeave, 'no extra stop on leave')
    const cfg = lastConfig(calls)
    assert(cfg, 'restore config')
    assertEquals(cfg.record_sessions_percent, LIBERTYMD_NON_CLINICAL_RECORD_SESSIONS_PERCENT, 'restore 100')
    const ac = cfg.autocapture as Record<string, unknown>
    assertEquals(ac.input, true, 'input restored')
    assertEquals(LIBERTYMD_PORTFOLIO_AUTOCAPTURE.input, true, 'portfolio const')
    assertEquals(__isLibertyMdClinicalReplayActiveForTests(), false, 'gate cleared')
  } finally {
    __setLibertyMdSessionReplayAnalyticsForTests(null)
    __resetLibertyMdSessionReplayStateForTests()
  }
})

Deno.test('P1-18 Q3: non-clinical paths without prior clinical do not spuriously start recording', () => {
  __resetLibertyMdSessionReplayStateForTests()
  const { analytics, calls } = makeMock()
  __setLibertyMdSessionReplayAnalyticsForTests(analytics)
  try {
    syncLibertyMdSessionReplayForPath('/')
    syncLibertyMdSessionReplayForPath('/health-twin')
    assertEquals(calls.stop, 0, 'no stop')
    assertEquals(calls.start, 0, 'no spurious start')
    assertEquals(calls.configs.length, 0, 'no config churn')
  } finally {
    __setLibertyMdSessionReplayAnalyticsForTests(null)
    __resetLibertyMdSessionReplayStateForTests()
  }
})

Deno.test('P1-18 AC4: config-in-code — analytics wrappers + mask pin + hooks + docs', async () => {
  const analyticsSrc = await Deno.readTextFile(SERVICES_ANALYTICS)
  const replaySrc = await Deno.readTextFile(REPLAY_SOURCE)
  const appSrc = await Deno.readTextFile(APP_SOURCE)
  const chatSrc = await Deno.readTextFile(CHAT_SOURCE)
  const care = await Deno.readTextFile(CARE_SOURCE)
  const lexicon = await Deno.readTextFile(LEXICON_SOURCE)

  assert(analyticsSrc.includes('stopSessionRecording'), 'wrapper stop')
  assert(analyticsSrc.includes('startSessionRecording'), 'wrapper start')
  assert(analyticsSrc.includes('setConfig'), 'wrapper setConfig')
  assert(analyticsSrc.includes("record_mask_text_selector: '*'"), 'Q8 mask pin')
  assert(analyticsSrc.includes('stop_session_recording'), 'SDK stop call')
  assert(analyticsSrc.includes('start_session_recording'), 'SDK start call')

  assert(replaySrc.includes('record_sessions_percent: 0'), 'sampling guard')
  assert(replaySrc.includes('input: false'), 'input false in helper')
  // Comment may mention the rejected control; must not appear as an applied config key.
  assert(
    !/block_url_regexes\s*:/.test(replaySrc),
    'no block_url_regexes config assignment',
  )

  assert(appSrc.includes('syncLibertyMdSessionReplayForPath'), 'App SoT hook')
  assert(chatSrc.includes('syncLibertyMdSessionReplayForPath'), 'Chat idempotent hook')

  assert(care.includes('Session Replay'), 'CARE Replay section')
  assert(care.includes('record_sessions_percent'), 'CARE sampling')
  assert(care.includes('DoD+ AC2') || care.includes('AC2 inspection'), 'CARE AC2 checklist')
  assert(lexicon.includes('Session Replay is **disabled in code**') || lexicon.includes('disabled in code'), 'Lexicon privacy')
})
