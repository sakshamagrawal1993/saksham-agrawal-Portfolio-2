/**
 * P0-12 — failure taxonomy: eight classes + fallback, copy hygiene, offline queue.
 *
 * Registered as `npm run test:libertymd:failure-taxonomy` and included in `:ci`.
 *
 * Declares Deno locally (same pattern as severity-mapping.test.ts) so the repo
 * `tsc` ratchet stays flat.
 */
declare const Deno: { test(name: string, fn: () => void | Promise<void>): void }

import {
  CLAIM_REJECTION_SAFE_ERROR,
  classifySendFailure,
  clearOfflineQueue,
  copyForErrorClass,
  detectSessionExpiredSignal,
  EIGHT_USER_VISIBLE_CLASSES,
  enqueueOfflineMessage,
  FORBIDDEN_USER_COPY_TOKENS,
  formatRateLimitCopy,
  LIBERTYMD_ERROR_CLASSES,
  OFFLINE_QUEUE_TTL_MS,
  readOfflineQueue,
  resolveChatSendFailureAction,
  resolveProfileCapabilityOffer,
  userCopyContainsForbiddenToken,
  type LibertyMDErrorClass,
  type OfflineStorage,
} from '../../components/LibertyMD/libertymd-failure-taxonomy.ts'
import {
  normalizeRetryAfterMs,
  RETRY_AFTER_MS_DEFAULT,
} from '../../components/LibertyMD/libertymd-care-proxy-client.ts'
import { errorResponse } from '../../supabase/functions/libertymd-care-proxy/lib/errors.ts'
import {
  __setLibertyMdTrackForTests,
  emitAppErrorShown,
  emitTurnFailed,
  libertyMdEventName,
  LIBERTYMD_EVENT_PREFIX,
} from '../../components/LibertyMD/libertymd-analytics.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

function memoryStorage(): OfflineStorage & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    setItem: (key, value) => { store.set(key, value) },
    removeItem: (key) => { store.delete(key) },
  }
}

// ---------------------------------------------------------------------------
// AC1 — exhaustive classifier
// ---------------------------------------------------------------------------

Deno.test('P0-12 AC1: eight classes plus upstream_unknown are documented', () => {
  assertEquals(EIGHT_USER_VISIBLE_CLASSES.length, 8, 'exactly eight user-visible classes')
  assert(LIBERTYMD_ERROR_CLASSES.includes('upstream_unknown'), 'fallback present')
})

const CLASSIFIER_CASES: Array<{
  name: string
  input: Parameters<typeof classifySendFailure>[0]
  errorClass: LibertyMDErrorClass | null
  userVisible?: boolean
  showRetry?: boolean
}> = [
  {
    name: 'holding short-circuits',
    input: { holding: true, status: 503 },
    errorClass: null,
  },
  {
    name: 'offline',
    input: { online: false },
    errorClass: 'offline',
    userVisible: true,
    showRetry: false,
  },
  {
    name: 'lease_conflict',
    input: { status: 409, body: { claim_rejection: 'lease_conflict' } },
    errorClass: 'lease_conflict',
    userVisible: false,
  },
  {
    name: 'version_mismatch',
    input: { status: 409, body: { claim_rejection: 'version_mismatch' } },
    errorClass: 'version_mismatch',
    userVisible: false,
  },
  {
    name: 'n8n_timeout via failure tag',
    input: { failure: 'timeout', status: 504 },
    errorClass: 'n8n_timeout',
    showRetry: true,
  },
  {
    name: 'n8n_timeout via AbortError',
    input: { errorName: 'AbortError' },
    errorClass: 'n8n_timeout',
    showRetry: true,
  },
  {
    name: 'n8n_upstream 5xx',
    input: { status: 502 },
    errorClass: 'n8n_upstream',
    showRetry: true,
  },
  {
    name: 'n8n_upstream 408',
    input: { status: 408 },
    errorClass: 'n8n_upstream',
    showRetry: true,
  },
  {
    name: 'n8n_upstream unknown network',
    input: { online: true, status: undefined },
    errorClass: 'n8n_upstream',
    showRetry: true,
  },
  {
    name: 'guardrail_failure',
    input: { failure: 'guardrail', body: { source: 'error_fail_cautious' } },
    errorClass: 'guardrail_failure',
    userVisible: true,
    showRetry: false,
  },
  {
    name: 'session_expired 401',
    input: { status: 401 },
    errorClass: 'session_expired',
  },
  {
    name: 'rate_limited 429',
    input: { status: 429, body: { retry_after_ms: 90_000 } },
    errorClass: 'rate_limited',
    showRetry: false,
  },
  {
    name: 'upstream_unknown 404',
    input: { status: 404 },
    errorClass: 'upstream_unknown',
    showRetry: false,
  },
]

