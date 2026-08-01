/**
 * `send_message` — one interview turn.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor). Only the
 * indentation of the lease try/finally block changed.
 *
 * Lane A owns this module.
 *
 * The order of operations here is load-bearing:
 *   1. Claim the request lease (idempotency + optimistic version check).
 *   2. Run guardrail and interview concurrently — separate failure domains.
 *   3. Persist the safety verdict FIRST, before any interview or diagnosis
 *      decision. A diagnosis failure must never lose a safety verdict.
 *   4. force_end short-circuits: no inference is acted on after an emergency.
 *   5. The proxy — not n8n — decides whether a report is produced, withheld,
 *      or escalated to clinical review.
 *
 * ## P0-11 · what an n8n outage looks like from here
 *
 * The guardrail is *never* skipped, breaker or no breaker: the deterministic
 * edge screen runs in-process before any transport, and the n8n leg fails
 * cautious. What the breaker changes is that a downed **interview** or
 * **diagnosis** stage no longer produces a fabricated question or a
 * `clinical_review_needed` dead-end per turn. It produces one holding state,
 * marked `severity: 'technical'`, and the turn is not consumed — see
 * `holdingState()`.
 *
 * ## P0-13 · the four invariants this handler is the main enforcement point for
 *
 *   1. Turn cap — `consultation.turn_count + 1 > MAX_TURNS` is impossible;
 *      at the cap the consult transitions deterministically instead.
 *   2. No inference after an emergency — the status allow-list is checked at
 *      entry *and* inside `runInterview` / `runDiagnosis`.
 *   3. Exactly one `message_type` from the closed enum — enforced in
 *      `addMessage`; this file previously passed `'question'`, which is not in
 *      the enum and could only ever have failed the CHECK constraint.
 *   4. No write to a consultation the JWT subject does not own — every write
 *      goes through `updateOwnedConsultation` / the row form of `addMessage`.
 */
import { assessClinicalEvidence, classifyResponseRelevance, decideReportOutcome } from '../clinical-policy.ts'
import { isSpeculativeDiagnosisEnabled, MAX_TURNS } from '../lib/config.ts'
import {
  addMessage,
  assertTurnWithinCap,
  diagnosisResultFromDiagnosticRun,
  findLatestSpeculativeDiagnosticRun,
  getHistory,
  getOwnedConsultation,
  replayCompletedTurn,
  saveDiagnosticRun,
  updateOwnedConsultation,
} from '../lib/consultations.ts'
import { jsonResponse } from '../lib/errors.ts'
import { scheduleDetached } from '../lib/mixpanel.ts'
import {
  INFERENCE_ALLOWED_STATUSES,
  isInterviewHoldingSource,
  n8nBreakerSnapshot,
  normalizeObject,
  runDiagnosis,
  runInterview,
  type DiagnosisResult,
  type N8nStage,
} from '../lib/n8n-client.ts'
import { ensureProfile, getOwnedPatient } from '../lib/profiles.ts'
import { runGuardrail, saveSafetyEvent, toClientSafety } from '../lib/safety.ts'
import {
  buildComprehensionCheckPayload,
  COMPREHENSION_BRIDGE_MESSAGE,
  CONTINUE_EMPTY_QUESTION_FALLBACK,
  isComprehensionCompleted,
  readComprehensionFlags,
  withComprehensionCompleted,
  withComprehensionPending,
} from '../lib/comprehension-check.ts'
import { calculateMissingSlots } from '../lib/slots.ts'
import {
  computeShouldRunDiagnosis,
  isOneTurnFromDiagnosisGate,
  isSpeculativeRunServeEligible,
} from '../lib/speculative-diagnosis.ts'
import { addProductEvent, emitInferenceFailed, scoreBucket, type InferenceErrorClass } from '../lib/telemetry.ts'
import {
  composeWarmMidPathRedirect,
  OFF_TOPIC_STOP_BODY,
  selectLastClinicalAsk,
} from '../lib/off-topic-recovery.ts'
import {
  ensureReportInserted,
  finalizeFromExistingReport,
  findOwnedReport,
  hasReportGateMessage,
  isServeEligibleStoredReport,
} from '../lib/report-persistence.ts'
import { addDays, cleanMessage, limitConsultationMessage, patientPayload } from '../lib/utils.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { ConsultationRow, GuardrailResult, JsonObject, RequestPayload } from '../lib/types.ts'

function guardrailInferenceErrorClass(guardrail: GuardrailResult): InferenceErrorClass | null {
  if (guardrail.source !== 'error_fail_cautious') return null
  const failure = guardrail.raw?.failure
  if (failure === 'timeout') return 'timeout'
  if (failure === 'malformed_payload') return 'malformed_payload'
  return 'http_error'
}

function interviewInferenceErrorClass(source: string): InferenceErrorClass | null {
  if (source === 'breaker_open') return 'breaker_open'
  if (source === 'unavailable') return 'unavailable'
  return null
}

