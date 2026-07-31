/**
 * P0-17 AC14 / DoD — owner-scoped get_consultation returns terminal
 * `crisis_type` + `care_setting` (Q5 ordering), or omits them when no force_end.
 *
 * Imported by `proxy-invariants.mts` so it rides `test:libertymd:invariants`
 * without a package.json script change.
 */
import { handleGetConsultation } from '../../supabase/functions/libertymd-care-proxy/actions/reads.ts'
import {
  assertEquals,
  assertTrue,
  consultationRow,
  createFakeContext,
  opsFor,
} from './support/proxy-doubles.mts'

declare const Deno: { test: (name: string, fn: () => unknown | Promise<unknown>) => void }

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>
}

Deno.test('P0-17 AC14 · get_consultation includes terminal crisis_type + care_setting (Q5 order)', async () => {
  const consultation = consultationRow({
    id: 'consult-emergency-1',
    status: 'emergency_stopped',
    user_id: 'user-1',
  })
  const { ctx, ops } = createFakeContext({
    userId: 'user-1',
    consultation,
    history: [
      { role: 'assistant', content: 'Call 911 now.', message_type: 'safety' },
    ],
    terminalSafety: {
      crisis_type: 'acs_chest_pain',
      care_setting: 'emergency_services',
      turn_count: 4,
      created_at: '2026-07-31T12:00:00.000Z',
    },
  })

  const response = await handleGetConsultation(ctx, { action: 'get_consultation', consultation_id: consultation.id })
  assertEquals(response.status, 200, 'get_consultation status')
  const body = await parseJson(response)

  assertEquals(body.crisis_type, 'acs_chest_pain', 'top-level crisis_type')
  assertEquals(body.care_setting, 'emergency_services', 'top-level care_setting')
  assertTrue(body.consultation, 'consultation present')
  assertTrue(Array.isArray(body.messages), 'messages present')

  // Owner scope: consultation select filtered by jwt user_id.
  const consultSelects = opsFor(ops, 'libertymd_consultations', 'select')
  assertTrue(consultSelects.length >= 1, 'owned consultation lookup ran')
  assertTrue(
    consultSelects.some((op) => op.filters.some((f) => f.column === 'user_id' && f.value === 'user-1')),
    'consultation lookup owner-scoped by user_id',
  )

  // Q5 ordering: force_end rows ordered by turn_count desc, then created_at desc.
  const safetySelects = opsFor(ops, 'libertymd_safety_events', 'select')
  assertEquals(safetySelects.length, 1, 'one terminal safety lookup')
  const safetyOp = safetySelects[0]
  assertTrue(
    safetyOp.filters.some((f) => f.column === 'consultation_id' && f.value === consultation.id),
    'safety scoped to consultation',
  )
  assertTrue(
    safetyOp.filters.some((f) => f.column === 'force_end' && f.value === true),
    'safety filtered to force_end',
  )
  assertEquals(safetyOp.orders?.[0]?.column, 'turn_count', 'primary order turn_count')
  assertEquals(safetyOp.orders?.[0]?.ascending, false, 'turn_count descending')
  assertEquals(safetyOp.orders?.[1]?.column, 'created_at', 'tie-break created_at')
  assertEquals(safetyOp.orders?.[1]?.ascending, false, 'created_at descending')
  assertEquals(safetyOp.limitCount, 1, 'limit 1 latest row')
})

Deno.test('P0-17 AC14 · get_consultation omits classification when no force_end row', async () => {
  const consultation = consultationRow({
    id: 'consult-interview-1',
    status: 'interviewing',
    user_id: 'user-1',
  })
  const { ctx } = createFakeContext({
    userId: 'user-1',
    consultation,
    history: [],
    terminalSafety: null,
  })

  const response = await handleGetConsultation(ctx, { action: 'get_consultation', consultation_id: consultation.id })
  assertEquals(response.status, 200, 'get_consultation status')
  const body = await parseJson(response)

  assertEquals('crisis_type' in body, false, 'crisis_type omitted')
  assertEquals('care_setting' in body, false, 'care_setting omitted')
})

Deno.test('P0-17 AC14 · get_consultation SI crisis_line classification on reopen', async () => {
  const consultation = consultationRow({
    id: 'consult-si-1',
    status: 'emergency_stopped',
    user_id: 'user-1',
  })
  const { ctx } = createFakeContext({
    userId: 'user-1',
    consultation,
    terminalSafety: {
      crisis_type: 'suicidal_ideation',
      care_setting: 'crisis_line',
      turn_count: 2,
      created_at: '2026-07-31T11:00:00.000Z',
    },
  })

  const body = await parseJson(
    await handleGetConsultation(ctx, { action: 'get_consultation', consultation_id: consultation.id }),
  )
  assertEquals(body.crisis_type, 'suicidal_ideation', 'SI crisis_type')
  assertEquals(body.care_setting, 'crisis_line', 'SI care_setting')
})