for (const testCase of CLASSIFIER_CASES) {
  Deno.test(`P0-12 AC1 classify: ${testCase.name}`, () => {
    const result = classifySendFailure(testCase.input)
    if (testCase.errorClass === null) {
      assertEquals(result, null, 'holding must not reclassify')
      return
    }
    assert(result, 'expected classification')
    assertEquals(result.errorClass, testCase.errorClass, 'error_class')
    assertEquals(result.severity, 'technical', 'always technical')
    if (testCase.userVisible !== undefined) {
      assertEquals(result.userVisible, testCase.userVisible, 'userVisible')
    }
    if (testCase.showRetry !== undefined) {
      assertEquals(result.showRetry, testCase.showRetry, 'showRetry')
    }
  })
}

Deno.test('P0-12 AC1: every eight class has ≥1 classifier case', () => {
  const covered = new Set(
    CLASSIFIER_CASES
      .map((c) => c.errorClass)
      .filter((c): c is LibertyMDErrorClass => c !== null && c !== 'upstream_unknown'),
  )
  for (const cls of EIGHT_USER_VISIBLE_CLASSES) {
    assert(covered.has(cls), `missing case for ${cls}`)
  }
})

// ---------------------------------------------------------------------------
// AC4 / AC10 — guardrail technical + forbidden tokens
// ---------------------------------------------------------------------------

Deno.test('P0-12 AC4: guardrail_failure severity is technical', () => {
  const result = classifySendFailure({
    body: { source: 'error_fail_cautious' },
    failure: 'guardrail',
  })
  assert(result, 'expected result')
  assertEquals(result.errorClass, 'guardrail_failure', 'class')
  assertEquals(result.severity, 'technical', 'severity')
})

Deno.test('P2-13 AC2 · n8n_timeout / upstream remain technical with retry (generation-failed path)', () => {
  const timeout = classifySendFailure({ failure: 'timeout', errorName: 'AbortError' })
  assert(timeout, 'timeout classified')
  assertEquals(timeout.severity, 'technical')
  assertEquals(timeout.showRetry, true)
  assertEquals(timeout.message.toLowerCase().includes('answers'), false, 'no user-blame')
  const upstream = classifySendFailure({ status: 502 })
  assert(upstream, 'upstream classified')
  assertEquals(upstream.severity, 'technical')
  assertEquals(upstream.showRetry, true)
})

Deno.test('P0-12 AC10: user copy table has no forbidden tokens', () => {
  for (const errorClass of LIBERTYMD_ERROR_CLASSES) {
    const copy = copyForErrorClass(errorClass, { retryAfterMs: RETRY_AFTER_MS_DEFAULT, offlinePersisted: true })
    const hit = userCopyContainsForbiddenToken(copy)
    assertEquals(hit, null, `${errorClass} copy must not contain ${hit}`)
  }
  for (const token of FORBIDDEN_USER_COPY_TOKENS) {
    assert(typeof token === 'string' && token.length > 0, 'token list non-empty')
  }
  assertEquals(
    userCopyContainsForbiddenToken(CLAIM_REJECTION_SAFE_ERROR),
    null,
    '409 constant is clean',
  )
  assert(
    !CLAIM_REJECTION_SAFE_ERROR.toLowerCase().includes('already being processed'),
    '409 must not use old lease copy',
  )
  assert(
    !CLAIM_REJECTION_SAFE_ERROR.toLowerCase().includes('refresh'),
    '409 must not instruct refresh',
  )
})

