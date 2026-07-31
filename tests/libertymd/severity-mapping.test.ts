/**
 * P0-16 / P0-14f — the severity boundary.
 *
 * These tests exist because the boundary has two sides in two runtimes, and a
 * boundary that is only documented drifts. They assert three things:
 *
 *   1. The proxy mapping and the client mirror agree on every `status` × `source`
 *      combination either could ever see.
 *   2. Emergency chrome is **unreachable** for anything that is not a
 *      `force_end` — proved over the whole matrix, not by spot check (AC4).
 *   3. A guardrail that fails at the transport level renders **technical** while
 *      the persisted posture stays cautious (P0-14f AC3/AC4).
 *
 * ## How this file runs
 *
 * It is registered by an `import` at the top of `clinical-policy.test.ts`, which
 * is what `npm run test:libertymd:policy` executes. `deno test` registers every
 * `Deno.test` reached through the module graph, so these run inside the existing
 * gate with no change to `package.json` (out of this ticket's file manifest).
 * If whoever owns `package.json` would rather have a named gate, the clean
 * follow-up is:
 *
 *     "test:libertymd:severity": "deno test --no-config tests/libertymd/severity-mapping.test.ts"
 *
 * added to `test:libertymd:ci`, and the import line removed.
 *
 * ## Why `Deno` is declared locally
 *
 * The repo `tsc` run has no Deno lib, so `/// <reference lib="deno.ns" />` and
 * bare `Deno.test` cost one TypeScript error per line — the two existing Deno
 * test files carry 22 between them. Declaring the one API used here keeps the
 * repo error count flat (BASELINE.md: no new errors) while Deno still supplies
 * the real global at runtime.
 */
declare const Deno: { test(name: string, fn: () => void | Promise<void>): void }

import {
  guardrailTransportFailureResult,
  type GuardrailFailureKind,
} from '../../supabase/functions/libertymd-care-proxy/lib/errors.ts'
import {
  isTechnicalSafetySource,
  severityForSafetySignal,
  TECHNICAL_SAFETY_SOURCES,
  type CareSeverity,
} from '../../supabase/functions/libertymd-care-proxy/lib/types.ts'
import {
  isLibertyMDTechnicalSafetySource,
  LIBERTYMD_SEVERITY_PRESENTATION,
  LIBERTYMD_TECHNICAL_SAFETY_SOURCES,
  libertyMDSafetyNoticeFromResponse,
  libertyMDSeverityForRequestFailure,
  libertyMDSeverityForSignal,
} from '../../components/LibertyMD/libertymd-severity.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

/**
 * Every `status` the table's CHECK constraint permits, plus the shapes a signal
 * can arrive in when it has been round-tripped through JSON or a stale row.
 */
const STATUSES: (string | null | undefined)[] = [
  'pass',
  'high_risk_continue',
  'force_end',
  'not_screened',
  '',
  'FORCE_END',
  'high_risk',
  null,
  undefined,
]

/**
 * Every `source` seen in the live data or written by the code, plus the
 * technical set, plus values nobody writes today. The junk values matter: the
 * mapping's default must be `info`, never `caution`, and never `emergency`.
 */
const SOURCES: (string | null | undefined)[] = [
  'n8n',
  'edge_deterministic',
  'error_fail_cautious',
  'guardrail_unavailable',
  'guardrail_timeout',
  'transport_error',
  'timeout',
  'error',
  'no_free_text_to_screen',
  'fallback',
  'unknown_future_source',
  '',
  null,
  undefined,
]

// ---------------------------------------------------------------------------
// 1 · the two mappings cannot drift
// ---------------------------------------------------------------------------

