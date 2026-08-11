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
 *   1. Turn cap — normal interviews stop at 15; unresolved media questions may
 *      use a bounded four-turn extension, and the hard ceiling is 19.
 *   2. No inference after an emergency — the status allow-list is checked at
 *      entry *and* inside `runInterview` / `runDiagnosis`.
 *   3. Exactly one `message_type` from the closed enum — enforced in
 *      `addMessage`; this file previously passed `'question'`, which is not in
 *      the enum and could only ever have failed the CHECK constraint.
 *   4. No write to a consultation the JWT subject does not own — every write
 *      goes through `updateOwnedConsultation` / the row form of `addMessage`.
 */
import { assessClinicalEvidence, classifyResponseRelevance, decideReportOutcome } from '../clinical-policy.ts'
import {
  getDiagnosticClarificationMaxQuestions,
  getDifferentialStopConfidence,
  isDiagnosticClarificationEnabled,
  isSpeculativeDiagnosisEnabled,
  MAX_TURNS,
} from '../lib/config.ts'
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
import { isAsyncDifferentialEnabled } from '../lib/config.ts'
import {
  buildDifferentialHint,
  decideDifferentialStop,
  differentialUpdatePatch,
  readStoredDifferential,
  stalenessTurns,
  shouldAcceptDifferentialWrite,
  shouldScheduleDifferential,
} from '../lib/differential.ts'
import {
  diagnosticClarificationContext,
  readDiagnosticClarificationState,
  selectDiagnosticClarificationCandidate,
  selectDifferentialClarificationCandidate,
  selectNonDuplicateFallbackCandidate,
  selectNonDuplicateInterviewCandidate,
  shouldAskDiagnosticClarification,
  withDiagnosticClarificationCompleted,
  withDiagnosticClarificationQuestion,
} from '../lib/diagnostic-clarification.ts'
import {
  INFERENCE_ALLOWED_STATUSES,
  isInterviewHoldingSource,
  n8nBreakerSnapshot,
  normalizeObject,
  runDiagnosis,
  runDifferential,
  runInterview,
  type DiagnosisResult,
  type N8nStage,
} from '../lib/n8n-client.ts'
import { ensureProfile, getOwnedPatient } from '../lib/profiles.ts'
import { runGuardrail, saveSafetyEvent, toClientSafety } from '../lib/safety.ts'
import {
  buildComprehensionCheckPayload,
  isComprehensionCompleted,
  readComprehensionFlags,
  withComprehensionCompleted,
  withComprehensionPending,
} from '../lib/comprehension-check.ts'
import {
  comprehensionBridgeMessage,
  continueFallbackQuestion,
  continueFallbackQuestions,
  reportGateMessage,
} from '../lib/clinical-copy.ts'
import { calculateMissingSlots, mergeClinicalSlotUpdates } from '../lib/slots.ts'
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
import { asClinicalLanguage } from '../lib/journey-locale.ts'
import {
  MAX_TOTAL_TURNS,
  answerAskedMediaFollowup,
  claimNextMediaFollowup,
  listMediaEvidence,
  mediaCompletionState,
  mediaContextForAgents,
  waivePendingMediaFollowups,
} from '../lib/media-evidence.ts'
import type { ProxyContext } from '../lib/context.ts'
import type {
  ConsultationRow,
  GuardrailResult,
  InterviewResult,
  JsonObject,
  RequestPayload,
} from '../lib/types.ts'

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
 * A comprehension acknowledgement closes the patient-facing interview; it is
 * not another clinical answer that should require the Interview workflow.
 *
 * When the summary itself was served on the final allowed turn, the follow-up
 * acknowledgement arrives while the stored consultation is already at the
 * cap. This snapshot lets that control action continue into Diagnosis/report
 * generation without asking another question or incrementing past the cap.
 */