/**
 * P0-11 AC3 — the calm holding state.
 *
 * One shape, returned identically however many times the client retries during
 * an outage, so the UI has one thing to render rather than a fresh alarming
 * event per turn. Three properties matter:
 *
 *   - `severity: 'technical'`. CONTEXT.md §4: a technical failure must never
 *     wear clinical clothing. Nothing on this path writes an assistant message
 *     into the transcript, so an outage leaves no clinical artefact behind.
 *   - The turn is **not** consumed and `state` is unchanged. The user's message
 *     is already persisted (and de-duplicated by `client_message_id`), so a
 *     retry resumes rather than repeating.
 *   - `retry_after_ms` comes from the breaker, so the client can wait for the
 *     cooldown instead of guessing.
 *
 * 503 rather than a 200 with a flag: the request genuinely did not complete, and
 * a 200 would be silently swallowed by any client that only reads
 * `next_question`. The rendering half of AC3 lives in the chat tree, which is
 * outside this ticket's manifest — see the implementation notes.
 */
function holdingState(
  consultation: ConsultationRow,
  stage: N8nStage,
  currentVersion: number,
  clientMessageId: string,
) {
  const snapshot = n8nBreakerSnapshot().find((entry) => entry.stage === stage)
  console.warn('LibertyMD returning holding state for a degraded inference stage', {
    stage,
    consultation_id: consultation.id,
    breaker_state: snapshot?.state,
    retry_after_ms: snapshot?.retry_after_ms || 0,
  })
  return jsonResponse({
    consultation_id: consultation.id,
    state: consultation.status,
    holding: true,
    severity: 'technical',
    retryable: true,
    retry_after_ms: snapshot?.retry_after_ms || 0,
    turn_count: consultation.turn_count,
    next_question: null,
    message: 'We have paused for a moment because the care service is not responding. Nothing you typed is lost, and this will pick up exactly where it left off.',
    version: currentVersion,
    // P0-07 D1 — echo turn UUID so holding joins client → proxy logs → n8n header.
    client_message_id: clientMessageId,
  }, 503)
}

/**
 * P0-13 AC1 — the deterministic transition at the turn cap.
 *
 * Called when a consult that is already at `MAX_TURNS` receives another answer.
 * By the time we get here the message has been retained and screened, and any
 * `force_end` has already short-circuited; what is left is to close the consult
 * without issuing an interview or diagnosis call.
 *
 * "Report if valid, else `clinical_review_needed`" is implemented literally
 * rather than asserted: a validated report is looked up and honoured if present.
 * That branch is unreachable through today's flows — a consult with a report is
 * already `completed` or `report_pending_auth`, which `send_message` refuses at
 * entry — but the AC describes the invariant, not the currently reachable subset
 * of it, and a lookup on a once-per-consult path costs nothing.
 *
 * No new diagnosis is run to try to rescue a report. Inventing a differential
 * from a stale snapshot at the moment we have decided to stop asking questions
 * would be the worst possible place to guess.
 */
async function closeAtTurnCap(
  ctx: ProxyContext,
  consultation: ConsultationRow,
  turnCount: number,
  currentVersion: number,
) {
  console.warn('LibertyMD turn cap reached; closing deterministically', {
    invariant: 'max_turns',
    consultation_id: consultation.id,
    turn_count: consultation.turn_count,
    max_turns: MAX_TURNS,
    status: consultation.status,
  })

  // P2-07 — turn-cap path is read-only on clinical body (no re-insert / upsert).
  const existingReport = await findOwnedReport(ctx, consultation.id)
  const reportIsValid = isServeEligibleStoredReport(existingReport)

  const now = new Date().toISOString()
  if (reportIsValid && existingReport) {
    const status = ctx.isAnonymous ? 'report_pending_auth' : 'completed'
    if (!(await hasReportGateMessage(ctx, consultation.id))) {
      await addMessage(ctx, consultation, 'assistant', ctx.isAnonymous
        ? 'We have reached the end of this consultation. Your LibertyMD report is ready — link Google to save it, or continue without saving.'
        : 'We have reached the end of this consultation. Your LibertyMD report is ready and saved to your history.', {
        message_type: 'report_gate',
      })
    }
    await updateOwnedConsultation(ctx, consultation, {
      status,
      turn_count: MAX_TURNS,
      resolution_reason: 'turn_limit_reached',
      completed_at: ctx.isAnonymous ? null : now,
      last_activity_at: now,
    })
    return jsonResponse({
      consultation_id: consultation.id,
      state: status,
      report_ready: true,
      auth_required: ctx.isAnonymous,
      turn_limit_reached: true,
      confidence_score: Number(existingReport.confidence_score || 0),
      report: existingReport.report_data,
      retention_expires_at: existingReport.retention_expires_at ?? null,
      report_omitted_reason: null,
      version: currentVersion,
    })
  }

  const messageText = 'We have reached the end of what I can safely ask in one consultation. I could not reach a confident enough differential from this intake, so the next step is a licensed clinician who can review what you have shared.'
  await addMessage(ctx, consultation, 'assistant', messageText, { message_type: 'safety' })
  await updateOwnedConsultation(ctx, consultation, {
    status: 'clinical_review_needed',
    turn_count: MAX_TURNS,
    resolution_reason: 'turn_limit_reached',
    last_activity_at: now,
  })
  await addProductEvent(ctx, 'clinical_review_needed', consultation.id, {
    reason: 'turn_limit_reached',
    turn_count: turnCount,
  })
  return jsonResponse({
    consultation_id: consultation.id,
    state: 'clinical_review_needed',
    clinical_review_needed: true,
    turn_limit_reached: true,
    reason: 'turn_limit_reached',
    message: messageText,
    version: currentVersion,
  })
}

