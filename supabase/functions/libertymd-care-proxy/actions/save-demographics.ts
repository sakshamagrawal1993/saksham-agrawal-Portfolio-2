/**
 * `save_demographics` — age, sex at birth, consent, then the first interview turn.
 *
 * This is the 35% wall (BASELINE / journey work). Lane F owns this module.
 * Adults-only is enforced here deterministically (18–120), not by prompt.
 *
 * ## Safety screening on this turn — P0-14d
 *
 * This turn accepts user input and advances the consult, so it is screened and
 * it writes a `libertymd_safety_events` row like every other turn. Before
 * P0-14d it did neither: the guardrail was never called here and the safety
 * state was silently inherited from turn 1.
 *
 * **Finding, recorded rather than papered over (AC5):** as of 2026-07-30
 * *neither shipped client sends free text on this turn.* Both
 * `LibertyMDChat.submitDemographics` and `LibertyMDApp.submitDemographics` post
 * exactly `{ action, consultation_id, age, sex_at_birth }`, and the message
 * written to history is a server-composed `Age N; sex assigned at birth: X`
 * string. So in today's UI there is genuinely nothing clinical to screen, and
 * calling n8n on a synthesised demographics string would add a 10 s worst-case
 * budget to the highest-drop-off step in the funnel for zero detection value.
 *
 * What is implemented is therefore:
 *   - `payload.message` (already on `RequestPayload`) is now **read**, retained
 *     in history, and screened at the full guardrail budget when present. It
 *     used to be silently discarded — the proxy is a public HTTP surface, so
 *     free text could already arrive here and go unscreened.
 *   - When no free text is supplied, an `unscreenedTurnResult` row is still
 *     written, so "not screened" is a queryable fact and not an absence.
 *
 * When P1-01 adds a free-text field to the demographics card ("value before
 * ask"), the screening path is already live and needs no proxy change. The
 * client-side rendering of a `force_end` on this turn is NOT wired — see
 * §"Deliberately left alone" in tickets/P0-14d-14e/04-implementation.md.
 */
import { addMessage, getHistory, getOwnedConsultation, updateOwnedConsultation } from '../lib/consultations.ts'
import { jsonResponse } from '../lib/errors.ts'
import { runInterview } from '../lib/n8n-client.ts'
import { runGuardrail, saveSafetyEvent, unscreenedTurnResult } from '../lib/safety.ts'
import { calculateMissingSlots } from '../lib/slots.ts'
import { addProductEvent } from '../lib/telemetry.ts'
import { cleanMessage, patientPayload } from '../lib/utils.ts'
import { CONSENT_VERSION } from '../lib/config.ts'
import { assessClinicalEvidence } from '../clinical-policy.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { JsonObject, PatientRow, RequestPayload } from '../lib/types.ts'

export async function handleSaveDemographics(ctx: ProxyContext, payload: RequestPayload) {
  const { db, user } = ctx
  if (!payload.consultation_id) return jsonResponse({ error: 'Missing consultation id' }, 400)
  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)
  if (consultation.status !== 'awaiting_demographics') return jsonResponse({ error: 'Demographics were already submitted' }, 409)
  const age = Number(payload.age)
  const sex = String(payload.sex_at_birth || '')
  // Any free text the user volunteered alongside age/sex. Empty for both shipped
  // clients today; see the module header.
  const freeText = cleanMessage(payload.message)
  if (!Number.isInteger(age) || age < 18 || age > 120) return jsonResponse({ error: 'Enter an age from 18 to 120' }, 400)
  if (!['female', 'male', 'intersex', 'prefer_not_to_say'].includes(sex)) return jsonResponse({ error: 'Choose a valid sex option' }, 400)

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

  const slots = { ...(consultation.filled_slots || {}), age, sex_at_birth: sex }
  await addMessage(ctx, consultation.id, 'user', `Age ${age}; sex assigned at birth: ${sex.replaceAll('_', ' ')}`, {
    message_type: 'demographics',
    slot_updates: { age, sex_at_birth: sex },
  })
  // The user's input is sacred: retain volunteered free text before anything can
  // fail, and retain it as its own message so the demographics row stays exactly
  // as it was for the existing flows.
  if (freeText) {
    await addMessage(ctx, consultation.id, 'user', freeText, {
      message_type: 'normal',
      target_slot: consultation.target_slot,
    })
  }

  const history = await getHistory(ctx, consultation.id)
  // Guardrail and interview run concurrently — separate failure domains, as in
  // send_message. The interview result is discarded on force_end.
  const [guardrail, interview] = await Promise.all([
    freeText
      ? runGuardrail(freeText, history, patientPayload(patient as PatientRow), slots)
      : Promise.resolve(unscreenedTurnResult('save_demographics carried no user free-text')),
    runInterview(history, patientPayload(patient as PatientRow), slots, consultation.missing_slots, consultation.target_slot, consultation.turn_count),
  ])
  // Persist the safety verdict FIRST, before any interview decision is acted on.
  // The demographics turn does not increment turn_count (unchanged), so this row
  // shares turn_count with turn 1 and is distinguished by `source` and created_at.
  await saveSafetyEvent(ctx, consultation, guardrail, consultation.turn_count)

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
    })
    await addProductEvent(ctx, 'emergency_stopped', consultation.id, {
      turn_count: consultation.turn_count,
      source: guardrail.source,
    })
    return jsonResponse({
      consultation_id: consultation.id,
      state: 'emergency_stopped',
      emergency: true,
      safety: guardrail,
      message: guardrail.message,
      version: consultation.version,
    })
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
  })

  return jsonResponse({
    consultation_id: consultation.id,
    state: nextStatus,
    next_question: interview.next_question,
    options: interview.options,
    target_slot: interview.target_slot,
    missing_slots: missingSlots,
    evidence_score: evidence.score,
    safety: guardrail.status === 'high_risk_continue' ? guardrail : null,
  })
}
