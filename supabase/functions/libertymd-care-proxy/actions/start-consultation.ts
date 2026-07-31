/**
 * `start_consultation` — the first symptom description.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 *
 * Emergency guidance precedes everything: the guardrail runs concurrently with
 * the consultation insert, and a force_end verdict short-circuits to emergency
 * copy with no gate of any kind in front of it.
 */
import { addMessage } from '../lib/consultations.ts'
import { jsonResponse } from '../lib/errors.ts'
import { getOrCreateSelfPatient } from '../lib/profiles.ts'
import { runGuardrail, saveSafetyEvent } from '../lib/safety.ts'
import { CORE_SLOTS } from '../lib/slots.ts'
import { addProductEvent } from '../lib/telemetry.ts'
import { addDays, cleanMessage, limitConsultationMessage, patientPayload, timed } from '../lib/utils.ts'
import type { ProxyContext } from '../lib/context.ts'
import { isTechnicalSafetySource, type GuardrailResult, type JsonObject, type RequestPayload } from '../lib/types.ts'

function acknowledgement(symptom: string, risk: GuardrailResult) {
  const condition = /\bfever\b/i.test(symptom) ? 'your fever' : 'your symptoms'
  // Defect 2 / P0-14f: transport failures still fail-cautious as high_risk_continue,
  // but that must never write a clinical caution sentence into the transcript.
  const genuineClinicalCaution = risk.status === 'high_risk_continue'
    && risk.severity !== 'technical'
    && !isTechnicalSafetySource(risk.source)
  const caution = genuineClinicalCaution
    ? ' I also noticed details that deserve extra caution, so I will keep checking for urgent warning signs.'
    : ''
  return limitConsultationMessage(`Thank you for reaching out. I'm here to help you feel better and address ${condition} as thoroughly as possible.${caution}\n\nTo give you the most accurate advice and ensure your care is personalized, could you please tell me your age and biological sex? This information helps me consider the best recommendations for your specific situation. Rest assured, anything you share will remain private and confidential.`)
}

export async function handleStartConsultation(ctx: ProxyContext, payload: RequestPayload) {
  const { db, user, isAnonymous, requestStartedAt } = ctx
  const message = cleanMessage(payload.message)
  if (!message) return jsonResponse({ error: 'Please describe the symptom' }, 400)
  const patientTiming = await timed(() => getOrCreateSelfPatient(ctx))
  const patient = patientTiming.value
  const slots = { chief_complaint: message }
  const initialHistory = [{ role: 'user', content: message, message_type: 'message' }]
  // P0-14e: no timeout argument. Turn 1 uses the same guardrail budget as every
  // later turn (lib/config.ts N8N_TIMEOUT_MS.guardrail). It used to pass 2_000,
  // putting the tightest safety budget on the turn most likely to carry an
  // untriaged emergency.
  const [guardrailTiming, consultationTiming] = await Promise.all([
    timed(() => runGuardrail(message, initialHistory, patientPayload(patient), slots)),
    timed(async () => await db
      .from('libertymd_consultations')
      .insert({
        user_id: user.id,
        patient_id: patient.id,
        patient_snapshot: {
          patient_id: patient.id,
          relationship: patient.relationship,
          age: patient.age,
          sex_at_birth: patient.sex_at_birth,
        },
        status: 'awaiting_demographics',
        region: payload.region === 'EU' ? 'EU' : 'US',
        chief_complaint: message,
        turn_count: 1,
        filled_slots: slots,
        missing_slots: CORE_SLOTS,
        retention_expires_at: isAnonymous ? addDays(30) : null,
        workflow_versions: { guardrail: 'libertymd-v1', interview: 'libertymd-v1', diagnosis: 'libertymd-v2' },
      })
      .select('*')
      .single()),
  ])
  const guardrail = guardrailTiming.value
  const consultationResult = consultationTiming.value
  const { data: consultation, error } = consultationResult
  if (error) throw error
  if (!consultation) throw new Error('Unable to create consultation')

  const updateConsultation = async (values: JsonObject) => {
    const { error: updateError } = await db
      .from('libertymd_consultations')
      .update(values)
      .eq('id', consultation.id)
      .eq('user_id', user.id)
    if (updateError) throw updateError
  }
  const initialPersistenceTiming = await timed(() => Promise.all([
      addProductEvent(ctx, 'consultation_started', consultation.id, {
        region: payload.region === 'EU' ? 'EU' : 'US',
        is_anonymous: isAnonymous,
      }),
      addMessage(ctx, consultation.id, 'user', message, {
        slot_updates: slots,
        target_slot: 'chief_complaint',
      }),
      saveSafetyEvent(ctx, consultation, guardrail, 1),
    ]))

  if (guardrail.force_end) {
    const assistantPersistenceTiming = await timed(() => Promise.all([
      addMessage(ctx, consultation.id, 'assistant', guardrail.message, { message_type: 'safety' }),
      updateConsultation({
        status: 'emergency_stopped',
        safety_state: guardrail.raw,
        last_activity_at: new Date().toISOString(),
      }),
      addProductEvent(ctx, 'emergency_stopped', consultation.id, { turn_count: 1, source: guardrail.source }),
    ]))
    return jsonResponse({
      consultation_id: consultation.id,
      emergency: true,
      safety: guardrail,
      message: guardrail.message,
      version: consultation.version,
      timings: {
        auth_and_request_ms: Math.max(0, Math.round(performance.now() - requestStartedAt)
          - patientTiming.ms
          - Math.max(guardrailTiming.ms, consultationTiming.ms)
          - initialPersistenceTiming.ms
          - assistantPersistenceTiming.ms),
        patient_lookup_ms: patientTiming.ms,
        guardrail_ms: guardrailTiming.ms,
        consultation_insert_ms: consultationTiming.ms,
        initial_persistence_ms: initialPersistenceTiming.ms,
        assistant_persistence_ms: assistantPersistenceTiming.ms,
        total_ms: Math.round(performance.now() - requestStartedAt),
      },
    })
  }

  const prompt = acknowledgement(message, guardrail)
  const assistantPersistenceTiming = await timed(() => Promise.all([
    addMessage(ctx, consultation.id, 'assistant', prompt, {
      message_type: 'demographics',
      metadata: { safety_status: guardrail.status },
    }),
    updateConsultation({
      safety_state: { ...guardrail.raw, status: guardrail.status, risk_level: guardrail.risk_level },
      last_activity_at: new Date().toISOString(),
    }),
  ]))

  return jsonResponse({
    consultation_id: consultation.id,
    state: 'awaiting_demographics',
    acknowledgement: prompt,
    safety: guardrail.status === 'high_risk_continue' ? guardrail : null,
    version: consultation.version,
    timings: {
      auth_and_request_ms: Math.max(0, Math.round(performance.now() - requestStartedAt)
        - patientTiming.ms
        - Math.max(guardrailTiming.ms, consultationTiming.ms)
        - initialPersistenceTiming.ms
        - assistantPersistenceTiming.ms),
      patient_lookup_ms: patientTiming.ms,
      guardrail_ms: guardrailTiming.ms,
      consultation_insert_ms: consultationTiming.ms,
      initial_persistence_ms: initialPersistenceTiming.ms,
      assistant_persistence_ms: assistantPersistenceTiming.ms,
      total_ms: Math.round(performance.now() - requestStartedAt),
    },
  })
}