Deno.test('P0-16 · proxy and client severity mappings agree on the whole status x source matrix', () => {
  let combinations = 0
  for (const status of STATUSES) {
    for (const source of SOURCES) {
      const server = severityForSafetySignal({ status, source })
      const client = libertyMDSeverityForSignal({ status, source })
      assertEquals(
        client,
        server,
        `mirror drift for status=${String(status)} source=${String(source)}`,
      )
      combinations += 1
    }
  }
  assertEquals(combinations, STATUSES.length * SOURCES.length, 'matrix size')
  assert(combinations >= 100, 'matrix should be broad enough to be evidence, not decoration')
})

Deno.test('P0-16 · the technical source lists are identical in both runtimes', () => {
  assertEquals(
    LIBERTYMD_TECHNICAL_SAFETY_SOURCES.join('|'),
    TECHNICAL_SAFETY_SOURCES.join('|'),
    'technical source lists differ',
  )
  for (const source of SOURCES) {
    assertEquals(
      isLibertyMDTechnicalSafetySource(source),
      isTechnicalSafetySource(source),
      `technical-source predicates disagree for ${String(source)}`,
    )
  }
})

Deno.test('P0-16 · a null or absent signal is info, never a notice', () => {
  assertEquals(severityForSafetySignal(null), 'info', 'proxy null signal')
  assertEquals(severityForSafetySignal(undefined), 'info', 'proxy undefined signal')
  assertEquals(libertyMDSeverityForSignal(null), 'info', 'client null signal')
  assertEquals(libertyMDSeverityForSignal({}), 'info', 'client empty signal')
})

// ---------------------------------------------------------------------------
// 2 · emergency is unreachable for anything that is not force_end (AC4)
// ---------------------------------------------------------------------------

Deno.test('P0-16 AC4 · emergency severity is unreachable for any non-force_end signal', () => {
  let emergencies = 0
  for (const status of STATUSES) {
    for (const source of SOURCES) {
      for (const severity of [
        severityForSafetySignal({ status, source }),
        libertyMDSeverityForSignal({ status, source }),
      ]) {
        if (severity === 'emergency') {
          assertEquals(
            status,
            'force_end',
            `emergency reached from a non-force_end status (source=${String(source)})`,
          )
          emergencies += 1
        }
      }
    }
  }
  // Both mappings, every source, for the one status that is allowed to get there.
  assertEquals(emergencies, SOURCES.length * 2, 'force_end must reach emergency from every source')
})

Deno.test('P0-16 AC4 · force_end reaches emergency even when the source is a technical one', () => {
  // Safety asymmetry: rule 1 outranks rule 2. A real emergency must never be
  // demoted to a technical notice, whatever the source string says.
  for (const source of TECHNICAL_SAFETY_SOURCES) {
    assertEquals(
      severityForSafetySignal({ status: 'force_end', source }),
      'emergency',
      `force_end demoted to technical by source=${source}`,
    )
    assertEquals(
      libertyMDSeverityForSignal({ status: 'force_end', source }),
      'emergency',
      `client demoted force_end by source=${source}`,
    )
  }
})

Deno.test('P0-16 AC4 · the inline-notice helper cannot produce emergency from a caution or a fault', () => {
  const nonEmergency = [
    { status: 'high_risk_continue', source: 'n8n', message: 'Keep an eye on this.' },
    { status: 'high_risk_continue', source: 'error_fail_cautious', message: 'Could not run.' },
    { status: 'pass', source: 'n8n', message: 'No emergency detected.' },
    { status: 'not_screened', source: 'no_free_text_to_screen', message: 'Nothing to screen.' },
  ]
  for (const safety of nonEmergency) {
    const notice = libertyMDSafetyNoticeFromResponse({ safety })
    assert(notice === null || notice.severity !== 'emergency', `emergency leaked from ${safety.source}`)
  }
  // And it does surface an emergency when the signal genuinely is one.
  const forced = libertyMDSafetyNoticeFromResponse({
    safety: { status: 'force_end', source: 'edge_deterministic', message: 'Call 911 now.' },
  })
  assertEquals(forced?.severity, 'emergency', 'force_end notice severity')
})

