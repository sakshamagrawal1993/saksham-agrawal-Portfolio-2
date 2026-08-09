/**
 * `start_consultation` — the first symptom description.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 *
 * Emergency guidance precedes everything: the guardrail runs concurrently with
 * the consultation insert, and a force_end verdict short-circuits to emergency
 * copy with no gate of any kind in front of it.
 *
 * P1-01: on non-force_end starts, run Interview for the first clinical question,
 * persist `target_slot`, and return `{ next_question, options, target_slot }` so
 * the unified entry screen can show value before demographics submit. A short
 * transcript ack replaces the long “tell me your age…” demographics ask.
 *
 * P1-03: profile-aware bind / skip / picker-first.
 * - activeOwnedCount === 1 + skip-eligible + consent current → seed slots,
 *   skip_reaffirm ledger, advance to interviewing/high_risk + first question.
 * - activeOwnedCount === 1 + incomplete / stale consent → awaiting_demographics
 *   (prefill when age/sex present but consent not current).
 * - activeOwnedCount > 1 without owned patient_id → reject (no last-used guess).
 * - Explicit owned patient_id → bind that patient, then skip or gate per rules.
 */
import { addMessage, getHistory } from '../lib/consultations.ts'
import { CONSENT_VERSION } from '../lib/config.ts'
import { PatientSelectionRequiredError, jsonResponse } from '../lib/errors.ts'
import {
  journeyLocaleConsoleLog,
  resolveJourneyLocale,
} from '../lib/journey-locale.ts'
import { resolveLandingSessionIdForStart } from '../lib/landing-sessions.ts'
import { isInterviewHoldingSource, runInterview } from '../lib/n8n-client.ts'
import {
  getOrCreateSelfPatient,
  getOwnedPatient,
  isSkipEligiblePatient,
  listOwnedActivePatients,
  toPatientListItem,
} from '../lib/profiles.ts'
import { runGuardrail, saveSafetyEvent, toClientSafety } from '../lib/safety.ts'
import { CORE_SLOTS, calculateMissingSlots } from '../lib/slots.ts'
import { addProductEvent, emitInferenceFailed, type InferenceErrorClass } from '../lib/telemetry.ts'
import { addDays, cleanMessage, firstName, limitConsultationMessage, patientPayload, timed } from '../lib/utils.ts'
import type { ProxyContext } from '../lib/context.ts'
import type {
  GuardrailResult,
  JsonObject,
  PatientRow,
  RequestPayload,
} from '../lib/types.ts'
import { isTechnicalSafetySource } from '../lib/types.ts'

/** Deterministic fallback when start interview holds/fails (Q1A) — no fabricated clinical caution. */
const FALLBACK_ENTRY_QUESTION = 'When did this symptom begin?'
const FALLBACK_TARGET_SLOT = 'onset'

/**
 * P3-05 — opaque chip ids only (must match client `libertymd-complaint-chips.ts`).
 * Labels / chief_complaint never appear on product events.
 */
export const CHIP_IDS: ReadonlySet<string> = new Set([
  'sore_throat',
  'cough',
  'fever',
  'headache',
  'stomach_pain',
  'rash',
])

/** Q2 coercion — never omit entry_type on post-ship emits; never emit label prose. */
export function coerceEntryTelemetry(payload: RequestPayload): {
  entry_type: 'chip' | 'freetext'
  chip_id?: string
} {
  const rawType = typeof payload.entry_type === 'string' ? payload.entry_type.trim() : ''
  const rawChip = typeof payload.chip_id === 'string' ? payload.chip_id.trim() : ''
  if (rawType === 'chip' && CHIP_IDS.has(rawChip)) {
    return { entry_type: 'chip', chip_id: rawChip }
  }
  return { entry_type: 'freetext' }
}

/**
 * BO 2026-08-01 — greet a known user by first name on the opening line.
 *
 * `name` comes from the JWT's Google metadata via `firstName(user)`, so it is
 * only ever present for a linked identity; anonymous users keep the neutral
 * greeting. The name is a display token, not clinical content — it is not
 * written into slots, telemetry, or the guardrail payload.
 */
