/**
 * `save_demographics` — age, sex at birth, consent, then the next interview turn.
 *
 * This is the 35% wall (BASELINE / journey work). Lane F owns this module.
 * Adults-only is enforced here deterministically (18–120), not by prompt.
 *
 * ## Safety screening on this turn — P0-14d + P1-01
 *
 * This turn accepts user input and advances the consult, so it is screened and
 * it writes a `libertymd_safety_events` row like every other turn. Before
 * P0-14d it did neither: the guardrail was never called here and the safety
 * state was silently inherited from turn 1.
 *
 * **P1-01:** the unified entry screen sends free-text `message` (the answer to
 * the first interview question obtained on start). The proxy requires a
 * non-empty trimmed answer, binds it to the consultation's pre-start
 * `target_slot`, screens it, then runs Interview for the *following* question.
 * Clients already handle `force_end` on this turn (Defect 1 / AC0) — emergency
 * copy first, terminal stop, no `next_question` fall-through.
 *
 * Consent: three `accepted` rows (`terms_of_service`, `privacy_policy`,
 * `ai_care_disclosure`). Unchecked consent blocks submit client-side; this
 * handler does not write `declined` rows.
 */
import { addMessage, getHistory, getOwnedConsultation, updateOwnedConsultation } from '../lib/consultations.ts'
import {
  ADULTS_ONLY_CODE,
  SAFE_ADULTS_ONLY,
  ageRangeErrorMessage,
  jsonResponse,
} from '../lib/errors.ts'
import { asClinicalLanguage } from '../lib/journey-locale.ts'
import { isInterviewHoldingSource, n8nBreakerSnapshot, runInterview } from '../lib/n8n-client.ts'
import { LIBERTYMD_MIN_PATIENT_AGE } from '../lib/profiles.ts'
import { runGuardrail, saveSafetyEvent, toClientSafety, unscreenedTurnResult } from '../lib/safety.ts'
import { calculateMissingSlots } from '../lib/slots.ts'
import { addProductEvent, emitInferenceFailed, scoreBucket, type InferenceErrorClass } from '../lib/telemetry.ts'
import { cleanMessage, patientPayload } from '../lib/utils.ts'
import { CONSENT_VERSION } from '../lib/config.ts'
import { assessClinicalEvidence } from '../clinical-policy.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { JsonObject, PatientRow, RequestPayload } from '../lib/types.ts'

const FALLBACK_TARGET_SLOT = 'onset'