Deno.test('P0-16 AC4 · a server-supplied severity cannot promote a signal to emergency', () => {
  // The proxy publishes `severity`, but the client re-derives. A wrong or
  // tampered field must not be able to reach emergency chrome.
  const notice = libertyMDSafetyNoticeFromResponse({
    safety: {
      status: 'high_risk_continue',
      source: 'error_fail_cautious',
      severity: 'emergency',
      message: 'Could not run.',
    },
  })
  assertEquals(notice?.severity, 'technical', 'client trusted a server-supplied severity')
})

// ---------------------------------------------------------------------------
// 3 · error_fail_cautious is technical, not caution (P0-14f AC2, P0-16 AC3)
// ---------------------------------------------------------------------------

Deno.test('P0-16 AC3 · error_fail_cautious renders technical, never caution', () => {
  assertEquals(
    severityForSafetySignal({ status: 'high_risk_continue', source: 'error_fail_cautious' }),
    'technical',
    'proxy mapping',
  )
  assertEquals(
    libertyMDSeverityForSignal({ status: 'high_risk_continue', source: 'error_fail_cautious' }),
    'technical',
    'client mapping',
  )
})

Deno.test('P0-16 · a genuine high_risk_continue is still caution', () => {
  // The other half of the boundary. Failing cautious on detection is correct and
  // must keep its own treatment — if this collapsed into technical, the fix
  // would have hidden real clinical signal instead of separating it.
  assertEquals(
    severityForSafetySignal({ status: 'high_risk_continue', source: 'n8n' }),
    'caution',
    'proxy mapping',
  )
  assertEquals(
    libertyMDSeverityForSignal({ status: 'high_risk_continue', source: 'n8n' }),
    'caution',
    'client mapping',
  )
})

Deno.test('P0-14f AC3/AC4 · a failing guardrail is technical to the user and cautious internally', () => {
  for (const failure of ['timeout', 'transport'] as GuardrailFailureKind[]) {
    const verdict = guardrailTransportFailureResult(failure)

    // Rendered severity: technical.
    assertEquals(verdict.severity, 'technical', `severity for ${failure}`)
    assertEquals(severityForSafetySignal(verdict), 'technical', `re-derived severity for ${failure}`)
    assertEquals(libertyMDSeverityForSignal(verdict), 'technical', `client severity for ${failure}`)

    // Persisted posture: still cautious. These four are what downstream code
    // keys on; changing any of them changes the safety posture, not the styling.
    assertEquals(verdict.status, 'high_risk_continue', `status for ${failure}`)
    assertEquals(verdict.risk_level, 'medium', `risk_level for ${failure}`)
    assertEquals(verdict.force_end, false, `force_end for ${failure}`)
    assertEquals(verdict.source, 'error_fail_cautious', `source for ${failure}`)

    // Distinguishable in the persisted record without parsing copy (AC1).
    assertEquals(verdict.raw.screened, false, `raw.screened for ${failure}`)
    assertEquals(verdict.raw.failure, failure, `raw.failure for ${failure}`)
    assertEquals(verdict.raw.severity, 'technical', `raw.severity for ${failure}`)
  }
})

Deno.test('P0-14f AC2 · the transport-failure copy is about the app and gives no clinical instruction', () => {
  const message = guardrailTransportFailureResult('timeout').message.toLowerCase()

  // It must own the failure.
  assert(
    message.indexOf('our side') !== -1 || message.indexOf('we ') !== -1,
    'technical copy should attribute the failure to the app',
  )
  assert(
    message.indexOf('not a finding about your health') !== -1,
    'technical copy should say explicitly that this is not a health finding',
  )

  // It must not instruct care. This is the regression guard on the old string
  // "Seek urgent care if symptoms feel severe or dangerous." — a clinical
  // instruction produced by a socket.
  for (const clinical of [
    'seek urgent care',
    'seek emergency',
    'call 911',
    'emergency room',
    'symptoms feel severe',
    'dangerous',
    'your symptoms',
  ]) {
    assertEquals(
      message.indexOf(clinical),
      -1,
      `technical copy contains clinical instruction "${clinical}"`,
    )
  }
})