Deno.test('P0-12 AC10: errorResponse no longer echoes raw messages', async () => {
  const response = errorResponse(new Error('Workflow HTTP 502 at https://n8n.example/webhook'))
  assertEquals(response.status, 500, 'status')
  const body = await response.json() as { error: string; severity: string }
  assertEquals(body.severity, 'technical', 'severity')
  assertEquals(body.error, 'Something went wrong on our side. Please try again.', 'sanitized')
  assertEquals(userCopyContainsForbiddenToken(body.error), null, 'no forbidden tokens')
  assert(!body.error.includes('Workflow'), 'must not echo raw')
})

Deno.test('P0-12 AC10: errorResponse keeps 404 for Consultation not found without echoing stacks', async () => {
  const response = errorResponse(new Error('Consultation not found'))
  assertEquals(response.status, 404, 'status')
  const body = await response.json() as { error: string }
  assert(!body.error.includes('stack'), 'no stack')
  assertEquals(userCopyContainsForbiddenToken(body.error), null, 'clean')
})

// ---------------------------------------------------------------------------
// AC5 / AC8 — Chat-branch decisions (pure; mirrors LibertyMDChat send path)
// ---------------------------------------------------------------------------

Deno.test('P0-12 AC5: lease_conflict Chat branch is silent — no emit / no error UI', () => {
  const classified = classifySendFailure({
    status: 409,
    body: { claim_rejection: 'lease_conflict' },
  })
  assert(classified, 'lease classification')
  const branch = resolveChatSendFailureAction(classified)
  assertEquals(branch.type, 'silent_ignore', 'ignore')
  assertEquals(branch.emit, false, 'no app_error_shown')
  assertEquals(classified.userVisible, false, 'classifier invisible')
})

Deno.test('P0-12 AC5: version_mismatch Chat branch silent rehydrate — no emit', () => {
  const classified = classifySendFailure({
    status: 409,
    body: { claim_rejection: 'version_mismatch' },
  })
  assert(classified, 'version classification')
  const branch = resolveChatSendFailureAction(classified)
  assertEquals(branch.type, 'silent_rehydrate', 'rehydrate')
  assertEquals(branch.emit, false, 'no app_error_shown')
})

// ---------------------------------------------------------------------------
// AC8 — session detection fail-closed + mocked refresh success/fail branches
// ---------------------------------------------------------------------------

Deno.test('P0-12 AC8: session_expired on 401 and unambiguous JWT signals only', () => {
  assertEquals(detectSessionExpiredSignal({}, 401), 'session_expired', '401')
  assertEquals(
    detectSessionExpiredSignal({ name: 'AuthSessionMissingError', message: 'Auth session missing' }, 400),
    'session_expired',
    'AuthSessionMissingError',
  )
  assertEquals(
    detectSessionExpiredSignal({ message: 'jwt expired' }, 400),
    'session_expired',
    'jwt expired',
  )
  assertEquals(
    detectSessionExpiredSignal({ message: 'Something went wrong' }, 500),
    null,
    'ambiguous must fail closed',
  )
})

Deno.test('P0-12 AC8: mocked refreshSession success path is silent; failure shows technical', () => {
  const expired = classifySendFailure({ status: 401 })
  assert(expired, 'session_expired class')
  assertEquals(expired.errorClass, 'session_expired', 'class')

  const first = resolveChatSendFailureAction(expired, { sessionRefreshAttempted: false })
  assertEquals(first.type, 'attempt_session_refresh', 'silent refresh once')
  assertEquals(first.emit, false, 'no emit on successful-refresh attempt')

  // Simulated refresh failure → Chat shows technical + emit (same client_message_id held).
  const afterFail = resolveChatSendFailureAction(expired, { sessionRefreshAttempted: true })
  assertEquals(afterFail.type, 'show_technical', 'surface re-auth path')
  assertEquals(afterFail.emit, true, 'emit only when shown')
  if (afterFail.type === 'show_technical') {
    assertEquals(afterFail.showRetry, expired.showRetry, 'retry flag preserved')
  }
})

