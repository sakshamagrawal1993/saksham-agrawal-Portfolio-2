/**
 * P1-08 — speculative diagnosis pre-warm: predicate, staleness, flag, kill-switch,
 * cache serve, call-volume under doubles.
 *
 * `.mts` so Deno can import proxy modules without dragging them into the
 * recursive repo `tsc` glob.
 */
import {
  DIAGNOSIS_WEBHOOK,
  GUARDRAIL_WEBHOOK,
  INTERVIEW_WEBHOOK,
  MAX_TURNS,
  getDiagnosisEvidenceFloor,
  getDiagnosisTurnFloor,
  isDiagnosisEvenTurnRequired,
  isSpeculativeDiagnosisEnabled,
} from '../../supabase/functions/libertymd-care-proxy/lib/config.ts'
import { handleSendMessage } from '../../supabase/functions/libertymd-care-proxy/actions/send-message.ts'
import { flushMixpanelFanOutForTests } from '../../supabase/functions/libertymd-care-proxy/lib/mixpanel.ts'
import {
  computeShouldRunDiagnosis,
  isOneTurnFromDiagnosisGate,
  isSpeculativeRunServeEligible,
  materialSnapshotsEqual,
} from '../../supabase/functions/libertymd-care-proxy/lib/speculative-diagnosis.ts'
import {
  assertEquals,
  assertTrue,
  consultationRow,
  createFakeContext,
  okResponse,
  opsFor,
  stubFetch,
} from './support/proxy-doubles.mts'

declare const Deno: {
  test: (name: string, fn: () => unknown | Promise<unknown>) => void
  env: { get: (key: string) => string | undefined; set: (key: string, value: string) => void; delete: (key: string) => void }
}

const HIGH_EVIDENCE_SLOTS = {
  chief_complaint: 'headache',
  onset: 'two days',
  severity: '4',
  associated_symptoms: 'none',
  red_flag_negatives: 'no chest pain no shortness of breath',
  relevant_history: 'none',
  age: 34,
  sex_at_birth: 'female',
}

function interviewPass(overrides: Record<string, unknown> = {}) {
  return okResponse({
    next_question: 'When did this start?',
    options: ['Today', 'Yesterday', 'This week', 'Longer'],
    ready_for_report: false,
    target_slot: 'onset',
    slot_updates: {},
    missing_slots: ['onset'],
    input_relevance: 'clinical',
    input_relevance_reason: 'clinical',
    source: 'n8n',
    ...overrides,
  })
}

function guardrailPass() {
  return okResponse({
    status: 'pass',
    force_end: false,
    risk_level: 'low',
    care_setting: 'self_care',
    message: 'ok',
    red_flags: [],
    source: 'n8n',
  })
}

function diagnosisPass() {
  return okResponse({
    valid_report: true,
    confidence_score: 82,
    differential_diagnosis: [
      { name: 'tension headache', likelihood: 'most_likely' },
      { name: 'migraine', likelihood: 'possible' },
    ],
    soap_note: { subjective: 'x', objective: 'x', assessment: 'x', plan: 'x' },
    model_metadata: {},
  })
}

function productEventRows(ops: ReturnType<typeof createFakeContext>['ops']) {
  return opsFor(ops, 'libertymd_product_events', 'insert')
    .map((op) => {
      const payload = Array.isArray(op.payload) ? op.payload[0] : op.payload
      return payload as { event_name?: string; properties?: Record<string, unknown> }
    })
}