Deno.test('P0-14f · a client-side request failure is technical', () => {
  assertEquals(libertyMDSeverityForRequestFailure(), 'technical', 'request failure severity')
})

// ---------------------------------------------------------------------------
// 4 · the presentation table is complete and does not rely on colour alone
// ---------------------------------------------------------------------------

Deno.test('P0-16 AC1/AC5 · all four tiers are present, visually distinct, and labelled', () => {
  const tiers: CareSeverity[] = ['info', 'caution', 'emergency', 'technical']
  const containers = new Set<string>()

  for (const tier of tiers) {
    const presentation = LIBERTYMD_SEVERITY_PRESENTATION[tier]
    assert(presentation, `missing presentation for ${tier}`)
    assert(presentation.container.length > 0, `${tier} has no container styling`)
    containers.add(presentation.container)

    if (tier === 'info') {
      // Plain, no chrome: info deliberately carries no label and no notice box.
      assertEquals(presentation.live, 'off', 'info should not announce itself')
      continue
    }
    // Not colour alone: a text label and an icon, for every visible tier.
    assert(presentation.label.length > 0, `${tier} has no text label`)
    assert(presentation.iconName.length > 0, `${tier} has no icon`)
  }

  assertEquals(containers.size, tiers.length, 'two tiers share identical container styling')
})

Deno.test('P0-16 AC1 · caution, emergency and technical are distinguishable beyond hue', () => {
  const caution = LIBERTYMD_SEVERITY_PRESENTATION.caution
  const emergency = LIBERTYMD_SEVERITY_PRESENTATION.emergency
  const technical = LIBERTYMD_SEVERITY_PRESENTATION.technical

  // Different shapes, not just different colours: an inline left rule, a
  // bordered terminal card, a neutral system card.
  assert(caution.container.indexOf('border-l-2') !== -1, 'caution should read as an inline annotation')
  assert(emergency.container.indexOf('border-2') !== -1, 'emergency should read as a pinned card')
  assert(technical.container.indexOf('libertymd-slate') !== -1, 'technical should be neutral grey')
  assert(technical.container.indexOf('amber') === -1, 'technical must not borrow caution amber')
  assert(technical.container.indexOf('red') === -1, 'technical must not borrow emergency red')
  assert(caution.container.indexOf('red') === -1, 'caution must not borrow emergency red')

  // Only emergency is assertive; a caution or a fault must not interrupt a
  // screen reader mid-sentence.
  assertEquals(emergency.live, 'assertive', 'emergency politeness')
  assertEquals(emergency.role, 'alert', 'emergency role')
  assertEquals(caution.live, 'polite', 'caution politeness')
  assertEquals(technical.live, 'polite', 'technical politeness')
  assertEquals(technical.role, 'status', 'technical role')

  // The labels themselves must not be interchangeable.
  const labels = new Set([caution.label, emergency.label, technical.label])
  assertEquals(labels.size, 3, 'visible tier labels must differ')
  assert(
    technical.label.toLowerCase().indexOf('health') !== -1
      || technical.label.toLowerCase().indexOf('app') !== -1,
    'the technical label should say it is about the app',
  )
})

Deno.test('P0-16 · the info tier renders nothing rather than an empty notice', () => {
  assertEquals(libertyMDSafetyNoticeFromResponse({ safety: { status: 'pass', source: 'n8n', message: 'ok' } }), null, 'pass')
  assertEquals(libertyMDSafetyNoticeFromResponse({}), null, 'no safety object')
  assertEquals(libertyMDSafetyNoticeFromResponse(null), null, 'null response')
  // A caution with no message is also nothing — an empty box is worse than none.
  assertEquals(
    libertyMDSafetyNoticeFromResponse({ safety: { status: 'high_risk_continue', source: 'n8n', message: '   ' } }),
    null,
    'blank caution message',
  )
})
