/**
 * P1-09 — partial outcome eligibility, generation bans, and abandon telemetry.
 *
 * Run: `deno test --no-config --allow-env --allow-net tests/libertymd/partial-outcome.mts`
 * Also: `deno test --no-config --allow-read tests/libertymd/partial-outcome.test.ts` (Chat contracts)
 */
import { handleAbandonConsultation } from '../../supabase/functions/libertymd-care-proxy/actions/abandon-resume.ts'
import { handleGetPartialOutcome } from '../../supabase/functions/libertymd-care-proxy/actions/reads.ts'
import {
  classifyComplaintBucket,
  generatePartialOutcome,
  isPartialOutcomeEligible,
  PARTIAL_OUTCOME_INCOMPLETE_LABEL,
} from '../../supabase/functions/libertymd-care-proxy/lib/partial-outcome.ts'
import {
  assertEquals,
  assertTrue,
  consultationRow,
  createFakeContext,
  opsFor,
} from './support/proxy-doubles.mts'

function productEventRows(ops: ReturnType<typeof createFakeContext>['ops']) {
  return opsFor(ops, 'libertymd_product_events', 'insert')
    .map((op) => {
      const payload = Array.isArray(op.payload) ? op.payload[0] : op.payload
      return payload as { event_name?: string; consultation_id?: string; properties?: Record<string, unknown> }
    })
}

function assertExists(value: unknown, message = 'expected value'): asserts value {
  if (value === null || value === undefined) throw new Error(message)
}

function assertNoForbiddenKeys(props: Record<string, unknown> | undefined, label: string) {
  if (!props) return
  const forbidden = ['message', 'message_text', 'symptom', 'symptoms', 'diagnosis', 'email', 'name', 'age', 'sex']
  for (const key of forbidden) {
    if (key in props) throw new Error(`${label} must not carry PHI key ${key}`)
  }
}

const BANNED_CONTENT = [
  /\bdifferential\b/i,
  /\bmost likely\b/i,
  /\bpossible\b/i,
  /\bconfidence\b/i,
  /%\s*$/m,
  /\b\d{1,3}%\b/,
]

function assertNoBannedClinicalPatterns(text: string, label: string) {
  for (const pattern of BANNED_CONTENT) {
    if (pattern.test(text)) {
      throw new Error(`${label} contains banned pattern ${pattern}: ${text}`)
    }
  }
}

Deno.test('P1-09 AC4 · turn < 3 → not eligible / null', () => {
  const source = {
    turn_count: 2,
    status: 'interviewing',
    filled_slots: { chief_complaint: 'headache for two days' },
  }
  assertEquals(isPartialOutcomeEligible(source), false)
  assertEquals(generatePartialOutcome(source), null)
})

Deno.test('P1-09 AC4 · turn 0 → none', () => {
  assertEquals(
    generatePartialOutcome({
      turn_count: 0,
      status: 'awaiting_demographics',
      filled_slots: { chief_complaint: 'cough' },
    }),
    null,
  )
})

Deno.test('P1-09 Q7 · missing chief_complaint → none even at turn ≥ 3', () => {
  assertEquals(
    generatePartialOutcome({
      turn_count: 5,
      status: 'interviewing',
      filled_slots: { onset: 'yesterday' },
    }),
    null,
  )
  assertEquals(
    generatePartialOutcome({
      turn_count: 5,
      status: 'interviewing',
      filled_slots: { chief_complaint: 'unknown' },
    }),
    null,
  )
})

Deno.test('P1-09 AC4 · emergency_stopped → never', () => {
  assertEquals(
    isPartialOutcomeEligible({
      turn_count: 8,
      status: 'emergency_stopped',
      filled_slots: { chief_complaint: 'chest pain' },
    }),
    false,
  )
  assertEquals(
    generatePartialOutcome({
      turn_count: 8,
      status: 'emergency_stopped',
      filled_slots: { chief_complaint: 'chest pain' },
    }),
    null,
  )
})

Deno.test('P1-09 AC1 · turn ≥ 3 + chief_complaint → guidance + see today', () => {
  const outcome = generatePartialOutcome({
    turn_count: 3,
    status: 'interviewing',
    filled_slots: { chief_complaint: 'migraine headache' },
  })
  assertExists(outcome)
  assertEquals(outcome!.incomplete_label, PARTIAL_OUTCOME_INCOMPLETE_LABEL)
  assertTrue(outcome!.general_guidance.length > 20, 'general guidance present')
  assertTrue(outcome!.see_today_signs.length >= 2, 'see today signs present')
  assertEquals(outcome!.bucket, 'headache')
})

Deno.test('P1-09 S2A · high_risk eligible when turn/slots pass', () => {
  const outcome = generatePartialOutcome({
    turn_count: 4,
    status: 'high_risk',
    filled_slots: { chief_complaint: 'shortness of breath' },
  })
  assertExists(outcome)
  assertEquals(outcome!.bucket, 'respiratory')
})