function withEnv(key: string, value: string | null, fn: () => Promise<void> | void) {
  const prev = Deno.env.get(key)
  if (value === null) Deno.env.delete(key)
  else Deno.env.set(key, value)
  return Promise.resolve(fn()).finally(() => {
    if (prev === undefined) Deno.env.delete(key)
    else Deno.env.set(key, prev)
  })
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

Deno.test('P2-14 AC1/AC2 · computeShouldRunDiagnosis G2 (even not required by default)', async () => {
  await withEnv('LIBERTYMD_DIAGNOSIS_EVEN_TURN_REQUIRED', null, async () => {
    await withEnv('LIBERTYMD_DIAGNOSIS_TURN_FLOOR', null, async () => {
      await withEnv('LIBERTYMD_DIAGNOSIS_EVIDENCE_FLOOR', null, () => {
        assertEquals(getDiagnosisTurnFloor(), 6)
        assertEquals(getDiagnosisEvidenceFloor(), 50)
        assertEquals(isDiagnosisEvenTurnRequired(), false)
        // Even turn still opens
        assertEquals(computeShouldRunDiagnosis({ evidenceScore: 50, turnCount: 6, readyForReport: false }), true)
        // Odd turn 7 + score ≥50 + ready false → runs (even-turn removed)
        assertEquals(computeShouldRunDiagnosis({ evidenceScore: 50, turnCount: 7, readyForReport: false }), true)
        // Score <50 → does not
        assertEquals(computeShouldRunDiagnosis({ evidenceScore: 49, turnCount: 6, readyForReport: false }), false)
        assertEquals(computeShouldRunDiagnosis({ evidenceScore: 49, turnCount: 7, readyForReport: false }), false)
        // Turn <6 + ready still false (reject G3)
        assertEquals(computeShouldRunDiagnosis({ evidenceScore: 50, turnCount: 5, readyForReport: false }), false)
        assertEquals(computeShouldRunDiagnosis({ evidenceScore: 50, turnCount: 5, readyForReport: true }), false)
        // At the final turn, any real health information opens diagnosis so a
        // low-confidence physician-review report can still be produced.
        assertEquals(computeShouldRunDiagnosis({ evidenceScore: 50, turnCount: 15, readyForReport: false }), true)
        assertEquals(computeShouldRunDiagnosis({ evidenceScore: 40, turnCount: 15, readyForReport: false }), true)
        // Zero evidence is the only final-turn case that remains incomplete.
        assertEquals(computeShouldRunDiagnosis({ evidenceScore: 0, turnCount: 15, readyForReport: false }), false)
      })
    })
  })
})

Deno.test('P2-14 AC6 · EVEN_REQUIRED=true restores legacy even∨ready∨atCap', async () => {
  await withEnv('LIBERTYMD_DIAGNOSIS_EVEN_TURN_REQUIRED', 'true', async () => {
    await withEnv('LIBERTYMD_DIAGNOSIS_TURN_FLOOR', null, async () => {
      await withEnv('LIBERTYMD_DIAGNOSIS_EVIDENCE_FLOOR', null, () => {
        assertEquals(isDiagnosisEvenTurnRequired(), true)
        assertEquals(computeShouldRunDiagnosis({ evidenceScore: 50, turnCount: 6, readyForReport: false }), true)
        assertEquals(computeShouldRunDiagnosis({ evidenceScore: 50, turnCount: 7, readyForReport: false }), false)
        assertEquals(computeShouldRunDiagnosis({ evidenceScore: 50, turnCount: 7, readyForReport: true }), true)
        assertEquals(computeShouldRunDiagnosis({ evidenceScore: 50, turnCount: 15, readyForReport: false }), true)
      })
    })
  })
})

Deno.test('P2-14 R2 · isOneTurnFromDiagnosisGate retargeted under G2', async () => {
  await withEnv('LIBERTYMD_DIAGNOSIS_EVEN_TURN_REQUIRED', null, () => {
    // 5→6 with evidence already qualifying still true
    assertEquals(isOneTurnFromDiagnosisGate({ evidenceScore: 50, turnCount: 5 }), true)
    // turn 7 score≥50 is already on gate → predictor false
    assertEquals(isOneTurnFromDiagnosisGate({ evidenceScore: 50, turnCount: 7 }), false)
    // already on gate (6)
    assertEquals(isOneTurnFromDiagnosisGate({ evidenceScore: 50, turnCount: 6 }), false)
    // evidence too low
    assertEquals(isOneTurnFromDiagnosisGate({ evidenceScore: 40, turnCount: 5 }), false)
    // turn 4 → 5 still below floor
    assertEquals(isOneTurnFromDiagnosisGate({ evidenceScore: 50, turnCount: 4 }), false)
  })
})

Deno.test('P2-14 AC7 · call-volume delta: odd turn 7 newly eligible (+1 acted-upon)', async () => {
  // Pre-change (EVEN_REQUIRED=true): turn 7 score≥50 ready false → gate closed → 0 Diagnosis
  // Post-change (default): same inputs → gate open → +1 acted-upon (comprehension already done)
  let legacyCount = 0
  let retunedCount = 0
  await withEnv('LIBERTYMD_DIAGNOSIS_EVEN_TURN_REQUIRED', 'true', async () => {
    const fetchLog = stubFetch((url) => {
      if (url === INTERVIEW_WEBHOOK) {
        return interviewPass({
          target_slot: 'associated_symptoms',
          ready_for_report: false,
          slot_updates: {},
          missing_slots: [],
        })
      }
      if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
      if (url === DIAGNOSIS_WEBHOOK) return diagnosisPass()
      return okResponse({})
    })
    const { ctx } = createFakeContext({
      consultation: consultationRow({
        status: 'interviewing',
        turn_count: 6,
        version: 7,
        filled_slots: HIGH_EVIDENCE_SLOTS,
        missing_slots: [],
        target_slot: 'aggravating_factors',
        clinical_evidence_score: 70,
        patient_snapshot: { age: 34 },
        workflow_versions: { comprehension_completed: true },
      }),
      claim: { accepted: true, replayed: false, current_version: 7 },
    })
    try {
      await handleSendMessage(ctx, {
        action: 'send_message',
        consultation_id: 'consultation-1',
        message: 'Nothing else',
        client_message_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0e01',
        expected_version: 7,
      })
      await flushMixpanelFanOutForTests()
      legacyCount = fetchLog.calls.filter((c) => c.url === DIAGNOSIS_WEBHOOK).length
    } finally {
      fetchLog.restore()
    }
  })
  await withEnv('LIBERTYMD_DIAGNOSIS_EVEN_TURN_REQUIRED', null, async () => {
    const fetchLog = stubFetch((url) => {
      if (url === INTERVIEW_WEBHOOK) {
        return interviewPass({
          target_slot: 'associated_symptoms',
          ready_for_report: false,
          slot_updates: {},
          missing_slots: [],
        })
      }
      if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
      if (url === DIAGNOSIS_WEBHOOK) return diagnosisPass()
      return okResponse({})
    })
    const { ctx } = createFakeContext({
      consultation: consultationRow({
        status: 'interviewing',
        turn_count: 6,
        version: 7,
        filled_slots: HIGH_EVIDENCE_SLOTS,
        missing_slots: [],
        target_slot: 'aggravating_factors',
        clinical_evidence_score: 70,
        patient_snapshot: { age: 34 },
        workflow_versions: { comprehension_completed: true },
      }),
      claim: { accepted: true, replayed: false, current_version: 7 },
    })
    try {
      await handleSendMessage(ctx, {
        action: 'send_message',
        consultation_id: 'consultation-1',
        message: 'Nothing else',
        client_message_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0e02',
        expected_version: 7,
      })
      await flushMixpanelFanOutForTests()
      retunedCount = fetchLog.calls.filter((c) => c.url === DIAGNOSIS_WEBHOOK).length
    } finally {
      fetchLog.restore()
    }
  })
  assertEquals(legacyCount, 0, 'legacy even-required: odd turn 7 → 0 Diagnosis')
  assertEquals(retunedCount, 1, 'retuned gate: odd turn 7 → 1 acted-upon Diagnosis')
  assertEquals(retunedCount - legacyCount, 1, 'AC7 expected +1 acted-upon on newly eligible odd turn')
})

Deno.test('P1-08 AC2 · material equality ignores missing_slots; deltas invalidate', () => {
  const base = {
    filled_slots: { chief_complaint: 'headache', onset: 'today' },
    patient: { age: 34 },
    target_slot: 'severity',
  }
  assertEquals(
    materialSnapshotsEqual(base, {
      ...base,
      // missing_slots not part of material snapshot — equality holds
    }),
    true,
  )
  assertEquals(
    materialSnapshotsEqual(base, {
      filled_slots: { chief_complaint: 'headache', onset: 'yesterday' },
      patient: base.patient,
      target_slot: base.target_slot,
    }),
    false,
    'filled_slots delta must invalidate',
  )
  assertEquals(
    materialSnapshotsEqual(base, {
      filled_slots: base.filled_slots,
      patient: { age: 40 },
      target_slot: base.target_slot,
    }),
    false,
    'patient delta must invalidate',
  )
  assertEquals(
    materialSnapshotsEqual(base, {
      filled_slots: base.filled_slots,
      patient: base.patient,
      target_slot: 'associated_symptoms',
    }),
    false,
    'target_slot delta must invalidate',
  )
})

Deno.test('P1-08 AC2/AC3 · serve eligibility: validated + equal only; never stale/invalid', () => {
  const current = {
    filled_slots: HIGH_EVIDENCE_SLOTS,
    patient: { age: 34 },
    target_slot: 'aggravating_factors',
  }
  const validatedEqual = {
    id: 'spec-1',
    run_status: 'validated',
    is_speculative: true,
    input_snapshot: {
      filled_slots: HIGH_EVIDENCE_SLOTS,
      patient: { age: 34 },
      target_slot: 'aggravating_factors',
      missing_slots: ['something_else'],
    },
  }
  assertEquals(
    isSpeculativeRunServeEligible({ enabled: true, run: validatedEqual, current }),
    true,
    'missing_slots-only delta still eligible',
  )
  assertEquals(
    isSpeculativeRunServeEligible({ enabled: false, run: validatedEqual, current }),
    false,
    'kill-switch off never serves',
  )
  assertEquals(
    isSpeculativeRunServeEligible({ enabled: true, run: null, current }),
    false,
    'in-flight / missing → fresh',
  )
  assertEquals(
    isSpeculativeRunServeEligible({
      enabled: true,
      run: { ...validatedEqual, run_status: 'withheld' },
      current,
    }),
    false,
    'withheld never served',
  )
  assertEquals(
    isSpeculativeRunServeEligible({
      enabled: true,
      run: { ...validatedEqual, run_status: 'error' },
      current,
    }),
    false,
    'error never served',
  )
  assertEquals(
    isSpeculativeRunServeEligible({
      enabled: true,
      run: {
        ...validatedEqual,
        input_snapshot: {
          ...validatedEqual.input_snapshot,
          filled_slots: { ...HIGH_EVIDENCE_SLOTS, onset: 'changed' },
        },
      },
      current,
    }),
    false,
    'material change never served',
  )
})

Deno.test('P1-08 AC5 · LIBERTYMD_SPECULATIVE_DIAGNOSIS defaults off', async () => {
  await withEnv('LIBERTYMD_SPECULATIVE_DIAGNOSIS', null, () => {
    assertEquals(isSpeculativeDiagnosisEnabled(), false)
  })
  await withEnv('LIBERTYMD_SPECULATIVE_DIAGNOSIS', 'false', () => {
    assertEquals(isSpeculativeDiagnosisEnabled(), false)
  })
  await withEnv('LIBERTYMD_SPECULATIVE_DIAGNOSIS', 'true', () => {
    assertEquals(isSpeculativeDiagnosisEnabled(), true)
  })
  await withEnv('LIBERTYMD_SPECULATIVE_DIAGNOSIS', '1', () => {
    assertEquals(isSpeculativeDiagnosisEnabled(), true)
  })
})

// ---------------------------------------------------------------------------
// Integration under doubles
// ---------------------------------------------------------------------------

Deno.test('P1-08 AC5 · flag off → zero speculative Diagnosis POSTs on near-gate continue', async () => {
  await withEnv('LIBERTYMD_SPECULATIVE_DIAGNOSIS', null, async () => {
    const fetchLog = stubFetch((url) => {
      if (url === INTERVIEW_WEBHOOK) {
        return interviewPass({
          target_slot: 'aggravating_factors',
          slot_updates: {},
          missing_slots: [],
          ready_for_report: false,
        })
      }
      if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
      if (url === DIAGNOSIS_WEBHOOK) return diagnosisPass()
      return okResponse({})
    })
    const { ctx } = createFakeContext({
      consultation: consultationRow({
        status: 'interviewing',
        turn_count: 4,
        version: 5,
        filled_slots: HIGH_EVIDENCE_SLOTS,
        missing_slots: [],
        target_slot: 'relevant_history',
        clinical_evidence_score: 70,
        patient_snapshot: { age: 34 },
      }),
      claim: { accepted: true, replayed: false, current_version: 5 },
    })
    try {
      const response = await handleSendMessage(ctx, {
        action: 'send_message',
        consultation_id: 'consultation-1',
        message: 'Nothing else',
        client_message_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0001',
        expected_version: 5,
      })
      assertEquals(response.status, 200, 'continue ok')
      await flushMixpanelFanOutForTests()
      const diagnosisCalls = fetchLog.calls.filter((c) => c.url === DIAGNOSIS_WEBHOOK)
      assertEquals(diagnosisCalls.length, 0, 'flag off: no speculative Diagnosis')
      const body = await response.json() as { diagnosis_ran?: boolean; turn_count?: number }
      assertEquals(body.diagnosis_ran, false, 'pre-warm turn must not set diagnosis_ran')
      assertEquals(body.turn_count, 5)
    } finally {
      fetchLog.restore()
    }
  })
})

Deno.test('P1-08 AC1/AC6/T1 · flag on → speculative POST + is_speculative insert + was_speculative emit', async () => {
  await withEnv('LIBERTYMD_SPECULATIVE_DIAGNOSIS', 'true', async () => {
    const fetchLog = stubFetch((url) => {
      if (url === INTERVIEW_WEBHOOK) {
        return interviewPass({
          target_slot: 'aggravating_factors',
          slot_updates: {},
          missing_slots: [],
          ready_for_report: false,
        })
      }
      if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
      if (url === DIAGNOSIS_WEBHOOK) return diagnosisPass()
      return okResponse({})
    })
    const { ctx, ops } = createFakeContext({
      consultation: consultationRow({
        status: 'interviewing',
        turn_count: 4,
        version: 5,
        filled_slots: HIGH_EVIDENCE_SLOTS,
        missing_slots: [],
        target_slot: 'relevant_history',
        clinical_evidence_score: 70,
        patient_snapshot: { age: 34 },
      }),
      claim: { accepted: true, replayed: false, current_version: 5 },
    })
    try {
      const response = await handleSendMessage(ctx, {
        action: 'send_message',
        consultation_id: 'consultation-1',
        message: 'Nothing else',
        client_message_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0002',
        expected_version: 5,
      })
      assertEquals(response.status, 200)
      await flushMixpanelFanOutForTests()
      const diagnosisCalls = fetchLog.calls.filter((c) => c.url === DIAGNOSIS_WEBHOOK)
      assertEquals(diagnosisCalls.length, 1, 'AC6: +1 Diagnosis POST on pre-warm-eligible continue')

      const inserts = opsFor(ops, 'libertymd_diagnostic_runs', 'insert')
      assertTrue(inserts.length >= 1, 'speculative row inserted')
      const payload = (Array.isArray(inserts[0].payload) ? inserts[0].payload[0] : inserts[0].payload) as Record<string, unknown>
      assertEquals(payload.is_speculative, true, 'AC1: is_speculative true')

      const diagnosisEvents = productEventRows(ops).filter((r) => r.event_name === 'diagnosis_attempted')
      assertTrue(diagnosisEvents.length >= 1, 'diagnosis_attempted on speculative')
      assertEquals(diagnosisEvents[0].properties?.was_speculative, true, 'T1: was_speculative true')
      assertEquals(diagnosisEvents[0].properties?.served_from_cache, false)

      const body = await response.json() as { diagnosis_ran?: boolean }
      assertEquals(body.diagnosis_ran, false, 'R1: pre-warm must not flip diagnosis_ran')

      // No intermediate_diagnoses write from speculative path (P1-09 out) —
      // continue update may still pass prior intermediate_diagnoses through.
      const updates = opsFor(ops, 'libertymd_consultations', 'update')
      for (const op of updates) {
        const row = op.payload as Record<string, unknown>
        // Speculative path must not invent new differentials on the consult row
        // before gate; continue path only copies prior/acted-upon diagnosis.
        if (row.intermediate_diagnoses !== undefined) {
          assertEquals(
            Array.isArray(row.intermediate_diagnoses) && (row.intermediate_diagnoses as unknown[]).length === 0,
            true,
            'no speculative intermediate_diagnoses write',
          )
        }
      }
    } finally {
      fetchLog.restore()
    }
  })
})

Deno.test('P1-08 AC3/AC4/T1 · cache hit skips Diagnosis webhook and emits served_from_cache', async () => {
  await withEnv('LIBERTYMD_SPECULATIVE_DIAGNOSIS', 'true', async () => {
    const fetchLog = stubFetch((url) => {
      if (url === INTERVIEW_WEBHOOK) {
        return interviewPass({
          target_slot: 'associated_symptoms',
          ready_for_report: true,
          slot_updates: {},
          missing_slots: [],
        })
      }
      if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
      if (url === DIAGNOSIS_WEBHOOK) return diagnosisPass()
      return okResponse({})
    })

    const speculativeRow = {
      id: 'spec-run-hit',
      turn_count: 5,
      run_status: 'validated',
      is_speculative: true,
      input_snapshot: {
        patient: { age: 34 },
        filled_slots: HIGH_EVIDENCE_SLOTS,
        missing_slots: [],
        target_slot: 'aggravating_factors',
      },
      differential_diagnosis: [
        { name: 'tension headache', likelihood: 'most_likely' },
      ],
      confidence_score: 82,
      clinical_summary: {},
      clinical_reasoning: {},
      validation_reason: 'validated',
      workflow_metadata: { source: 'libertymd-diagnosis' },
    }

    const { ctx, ops } = createFakeContext({
      consultation: consultationRow({
        status: 'interviewing',
        turn_count: 5,
        version: 6,
        filled_slots: HIGH_EVIDENCE_SLOTS,
        missing_slots: [],
        target_slot: 'aggravating_factors',
        clinical_evidence_score: 70,
        patient_snapshot: { age: 34 },
        // P1-14 — gate-open fixtures seed once-completed so Diagnosis-path
        // assertions exercise cache/serve, not the comprehension short-circuit.
        workflow_versions: { comprehension_completed: true },
      }),
      claim: { accepted: true, replayed: false, current_version: 6 },
      speculativeDiagnosticRun: speculativeRow,
    })
    try {
      const response = await handleSendMessage(ctx, {
        action: 'send_message',
        consultation_id: 'consultation-1',
        message: 'Nothing else',
        client_message_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0003',
        expected_version: 6,
      })
      assertEquals(response.status, 200)
      const diagnosisCalls = fetchLog.calls.filter((c) => c.url === DIAGNOSIS_WEBHOOK)
      assertEquals(diagnosisCalls.length, 0, 'AC4: cache hit must not await Diagnosis webhook')

      const inserts = opsFor(ops, 'libertymd_diagnostic_runs', 'insert')
      assertEquals(inserts.length, 0, 'R1: no second insert on cache serve')

      const reports = opsFor(ops, 'libertymd_reports', 'insert')
      assertTrue(reports.length >= 1, 'report path used served run (insert-once)')
      assertEquals(opsFor(ops, 'libertymd_reports', 'upsert').length, 0, 'P2-07: no clinical upsert')
      const reportPayload = (Array.isArray(reports[0].payload) ? reports[0].payload[0] : reports[0].payload) as Record<string, unknown>
      assertEquals(reportPayload.final_diagnostic_run_id, 'spec-run-hit', 'serve existing row id')

      const diagnosisEvents = productEventRows(ops).filter((r) => r.event_name === 'diagnosis_attempted')
      assertTrue(diagnosisEvents.length >= 1)
      assertEquals(diagnosisEvents[0].properties?.was_speculative, true)
      assertEquals(diagnosisEvents[0].properties?.served_from_cache, true)
      assertEquals(diagnosisEvents[0].properties?.outcome, 'valid')
    } finally {
      fetchLog.restore()
    }
  })
})

Deno.test('P1-08 AC3 · stale speculative never served → fresh Diagnosis insert is_speculative false', async () => {
  await withEnv('LIBERTYMD_SPECULATIVE_DIAGNOSIS', 'true', async () => {
    const fetchLog = stubFetch((url) => {
      if (url === INTERVIEW_WEBHOOK) {
        return interviewPass({
          target_slot: 'associated_symptoms',
          ready_for_report: true,
          slot_updates: { onset: 'three days ago' },
          missing_slots: [],
        })
      }
      if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
      if (url === DIAGNOSIS_WEBHOOK) return diagnosisPass()
      return okResponse({})
    })

    const staleRow = {
      id: 'spec-run-stale',
      turn_count: 5,
      run_status: 'validated',
      is_speculative: true,
      input_snapshot: {
        patient: { age: 34 },
        filled_slots: HIGH_EVIDENCE_SLOTS,
        missing_slots: [],
        target_slot: 'aggravating_factors',
      },
      differential_diagnosis: [{ name: 'stale dx' }],
      confidence_score: 70,
      clinical_summary: {},
      clinical_reasoning: {},
      validation_reason: 'validated',
      workflow_metadata: {},
    }

    const { ctx, ops } = createFakeContext({
      consultation: consultationRow({
        status: 'interviewing',
        turn_count: 5,
        version: 6,
        filled_slots: HIGH_EVIDENCE_SLOTS,
        missing_slots: [],
        target_slot: 'aggravating_factors',
        clinical_evidence_score: 70,
        patient_snapshot: { age: 34 },
        // P1-14 — see cache-hit fixture: once-completed so stale→fresh Diagnosis runs.
        workflow_versions: { comprehension_completed: true },
      }),
      claim: { accepted: true, replayed: false, current_version: 6 },
      speculativeDiagnosticRun: staleRow,
    })
    try {
      const response = await handleSendMessage(ctx, {
        action: 'send_message',
        consultation_id: 'consultation-1',
        message: 'It started three days ago',
        client_message_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0004',
        expected_version: 6,
      })
      assertEquals(response.status, 200)
      const diagnosisCalls = fetchLog.calls.filter((c) => c.url === DIAGNOSIS_WEBHOOK)
      assertEquals(diagnosisCalls.length, 1, 'stale → fresh Diagnosis')

      const inserts = opsFor(ops, 'libertymd_diagnostic_runs', 'insert')
      assertTrue(inserts.length >= 1, 'fresh insert')
      const payload = (Array.isArray(inserts[0].payload) ? inserts[0].payload[0] : inserts[0].payload) as Record<string, unknown>
      assertEquals(payload.is_speculative, false, 'acted-upon fresh is_speculative false')

      const diagnosisEvents = productEventRows(ops).filter((r) => r.event_name === 'diagnosis_attempted')
      assertEquals(diagnosisEvents[0].properties?.was_speculative, false)
      assertEquals(diagnosisEvents[0].properties?.served_from_cache, false)

      const reports = opsFor(ops, 'libertymd_reports', 'insert')
      if (reports.length) {
        const reportPayload = (Array.isArray(reports[0].payload) ? reports[0].payload[0] : reports[0].payload) as Record<string, unknown>
        assertEquals(reportPayload.final_diagnostic_run_id === 'spec-run-stale', false, 'never insert report from discarded speculative')
      }
      assertEquals(opsFor(ops, 'libertymd_reports', 'upsert').length, 0, 'P2-07: no clinical upsert')
    } finally {
      fetchLog.restore()
    }
  })
})

Deno.test('P1-08 AC6 · volume delta: flag on vs off on near-gate continue', async () => {
  let offCount = 0
  let onCount = 0
  await withEnv('LIBERTYMD_SPECULATIVE_DIAGNOSIS', null, async () => {
    const fetchLog = stubFetch((url) => {
      if (url === INTERVIEW_WEBHOOK) {
        return interviewPass({
          target_slot: 'aggravating_factors',
          slot_updates: {},
          missing_slots: [],
          ready_for_report: false,
        })
      }
      if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
      if (url === DIAGNOSIS_WEBHOOK) return diagnosisPass()
      return okResponse({})
    })
    const { ctx } = createFakeContext({
      consultation: consultationRow({
        status: 'interviewing',
        turn_count: 4,
        version: 5,
        filled_slots: HIGH_EVIDENCE_SLOTS,
        missing_slots: [],
        target_slot: 'relevant_history',
        clinical_evidence_score: 70,
        patient_snapshot: { age: 34 },
      }),
      claim: { accepted: true, replayed: false, current_version: 5 },
    })
    try {
      await handleSendMessage(ctx, {
        action: 'send_message',
        consultation_id: 'consultation-1',
        message: 'Nothing else',
        client_message_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee00aa',
        expected_version: 5,
      })
      await flushMixpanelFanOutForTests()
      offCount = fetchLog.calls.filter((c) => c.url === DIAGNOSIS_WEBHOOK).length
    } finally {
      fetchLog.restore()
    }
  })
  await withEnv('LIBERTYMD_SPECULATIVE_DIAGNOSIS', 'true', async () => {
    const fetchLog = stubFetch((url) => {
      if (url === INTERVIEW_WEBHOOK) {
        return interviewPass({
          target_slot: 'aggravating_factors',
          slot_updates: {},
          missing_slots: [],
          ready_for_report: false,
        })
      }
      if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
      if (url === DIAGNOSIS_WEBHOOK) return diagnosisPass()
      return okResponse({})
    })
    const { ctx } = createFakeContext({
      consultation: consultationRow({
        status: 'interviewing',
        turn_count: 4,
        version: 5,
        filled_slots: HIGH_EVIDENCE_SLOTS,
        missing_slots: [],
        target_slot: 'relevant_history',
        clinical_evidence_score: 70,
        patient_snapshot: { age: 34 },
      }),
      claim: { accepted: true, replayed: false, current_version: 5 },
    })
    try {
      await handleSendMessage(ctx, {
        action: 'send_message',
        consultation_id: 'consultation-1',
        message: 'Nothing else',
        client_message_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee00bb',
        expected_version: 5,
      })
      await flushMixpanelFanOutForTests()
      onCount = fetchLog.calls.filter((c) => c.url === DIAGNOSIS_WEBHOOK).length
    } finally {
      fetchLog.restore()
    }
  })
  assertEquals(offCount, 0, 'flag off: 0 Diagnosis posts')
  assertEquals(onCount, 1, 'flag on: +1 Diagnosis post on near-gate continue')
  assertEquals(onCount - offCount, 1, 'AC6 expected extra calls = +1 per pre-warm-eligible continue')
})

Deno.test('P2-07 AC2/AC7 · existing report short-circuit: no Diagnosis, no rewrite, no second report_ready', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === INTERVIEW_WEBHOOK) {
      return interviewPass({
        target_slot: 'associated_symptoms',
        ready_for_report: true,
        slot_updates: {},
        missing_slots: [],
      })
    }
    if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
    if (url === DIAGNOSIS_WEBHOOK) return diagnosisPass()
    return okResponse({})
  })

  const storedBody = {
    differential_diagnosis: [{ name: 'stored first insert', likelihood: 'most_likely' }],
    soap_note: { subjective: 'stored', objective: 'x', assessment: 'x', plan: 'x' },
  }
  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({
      status: 'interviewing',
      turn_count: 5,
      version: 6,
      filled_slots: HIGH_EVIDENCE_SLOTS,
      missing_slots: [],
      target_slot: 'aggravating_factors',
      clinical_evidence_score: 70,
      patient_snapshot: { age: 34 },
      workflow_versions: { comprehension_completed: true },
    }),
    claim: { accepted: true, replayed: false, current_version: 6 },
    report: {
      id: 'report-existing',
      consultation_id: 'consultation-1',
      user_id: 'user-1',
      report_data: storedBody,
      confidence_score: 88,
      final_diagnostic_run_id: 'run-first-insert',
      access_status: 'withheld',
      model_metadata: { source: 'libertymd-diagnosis', turn_count: 6 },
    },
    reportGateMessage: true,
  })
  try {
    const response = await handleSendMessage(ctx, {
      action: 'send_message',
      consultation_id: 'consultation-1',
      message: 'Nothing else',
      client_message_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee00c2',
      expected_version: 6,
    })
    assertEquals(response.status, 200)
    const body = await response.json() as {
      report_ready?: boolean
      report?: { differential_diagnosis?: Array<{ name?: string }> }
      confidence_score?: number
    }
    assertEquals(body.report_ready, true)
    assertEquals(body.report?.differential_diagnosis?.[0]?.name, 'stored first insert')
    assertEquals(body.confidence_score, 88)

    const diagnosisCalls = fetchLog.calls.filter((c) => c.url === DIAGNOSIS_WEBHOOK)
    assertEquals(diagnosisCalls.length, 0, 'AC4/Q4: no Diagnosis re-call on existing report')

    assertEquals(opsFor(ops, 'libertymd_reports', 'insert').length, 0, 'no second insert')
    assertEquals(opsFor(ops, 'libertymd_reports', 'upsert').length, 0, 'no upsert clobber')

    const readyEvents = productEventRows(ops).filter((r) => r.event_name === 'report_ready')
    assertEquals(readyEvents.length, 0, 'no second report_ready')
    const gateEvents = productEventRows(ops).filter((r) => r.event_name === 'report_gate_reached')
    assertEquals(gateEvents.length, 0, 'no second report_gate_reached')

    const gateMessages = opsFor(ops, 'libertymd_messages', 'insert').filter((op) => {
      const payload = (Array.isArray(op.payload) ? op.payload[0] : op.payload) as Record<string, unknown>
      return payload?.message_type === 'report_gate'
    })
    assertEquals(gateMessages.length, 0, 'skip duplicate report_gate message')
  } finally {
    fetchLog.restore()
  }
})