// ---------------------------------------------------------------------------
// AC9 — rate limit wait + default
// ---------------------------------------------------------------------------

Deno.test('P0-12 AC9: rate_limited uses retry_after_ms and default 60s', () => {
  const withWait = classifySendFailure({ status: 429, body: { retry_after_ms: 120_000 } })
  assert(withWait, 'expected rate limit classification')
  assertEquals(withWait.errorClass, 'rate_limited', 'class')
  assertEquals(withWait.retryAfterMs, 120_000, 'wait')
  assert(withWait.message.includes('minute') || withWait.message.includes('2'), 'copy mentions wait')

  const missing = classifySendFailure({ status: 429, body: {} })
  assert(missing, 'expected default rate limit classification')
  assertEquals(missing.retryAfterMs, RETRY_AFTER_MS_DEFAULT, 'default 60s')
  assertEquals(normalizeRetryAfterMs(undefined), RETRY_AFTER_MS_DEFAULT, 'normalize default')
  assert(formatRateLimitCopy(RETRY_AFTER_MS_DEFAULT).length > 0, 'default copy')
  assertEquals(userCopyContainsForbiddenToken(formatRateLimitCopy(45_000)), null, 'clean rate copy')
})

// ---------------------------------------------------------------------------
// AC7 — offline queue persist / TTL / isolation
// ---------------------------------------------------------------------------

Deno.test('P0-12 AC7: offline queue enqueue / read / clear / TTL / consult isolation', () => {
  const storage = memoryStorage()
  const now = 1_000_000
  const entry = enqueueOfflineMessage(
    {
      consultationId: 'consult-a',
      message: 'synthetic symptom text',
      clientMessageId: '11111111-1111-4111-8111-111111111111',
      enqueuedAt: now,
    },
    storage,
    now,
  )
  assertEquals(entry.v, 1, 'schema v')
  const read = readOfflineQueue('consult-a', storage, now + 1000)
  assert(read, 'readable')
  assertEquals(read.consultationId, 'consult-a', 'same consult')
  assertEquals(read.message, 'synthetic symptom text', 'message')

  assertEquals(readOfflineQueue('consult-b', storage, now), null, 'no cross-consult steal')

  const expired = readOfflineQueue('consult-a', storage, now + OFFLINE_QUEUE_TTL_MS + 1)
  assertEquals(expired, null, '24h TTL clears')

  enqueueOfflineMessage(
    {
      consultationId: 'consult-a',
      message: 'newer',
      clientMessageId: '22222222-2222-4222-8222-222222222222',
    },
    storage,
    now,
  )
  clearOfflineQueue('consult-a', storage)
  assertEquals(readOfflineQueue('consult-a', storage, now), null, 'clear on success/abandon')
})

Deno.test('P0-12 AC7: offline banner copy does not claim saved until persisted flag', () => {
  const before = copyForErrorClass('offline')
  const after = copyForErrorClass('offline', { offlinePersisted: true })
  assert(!before.toLowerCase().includes('saved'), 'pre-persist must not say saved')
  assert(!after.toLowerCase().includes('saved'), 'queued copy uses queued not saved')
  assert(after.toLowerCase().includes('queued') || after.toLowerCase().includes('reconnect'), 'post-persist honest')
})

// ---------------------------------------------------------------------------
// AC2 / AC3 — Try again flags on exhausted upstream classes
// ---------------------------------------------------------------------------

Deno.test('P0-12 AC2/AC3: n8n_timeout and n8n_upstream both offer Try again', () => {
  const timeout = classifySendFailure({ failure: 'timeout' })
  const upstream = classifySendFailure({ status: 503 })
  assert(timeout && upstream, 'both classifications required')
  assertEquals(timeout.showRetry, true, 'timeout retry')
  assertEquals(upstream.showRetry, true, 'upstream retry')
  assertEquals(timeout.severity, 'technical', 'timeout technical')
  assertEquals(upstream.severity, 'technical', 'upstream technical')
})