function acknowledgement(symptom: string, risk: GuardrailResult, name?: string | null, language?: string) {
  const isSpanish = String(language || 'en').trim().toLowerCase() === 'es'
  const condition = isSpanish
    ? (/\bfiebre\b/i.test(symptom) ? 'su fiebre' : 'sus síntomas')
    : (/\bfever\b/i.test(symptom) ? 'your fever' : 'your symptoms')
  const greeting = isSpanish
    ? (name ? `${name}, gracias` : 'Gracias')
    : (name ? `${name}, thank you` : 'Thank you')
  // Defect 2 / P0-14f: transport failures still fail-cautious as high_risk_continue,
  // but that must never write a clinical caution sentence into the transcript.
  const genuineClinicalCaution = risk.status === 'high_risk_continue'
    && risk.severity !== 'technical'
    && !isTechnicalSafetySource(risk.source)
  const caution = genuineClinicalCaution
    ? (isSpanish ? ' Continuaré monitoreando signos de alerta urgentes.' : ' I will keep checking for urgent warning signs.')
    : ''
  // P1-01 Q6B — short neutral ack; the clinical question lives in the unified control.
  return limitConsultationMessage(
    isSpanish
      ? `${greeting} por comunicarse con nosotros sobre ${condition}.${caution}`
      : `${greeting} for reaching out about ${condition}.${caution}`
  )
}

function patientSnapshot(patient: PatientRow): JsonObject {
  return {
    patient_id: patient.id,
    relationship: patient.relationship,
    age: patient.age,
    sex_at_birth: patient.sex_at_birth,
  }
}

function relationshipBucket(relationship: string): 'self' | 'dependent' | 'other' {
  if (relationship === 'dependent') return 'dependent'
  if (relationship === 'other') return 'other'
  return 'self'
}

async function resolveStartPatient(
  ctx: ProxyContext,
  payload: RequestPayload,
): Promise<{
  patient: PatientRow
  activeOwnedCount: number
  explicitPick: boolean
  patientsList: ReturnType<typeof toPatientListItem>[]
}> {
  let active = await listOwnedActivePatients(ctx)
  // First-timer: ensure the self row exists, then re-list so count is honest.
  if (active.length === 0) {
    await getOrCreateSelfPatient(ctx)
    active = await listOwnedActivePatients(ctx)
  }

  const patientsList = active.map(toPatientListItem)
  const activeOwnedCount = active.length
  const requestedId = typeof payload.patient_id === 'string' ? payload.patient_id.trim() : ''

  if (activeOwnedCount > 1) {
    if (!requestedId) {
      throw new PatientSelectionRequiredError(patientsList)
    }
    try {
      const owned = await getOwnedPatient(ctx, requestedId)
      if (owned.is_active === false) {
        throw new PatientSelectionRequiredError(patientsList)
      }
      return { patient: owned, activeOwnedCount, explicitPick: true, patientsList }
    } catch (error) {
      if (error instanceof PatientSelectionRequiredError) throw error
      throw new PatientSelectionRequiredError(patientsList)
    }
  }

  // Sole active: auto-bind that patient (client may omit patient_id).
  // If client sends an id, it must match the sole owned active patient.
  if (activeOwnedCount === 1) {
    const sole = active[0]
    if (requestedId && requestedId !== sole.id) {
      throw new PatientSelectionRequiredError(patientsList)
    }
    return { patient: sole, activeOwnedCount, explicitPick: false, patientsList }
  }

  // Defensive: list still empty after ensure — bind via getOrCreateSelfPatient.
  const patient = await getOrCreateSelfPatient(ctx)
  return { patient, activeOwnedCount: 1, explicitPick: false, patientsList: [toPatientListItem(patient)] }
}