Deno.test('P2-07 AC7 · serve-eligible speculative still first-inserts (no historical non-spec override)', async () => {
  await withEnv('LIBERTYMD_SPECULATIVE_DIAGNOSIS', 'true', async () => {
    const fetchLog = stubFetch((url) => {
      if (url === INTERVIEW_WEBHOOK) {
        return interviewPass({
          target_slot: 'associated_symptoms',
          ready_for_report: true,
          slot_updates: {},
          missing_slots: [],
        })
      }
      if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
      if (url === DIAGNOSIS_WEBHOOK) return diagnosisPass()
      return okResponse({})
    })

    const speculativeRow = {
      id: 'spec-run-preferred',
      turn_count: 5,
      run_status: 'validated',
      is_speculative: true,
      input_snapshot: {
        patient: { age: 34 },
        filled_slots: HIGH_EVIDENCE_SLOTS,
        missing_slots: [],
        target_slot: 'aggravating_factors',
      },
      differential_diagnosis: [{ name: 'speculative current-turn', likelihood: 'most_likely' }],
      confidence_score: 82,
      clinical_summary: {},
      clinical_reasoning: {},
      validation_reason: 'validated',
      workflow_metadata: { source: 'libertymd-diagnosis' },
    }

    const { ctx, ops } = createFakeContext({
      consultation: consultationRow({
        status: 'interviewing',
        turn_count: 5,
        version: 6,
        filled_slots: HIGH_EVIDENCE_SLOTS,
        missing_slots: [],
        target_slot: 'aggravating_factors',
        clinical_evidence_score: 70,
        patient_snapshot: { age: 34 },
        workflow_versions: { comprehension_completed: true },
        // Prior acted-upon intermediate_diagnoses exist but must not invent a
        // historical non-spec scan at report write time (Q2c).
        intermediate_diagnoses: [{ name: 'older non-spec dx' }],
      }),
      claim: { accepted: true, replayed: false, current_version: 6 },
      speculativeDiagnosticRun: speculativeRow,
    })
    try {
      const response = await handleSendMessage(ctx, {
        action: 'send_message',
        consultation_id: 'consultation-1',
        message: 'Nothing else',
        client_message_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee00c7',
        expected_version: 6,
      })
      assertEquals(response.status, 200)
      assertEquals(fetchLog.calls.filter((c) => c.url === DIAGNOSIS_WEBHOOK).length, 0)

      const reports = opsFor(ops, 'libertymd_reports', 'insert')
      assertEquals(reports.length, 1, 'exactly one insert')
      const reportPayload = (Array.isArray(reports[0].payload) ? reports[0].payload[0] : reports[0].payload) as Record<string, unknown>
      assertEquals(reportPayload.final_diagnostic_run_id, 'spec-run-preferred')
      assertEquals(opsFor(ops, 'libertymd_reports', 'upsert').length, 0)
    } finally {
      fetchLog.restore()
    }
  })
})