export async function handleSaveDemographics(ctx: ProxyContext, payload: RequestPayload) {
  const { db, user } = ctx
  if (!payload.consultation_id) return jsonResponse({ error: 'Missing consultation id' }, 400)
  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)
  if (consultation.status !== 'awaiting_demographics') return jsonResponse({ error: 'Demographics were already submitted' }, 409)
  const clinicalLanguage = asClinicalLanguage(consultation.language)
  ctx.clinicalLocale = clinicalLanguage
  const age = Number(payload.age)
  const sex = String(payload.sex_at_birth || '')
  // BO 2026-08-01 — the demographics card is demographics-only again, so a
  // clinical answer is now OPTIONAL here. When the client still sends one
  // (older bundles, or a future combined layout) it is bound to the pre-start
  // slot exactly as before; when it is absent the interview simply asks the
  // first question on the next turn. Was: P1-01 Q4 hard requirement.
  const freeText = cleanMessage(payload.message)
  // P1-05 Q2/Q5 — under-floor → adults_only + care pointer; other invalid → neutral range.
  if (Number.isInteger(age) && age < LIBERTYMD_MIN_PATIENT_AGE) {
    return jsonResponse(
      { code: ADULTS_ONLY_CODE, error: SAFE_ADULTS_ONLY, severity: 'technical' },
      400,
    )
  }
  if (!Number.isInteger(age) || age > 120) {
    return jsonResponse({ error: ageRangeErrorMessage(LIBERTYMD_MIN_PATIENT_AGE) }, 400)
  }
  if (!['female', 'male', 'intersex', 'prefer_not_to_say'].includes(sex)) return jsonResponse({ error: 'Choose a valid sex option' }, 400)

  const snapshot = consultation.patient_snapshot && typeof consultation.patient_snapshot === 'object'
    ? consultation.patient_snapshot as JsonObject
    : {}
  const wasPrefilled = Number(snapshot.age) >= LIBERTYMD_MIN_PATIENT_AGE
    && Number(snapshot.age) <= 120
    && typeof snapshot.sex_at_birth === 'string'
    && Boolean(String(snapshot.sex_at_birth).trim())

  const now = new Date().toISOString()
  const { data: profile, error: profileError } = await db
    .from('libertymd_profiles')
    .update({ age, sex_at_birth: sex, consent_version: CONSENT_VERSION, consented_at: now })
    .eq('user_id', user.id)
    .select('*')
    .single()
  if (profileError) throw profileError

  const { data: patient, error: patientError } = await db
    .from('libertymd_patients')
    .update({ age, sex_at_birth: sex })
    .eq('id', consultation.patient_id)
    .eq('owner_user_id', user.id)
    .select('*')
    .single()
  if (patientError) throw patientError

  const consentRows = ['terms_of_service', 'privacy_policy', 'ai_care_disclosure'].map((consentType) => ({
    user_id: user.id,
    patient_id: consultation.patient_id,
    consultation_id: consultation.id,
    consent_type: consentType,
    consent_version: CONSENT_VERSION,
    decision: 'accepted',
    source: 'demographics_submit',
  }))
  const { error: consentError } = await db.from('libertymd_consent_events').insert(consentRows)
  if (consentError) throw consentError

  // P1-15 Q4 — thin product funnel event alongside consent ledger (no age/sex).
  await addProductEvent(ctx, 'consent_recorded', consultation.id, {
    consent_version: CONSENT_VERSION,
    method: 'demographics_submit',
  })

  const answerSlot = (() => {
    const slot = String(consultation.target_slot || '').trim()
    return slot && slot !== 'none' ? slot : FALLBACK_TARGET_SLOT
  })()
  // Bind free text to the pre-start slot (Q1A / AC5) when one was sent, then the
  // interview asks the following question. With the demographics-only card the
  // slot stays unfilled and the interview asks the *first* question instead.
  const slots = {
    ...(consultation.filled_slots || {}),
    age,
    sex_at_birth: sex,
    ...(freeText ? { [answerSlot]: freeText } : {}),
  }
  const missingBeforeInterview = calculateMissingSlots(slots)
  const previousTargetSlot = freeText ? answerSlot : null

  await addMessage(ctx, consultation.id, 'user', `Age ${age}; sex assigned at birth: ${sex.replaceAll('_', ' ')}`, {
    message_type: 'demographics',
    slot_updates: { age, sex_at_birth: sex },
  })
  // The user's input is sacred: retain the clinical answer before anything can
  // fail. Only when one was actually supplied — a demographics-only submit has
  // no clinical content to persist and must not fabricate a turn.
  if (freeText) {
    await addMessage(ctx, consultation.id, 'user', freeText, {
      message_type: 'normal',
      target_slot: answerSlot,
      slot_updates: { [answerSlot]: freeText },
    })

    // P1-15 S3 — first answer completed on demographics (turn_count unchanged = 1).
    await addProductEvent(ctx, 'turn_completed', consultation.id, {
      turn_index: consultation.turn_count,
      target_slot: answerSlot,
    })
  }

  const history = await getHistory(ctx, consultation.id)
  // P0-07 Q1 — no client_message_id on demographics; one ephemeral UUID for this invocation.
  const correlationId = crypto.randomUUID()
  // Guardrail and interview run concurrently — separate failure domains, as in
  // send_message. The interview result is discarded on force_end.
  const [guardrail, interview] = await Promise.all([
    // P0-14d AC3/AC5 — a demographics-only submit carries no free text, so there
    // is nothing to screen. Record the unscreened verdict rather than sending an
    // empty string to the guardrail: every input-accepting turn still leaves an
    // auditable safety row, and "this turn was never screened" stays a fact in
    // the ledger rather than a silent pass.
    freeText
      ? runGuardrail(
        freeText,
        history,
        patientPayload(patient as PatientRow),
        slots,
        undefined,
        correlationId,
        {
          db: ctx.db,
          region: consultation.region ?? 'US',
          language: consultation.language ?? 'en',
        },
      )
      : Promise.resolve(unscreenedTurnResult('demographics_only_submit')),
    runInterview(
      history,
      patientPayload(patient as PatientRow),
      slots,
      missingBeforeInterview,
      previousTargetSlot,
      consultation.turn_count,
      consultation.status,
      consultation.id,
      correlationId,
      clinicalLanguage,
    ),
  ])
  // Persist the safety verdict FIRST, before any interview decision is acted on.
  // The demographics turn does not increment turn_count (unchanged), so this row
  // shares turn_count with turn 1 and is distinguished by `source` and created_at.
  await saveSafetyEvent(
    ctx,
    consultation,
    guardrail,
    consultation.turn_count,
    { message: freeText, history, patient: patientPayload(patient as PatientRow) },
    correlationId,
  )

  await addProductEvent(ctx, 'guardrail_evaluated', consultation.id, {
    status: guardrail.status,
    risk_level: guardrail.risk_level,
    source: guardrail.source,
    turn_index: consultation.turn_count,
    shadow_llm_status: 'disabled',
  })

  if (guardrail.source === 'error_fail_cautious') {
    const failure = guardrail.raw?.failure
    const errorClass: InferenceErrorClass = failure === 'timeout'
      ? 'timeout'
      : failure === 'malformed_payload'
        ? 'malformed_payload'
        : 'http_error'
    await emitInferenceFailed(ctx, consultation.id, {
      stage: 'guardrail',
      error_class: errorClass,
      outcome: 'fail_cautious',
    })
  }

  if (guardrail.force_end) {
    // Emergency guidance precedes everything, including the interview question.
    await addMessage(ctx, consultation.id, 'assistant', guardrail.message, { message_type: 'safety' })
    await updateOwnedConsultation(ctx, consultation, {
      status: 'emergency_stopped',
      filled_slots: slots,
      safety_state: guardrail.raw,
      patient_snapshot: {
        patient_id: consultation.patient_id,
        relationship: patient.relationship,
        age,
        sex_at_birth: sex,
      },
      last_activity_at: now,
    })
    // The demographics *were* saved — the funnel event still belongs here.
    await addProductEvent(ctx, 'demographics_saved', consultation.id, {
      patient_relationship: patient.relationship,
      consent_version: CONSENT_VERSION,
      was_prefilled: wasPrefilled,
    })
    await addProductEvent(ctx, 'emergency_stopped', consultation.id, {
      turn_count: consultation.turn_count,
      source: guardrail.source,
    })
    return jsonResponse({
      consultation_id: consultation.id,
      state: 'emergency_stopped',
      emergency: true,
      safety: toClientSafety(guardrail),
      message: guardrail.message,
      emergency_copy: guardrail.emergency_copy ?? null,
      version: consultation.version,
    })
  }

  // P0-08 Q2 — interview transport/malformed → holding, never write fabricated clinical copy.
  if (isInterviewHoldingSource(interview.source)) {
    const errorClass: InferenceErrorClass = interview.source === 'breaker_open' ? 'breaker_open' : 'unavailable'
    await emitInferenceFailed(ctx, consultation.id, {
      stage: 'interview',
      error_class: errorClass,
      outcome: 'holding',
    })
    const snapshotBreaker = n8nBreakerSnapshot().find((entry) => entry.stage === 'interview')
    return jsonResponse({
      consultation_id: consultation.id,
      state: consultation.status,
      holding: true,
      severity: 'technical',
      retryable: true,
      retry_after_ms: snapshotBreaker?.retry_after_ms || 0,
      turn_count: consultation.turn_count,
      next_question: null,
      message: 'We have paused for a moment because the care service is not responding. Nothing you typed is lost, and this will pick up exactly where it left off.',
      version: consultation.version,
    }, 503)
  }

  const mergedSlots = { ...slots, ...interview.slot_updates }
  const missingSlots = interview.missing_slots.length ? interview.missing_slots : calculateMissingSlots(mergedSlots)
  const evidence = assessClinicalEvidence(mergedSlots)
  // Never downgrade: an inherited high_risk_continue from turn 1 still wins even
  // if this turn screened clean, and a fresh high_risk_continue escalates.
  const nextStatus = consultation.safety_state?.status === 'high_risk_continue'
    || guardrail.status === 'high_risk_continue'
    ? 'high_risk'
    : 'interviewing'

  await addMessage(ctx, consultation.id, 'assistant', interview.next_question, {
    options: interview.options,
    target_slot: interview.target_slot,
    slot_updates: interview.slot_updates,
    metadata: { workflow_source: interview.source, safety_status: guardrail.status },
  })
  const consultationUpdate: JsonObject = {
    status: nextStatus,
    filled_slots: mergedSlots,
    missing_slots: missingSlots,
    target_slot: interview.target_slot,
    patient_snapshot: {
      patient_id: consultation.patient_id,
      relationship: patient.relationship,
      age,
      sex_at_birth: sex,
    },
    clinical_evidence_score: evidence.score,
    last_activity_at: now,
  }
  // `safety_state` is only written when this turn actually escalated. An
  // unscreened or clean demographics turn must not overwrite turn 1's verdict —
  // that would be a silent downgrade of the very state P0-14d exists to protect.
  if (guardrail.status === 'high_risk_continue') {
    consultationUpdate.safety_state = { ...guardrail.raw, status: guardrail.status, risk_level: guardrail.risk_level }
  }
  await updateOwnedConsultation(ctx, consultation, consultationUpdate)
  await addProductEvent(ctx, 'demographics_saved', consultation.id, {
    patient_relationship: patient.relationship,
    consent_version: CONSENT_VERSION,
    was_prefilled: wasPrefilled,
  })

  const nextSlot = String(interview.target_slot || '').trim()
  const nextSlotId = nextSlot && nextSlot !== 'none' ? nextSlot : FALLBACK_TARGET_SLOT
  const nextOptions = Array.isArray(interview.options) ? interview.options : []
  await addProductEvent(ctx, 'question_served', consultation.id, {
    turn_index: consultation.turn_count,
    target_slot: nextSlotId,
    had_options: nextOptions.length > 0,
    was_repeat: false,
    ...(Number.isFinite(evidence.score) ? { evidence_bucket: scoreBucket(evidence.score) } : {}),
  })

  return jsonResponse({
    consultation_id: consultation.id,
    state: nextStatus,
    next_question: interview.next_question,
    options: interview.options,
    target_slot: interview.target_slot,
    missing_slots: missingSlots,
    evidence_score: evidence.score,
    turn_count: consultation.turn_count,
    diagnosis_ran: false,
    safety: guardrail.status === 'high_risk_continue' ? toClientSafety(guardrail) : null,
  })
}