// ---------------------------------------------------------------------------
// AC11 — emit helper contract (spy real libertymd-analytics.ts)
// ---------------------------------------------------------------------------

Deno.test('P0-12 AC11: emitAppErrorShown spies real wrapper — LibertyMd prefix, stage, no PHI', () => {
  const calls: Array<{ name: string; props: Record<string, unknown> }> = []
  __setLibertyMdTrackForTests((name, props) => {
    calls.push({ name, props })
  })
  try {
    assertEquals(libertyMdEventName('app_error_shown'), `${LIBERTYMD_EVENT_PREFIX}app_error_shown`, 'name helper')
    emitAppErrorShown('n8n_upstream')
    emitAppErrorShown('offline')
    assertEquals(calls.length, 2, 'two emits')
    assertEquals(calls[0].name, 'LibertyMd app_error_shown', 'prefixed')
    assertEquals(calls[0].props.stage, 'send_message', 'stage')
    assertEquals(calls[0].props.error_class, 'n8n_upstream', 'class')
    assert(!('message' in calls[0].props), 'no PHI message field')
    assertEquals(calls[1].props.error_class, 'offline', 'offline class')
  } finally {
    __setLibertyMdTrackForTests(null)
  }
})

// ---------------------------------------------------------------------------
// P0-10 AC6 — turn_failed helper (thin Mixpanel props; no PHI)
// ---------------------------------------------------------------------------

Deno.test('P0-10 AC6: emitTurnFailed — LibertyMd prefix, retry_count + resolved_silently, emit_origin client, no PHI', () => {
  const calls: Array<{ name: string; props: Record<string, unknown> }> = []
  __setLibertyMdTrackForTests((name, props) => {
    calls.push({ name, props })
  })
  try {
    assertEquals(libertyMdEventName('turn_failed'), `${LIBERTYMD_EVENT_PREFIX}turn_failed`, 'name helper')
    emitTurnFailed({ retry_count: 1, resolved_silently: true })
    emitTurnFailed({ retry_count: 2, resolved_silently: false })
    assertEquals(calls.length, 2, 'two emits')
    assertEquals(calls[0].name, 'LibertyMd turn_failed', 'prefixed')
    assertEquals(calls[0].props.retry_count, 1, 'silent success retry_count')
    assertEquals(calls[0].props.resolved_silently, true, 'silent success flag')
    assertEquals(calls[0].props.emit_origin, 'client', 'P1-17 emit_origin')
    assertEquals(Object.keys(calls[0].props).sort().join(','), 'emit_origin,locale,resolved_silently,retry_count', 'props only (+ clinical locale super)')
    assertEquals(calls[0].props.locale, 'en', 'P3-07 clinical locale default')
    assert(!('message' in calls[0].props), 'no PHI message field')
    assert(!('error_class' in calls[0].props), 'no error_class on turn_failed')
    assert(!('stage' in calls[0].props), 'no stage on turn_failed')
    assert(!('consultation_id' in calls[0].props), 'no consultation id')
    assertEquals(calls[1].props.retry_count, 2, 'exhaustion retry_count')
    assertEquals(calls[1].props.resolved_silently, false, 'exhaustion flag')
  } finally {
    __setLibertyMdTrackForTests(null)
  }
})

Deno.test('P1-04: resolveProfileCapabilityOffer keys on 403 + sign_in_required', () => {
  assertEquals(
    resolveProfileCapabilityOffer(403, { code: 'sign_in_required', severity: 'technical' }),
    'sign_in_required',
    'stable create reject',
  )
  assertEquals(
    resolveProfileCapabilityOffer(undefined, null),
    'unreachable',
    'network → offer',
  )
  assertEquals(
    resolveProfileCapabilityOffer(400, { error: 'Enter an age from 18 to 120' }),
    null,
    'linked validation is not offer path',
  )
  assertEquals(
    resolveProfileCapabilityOffer(403, { code: 'account_required' }),
    'unreachable',
    'must not overload history boolean name as create code',
  )
})