async function appendSkipReaffirmConsent(
  ctx: ProxyContext,
  consultationId: string,
  patientId: string,
) {
  const consentRows = ['terms_of_service', 'privacy_policy', 'ai_care_disclosure'].map((consentType) => ({
    user_id: ctx.user.id,
    patient_id: patientId,
    consultation_id: consultationId,
    consent_type: consentType,
    consent_version: CONSENT_VERSION,
    decision: 'accepted',
    source: 'skip_reaffirm',
  }))
  const { error } = await ctx.db.from('libertymd_consent_events').insert(consentRows)
  if (error) throw error
  await addProductEvent(ctx, 'consent_recorded', consultationId, {
    consent_version: CONSENT_VERSION,
    method: 'skip_reaffirm',
  })
}

export async function handleStartConsultation(ctx: ProxyContext, payload: RequestPayload) {
  const { db, user, isAnonymous, requestStartedAt } = ctx
  const message = cleanMessage(payload.message)
  if (!message) return jsonResponse({ error: 'Please describe the symptom' }, 400)
  // P0-07 Q1 — no client_message_id on start; one ephemeral UUID for every n8n call.
  const correlationId = crypto.randomUUID()

  let resolveTiming: { value: Awaited<ReturnType<typeof resolveStartPatient>>; ms: number }
  try {
    resolveTiming = await timed(() => resolveStartPatient(ctx, payload))
  } catch (error) {
    if (error instanceof PatientSelectionRequiredError) {
      return jsonResponse(
        {
          code: error.code,
          error: error.message,
          severity: error.severity,
          patients: error.patients,
        },
        error.httpStatus,
      )
    }
    throw error
  }

  const { patient, explicitPick } = resolveTiming.value
  const patientTiming = resolveTiming

  // Consent “current” = profile.consent_version matches CONSENT_VERSION (Q3A).
  const { data: profileRow, error: profileReadError } = await db
    .from('libertymd_profiles')
    .select('consent_version')
    .eq('user_id', user.id)
    .maybeSingle()
  if (profileReadError) throw profileReadError
  const consentCurrent = String((profileRow as { consent_version?: string } | null)?.consent_version || '')
    === CONSENT_VERSION

  const skipEligible = isSkipEligiblePatient(patient)
  const willSkip = skipEligible && consentCurrent

  const slots: JsonObject = willSkip
    ? {
      chief_complaint: message,
      age: patient.age,
      sex_at_birth: patient.sex_at_birth,
    }
    : { chief_complaint: message }

  const initialStatus = willSkip ? 'interviewing' : 'awaiting_demographics'
  const initialHistory = [{ role: 'user', content: message, message_type: 'message' }]

  // P1-19 Q4(C) — prefer opaque id, else key upsert; missing → NULL (direct visit).
  // Soft-fail: invalid id never 500s the consult.
  const landingSessionId = await resolveLandingSessionIdForStart(ctx, payload)

  // P3-07 — explicit `language` on start; journey-locale normalizer SoT (AC6 path 2 → en).
  // P1-19 attribution `locale` is never clinical SoT.
  const journeyLocale = await resolveJourneyLocale({
    requestedLanguage: payload.language,
    db: ctx.db,
    log: journeyLocaleConsoleLog,
  })
  const clinicalLanguage = journeyLocale.language
  ctx.clinicalLocale = clinicalLanguage

  // P0-14e: no timeout argument. Turn 1 uses the same guardrail budget as every
  // later turn (lib/config.ts N8N_TIMEOUT_MS.guardrail).
  const [guardrailTiming, consultationTiming] = await Promise.all([
    timed(() => runGuardrail(
      message,
      initialHistory,
      patientPayload(patient),
      slots,
      undefined,
      correlationId,
      {
        db: ctx.db,
        region: payload.region === 'EU' ? 'EU' : 'US',
        language: clinicalLanguage,
      },
    )),
    timed(async () => await db
      .from('libertymd_consultations')
      .insert({
        user_id: user.id,
        patient_id: patient.id,
        patient_snapshot: patientSnapshot(patient),
        status: initialStatus,
        region: payload.region === 'EU' ? 'EU' : 'US',
        language: clinicalLanguage,
        chief_complaint: message,
        turn_count: 1,
        filled_slots: slots,
        missing_slots: willSkip ? calculateMissingSlots(slots) : CORE_SLOTS,
        retention_expires_at: isAnonymous ? addDays(30) : null,
        landing_session_id: landingSessionId,
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

  // P1-15 Q2 — consultation_started first after insert, before inference_failed
  // or any parallel batch that can throw. Never reverse that order.
  // P1-19 Q8(A) — opaque landing_session_id only when non-null (no UTM/keyword prose).
  // P3-05 — entry_type + optional allow-listed chip_id (never label / chief_complaint).
  const entryTelemetry = coerceEntryTelemetry(payload)
  await addProductEvent(ctx, 'consultation_started', consultation.id, {
    region: payload.region === 'EU' ? 'EU' : 'US',
    is_anonymous: isAnonymous,
    entry_type: entryTelemetry.entry_type,
    ...(entryTelemetry.chip_id ? { chip_id: entryTelemetry.chip_id } : {}),
    ...(landingSessionId ? { landing_session_id: landingSessionId } : {}),
    ...(journeyLocale.blocked
      ? { clinical_locale_blocked: true, clinical_locale_candidate: journeyLocale.candidate }
      : {}),
  })

  // P1-03 Q9A — explicit multi pick / someone-else-create only (never sole auto-bind).
  if (explicitPick) {
    const source = payload.selection_source === 'someone_else_create'
      ? 'someone_else_create'
      : 'picker'
    await addProductEvent(ctx, 'profile_selected', consultation.id, {
      relationship: relationshipBucket(String(patient.relationship || 'self')),
      selection_source: source,
    })
  }

  // P1-16 AC2: categorical shadow_llm_status on sync path; 'disabled' until live shadow available.
  await addProductEvent(ctx, 'guardrail_evaluated', consultation.id, {
    status: guardrail.status,
    risk_level: guardrail.risk_level,
    source: guardrail.source,
    turn_index: 1,
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

  const updateConsultation = async (values: JsonObject) => {
    const { error: updateError } = await db
      .from('libertymd_consultations')
      .update(values)
      .eq('id', consultation.id)
      .eq('user_id', user.id)
    if (updateError) throw updateError
  }
  const initialPersistenceTiming = await timed(() => Promise.all([
      addMessage(ctx, consultation.id, 'user', message, {
        slot_updates: slots,
        target_slot: 'chief_complaint',
      }),
      saveSafetyEvent(ctx, consultation, guardrail, 1, {
        message,
        history: initialHistory,
        patient: patientPayload(patient),
      }, correlationId),
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
      language: clinicalLanguage,
      emergency: true,
      safety: toClientSafety(guardrail),
      message: guardrail.message,
      emergency_copy: guardrail.emergency_copy ?? null,
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

  // Interview consult status for skip vs gate (high_risk when caution continues).
  const postGuardStatus = willSkip
    ? (guardrail.status === 'high_risk_continue' ? 'high_risk' : 'interviewing')
    : 'awaiting_demographics'

  if (willSkip) {
    await appendSkipReaffirmConsent(ctx, consultation.id, patient.id)
  }

  // P1-01 Q1A — obtain first interview question only after emergency short-circuit.
  const history = await getHistory(ctx, consultation.id)
  const interviewTiming = await timed(() => runInterview(
    history,
    patientPayload(patient),
    slots,
    willSkip ? calculateMissingSlots(slots) : CORE_SLOTS,
    null,
    1,
    postGuardStatus,
    consultation.id,
    correlationId,
    clinicalLanguage,
  ))
  const interview = interviewTiming.value

  let nextQuestion = FALLBACK_ENTRY_QUESTION
  let options: string[] = []
  let targetSlot = FALLBACK_TARGET_SLOT
  if (!isInterviewHoldingSource(interview.source) && cleanMessage(interview.next_question)) {
    nextQuestion = interview.next_question
    options = Array.isArray(interview.options) ? interview.options.map(String).filter(Boolean).slice(0, 4) : []
    const slot = String(interview.target_slot || '').trim()
    targetSlot = slot && slot !== 'none' ? slot : FALLBACK_TARGET_SLOT
  } else if (isInterviewHoldingSource(interview.source)) {
    const errorClass: InferenceErrorClass = interview.source === 'breaker_open' ? 'breaker_open' : 'unavailable'
    await emitInferenceFailed(ctx, consultation.id, {
      stage: 'interview',
      error_class: errorClass,
      outcome: 'holding',
    })
  }

  // Use the selected patient's first name for the greeting, not the auth user's name.
  // When the patient is a dependent/other (e.g. "John Snow"), greeting should say "John",
  // not the account holder's name. Fall back to firstName(user) only when the patient
  // has no display_label (anonymous / self with no label set).
  const patientGreetingName = (() => {
    if (isAnonymous) return null
    const label = typeof patient.display_label === 'string' ? patient.display_label.trim() : ''
    if (label) return label.split(/\s+/)[0]
    return firstName(user) || null
  })()
  const prompt = acknowledgement(message, guardrail, patientGreetingName, clinicalLanguage)

  const assistantPersistenceTiming = await timed(() => Promise.all([
    addMessage(ctx, consultation.id, 'assistant', prompt, {
      message_type: willSkip ? 'normal' : 'demographics',
      metadata: { safety_status: guardrail.status },
    }),
    // Persist the staged entry question so resume can restore the unified control
    // without changing getHistory's select list (consultations.ts out of manifest).
    addMessage(ctx, consultation.id, 'assistant', nextQuestion, {
      message_type: 'normal',
      options,
      target_slot: targetSlot,
      metadata: { entry_question: true, safety_status: guardrail.status, demographics_skipped: willSkip },
    }),
    updateConsultation({
      status: postGuardStatus,
      safety_state: { ...guardrail.raw, status: guardrail.status, risk_level: guardrail.risk_level },
      target_slot: targetSlot,
      filled_slots: slots,
      missing_slots: willSkip ? calculateMissingSlots(slots) : CORE_SLOTS,
      last_activity_at: new Date().toISOString(),
    }),
  ]))

  // P1-15 S3 — first interview question served on start.
  await addProductEvent(ctx, 'question_served', consultation.id, {
    turn_index: 1,
    target_slot: targetSlot,
    had_options: options.length > 0,
    was_repeat: false,
  })

  return jsonResponse({
    consultation_id: consultation.id,
    language: clinicalLanguage,
    state: postGuardStatus,
    acknowledgement: prompt,
    next_question: nextQuestion,
    options,
    target_slot: targetSlot,
    patient_snapshot: patientSnapshot(patient),
    demographics_skipped: willSkip,
    // Prefill hints for gated path when age/sex already known (stale consent / partial).
    prefill: skipEligible || (patient.age != null || patient.sex_at_birth)
      ? {
        age: patient.age ?? null,
        sex_at_birth: patient.sex_at_birth ?? null,
      }
      : null,
    safety: guardrail.status === 'high_risk_continue' ? toClientSafety(guardrail) : null,
    version: consultation.version,
    timings: {
      auth_and_request_ms: Math.max(0, Math.round(performance.now() - requestStartedAt)
        - patientTiming.ms
        - Math.max(guardrailTiming.ms, consultationTiming.ms)
        - initialPersistenceTiming.ms
        - interviewTiming.ms
        - assistantPersistenceTiming.ms),
      patient_lookup_ms: patientTiming.ms,
      guardrail_ms: guardrailTiming.ms,
      consultation_insert_ms: consultationTiming.ms,
      initial_persistence_ms: initialPersistenceTiming.ms,
      interview_ms: interviewTiming.ms,
      assistant_persistence_ms: assistantPersistenceTiming.ms,
      total_ms: Math.round(performance.now() - requestStartedAt),
    },
  })
}