function cappedComprehensionAcknowledgement(
  consultation: ConsultationRow,
): InterviewResult {
  return {
    next_question: '',
    options: [],
    ready_for_report: true,
    target_slot: String(consultation.target_slot || 'none'),
    slot_updates: {},
    missing_slots: Array.isArray(consultation.missing_slots)
      ? consultation.missing_slots.map(String)
      : [],
    input_relevance: 'clinical',
    input_relevance_reason: 'Patient confirmed the comprehension summary',
    diagnostic_clarification: false,
    clarification_exhausted: true,
    question_purpose: '',
    backup_question: '',
    backup_options: [],
    backup_question_purpose: '',
    working_differential: [],
    diagnostic_confidence: 0,
    stop_reason: 'comprehension_confirmed',
    source: 'comprehension_ack',
  }
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
  maxTurns = MAX_TURNS,
) {
  console.warn('LibertyMD turn cap reached; closing deterministically', {
    invariant: 'max_turns',
    consultation_id: consultation.id,
    turn_count: consultation.turn_count,
    max_turns: maxTurns,
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
      turn_count: turnCount,
      // `turn_limit_confident` — the closed vocabulary shared with
      // clinical-policy and enforced by libertymd_consultations_resolution_
      // reason_check. This branch is "capped *with* a serve-eligible report",
      // which is exactly what that reason means. It previously wrote
      // 'turn_limit_reached', which is not in the CHECK, so every consult that
      // reached the cap failed its UPDATE and surfaced as a 500.
      resolution_reason: 'turn_limit_confident',
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
    turn_count: turnCount,
    // Capped *without* a serve-eligible report — the same reason the
    // non-capped review path writes at line ~501. Was 'turn_limit_reached'.
    resolution_reason: 'insufficient_clinical_information',
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
  const clinicalLanguage = asClinicalLanguage(consultation.language)
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
    let mediaPackets = await listMediaEvidence(ctx, consultation)
    const initialMediaState = mediaCompletionState(mediaPackets)
    const hasClientMediaUpload = payload.media_upload_in_progress === true
    const hasMediaAllowance = hasClientMediaUpload
      || initialMediaState.processing
      || initialMediaState.pendingFollowups.length > 0
    const continuingMediaExtension = consultation.turn_count >= MAX_TURNS
      && mediaPackets.some((packet) => packet.considered_in_consultation)
    const allowedMaxTurns = hasMediaAllowance || continuingMediaExtension
      ? MAX_TOTAL_TURNS
      : Math.max(MAX_TURNS, consultation.turn_count)
    const atCap = consultation.turn_count >= allowedMaxTurns
    const turnCount = atCap ? consultation.turn_count : consultation.turn_count + 1
    assertTurnWithinCap(consultation.id, turnCount, allowedMaxTurns)
    const activeMediaFollowup = initialMediaState.pendingFollowups.find((row) => row.status === 'asked') || null
    let activeMediaFollowupWasServed = false
    if (activeMediaFollowup) {
      const { data: servedMessage, error: servedMessageError } = await db
        .from('libertymd_messages')
        .select('id')
        .eq('consultation_id', consultation.id)
        .eq('role', 'assistant')
        .contains('metadata', { media_followup_id: activeMediaFollowup.id })
        .limit(1)
        .maybeSingle()
      if (servedMessageError) throw servedMessageError
      activeMediaFollowupWasServed = Boolean(servedMessage?.id)
    }
    const { data: existingRequestMessage, error: existingRequestError } = await db
      .from('libertymd_messages')
      .select('id')
      .eq('consultation_id', consultation.id)
      .eq('client_message_id', requestId)
      .maybeSingle()
    if (existingRequestError) throw existingRequestError
    if (!existingRequestMessage) {
      const userMessageMetadata = comprehensionCorrection
        ? { source: 'comprehension_correction' }
        : comprehensionAck
          ? { source: 'comprehension_ack' }
          : activeMediaFollowup && activeMediaFollowupWasServed
            ? {
              source: 'media_followup_answer',
              evidence_kind: activeMediaFollowup.evidence_kind,
              media_followup_id: activeMediaFollowup.id,
            }
            : null
      await addMessage(ctx, consultation, 'user', message, {
        target_slot: consultation.target_slot,
        client_message_id: requestId,
        ...(userMessageMetadata ? { metadata: userMessageMetadata } : {}),
      })
      const answeredSlot = String(consultation.target_slot || '').trim() || 'none'
      // P1-15 S3 — user answer persistence that advances the turn.
      await addProductEvent(ctx, 'turn_completed', consultation.id, {
        turn_index: turnCount,
        target_slot: answeredSlot,
      })
    }

    const answeredMediaFollowup = activeMediaFollowup && activeMediaFollowupWasServed
      ? await answerAskedMediaFollowup(ctx, consultation, message, turnCount)
      : null
    if (answeredMediaFollowup) mediaPackets = await listMediaEvidence(ctx, consultation)
    let mediaContext = mediaContextForAgents(mediaPackets)

    const history = await getHistory(ctx, consultation.id)
    const clarificationEnabled = isDiagnosticClarificationEnabled()
    const clarificationMaxQuestions = getDiagnosticClarificationMaxQuestions()
    const clarificationStateAtStart = readDiagnosticClarificationState(consultation.workflow_versions)
    // The guardrail runs on every turn including the capped one. Skipping the
    // screen because the interview is over would mean an emergency described in
    // the 16th message goes unread — safety asymmetry, CONTEXT.md §4.
    const shouldRunInterview = !atCap || (comprehensionCorrection && !comprehensionAck)
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
      shouldRunInterview
        ? runInterview(
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
          // P5-DDX T5 — steer WHAT is asked. Null when absent or stale; the agent
          // then falls back to missing_slots exactly as before.
          buildDifferentialHint(readStoredDifferential(consultation), turnCount),
          mediaContext,
          {
            comprehensionCorrection,
            diagnosticClarification: diagnosticClarificationContext(
              consultation.workflow_versions,
              clarificationEnabled,
              clarificationMaxQuestions,
            ),
          },
        )
        : comprehensionAck
          ? Promise.resolve(cappedComprehensionAcknowledgement(consultation))
          : Promise.resolve(null),
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

    // P0-13 AC1 — ordinary answers at the cap close deterministically. A
    // comprehension control action is different: the conversation is already
    // closed, and this request owns the promised post-closure Diagnosis/report
    // generation. Never require a report to pre-exist before that generation.
    const postClosureComprehension = atCap && completingComprehension
    if ((atCap && !postClosureComprehension) || !interview) {
      return await closeAtTurnCap(ctx, consultation, turnCount, currentVersion, allowedMaxTurns)
    }

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
    const isNonClinical = !activeMediaFollowup
      && (deterministicRelevance === 'off_topic' || interview.input_relevance === 'off_topic')
    const nonClinicalResponseCount = (consultation.non_clinical_response_count || 0) + (isNonClinical ? 1 : 0)
    const consecutiveNonClinicalResponseCount = isNonClinical
      ? (consultation.consecutive_non_clinical_response_count || 0) + 1
      : 0
    const { slots, appliedUpdates } = mergeClinicalSlotUpdates(
      consultation.filled_slots,
      interview.slot_updates,
      { allowTimingOverwrite: comprehensionCorrection },
    )
    const provisionalEvidence = assessClinicalEvidence(slots)

    if (isNonClinical && !(turnCount >= MAX_TURNS && provisionalEvidence.present.length > 0)) {
      // P1-10 Q6A: last non-off-topic clinical ask (skip prior redirects), not nested warm copy.
      const clinicalAsk = selectLastClinicalAsk(history, interview.next_question)
      const replayOptions = Array.isArray(clinicalAsk.options) ? clinicalAsk.options : interview.options
      // BO 2026-08-02 — "no health information" must mean no *clinical*
      // information.
      //
      // The opening message is stored as `chief_complaint` whatever it says. If
      // the patient opened off-topic ("Who won the game last night?"), that text
      // becomes a filled slot, `present` is non-empty, and this stop can never
      // fire — for precisely the patient it exists to protect. Verified live:
      // six consecutive off-topic messages, `non_clinical_response_count` 5 and
      // `consecutive_non_clinical_response_count` 5 (both past threshold), and
      // the consultation still sat in `interviewing` replaying the same redirect.
      //
      // A chief_complaint that itself classifies as off-topic is not evidence.
      const mergedSlots = slots
      const chiefComplaintText = String((mergedSlots as JsonObject)?.chief_complaint ?? '').trim()
      const chiefComplaintIsClinical = chiefComplaintText.length > 0
        && classifyResponseRelevance(chiefComplaintText) === 'clinical'
      const clinicalPresent = provisionalEvidence.present.filter((slot) =>
        slot !== 'chief_complaint' || chiefComplaintIsClinical)

      const shouldStop = clinicalPresent.length === 0 && (
        turnCount >= MAX_TURNS
        || consecutiveNonClinicalResponseCount >= 3
        || nonClinicalResponseCount >= 5
      )
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
        resolution_reason: shouldStop ? 'no_health_information' : null,
        last_activity_at: new Date().toISOString(),
      })
      if (shouldStop) {
        await addProductEvent(ctx, 'clinical_review_needed', consultation.id, {
          reason: 'no_health_information',
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

    const missingSlots = interview.missing_slots.length ? interview.missing_slots : calculateMissingSlots(slots)
    const evidence = assessClinicalEvidence(slots)

    // File-specific context stays in the normal transcript. It gets priority
    // over another generic interview question, but never over the guardrail
    // above. The hard ceiling prevents many uploads from creating an unbounded
    // consultation; any excess prompts are waived while their evidence remains
    // available to Diagnosis and Report Composer.
    if (turnCount >= MAX_TOTAL_TURNS) {
      await waivePendingMediaFollowups(ctx, consultation)
      mediaPackets = await listMediaEvidence(ctx, consultation)
      mediaContext = mediaContextForAgents(mediaPackets)
    }
    let currentMediaState = mediaCompletionState(mediaPackets)
    if (!currentMediaState.processing && currentMediaState.pendingFollowups.length > 0 && turnCount < MAX_TOTAL_TURNS) {
      const mediaFollowup = activeMediaFollowup && !activeMediaFollowupWasServed
        ? activeMediaFollowup
        : await claimNextMediaFollowup(ctx, consultation, turnCount)
      if (mediaFollowup) {
        const nextStatus = guardrail.status === 'high_risk_continue' ? 'high_risk' : 'interviewing'
        const nextQuestion = limitConsultationMessage(mediaFollowup.question_text)
        await addMessage(ctx, consultation, 'assistant', nextQuestion, {
          options: [],
          target_slot: 'media_evidence',
          metadata: {
            source: 'media_followup',
            evidence_kind: mediaFollowup.evidence_kind,
            evidence_object_uuid: mediaFollowup.evidence_object_uuid,
            media_followup_id: mediaFollowup.id,
            question_order: mediaFollowup.question_order,
          },
        })
        await updateOwnedConsultation(ctx, consultation, {
          status: nextStatus,
          turn_count: turnCount,
          filled_slots: slots,
          missing_slots: missingSlots,
          target_slot: 'media_evidence',
          safety_state: { ...guardrail.raw, status: guardrail.status, risk_level: guardrail.risk_level },
          non_clinical_response_count: nonClinicalResponseCount,
          consecutive_non_clinical_response_count: 0,
          clinical_evidence_score: evidence.score,
          resolution_reason: null,
          last_activity_at: new Date().toISOString(),
        })
        await addProductEvent(ctx, 'question_served', consultation.id, {
          turn_index: turnCount,
          target_slot: 'media_evidence',
          had_options: false,
          was_repeat: false,
          evidence_bucket: scoreBucket(evidence.score),
        })
        mediaPackets = await listMediaEvidence(ctx, consultation)
        return jsonResponse({
          consultation_id: consultation.id,
          state: nextStatus,
          next_question: nextQuestion,
          options: [],
          target_slot: 'media_evidence',
          missing_slots: missingSlots,
          evidence_score: evidence.score,
          turn_count: turnCount,
          diagnosis_ran: false,
          media_followup: {
            kind: mediaFollowup.evidence_kind,
            evidence_id: mediaFollowup.evidence_object_uuid,
            question_order: mediaFollowup.question_order,
          },
          media_evidence: mediaPackets,
          safety: guardrail.status === 'high_risk_continue' ? toClientSafety(guardrail) : null,
          version: currentVersion,
        })
      }
    }
    currentMediaState = mediaCompletionState(mediaPackets)
    const mediaBlocksCompletion = hasClientMediaUpload
      || currentMediaState.processing
      || currentMediaState.pendingFollowups.length > 0
    // Refuse repeated ordinary interview questions at the proxy boundary. The
    // backup was generated in the same Interview call, so selection is local
    // and adds no latency. If both model candidates repeat, use the existing
    // localized open-detail fallback. This boundary also applies before the
    // formal clarification phase: a model label must never exempt a question
    // from transcript-wide deduplication. The purpose-aware selector below then
    // records eligible clarification questions in the bounded phase ledger.
    // `ready_for_report` is advisory. Another gate (for example outstanding
    // differential safety coverage) may still keep the consultation open, so
    // a question returned alongside ready=true can reach the patient and must
    // be deduplicated too.
    let questionCandidatesExhausted = false
    if (interview.next_question) {
      const nonDuplicateCandidate = selectNonDuplicateInterviewCandidate(
        interview,
        history,
        evidence.sufficient ? [] : continueFallbackQuestions(clinicalLanguage),
      )
      if (nonDuplicateCandidate) {
        interview.next_question = nonDuplicateCandidate.question
        interview.options = nonDuplicateCandidate.options
        interview.question_purpose = nonDuplicateCandidate.purpose
      } else {
        // Every available candidate has already been asked and the minimum
        // physician-review fallback set is exhausted. Do not repeat a question
        // merely to keep the chat alive; let the normal clarification/report
        // gates below decide the next phase.
        questionCandidatesExhausted = true
        interview.ready_for_report = true
        interview.next_question = ''
        interview.options = []
        interview.target_slot = 'none'
      }
    }
    // P5-DDX T6 — the stop rule.
    //
    // With the flag on, confidence >= 80 remains the confident early-stop path.
    // A second path handles a different question: whether the history is
    // complete enough for a physician-review report even though no single
    // diagnosis is highly certain. That path requires the Interview workflow to
    // declare its useful questions exhausted, the deterministic evidence floor,
    // and zero outstanding differential red flags. It never changes or inflates
    // the differential confidence itself.
    //
    // With the flag off this collapses to the pre-P5 behaviour exactly.
    const differentialState = readStoredDifferential(consultation)
    const differentialStop = decideDifferentialStop(differentialState, turnCount)
    const freshDifferentialHint = buildDifferentialHint(differentialState, turnCount)
    const differentialClarificationCandidate = selectDifferentialClarificationCandidate(
      Array.isArray(freshDifferentialHint?.entries) ? freshDifferentialHint.entries as JsonObject[] : [],
      history,
      clarificationStateAtStart,
    )
    // The phase is backend-owned. Once core history is sufficient, a new
    // clinical Interview question may consume the bounded clarification budget
    // even when the model omitted its advisory diagnostic_clarification flag.
    // Administrative closing prompts are rejected by the selector.
    const interviewClarificationCandidate = selectDiagnosticClarificationCandidate(
      interview,
      history,
      clarificationStateAtStart,
      true,
    )
    const clarificationConfidenceLow = differentialState.topConfidence === null
      || differentialState.topConfidence < getDifferentialStopConfidence()
    const clarificationEligible = shouldAskDiagnosticClarification({
      enabled: clarificationEnabled,
      turnCount,
      maxTurns: MAX_TURNS,
      evidenceSufficient: evidence.sufficient,
      mediaBlocksCompletion,
      redFlagsOutstanding: differentialState.redFlagsOutstanding,
      topConfidence: differentialState.topConfidence,
      stopConfidence: getDifferentialStopConfidence(),
      state: clarificationStateAtStart,
      maxQuestions: clarificationMaxQuestions,
      // Interview remains the primary question generator. A fresh mini-
      // differential discriminator is the fail-open path when Interview has no
      // useful new clinical question or returns only administrative copy.
      interviewRequestedClarification: Boolean(interviewClarificationCandidate || differentialClarificationCandidate),
    })
    const clarificationCandidate = clarificationEligible
      ? interviewClarificationCandidate || differentialClarificationCandidate
      : null
    let workflowVersionsForTurn = consultation.workflow_versions
    let servingDiagnosticClarification = false
    if (clarificationCandidate) {
      questionCandidatesExhausted = false
      servingDiagnosticClarification = true
      interview.next_question = clarificationCandidate.question
      interview.options = clarificationCandidate.options
      interview.ready_for_report = false
      interview.target_slot = 'diagnostic_clarification'
      workflowVersionsForTurn = withDiagnosticClarificationQuestion(
        workflowVersionsForTurn,
        clarificationStateAtStart,
        clarificationCandidate,
        turnCount,
      )
    } else if (clarificationEligible || (
      clarificationEnabled
      && evidence.sufficient
      && clarificationConfidenceLow
      && !clarificationStateAtStart.completed
      && (clarificationStateAtStart.askedCount >= clarificationMaxQuestions || interview.clarification_exhausted)
    )) {
      const reason = turnCount >= MAX_TURNS
        ? 'turn_limit'
        : clarificationStateAtStart.askedCount >= clarificationMaxQuestions
          ? 'question_budget_exhausted'
          : 'no_new_question'
      workflowVersionsForTurn = withDiagnosticClarificationCompleted(
        workflowVersionsForTurn,
        clarificationStateAtStart,
        reason,
      )
      // Both candidates repeated, the model declared exhaustion, or the
      // bounded budget is spent. Fail open to comprehension/report rather than
      // serving the duplicate question that was rejected above.
      interview.diagnostic_clarification = false
      interview.clarification_exhausted = true
      interview.ready_for_report = true
      interview.next_question = ''
      interview.options = []
      interview.target_slot = 'none'
    } else if (
      clarificationEnabled
      && !clarificationStateAtStart.completed
      && differentialState.topConfidence !== null
      && differentialState.topConfidence >= getDifferentialStopConfidence()
    ) {
      workflowVersionsForTurn = withDiagnosticClarificationCompleted(
        workflowVersionsForTurn,
        clarificationStateAtStart,
        'confidence_met',
      )
    }
    // A completed/exhausted clarification phase can still be blocked for one
    // turn while the async differential refreshes unresolved discriminators.
    // If the phase cleared next_question, rotate to a transcript-new local
    // fallback instead of reintroducing the first fallback at response time.
    if (
      !interview.next_question
      && !servingDiagnosticClarification
      && (!evidence.sufficient || differentialState.redFlagsOutstanding.length > 0)
    ) {
      const postClarificationFallback = selectNonDuplicateFallbackCandidate(
        continueFallbackQuestions(clinicalLanguage),
        history,
      )
      if (postClarificationFallback) {
        interview.next_question = postClarificationFallback.question
        interview.options = []
        interview.question_purpose = postClarificationFallback.purpose
        interview.target_slot = 'none'
        questionCandidatesExhausted = false
      } else {
        questionCandidatesExhausted = true
      }
    }
    const legacyGateOpen = computeShouldRunDiagnosis({
      evidenceScore: evidence.score,
      turnCount,
      readyForReport: interview.ready_for_report,
    })
    const workflowReadyStop = interview.ready_for_report
      && legacyGateOpen
      && evidence.sufficient
      && differentialState.redFlagsOutstanding.length === 0
      && !servingDiagnosticClarification
    const baseGateOpen = isAsyncDifferentialEnabled()
      ? ((differentialStop.stop && evidence.sufficient) || workflowReadyStop)
      : legacyGateOpen
    const mediaExtensionReady = Boolean(answeredMediaFollowup)
      && !mediaBlocksCompletion
      && evidence.sufficient
    // At the normal turn cap, any actual health information deserves a final
    // physician-review report attempt. Confidence affects its labels, not its
    // existence. A score of zero is the only no-health-information exception.
    const informationCapReportReady = turnCount >= MAX_TURNS && evidence.present.length > 0
    const questionExhaustedReportReady = questionCandidatesExhausted
      && evidence.present.length > 0
      && !servingDiagnosticClarification
    const gateOpen = !mediaBlocksCompletion && (
      baseGateOpen || mediaExtensionReady || informationCapReportReady || questionExhaustedReportReady
    )
    const comprehensionDone = isComprehensionCompleted(workflowVersionsForTurn)

    // P1-14 — Diagnosis-gate short-circuit: slots summary OverlaySheet before Diagnosis.
    // Once-completed via workflow_versions (no new column). Dismiss ≠ proceed (client-only).
    if (gateOpen && !comprehensionDone && !completingComprehension) {
      const comprehension = buildComprehensionCheckPayload(slots, clinicalLanguage)
      const nextStatus = guardrail.status === 'high_risk_continue' ? 'high_risk' : 'interviewing'
      const bridge = limitConsultationMessage(comprehensionBridgeMessage(clinicalLanguage))
      await addMessage(ctx, consultation, 'assistant', bridge, {
        options: [],
        target_slot: interview.target_slot,
        slot_updates: appliedUpdates,
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
        workflow_versions: withComprehensionPending(workflowVersionsForTurn),
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
    let workflowVersions = workflowVersionsForTurn
    if (completingComprehension) {
      workflowVersions = withComprehensionCompleted(workflowVersionsForTurn)
      // Persist before Diagnosis so a holding/unavailable path cannot re-open the sheet forever.
      await updateOwnedConsultation(ctx, consultation, {
        workflow_versions: workflowVersions,
        last_activity_at: new Date().toISOString(),
      })
    }

    // Ack / correction after a pending sheet must reach Diagnosis even on an odd turn.
    // BO 2026-08-02 — the final turn always attempts a diagnosis.
    //
    // `decideReportOutcome` promises that at the cap "any usable health
    // information plus a structurally valid three-item differential is
    // released, even when confidence is low". That promise was unreachable:
    // diagnosis only ran once the mini-differential gate opened (now >= 80), so a
    // consult whose differential stayed low never attempted one and
    // `turn_limit_report` could never fire. Verified live — three corpus cases
    // reached turn 15 with differentials of 40, 25 and null, recorded ZERO
    // `diagnosis_attempted` events, and closed `insufficient_clinical_
    // information`: a technical non-attempt wearing clinical clothing.
    //
    // Low confidence is precisely what the physician-review report is for.
    // Attempt it on the last turn and let the policy decide; the band labels
    // the result. Media still blocks — unresolved evidence is a real reason to
    // wait, unlike a differential that simply never got confident.
    const shouldRunDiagnosis =
      (gateOpen || completingComprehension || turnCount >= MAX_TURNS) && !mediaBlocksCompletion
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
        media_context: mediaContext,
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
        diagnosis = await runDiagnosis(history, patientPayload(patient), diagnosisInput, slots, requestId, {
          mediaContext,
        })
      }

      await addProductEvent(ctx, 'diagnosis_attempted', consultation.id, {
        turn_index: turnCount,
        evidence_bucket: scoreBucket(evidence.score),
        outcome: diagnosis.failure
          ? (diagnosis.unavailable ? 'unavailable' : 'invalid')
          : (diagnosis.valid ? 'valid' : 'invalid'),
        was_speculative: servedFromSpeculativeCache,
        ...(servedFromSpeculativeCache ? { served_from_cache: true } : { served_from_cache: false }),
        // P5-DDX T8 — how the consult reached the gate. Bucketed, never raw:
        // a confidence figure is clinical reasoning, and CONTEXT §3.5 keeps
        // that out of telemetry. `stop_reason` is what makes a completion-rate
        // drop diagnosable — turn_ceiling and red_flags_outstanding are very
        // different problems with the same symptom.
        differential_confidence_bucket: scoreBucket(differentialState.topConfidence ?? 0),
        differential_stale_turns: stalenessTurns(differentialState, turnCount) ?? -1,
        differential_red_flags_open: differentialState.redFlagsOutstanding.length,
        stop_reason: differentialStop.stop
          ? 'confidence_met'
          : workflowReadyStop
            ? 'workflow_ready'
            : differentialStop.reason,
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
          { isSpeculative: false, mediaContext },
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
      comprehensionConfirmed: completingComprehension,
    })

    // A failed report attempt after the patient shared health information is a
    // technical state, never an "incomplete consultation" state. Hold so it can
    // be retried without consuming or closing the consultation.
    if (
      !mediaBlocksCompletion
      && reportDecision.outcome === 'continue'
      && reportDecision.reason === 'retry_report_generation'
      && diagnosis?.failure
    ) {
      return holdingState(consultation, 'diagnosis', currentVersion, requestId)
    }

    if (!mediaBlocksCompletion && (reportDecision.outcome === 'complete' || Boolean(diagnosis?.valid) || Boolean(diagnosis?.differentials?.length)) && diagnosis) {
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
          media_evidence_ids: mediaContext.map((item) => String(item.evidence_id || '')).filter(Boolean),
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

      const reportGateText = reportGateMessage(clinicalLanguage, isAnonymous)

      await addMessage(ctx, consultation, 'assistant', reportGateText, {
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

    if (!mediaBlocksCompletion && reportDecision.outcome === 'review') {
      const messageText = 'I could not identify any health concern or symptom information in this consultation, so there is no clinical report to prepare. Start a new consultation whenever you are ready to discuss your health.'
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
      interview.next_question || continueFallbackQuestion(clinicalLanguage),
    )
    const nextStatus = guardrail.status === 'high_risk_continue' ? 'high_risk' : 'interviewing'
    await addMessage(ctx, consultation, 'assistant', nextQuestion, {
      options: interview.options,
      target_slot: interview.target_slot,
      slot_updates: appliedUpdates,
      metadata: {
        workflow_source: interview.source,
        safety_status: guardrail.status,
        ...(servingDiagnosticClarification
          ? {
            diagnostic_clarification: true,
            question_purpose: clarificationCandidate?.purpose || '',
            used_backup_question: clarificationCandidate?.usedBackup === true,
          }
          : {}),
      },
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
      workflow_versions: workflowVersions,
    })

    const nextSlot = String(interview.target_slot || '').trim() || 'none'
    const nextOptions = Array.isArray(interview.options) ? interview.options : []
    await addProductEvent(ctx, 'question_served', consultation.id, {
      turn_index: turnCount,
      target_slot: nextSlot,
      had_options: nextOptions.length > 0,
      was_repeat: false,
      evidence_bucket: scoreBucket(evidence.score),
      diagnostic_clarification: servingDiagnosticClarification,
    })

    // P1-08 — detached speculative Diagnosis one gate-step ahead (Q1 A+S1).
    // After persist so the snapshot matches committed slots. Never blocks
    // next_question. Never sets diagnosis_ran. Never writes intermediate_diagnoses.
    if (
      !shouldRunDiagnosis
      && !mediaBlocksCompletion
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
            { speculative: true, mediaContext },
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
            { isSpeculative: true, targetSlot: speculativeTarget, mediaContext },
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

    // P5-DDX T4 — schedule the mini-differential detached. Nothing below this
    // point may await it: the whole design premise is that the differential
    // never costs the patient a second. A failure returns null and leaves the
    // previously stored differential in place.
    if (shouldScheduleDifferential(turnCount)) {
      const differentialTurn = turnCount
      const differentialSlots = slots
      const differentialHistory = history
      const differentialPatient = patientPayload(patient)
      const differentialLanguage = String(consultation.language || 'en')
      const priorForModel = (() => {
        const stored = readStoredDifferential(consultation)
        if (stored.entries.length === 0) return null
        return { entries: stored.entries, computed_at_turn: stored.computedAtTurn }
      })()
      scheduleDetached((async () => {
        const result = await runDifferential(
          differentialHistory,
          differentialPatient,
          differentialSlots,
          differentialTurn,
          differentialLanguage,
          priorForModel as JsonObject | null,
          requestId,
          mediaContext,
        )
        if (!result) return
        // Ordering guard: re-read the row rather than trusting the snapshot this
        // turn started with, because another detached run may have landed in
        // between. Accept only a strictly newer view of the case.
        const { data: fresh } = await db
          .from('libertymd_consultations')
          .select('working_differential,differential_top_confidence,differential_red_flags_outstanding,differential_computed_at_turn')
          .eq('id', consultation.id)
          .maybeSingle()
        const stored = readStoredDifferential((fresh || {}) as ConsultationRow)
        if (!shouldAcceptDifferentialWrite(stored, result)) {
          console.warn('LibertyMD differential discarded as out of order', {
            consultation_id: consultation.id,
            incoming_turn: result.computed_at_turn,
            stored_turn: stored.computedAtTurn,
          })
          return
        }
        await db
          .from('libertymd_consultations')
          .update(differentialUpdatePatch(result))
          .eq('id', consultation.id)
          .eq('user_id', user.id)
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
      // P5-DDX — echo the STORED differential, not the interview's. The
      // interview stopped computing one when the mini-differential workflow
      // took the job; reading `interview.*` here reported 0 on every turn while
      // the real value sat in the row. Machine-read: condition names are
      // English by contract and no client surface renders them to the patient.
      working_differential: differentialState.entries,
      diagnostic_confidence: differentialState.topConfidence ?? 0,
      differential_stale_turns: stalenessTurns(differentialState, turnCount) ?? -1,
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
