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
import { MAX_TURNS } from '../lib/config.ts'
import {
  addMessage,
  assertTurnWithinCap,
  getHistory,
  getOwnedConsultation,
  replayCompletedTurn,
  saveDiagnosticRun,
  updateOwnedConsultation,
} from '../lib/consultations.ts'
import { jsonResponse } from '../lib/errors.ts'
import {
  INFERENCE_ALLOWED_STATUSES,
  n8nBreakerSnapshot,
  normalizeObject,
  runDiagnosis,
  runInterview,
  type DiagnosisResult,
  type N8nStage,
} from '../lib/n8n-client.ts'
import { ensureProfile, getOwnedPatient } from '../lib/profiles.ts'
import { runGuardrail, saveSafetyEvent } from '../lib/safety.ts'
import { calculateMissingSlots } from '../lib/slots.ts'
import { addProductEvent } from '../lib/telemetry.ts'
import { addDays, cleanMessage, limitConsultationMessage, patientPayload } from '../lib/utils.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { ConsultationRow, JsonObject, RequestPayload } from '../lib/types.ts'

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
function holdingState(consultation: ConsultationRow, stage: N8nStage, currentVersion: number) {
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

  const { data: existingReport, error: reportLookupError } = await ctx.db
    .from('libertymd_reports')
    .select('access_status,confidence_score')
    .eq('consultation_id', consultation.id)
    .eq('user_id', ctx.user.id)
    .maybeSingle()
  if (reportLookupError) throw reportLookupError
  const reportIsValid = Boolean(existingReport) && Number(existingReport?.confidence_score || 0) > 0

  const now = new Date().toISOString()
  if (reportIsValid) {
    const status = ctx.isAnonymous ? 'report_pending_auth' : 'completed'
    await addMessage(ctx, consultation, 'assistant', ctx.isAnonymous
      ? 'We have reached the end of this consultation. Your LibertyMD report is ready — link Google to save it, or continue without saving.'
      : 'We have reached the end of this consultation. Your LibertyMD report is ready and saved to your history.', {
      message_type: 'report_gate',
    })
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
      confidence_score: Number(existingReport?.confidence_score || 0),
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
    return jsonResponse({
      error: 'Another answer is already being processed',
      retryable: true,
      current_version: claim?.current_version || consultation.version,
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
      })
    }
    const history = await getHistory(ctx, consultation.id)
    // The guardrail runs on every turn including the capped one. Skipping the
    // screen because the interview is over would mean an emergency described in
    // the 16th message goes unread — safety asymmetry, CONTEXT.md §4.
    const [guardrail, interview] = await Promise.all([
      runGuardrail(message, history, patientPayload(patient), consultation.filled_slots),
      atCap ? Promise.resolve(null) : runInterview(
        history,
        patientPayload(patient),
        consultation.filled_slots,
        consultation.missing_slots,
        consultation.target_slot,
        turnCount,
        consultation.status,
        consultation.id,
      ),
    ])
    await saveSafetyEvent(ctx, consultation, guardrail, turnCount)

    if (guardrail.force_end) {
      await addMessage(ctx, consultation, 'assistant', guardrail.message, { message_type: 'safety' })
      await updateOwnedConsultation(ctx, consultation, {
        status: 'emergency_stopped',
        turn_count: turnCount,
        safety_state: guardrail.raw,
        last_activity_at: new Date().toISOString(),
      })
      await addProductEvent(ctx, 'emergency_stopped', consultation.id, { turn_count: turnCount, source: guardrail.source })
      return jsonResponse({ consultation_id: consultation.id, emergency: true, safety: guardrail, message: guardrail.message, version: currentVersion })
    }

    // P0-13 AC1 — the deterministic transition at the cap. Report if one is
    // already valid, otherwise clinical review. No inference was issued.
    if (atCap || !interview) return await closeAtTurnCap(ctx, consultation, turnCount, currentVersion)

    // P0-11 AC3 — the interview stage is down. One calm holding state; the turn
    // is not consumed and no fabricated question reaches the transcript.
    if (interview.source === 'breaker_open') return holdingState(consultation, 'interview', currentVersion)

    const deterministicRelevance = classifyResponseRelevance(message)
    const isNonClinical = deterministicRelevance === 'off_topic' || interview.input_relevance === 'off_topic'
    const nonClinicalResponseCount = (consultation.non_clinical_response_count || 0) + (isNonClinical ? 1 : 0)
    const consecutiveNonClinicalResponseCount = isNonClinical
      ? (consultation.consecutive_non_clinical_response_count || 0) + 1
      : 0

    if (isNonClinical) {
      const previousPrompt = [...history].reverse().find((item) => {
        const row = item as JsonObject
        return row.role === 'assistant' && row.message_type !== 'safety'
      }) as JsonObject | undefined
      const shouldStop = turnCount >= MAX_TURNS || consecutiveNonClinicalResponseCount >= 3 || nonClinicalResponseCount >= 5
      const messageText = limitConsultationMessage(shouldStop
        ? 'I do not have enough relevant health information to produce a responsible differential diagnosis. Please restart with the symptom details or continue with a licensed clinician.'
        : `I need a health-related answer to continue safely. ${cleanMessage(previousPrompt?.content) || interview.next_question}`)

      await addMessage(ctx, consultation, 'assistant', messageText, {
        // P0-13 AC3: this was `'question'`, which is not one of the six values
        // the `libertymd_messages` CHECK constraint permits — so every
        // off-topic, non-stopping turn was writing a row the database had to
        // reject. `'normal'` is what the other interview questions in this file
        // and in save_demographics already use (via the column default).
        message_type: shouldStop ? 'safety' : 'normal',
        options: shouldStop ? [] : (Array.isArray(previousPrompt?.options) ? previousPrompt.options : interview.options),
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
        options: shouldStop ? [] : (Array.isArray(previousPrompt?.options) ? previousPrompt.options : interview.options),
        version: currentVersion,
      })
    }

    const slots = { ...consultation.filled_slots, ...interview.slot_updates }
    const missingSlots = interview.missing_slots.length ? interview.missing_slots : calculateMissingSlots(slots)
    const evidence = assessClinicalEvidence(slots)
    const shouldRunDiagnosis = evidence.score >= 50 && turnCount >= 6 && (turnCount % 2 === 0 || interview.ready_for_report || turnCount >= MAX_TURNS)
    let diagnosis: DiagnosisResult | null = null
    let diagnosticRunId: string | null = null

    if (shouldRunDiagnosis) {
      const diagnosisInput = { ...consultation, turn_count: turnCount }
      diagnosis = await runDiagnosis(history, patientPayload(patient), diagnosisInput, slots)
      diagnosticRunId = await saveDiagnosticRun(
        ctx,
        diagnosisInput,
        diagnosis,
        slots,
        missingSlots,
        evidence.score,
        turnCount,
      )
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
      return holdingState(consultation, 'diagnosis', currentVersion)
    }

    if (reportDecision.outcome === 'complete' && diagnosis) {
      const now = new Date().toISOString()
      const accessStatus = isAnonymous ? 'withheld' : 'saved'
      const { error: reportError } = await db.from('libertymd_reports').upsert({
        consultation_id: consultation.id,
        user_id: user.id,
        report_data: diagnosis.raw,
        confidence_score: diagnosis.confidence,
        final_diagnostic_run_id: diagnosticRunId,
        access_status: accessStatus,
        released_at: isAnonymous ? null : now,
        retention_expires_at: isAnonymous ? addDays(30) : null,
        model_metadata: {
          ...normalizeObject(diagnosis.raw.model_metadata),
          source: 'libertymd-diagnosis',
          turn_count: turnCount,
        },
      }, { onConflict: 'consultation_id' })
      if (reportError) throw reportError

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
      })
      await addProductEvent(ctx, 'report_gate_reached', consultation.id, {
        confidence_score: diagnosis.confidence,
        evidence_score: evidence.score,
        is_anonymous: isAnonymous,
      })

      return jsonResponse({
        consultation_id: consultation.id,
        state: isAnonymous ? 'report_pending_auth' : 'completed',
        report_ready: true,
        auth_required: isAnonymous,
        report: isAnonymous ? undefined : diagnosis.raw,
        confidence_score: diagnosis.confidence,
        evidence_score: evidence.score,
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
        version: currentVersion,
      })
    }

    const nextQuestion = limitConsultationMessage(
      interview.next_question || 'Before I prepare the report, is there anything else about the symptom or your medical history that may be important?',
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
    })

    return jsonResponse({
      consultation_id: consultation.id,
      state: nextStatus,
      next_question: nextQuestion,
      options: interview.options,
      target_slot: interview.target_slot,
      missing_slots: missingSlots,
      evidence_score: evidence.score,
      safety: guardrail.status === 'high_risk_continue' ? guardrail : null,
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