Deno.test('P1-09 AC2 · incomplete label + no differential/confidence patterns', () => {
  const buckets = ['headache', 'chest pain', 'belly cramps', 'cough', 'dizzy and tired']
  for (const complaint of buckets) {
    const outcome = generatePartialOutcome({
      turn_count: 3,
      status: 'interviewing',
      filled_slots: { chief_complaint: complaint },
    })
    assertExists(outcome, `expected outcome for ${complaint}`)
    assertTrue(
      /incomplete/i.test(outcome!.incomplete_label),
      'incomplete label required',
    )
    const blob = [
      outcome!.incomplete_label,
      outcome!.general_guidance,
      ...outcome!.see_today_signs,
    ].join('\n')
    assertNoBannedClinicalPatterns(blob, complaint)
  }
})

Deno.test('P1-09 Q3A · bucket map + generic fallback', () => {
  assertEquals(classifyComplaintBucket('bad migraine'), 'headache')
  assertEquals(classifyComplaintBucket('chest pressure'), 'chest')
  assertEquals(classifyComplaintBucket('stomach pain'), 'abdominal')
  assertEquals(classifyComplaintBucket('wheezing cough'), 'respiratory')
  assertEquals(classifyComplaintBucket('feeling off'), 'generic')
})

Deno.test('P1-09 AC3 · generator never reads intermediate_diagnoses', async () => {
  const source = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-care-proxy/lib/partial-outcome.ts', import.meta.url),
  )
  // Strip block comments so doc lines like "no n8n" do not false-positive.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  if (code.includes('intermediate_diagnoses')) {
    throw new Error('partial-outcome.ts must not read intermediate_diagnoses')
  }
  if (/runDiagnosis|DIAGNOSIS_WEBHOOK|from ['"].*n8n/i.test(code)) {
    throw new Error('partial-outcome.ts must not call Diagnosis / n8n')
  }
})

Deno.test('P1-09 Q5A · abandon attaches payload → partial_outcome_shown true', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({
      status: 'interviewing',
      turn_count: 3,
      version: 4,
      filled_slots: { chief_complaint: 'headache' },
      intermediate_diagnoses: [],
    }),
  })
  const response = await handleAbandonConsultation(ctx, {
    action: 'abandon_consultation',
    consultation_id: 'consultation-1',
  })
  assertEquals(response.status, 200)
  const body = await response.json()
  assertExists(body.partial_outcome)
  assertEquals(body.partial_outcome.bucket, 'headache')
  const abandoned = productEventRows(ops).find((row) => row.event_name === 'consult_abandoned')
  assertTrue(abandoned, 'consult_abandoned emitted')
  assertEquals(abandoned!.properties?.partial_outcome_shown, true)
  assertNoForbiddenKeys(abandoned!.properties as Record<string, unknown>, 'consult_abandoned')
})

Deno.test('P1-09 Q5A · ineligible abandon → shown false + null payload', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({
      status: 'interviewing',
      turn_count: 1,
      version: 2,
      filled_slots: { chief_complaint: 'headache' },
      intermediate_diagnoses: [{ name: 'migraine', confidence: 0.9 }],
    }),
  })
  const response = await handleAbandonConsultation(ctx, {
    action: 'abandon_consultation',
    consultation_id: 'consultation-1',
  })
  assertEquals(response.status, 200)
  const body = await response.json()
  assertEquals(body.partial_outcome, null)
  const abandoned = productEventRows(ops).find((row) => row.event_name === 'consult_abandoned')
  assertTrue(abandoned, 'consult_abandoned emitted')
  assertEquals(abandoned!.properties?.partial_outcome_shown, false)
})

Deno.test('P1-09 AC4 · emergency abandon still 409 / no partial', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({
      status: 'emergency_stopped',
      turn_count: 5,
      filled_slots: { chief_complaint: 'chest pain' },
    }),
  })
  const response = await handleAbandonConsultation(ctx, {
    action: 'abandon_consultation',
    consultation_id: 'consultation-1',
  })
  assertEquals(response.status, 409)
  assertEquals(productEventRows(ops).length, 0)
})

Deno.test('P1-09 soft-leave path · get_partial_outcome generate-only', async () => {
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({
      status: 'interviewing',
      turn_count: 4,
      filled_slots: { chief_complaint: 'abdominal cramps' },
    }),
  })
  const response = await handleGetPartialOutcome(ctx, {
    action: 'get_partial_outcome',
    consultation_id: 'consultation-1',
  })
  assertEquals(response.status, 200)
  const body = await response.json()
  assertExists(body.partial_outcome)
  assertEquals(body.partial_outcome.bucket, 'abdominal')
  // No status mutation / no product events from soft-leave generate.
  assertEquals(productEventRows(ops).length, 0)
  assertEquals(opsFor(ops, 'libertymd_consultations', 'update').length, 0)
})