export async function handleSendMessage(ctx: ProxyContext, payload: RequestPayload) {
  const { db, user, isAnonymous } = ctx
  if (!payload.consultation_id) return jsonResponse({ error: 'Missing consultation id' }, 400)
  const message = cleanMessage(payload.message)
  if (!message) return jsonResponse({ error: 'Message cannot be empty' }, 400)
  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)
  // P3-07 — Mixpanel locale super + n8n IO from stored clinical language (immutable).
  const clinicalLanguage = String(consultation.language || 'en').trim().toLowerCase() === 'es' ? 'es' : 'en'
  ctx.clinicalLocale = clinicalLanguage
  // P0-13 AC2. `send_message` accepts a narrower set than
  // INFERENCE_ALLOWED_STATUSES (which also admits the demographics turn), so the
  // list stays explicit here; the shared allow-list is asserted again inside
  // runInterview/runDiagnosis so no future path can bypass it.
  if (!['interviewing', 'high_risk'].includes(consultation.status)) {
    // DoD+: logged at warn with enough context to identify the caller. The
    // message body is deliberately absent — it is PHI.
    console.warn('LibertyMD invariant violation: answer rejected for a non-inferable consultation status', {
      invariant: 'no_inference_after_emergency',
      action: 'send_message',
      consultation_id: consultation.id,
      status: consultation.status,
      jwt_subject: user.id,
      inference_allowed_statuses: INFERENCE_ALLOWED_STATUSES,
    })
    return jsonResponse({ error: `Consultation cannot accept answers in ${consultation.status}` }, 409)
  }
  const suppliedRequestId = String(payload.client_message_id || '').trim()
  const requestId = suppliedRequestId || crypto.randomUUID()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return jsonResponse({ error: 'Invalid client message id' }, 400)
  }
  const { comprehensionAck, comprehensionCorrection } = readComprehensionFlags(payload)
  const completingComprehension = comprehensionAck || comprehensionCorrection
  const expectedVersion = Number.isInteger(payload.expected_version) ? Number(payload.expected_version) : null
  const { data: claims, error: claimError } = await db.rpc('libertymd_claim_consultation_request', {
    p_consultation_id: consultation.id,
    p_user_id: user.id,
    p_request_id: requestId,
    p_expected_version: expectedVersion,
  })
  if (claimError) throw claimError
  const claim = Array.isArray(claims) ? claims[0] : claims
  if (!claim?.accepted) {
    if (claim?.replayed) return jsonResponse(await replayCompletedTurn(ctx, await getOwnedConsultation(ctx, consultation.id)))
    // P0-12: distinguish lease vs version without a SQL migration. Prefer
    // version_mismatch when the client's expected version differs from the
    // claim's current_version (silent rehydrate is safer than ignoring stale).
    const currentVersion = Number(claim?.current_version || consultation.version)
    const claimRejection =
      expectedVersion !== null && currentVersion !== expectedVersion
        ? 'version_mismatch'
        : 'lease_conflict'
    return jsonResponse({
      error: 'This consultation could not accept that answer just now.',
      retryable: true,
      current_version: currentVersion,
      claim_rejection: claimRejection,
      severity: 'technical',
      // P0-07 D1 — structured failure JSON echoes the turn UUID (no client parse required).
      client_message_id: requestId,
    }, 409)
  }
  const currentVersion = Number(claim.current_version || consultation.version)

  try {
    await ensureProfile(ctx)
    const patient = await getOwnedPatient(ctx, consultation.patient_id)
    // P0-13 AC1. `atCap` means this consult is already at MAX_TURNS and is
    // somehow still in an answer-accepting status — a state today's
    // decideReportOutcome should make unreachable. Rather than trusting that, a
    // 16th turn is refused: the message is still retained and still screened,
    // but no interview or diagnosis inference is issued and the consult
    // transitions deterministically below.
    const atCap = consultation.turn_count >= MAX_TURNS
    const turnCount = atCap ? MAX_TURNS : consultation.turn_count + 1
    assertTurnWithinCap(consultation.id, turnCount)
    const { data: existingRequestMessage, error: existingRequestError } = await db
      .from('libertymd_messages')
      .select('id')
      .eq('consultation_id', consultation.id)
      .eq('client_message_id', requestId)
      .maybeSingle()
    if (existingRequestError) throw existingRequestError
    if (!existingRequestMessage) {
      await addMessage(ctx, consultation, 'user', message, {
        target_slot: consultation.target_slot,
        client_message_id: requestId,
        // P1-14 — tag correction / proceed ack (existing message_type; no schema widen).
        ...(comprehensionCorrection
          ? { metadata: { source: 'comprehension_correction' } }
          : comprehensionAck
            ? { metadata: { source: 'comprehension_ack' } }
            : {}),
      })
      const answeredSlot = String(consultation.target_slot || '').trim() || 'none'
      // P1-15 S3 — user answer persistence that advances the turn.
      await addProductEvent(ctx, 'turn_completed', consultation.id, {
        turn_index: turnCount,
        target_slot: answeredSlot,
      })
    }

    const history = await getHistory(ctx, consultation.id)
    // The guardrail runs on every turn including the capped one. Skipping the
    // screen because the interview is over would mean an emergency described in
    // the 16th message goes unread — safety asymmetry, CONTEXT.md §4.
    const [guardrail, interview] = await Promise.all([
      runGuardrail(
        message,
        history,
        patientPayload(patient),
        consultation.filled_slots,
        undefined,
        requestId,
        {
          db: ctx.db,
          region: consultation.region ?? 'US',
          language: consultation.language ?? 'en',
        },
      ),
      atCap ? Promise.resolve(null) : runInterview(
        history,
        patientPayload(patient),
        consultation.filled_slots,
        consultation.missing_slots,
        consultation.target_slot,
        turnCount,
        consultation.status,
        consultation.id,
        requestId,
        clinicalLanguage,
      ),
    ])
    await saveSafetyEvent(ctx, consultation, guardrail, turnCount, {
      message,
      history,
      patient: patientPayload(patient),
    }, requestId)

    await addProductEvent(ctx, 'guardrail_evaluated', consultation.id, {
      status: guardrail.status,
      risk_level: guardrail.risk_level,
      source: guardrail.source,
      turn_index: turnCount,
      shadow_llm_status: 'disabled',
    })

    const guardrailErrorClass = guardrailInferenceErrorClass(guardrail)
    if (guardrailErrorClass) {
      await emitInferenceFailed(ctx, consultation.id, {
        stage: 'guardrail',
        error_class: guardrailErrorClass,
        outcome: 'fail_cautious',
      })
    }

    if (guardrail.force_end) {
      await addMessage(ctx, consultation, 'assistant', guardrail.message, { message_type: 'safety' })
      await updateOwnedConsultation(ctx, consultation, {
        status: 'emergency_stopped',
        turn_count: turnCount,
        safety_state: guardrail.raw,
        last_activity_at: new Date().toISOString(),
      })
      await addProductEvent(ctx, 'emergency_stopped', consultation.id, { turn_count: turnCount, source: guardrail.source })
      return jsonResponse({
        consultation_id: consultation.id,
        emergency: true,
        safety: toClientSafety(guardrail),
        message: guardrail.message,
        emergency_copy: guardrail.emergency_copy ?? null,
        turn_count: turnCount,
        diagnosis_ran: false,
        version: currentVersion,
      })
    }

    // P0-13 AC1 — the deterministic transition at the cap. Report if one is
    // already valid, otherwise clinical review. No inference was issued.
    if (atCap || !interview) return await closeAtTurnCap(ctx, consultation, turnCount, currentVersion)

    // P2-07 — orphan / idempotent recovery: report row exists while status is
    // still interviewing|high_risk (insert succeeded, status update failed).
    // Prefer completing from the stored row — no Diagnosis, no second report_ready,
    // no clinical rewrite. Residual: brief desync window until this path runs.
    {
      const orphanReport = await findOwnedReport(ctx, consultation.id)
      if (isServeEligibleStoredReport(orphanReport) && orphanReport) {
        return await finalizeFromExistingReport(ctx, consultation, orphanReport, {
          turnCount,
          currentVersion,
          evidenceScore: consultation.clinical_evidence_score,
          diagnosisRan: false,
        })
      }
    }

    // P0-11 AC3 / P0-08 Q2 — interview stage down or malformed. One calm holding
    // state; the turn is not consumed and no fabricated question reaches the transcript.
    const interviewErrorClass = interviewInferenceErrorClass(interview.source)
    if (interviewErrorClass) {
      await emitInferenceFailed(ctx, consultation.id, {
        stage: 'interview',
        error_class: interviewErrorClass,
        outcome: 'holding',
      })
    }
    if (isInterviewHoldingSource(interview.source)) return holdingState(consultation, 'interview', currentVersion, requestId)

    const deterministicRelevance = classifyResponseRelevance(message)
    const isNonClinical = deterministicRelevance === 'off_topic' || interview.input_relevance === 'off_topic'
    const nonClinicalResponseCount = (consultation.non_clinical_response_count || 0) + (isNonClinical ? 1 : 0)
    const consecutiveNonClinicalResponseCount = isNonClinical
      ? (consultation.consecutive_non_clinical_response_count || 0) + 1
      : 0

    if (isNonClinical) {
      // P1-10 Q6A: last non-off-topic clinical ask (skip prior redirects), not nested warm copy.
      const clinicalAsk = selectLastClinicalAsk(history, interview.next_question)
      const replayOptions = Array.isArray(clinicalAsk.options) ? clinicalAsk.options : interview.options
      const shouldStop = turnCount >= MAX_TURNS || consecutiveNonClinicalResponseCount >= 3 || nonClinicalResponseCount >= 5
      // P1-10: warm mid-path / plain terminal stop (off-topic branch only). Thresholds unchanged.
      const messageText = limitConsultationMessage(shouldStop
        ? OFF_TOPIC_STOP_BODY
        : composeWarmMidPathRedirect(clinicalAsk.content || cleanMessage(interview.next_question)))

      await addMessage(ctx, consultation, 'assistant', messageText, {
        // P0-13 AC3: this was `'question'`, which is not one of the six values
        // the `libertymd_messages` CHECK constraint permits — so every
        // off-topic, non-stopping turn was writing a row the database had to
        // reject. `'normal'` is what the other interview questions in this file
        // and in save_demographics already use (via the column default).
        message_type: shouldStop ? 'safety' : 'normal',
        options: shouldStop ? [] : replayOptions,
        target_slot: consultation.target_slot,
        metadata: {
          response_relevance: 'off_topic',
          deterministic_relevance: deterministicRelevance,
          workflow_relevance: interview.input_relevance,
          relevance_reason: interview.input_relevance_reason,
        },
      })
      await updateOwnedConsultation(ctx, consultation, {
        status: shouldStop ? 'clinical_review_needed' : consultation.status,
        turn_count: turnCount,
        non_clinical_response_count: nonClinicalResponseCount,
        consecutive_non_clinical_response_count: consecutiveNonClinicalResponseCount,
        resolution_reason: shouldStop ? 'insufficient_clinical_information' : null,
        last_activity_at: new Date().toISOString(),
      })
      if (shouldStop) {
        await addProductEvent(ctx, 'clinical_review_needed', consultation.id, {
          reason: 'insufficient_clinical_information',
          non_clinical_response_count: nonClinicalResponseCount,
        })
      }

      return jsonResponse({
        consultation_id: consultation.id,
        state: shouldStop ? 'clinical_review_needed' : consultation.status,
        clinical_review_needed: shouldStop,
        non_clinical_response: true,
        message: messageText,
        next_question: shouldStop ? null : messageText,
        options: shouldStop ? [] : replayOptions,
        turn_count: turnCount,
        diagnosis_ran: false,
        version: currentVersion,
      })
    }

    const slots = { ...consultation.filled_slots, ...interview.slot_updates }
    const missingSlots = interview.missing_slots.length ? interview.missing_slots : calculateMissingSlots(slots)
    const evidence = assessClinicalEvidence(slots)
    const gateOpen = computeShouldRunDiagnosis({
      evidenceScore: evidence.score,
      turnCount,
      readyForReport: interview.ready_for_report,
    })
    const comprehensionDone = isComprehensionCompleted(consultation.workflow_versions)

    // P1-14 — Diagnosis-gate short-circuit: slots summary OverlaySheet before Diagnosis.
    // Once-completed via workflow_versions (no new column). Dismiss ≠ proceed (client-only).
    if (gateOpen && !comprehensionDone && !completingComprehension) {
      const comprehension = buildComprehensionCheckPayload(slots)
      const nextStatus = guardrail.status === 'high_risk_continue' ? 'high_risk' : 'interviewing'
      const bridge = limitConsultationMessage(COMPREHENSION_BRIDGE_MESSAGE)
      await addMessage(ctx, consultation, 'assistant', bridge, {
        options: [],
        target_slot: interview.target_slot,
        slot_updates: interview.slot_updates,
        metadata: {
          workflow_source: interview.source,
          safety_status: guardrail.status,
          comprehension_pending: true,
        },
      })
      await updateOwnedConsultation(ctx, consultation, {
        status: nextStatus,
        turn_count: turnCount,
        filled_slots: slots,
        missing_slots: missingSlots,
        target_slot: interview.target_slot,
        safety_state: { ...guardrail.raw, status: guardrail.status, risk_level: guardrail.risk_level },
        non_clinical_response_count: nonClinicalResponseCount,
        consecutive_non_clinical_response_count: 0,
        clinical_evidence_score: evidence.score,
        resolution_reason: null,
        workflow_versions: withComprehensionPending(consultation.workflow_versions),
        last_activity_at: new Date().toISOString(),
      })
      return jsonResponse({
        consultation_id: consultation.id,
        state: nextStatus,
        next_question: bridge,
        options: [],
        target_slot: interview.target_slot,
        missing_slots: missingSlots,
        evidence_score: evidence.score,
        turn_count: turnCount,
        diagnosis_ran: false,
        comprehension_check: comprehension,
        safety: guardrail.status === 'high_risk_continue' ? toClientSafety(guardrail) : null,
        version: currentVersion,
      })
    }

    // Proceed / correct: mark once-completed, then force Diagnosis continuum.
    let workflowVersions = consultation.workflow_versions
    if (completingComprehension) {
      workflowVersions = withComprehensionCompleted(consultation.workflow_versions)
      // Persist before Diagnosis so a holding/unavailable path cannot re-open the sheet forever.
      await updateOwnedConsultation(ctx, consultation, {
        workflow_versions: workflowVersions,
        last_activity_at: new Date().toISOString(),
      })
    }

    // Ack / correction after a pending sheet must reach Diagnosis even on an odd turn.
    const shouldRunDiagnosis = gateOpen || completingComprehension
    let diagnosis: DiagnosisResult | null = null
    let diagnosticRunId: string | null = null
    let servedFromSpeculativeCache = false

    if (shouldRunDiagnosis) {
      const diagnosisInput = { ...consultation, turn_count: turnCount }
      const speculationEnabled = isSpeculativeDiagnosisEnabled()
      const currentMaterial = {
        filled_slots: slots,
        patient: consultation.patient_snapshot || {},
        target_slot: consultation.target_slot,
      }

      if (speculationEnabled) {
        try {
          const speculativeRow = await findLatestSpeculativeDiagnosticRun(ctx, consultation)
          if (isSpeculativeRunServeEligible({
            enabled: true,
            run: speculativeRow,
            current: currentMaterial,
          }) && speculativeRow) {
            diagnosis = diagnosisResultFromDiagnosticRun(speculativeRow)
            diagnosticRunId = speculativeRow.id
            servedFromSpeculativeCache = true
          }
        } catch (error) {
          console.warn('LibertyMD speculative cache lookup soft-fail', {
            class: error instanceof Error ? error.name : 'unknown',
          })
        }
      }

      // `|| !diagnosis` is a null-safety belt, not a behaviour change: when the
      // speculative cache serves, it always assigns. It also lets the compiler
      // narrow `diagnosis` to non-null for the rest of this block, so a future
      // cache path that yields null falls back to a real run instead of throwing.
      if (!servedFromSpeculativeCache || !diagnosis) {
        diagnosis = await runDiagnosis(history, patientPayload(patient), diagnosisInput, slots, requestId)
      }

      await addProductEvent(ctx, 'diagnosis_attempted', consultation.id, {
        turn_index: turnCount,
        evidence_bucket: scoreBucket(evidence.score),
        outcome: diagnosis.failure
          ? (diagnosis.unavailable ? 'unavailable' : 'invalid')
          : (diagnosis.valid ? 'valid' : 'invalid'),
        was_speculative: servedFromSpeculativeCache,
        ...(servedFromSpeculativeCache ? { served_from_cache: true } : { served_from_cache: false }),
      })

      if (!servedFromSpeculativeCache && diagnosis.failure) {
        const errorClass: InferenceErrorClass = diagnosis.failure === 'malformed_payload'
          ? 'malformed_payload'
          : diagnosis.failure === 'timeout'
            ? 'timeout'
            : diagnosis.failure === 'http_error'
              ? 'http_error'
              : diagnosis.failure === 'breaker_open'
                ? 'breaker_open'
                : 'unavailable'
        await emitInferenceFailed(ctx, consultation.id, {
          stage: 'diagnosis',
          error_class: errorClass,
          outcome: diagnosis.unavailable ? 'holding_candidate' : 'invalid',
        })
      }

      if (!servedFromSpeculativeCache) {
        diagnosticRunId = await saveDiagnosticRun(
          ctx,
          diagnosisInput,
          diagnosis,
          slots,
          missingSlots,
          evidence.score,
          turnCount,
          { isSpeculative: false },
        )
      }
    }

    const reportDecision = decideReportOutcome({
      diagnosisValid: Boolean(diagnosis?.valid),
      confidence: diagnosis?.confidence || 0,
      turnCount,
      readyForReport: interview.ready_for_report,
      evidence,
      nonClinicalResponseCount,
    })

    // P0-11 AC3. The evidence was sufficient and the only thing missing was the
    // diagnosis call, which we could not make. Escalating to
    // `clinical_review_needed` here would permanently close a consult on
    // technical grounds and tell the user their symptoms need a clinician —
    // a technical failure wearing clinical clothing. Hold instead.
    if (
      reportDecision.outcome === 'review'
      && reportDecision.reason === 'low_diagnostic_confidence'
      && diagnosis?.unavailable
    ) {
      return holdingState(consultation, 'diagnosis', currentVersion, requestId)
    }

    if (reportDecision.outcome === 'complete' && diagnosis) {
      const now = new Date().toISOString()
      const accessStatus = isAnonymous ? 'withheld' : 'saved'
      // P2-07 — insert-once clinical body (current-turn diagnosis only; no historical
      // non-spec scan). Unique conflict → existing row wins; never upsert/clobber.
      const { report: storedReport, inserted: reportInserted } = await ensureReportInserted(ctx, {
        consultationId: consultation.id,
        userId: user.id,
        reportData: diagnosis.raw,
        confidenceScore: diagnosis.confidence,
        finalDiagnosticRunId: diagnosticRunId,
        accessStatus,
        releasedAt: isAnonymous ? null : now,
        retentionExpiresAt: isAnonymous ? addDays(30) : null,
        modelMetadata: {
          ...normalizeObject(diagnosis.raw.model_metadata),
          source: 'libertymd-diagnosis',
          turn_count: turnCount,
        },
      })

      if (!reportInserted) {
        // Race / retry after first insert: soft-gate from stored; no second telemetry.
        return await finalizeFromExistingReport(ctx, consultation, storedReport, {
          turnCount,
          currentVersion,
          evidenceScore: evidence.score,
          diagnosisRan: true,
        })
      }

      await addMessage(ctx, consultation, 'assistant', isAnonymous
        ? 'Your LibertyMD report is ready. Link Google to save it and revisit this consult, or continue without saving.'
        : 'Your LibertyMD report is ready and has been saved to your history.', {
        message_type: 'report_gate',
      })
      await updateOwnedConsultation(ctx, consultation, {
        status: isAnonymous ? 'report_pending_auth' : 'completed',
        report_gate: isAnonymous ? 'withheld' : 'google_linked',
        turn_count: turnCount,
        filled_slots: slots,
        missing_slots: missingSlots,
        intermediate_diagnoses: diagnosis.differentials,
        safety_state: guardrail.raw,
        non_clinical_response_count: nonClinicalResponseCount,
        consecutive_non_clinical_response_count: 0,
        clinical_evidence_score: evidence.score,
        resolution_reason: reportDecision.reason,
        completed_at: isAnonymous ? null : now,
        last_activity_at: now,
        ...(completingComprehension ? { workflow_versions: workflowVersions } : {}),
      })
      await addProductEvent(ctx, 'report_gate_reached', consultation.id, {
        confidence_bucket: scoreBucket(diagnosis.confidence),
        evidence_bucket: scoreBucket(evidence.score),
        is_anonymous: isAnonymous,
      })
      await addProductEvent(ctx, 'report_ready', consultation.id, {
        turn_index: turnCount,
        confidence_bucket: scoreBucket(diagnosis.confidence),
        evidence_bucket: scoreBucket(evidence.score),
        is_anonymous: isAnonymous,
      })

      // P2-02 Q3 soft gate: return report_data for anonymous complete — never withhold
      // content. access_status stays `withheld` until release; P2-06 owns gate chrome.
      return jsonResponse({
        consultation_id: consultation.id,
        state: isAnonymous ? 'report_pending_auth' : 'completed',
        report_ready: true,
        auth_required: isAnonymous,
        report: storedReport.report_data,
        confidence_score: Number(storedReport.confidence_score || diagnosis.confidence),
        evidence_score: evidence.score,
        turn_count: turnCount,
        diagnosis_ran: true,
        // P2-13 L6 — retention ISO for client pre-lapse warning (no body invent).
        retention_expires_at: storedReport.retention_expires_at ?? null,
        report_omitted_reason: null,
        version: currentVersion,
      })
    }

    if (reportDecision.outcome === 'review') {
      const messageText = reportDecision.reason === 'insufficient_clinical_information'
        ? 'I do not have enough relevant clinical information to produce a responsible differential diagnosis. Please restart with clearer symptom details or continue with a licensed clinician.'
        : 'I could not reach a sufficiently confident differential diagnosis from this intake. Please continue with a licensed clinician for review.'
      await addMessage(ctx, consultation, 'assistant', messageText, { message_type: 'safety' })
      await updateOwnedConsultation(ctx, consultation, {
        status: 'clinical_review_needed',
        turn_count: turnCount,
        filled_slots: slots,
        missing_slots: missingSlots,
        intermediate_diagnoses: diagnosis?.valid ? diagnosis.differentials : consultation.intermediate_diagnoses,
        safety_state: guardrail.raw,
        non_clinical_response_count: nonClinicalResponseCount,
        consecutive_non_clinical_response_count: 0,
        clinical_evidence_score: evidence.score,
        resolution_reason: reportDecision.reason,
        last_activity_at: new Date().toISOString(),
        ...(completingComprehension ? { workflow_versions: workflowVersions } : {}),
      })
      await addProductEvent(ctx, 'clinical_review_needed', consultation.id, {
        reason: reportDecision.reason,
        evidence_score: evidence.score,
      })
      return jsonResponse({
        consultation_id: consultation.id,
        state: 'clinical_review_needed',
        clinical_review_needed: true,
        reason: reportDecision.reason,
        evidence_score: evidence.score,
        message: messageText,
        turn_count: turnCount,
        diagnosis_ran: Boolean(shouldRunDiagnosis),
        version: currentVersion,
      })
    }

    const nextQuestion = limitConsultationMessage(
      interview.next_question || CONTINUE_EMPTY_QUESTION_FALLBACK,
    )
    const nextStatus = guardrail.status === 'high_risk_continue' ? 'high_risk' : 'interviewing'
    await addMessage(ctx, consultation, 'assistant', nextQuestion, {
      options: interview.options,
      target_slot: interview.target_slot,
      slot_updates: interview.slot_updates,
      metadata: { workflow_source: interview.source, safety_status: guardrail.status },
    })
    await updateOwnedConsultation(ctx, consultation, {
      status: nextStatus,
      turn_count: turnCount,
      filled_slots: slots,
      missing_slots: missingSlots,
      target_slot: interview.target_slot,
      intermediate_diagnoses: diagnosis?.valid ? diagnosis.differentials : consultation.intermediate_diagnoses,
      safety_state: { ...guardrail.raw, status: guardrail.status, risk_level: guardrail.risk_level },
      non_clinical_response_count: nonClinicalResponseCount,
      consecutive_non_clinical_response_count: 0,
      clinical_evidence_score: evidence.score,
      resolution_reason: null,
      last_activity_at: new Date().toISOString(),
      ...(completingComprehension ? { workflow_versions: workflowVersions } : {}),
    })

    const nextSlot = String(interview.target_slot || '').trim() || 'none'
    const nextOptions = Array.isArray(interview.options) ? interview.options : []
    await addProductEvent(ctx, 'question_served', consultation.id, {
      turn_index: turnCount,
      target_slot: nextSlot,
      had_options: nextOptions.length > 0,
      was_repeat: false,
      evidence_bucket: scoreBucket(evidence.score),
    })

    // P1-08 — detached speculative Diagnosis one gate-step ahead (Q1 A+S1).
    // After persist so the snapshot matches committed slots. Never blocks
    // next_question. Never sets diagnosis_ran. Never writes intermediate_diagnoses.
    if (
      !shouldRunDiagnosis
      && isSpeculativeDiagnosisEnabled()
      && isOneTurnFromDiagnosisGate({ evidenceScore: evidence.score, turnCount })
      && ['interviewing', 'high_risk'].includes(nextStatus)
    ) {
      const speculativeTurn = turnCount
      const speculativeSlots = { ...slots }
      const speculativeMissing = [...missingSlots]
      const speculativeTarget = interview.target_slot
      const speculativePatient = patientPayload(patient)
      const speculativeHistory = history
      const speculativeConsultation = {
        ...consultation,
        turn_count: speculativeTurn,
        filled_slots: speculativeSlots,
        missing_slots: speculativeMissing,
        target_slot: speculativeTarget,
        status: nextStatus as ConsultationRow['status'],
      }
      const evidenceScoreForEvent = evidence.score
      scheduleDetached((async () => {
        try {
          const speculativeDiagnosis = await runDiagnosis(
            speculativeHistory,
            speculativePatient,
            speculativeConsultation,
            speculativeSlots,
            requestId,
            { speculative: true },
          )
          await addProductEvent(ctx, 'diagnosis_attempted', consultation.id, {
            turn_index: speculativeTurn,
            evidence_bucket: scoreBucket(evidenceScoreForEvent),
            outcome: speculativeDiagnosis.failure
              ? (speculativeDiagnosis.unavailable ? 'unavailable' : 'invalid')
              : (speculativeDiagnosis.valid ? 'valid' : 'invalid'),
            was_speculative: true,
            served_from_cache: false,
          })
          // Soft-fail still persists the row when a result shape exists (S1).
          // Do not emit inference_failed — avoids reliability-dashboard pollution.
          await saveDiagnosticRun(
            ctx,
            speculativeConsultation,
            speculativeDiagnosis,
            speculativeSlots,
            speculativeMissing,
            evidenceScoreForEvent,
            speculativeTurn,
            { isSpeculative: true, targetSlot: speculativeTarget },
          )
          console.log('LibertyMD speculative diagnosis completed', {
            consultation_id: consultation.id,
            turn_index: speculativeTurn,
            outcome: speculativeDiagnosis.valid ? 'valid' : 'invalid',
          })
        } catch (error) {
          console.warn('LibertyMD speculative diagnosis soft-fail', {
            class: error instanceof Error ? error.name : 'unknown',
          })
        }
      })())
    }

    return jsonResponse({
      consultation_id: consultation.id,
      state: nextStatus,
      next_question: nextQuestion,
      options: interview.options,
      target_slot: interview.target_slot,
      missing_slots: missingSlots,
      evidence_score: evidence.score,
      turn_count: turnCount,
      diagnosis_ran: Boolean(shouldRunDiagnosis),
      safety: guardrail.status === 'high_risk_continue' ? toClientSafety(guardrail) : null,
      version: currentVersion,
    })
  } finally {
    const { error: finishError } = await db.rpc('libertymd_finish_consultation_request', {
      p_consultation_id: consultation.id,
      p_user_id: user.id,
      p_request_id: requestId,
    })
    if (finishError) console.error('Unable to clear LibertyMD request lease', finishError)
  }
}
