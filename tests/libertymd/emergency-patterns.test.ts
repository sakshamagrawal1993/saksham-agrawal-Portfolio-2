import {
  EMERGENCY_PATTERNS,
  EMERGENCY_PATTERN_SET_VERSION,
} from '../../supabase/functions/libertymd-care-proxy/emergency-patterns.ts'
import { detectDeterministicEmergency } from '../../supabase/functions/libertymd-care-proxy/clinical-policy.ts'
import CASES from './emergency-pattern-cases.json' with { type: 'json' }
import CLINICAL_CASES from './clinical-scenarios.v0.1.json' with { type: 'json' }
import I18N_CASES from './clinical-scenarios.i18n.v0.1.json' with { type: 'json' }

declare const Deno: { test: (name: string, fn: () => unknown | Promise<unknown>) => void }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

Deno.test('P0-14a pattern set is versioned and contains the exact seven presentations', () => {
  assert(/^\d+\.\d+\.\d+$/.test(EMERGENCY_PATTERN_SET_VERSION), 'Pattern-set version must be semver')
  assertEquals(CASES.pattern_set_version, EMERGENCY_PATTERN_SET_VERSION, 'Case corpus version')
  const expected = [
    'acs_chest_pain',
    'anaphylaxis',
    'respiratory_distress',
    'stroke_fast',
    'suicidal_ideation',
    'surgical_abdomen',
    'thunderclap_headache',
  ]
  const actual = [...new Set(EMERGENCY_PATTERNS.map((pattern) => pattern.crisisType))].sort()
  assertEquals(actual.length, 7, 'Distinct crisis type count')
  assertEquals(JSON.stringify(actual), JSON.stringify(expected), 'Exact crisis type set')
  for (const pattern of EMERGENCY_PATTERNS) {
    assert(pattern.id && pattern.careSetting && pattern.message && pattern.matcher.source, `${pattern.id} must be complete`)
    assertEquals(pattern.clinicianReview.status, 'pending', `${pattern.id} clinician review`)
  }
})

Deno.test('P0-14a suicidal ideation uses terminal crisis-line copy without medical-emergency framing', () => {
  const pattern = EMERGENCY_PATTERNS.find((candidate) => candidate.crisisType === 'suicidal_ideation')
  assert(pattern, 'Suicidal-ideation pattern must exist')
  assertEquals(pattern.careSetting, 'crisis_line', 'Suicidal-ideation care setting')
  assert(/\b988\b/.test(pattern.message), 'Crisis-line message must contain 988')
  assert(!/\b911\b|\bER\b|emergency room|ambulance/i.test(pattern.message), 'Crisis-line message must not use medical-emergency framing')
  for (const medical of EMERGENCY_PATTERNS.filter((candidate) => candidate.crisisType !== 'suicidal_ideation')) {
    assert(/\b911\b|\bER\b|emergency services/i.test(medical.message), `${medical.id} must direct the user to emergency services`)
  }
})

Deno.test('P0-14a positive emergency corpus returns structured matches', () => {
  for (const testCase of CASES.positives) {
    const result = detectDeterministicEmergency(testCase.message)
    assert(result, `Expected a match for ${testCase.id}`)
    assertEquals(result.crisisType, testCase.crisis_type, `${testCase.id} crisis type`)
    assertEquals(result.careSetting, testCase.care_setting, `${testCase.id} care setting`)
    assertEquals(result.patternId, testCase.crisis_type, `${testCase.id} pattern id`)
    assertEquals(result.patternSetVersion, EMERGENCY_PATTERN_SET_VERSION, `${testCase.id} pattern version`)
    assert(result.matchedSpan.length > 0 && result.matchedSpan.length <= 64, `${testCase.id} matched span must be bounded`)
    assertEquals(typeof result.spanStart, 'number', `${testCase.id} spanStart`)
    assertEquals(typeof result.spanEnd, 'number', `${testCase.id} spanEnd`)
    assertEquals(
      testCase.message.slice(result.spanStart, result.spanEnd),
      result.matchedSpan,
      `${testCase.id} span must be a verbatim original-message slice`,
    )
  }
})

Deno.test('P0-14a negative corpus is at least three times the positive corpus and stays clear', () => {
  assert(CASES.negatives.length >= 15, 'At least 15 negative cases are required')
  assert(CASES.negatives.length >= 3 * CASES.positives.length, 'Negatives must be at least three times positives')
  for (const testCase of CASES.negatives) {
    assertEquals(detectDeterministicEmergency(testCase.message), null, `Expected no match for ${testCase.id}`)
  }
})

Deno.test('P0-14a multilingual 32-case translations preserve every emergency decision', () => {
  for (const [locale, bundle] of Object.entries(I18N_CASES.locales)) {
    for (const scenario of CLINICAL_CASES.scenarios) {
      const message = bundle.messages[scenario.id as keyof typeof bundle.messages]
      assert(message, `${locale}/${scenario.id}: translated message`)
      const result = detectDeterministicEmergency(message)
      if (scenario.expected.emergency_action === 'force_end') {
        assert(result, `${locale}/${scenario.id}: expected deterministic force_end`)
        assertEquals(result.crisisType, scenario.expected.crisis_type, `${locale}/${scenario.id}: crisis type`)
      } else {
        assertEquals(result, null, `${locale}/${scenario.id}: expected deterministic continue`)
      }
    }
  }
})

Deno.test('P0-14a / P0-14b AC4 · deterministic matcher remains bounded on adversarial input', () => {
  // Per-turn latency budget for the edge deterministic screen (P0-14b AC4 / DoD):
  // adversarial bound < 50 ms on ~10k characters. The screen is in-process
  // (no network hop) and must stay cheap enough to run on every free-text turn.
  // Typical ACS matches are usually well under this; we do not assert a tighter
  // typical bound here because shared CI timing can flake.
  const input = 'chest chest chest '.repeat(625)
  const startedAt = performance.now()
  detectDeterministicEmergency(input)
  const elapsedMs = performance.now() - startedAt
  assert(elapsedMs < 50, `10,000-character input took ${elapsedMs.toFixed(2)} ms (budget: < 50 ms)`)
})