Deno.test('P1-14 regression · capped comprehension acknowledgement generates the report after closure', async () => {
  const fetchLog = stubFetch((url) => {
    if (url === GUARDRAIL_WEBHOOK) return guardrailPass()
    if (url === DIAGNOSIS_WEBHOOK) return diagnosisPass()
    if (url === INTERVIEW_WEBHOOK) {
      throw new Error('A comprehension acknowledgement must not ask another interview question')
    }
    return okResponse({})
  })

  const { ctx, ops } = createFakeContext({
    consultation: consultationRow({
      status: 'interviewing',
      turn_count: MAX_TURNS,
      version: MAX_TURNS,
      filled_slots: HIGH_EVIDENCE_SLOTS,
      missing_slots: [],
      target_slot: 'functional_impact',
      clinical_evidence_score: 100,
      patient_snapshot: { age: 34, sex_at_birth: 'female' },
      workflow_versions: { comprehension_pending: true },
    }),
    claim: { accepted: true, replayed: false, current_version: MAX_TURNS },
  })

  try {
    const response = await handleSendMessage(ctx, {
      action: 'send_message',
      consultation_id: 'consultation-1',
      message: 'Looks good',
      client_message_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee00f1',
      expected_version: MAX_TURNS,
      comprehension_ack: true,
    })
    await flushMixpanelFanOutForTests()

    const body = await response.json() as {
      state?: string
      report_ready?: boolean
      diagnosis_ran?: boolean
      turn_count?: number
    }
    assertEquals(response.status, 200, 'post-closure report response')
    assertEquals(body.state, 'report_pending_auth', 'anonymous report reaches soft gate')
    assertEquals(body.report_ready, true, 'report generated after closure')
    assertEquals(body.diagnosis_ran, true, 'final diagnosis ran')
    assertEquals(body.turn_count, MAX_TURNS, 'control acknowledgement does not exceed cap')
    assertEquals(
      fetchLog.calls.filter((call) => call.url === INTERVIEW_WEBHOOK).length,
      0,
      'no extra interview after conversation closure',
    )
    assertEquals(
      fetchLog.calls.filter((call) => call.url === DIAGNOSIS_WEBHOOK).length,
      1,
      'one post-closure diagnosis',
    )
    assertEquals(opsFor(ops, 'libertymd_reports', 'insert').length, 1, 'one report insert')

    const consultationUpdates = opsFor(ops, 'libertymd_consultations', 'update')
      .map((op) => op.payload as Record<string, unknown>)
    assertTrue(
      consultationUpdates.some((payload) => payload.status === 'report_pending_auth'),
      'consultation reaches report terminal state',
    )
    assertTrue(
      !consultationUpdates.some((payload) => payload.status === 'clinical_review_needed'),
      'missing pre-existing report must not become clinical_review_needed',
    )
    assertTrue(
      consultationUpdates.some((payload) => {
        const workflow = payload.workflow_versions as Record<string, unknown> | undefined
        return workflow?.comprehension_completed === true && workflow?.comprehension_pending === false
      }),
      'conversation closure is persisted before report generation',
    )
  } finally {
    fetchLog.restore()
  }
})
