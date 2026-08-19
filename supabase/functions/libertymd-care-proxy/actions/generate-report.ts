/**
 * Idempotent, patient-message-free report generation.
 *
 * The chat redirects to the report page as soon as the patient confirms the
 * consultation summary. That page may therefore outlive the final send_message
 * request. This action lets it safely resume a failed diagnosis without adding
 * a fake chat turn, releasing a report that does not exist, or racing the final
 * request. The consultation request lease and report uniqueness constraint are
 * the concurrency controls.
 */
import { assessClinicalEvidence } from '../clinical-policy.ts'
import { MAX_TURNS } from '../lib/config.ts'
import {
  getHistory,
  getOwnedConsultation,
  saveDiagnosticRun,
} from '../lib/consultations.ts'
import { isComprehensionCompleted } from '../lib/comprehension-check.ts'
import { dispatchDiagnosisGuidance } from '../lib/diagnosis-guidance.ts'
import { jsonResponse } from '../lib/errors.ts'
import {
  listMediaEvidence,
  mediaCompletionState,
  mediaContextForAgents,
} from '../lib/media-evidence.ts'
import { runDiagnosis } from '../lib/n8n-client.ts'
import { getOwnedPatient } from '../lib/profiles.ts'
import {
  ensureReportInserted,
  finalizeFromExistingReport,
  findOwnedReport,
  isCompleteStoredReport,
  isServeEligibleStoredReport,
  repairIncompleteReport,
} from '../lib/report-persistence.ts'
import { calculateMissingSlots } from '../lib/slots.ts'
import { addProductEvent, emitInferenceFailed, scoreBucket } from '../lib/telemetry.ts'
import { addDays, patientPayload } from '../lib/utils.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { RequestPayload } from '../lib/types.ts'

const GENERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function generationPending(consultationId: string, reason: string, retryAfterMs = 3_000) {
  return jsonResponse({
    consultation_id: consultationId,
    generation_pending: true,
    retryable: true,
    retry_after_ms: retryAfterMs,
    reason,
  }, 202)
}

export async function handleGenerateReport(ctx: ProxyContext, payload: RequestPayload) {
  if (!payload.consultation_id) return jsonResponse({ error: 'Missing consultation id' }, 400)
  const requestId = String(payload.generation_request_id || '').trim() || crypto.randomUUID()
  if (!GENERATION_ID.test(requestId)) return jsonResponse({ error: 'Invalid generation request id' }, 400)

  let consultation = await getOwnedConsultation(ctx, payload.consultation_id)
  const existing = await findOwnedReport(ctx, consultation.id)
  if (isCompleteStoredReport(existing) && existing) {
    return finalizeFromExistingReport(ctx, consultation, existing, {
      turnCount: consultation.turn_count,
      currentVersion: consultation.version,
      evidenceScore: consultation.clinical_evidence_score,
      diagnosisRan: false,
    })
  }

  // The report route can load before the final chat turn releases its request
  // lease. That is normal asynchronous progress, not a readiness conflict.
  // Return 202 before evaluating the still-stale turn/comprehension snapshot.
  const activeRequestStartedAt = consultation.active_request_started_at
    ? new Date(consultation.active_request_started_at).getTime()
    : Number.NaN
  const hasFreshActiveRequest = Boolean(
    consultation.active_request_id
    && Number.isFinite(activeRequestStartedAt)
    && activeRequestStartedAt > Date.now() - 2 * 60_000,
  )
  if (hasFreshActiveRequest) {
    return generationPending(consultation.id, 'request_in_progress')
  }

  const comprehensionComplete = isComprehensionCompleted(consultation.workflow_versions)
  if (consultation.turn_count < MAX_TURNS && !comprehensionComplete) {
    return jsonResponse({ error: 'Consultation is not ready for report generation' }, 409)
  }
  const repairingIncompleteReport = isServeEligibleStoredReport(existing) && !isCompleteStoredReport(existing)
  if (!['interviewing', 'high_risk'].includes(consultation.status)
    && !(repairingIncompleteReport && ['completed', 'report_pending_auth', 'clinical_review_needed'].includes(consultation.status))) {
    return jsonResponse({ error: `Report generation is unavailable in ${consultation.status}` }, 409)
  }

  const { data: claims, error: claimError } = await ctx.db.rpc('libertymd_claim_consultation_request', {
    p_consultation_id: consultation.id,
    p_user_id: ctx.user.id,
    p_request_id: requestId,
    p_expected_version: null,
  })
  if (claimError) throw claimError
  const claim = Array.isArray(claims) ? claims[0] : claims
  if (!claim?.accepted) return generationPending(consultation.id, 'request_in_progress')
  const currentVersion = Number(claim.current_version || consultation.version)

  try {
    consultation = await getOwnedConsultation(ctx, consultation.id)
    const reportAfterClaim = await findOwnedReport(ctx, consultation.id)
    if (isCompleteStoredReport(reportAfterClaim) && reportAfterClaim) {
      return finalizeFromExistingReport(ctx, consultation, reportAfterClaim, {
        turnCount: consultation.turn_count,
        currentVersion,
        evidenceScore: consultation.clinical_evidence_score,
        diagnosisRan: false,
      })
    }

    const mediaPackets = await listMediaEvidence(ctx, consultation)
    const mediaState = mediaCompletionState(mediaPackets)
    if (mediaState.processing || mediaState.pendingFollowups.length > 0) {
      return generationPending(consultation.id, 'media_processing')
    }

    const slots = consultation.filled_slots || {}
    const evidence = assessClinicalEvidence(slots)
    if (evidence.present.length === 0) {
      return jsonResponse({
        consultation_id: consultation.id,
        generation_pending: false,
        no_health_information: true,
      }, 422)
    }

    const patient = await getOwnedPatient(ctx, consultation.patient_id)
    const history = await getHistory(ctx, consultation.id)
    const mediaContext = mediaContextForAgents(mediaPackets)
    const diagnosis = await runDiagnosis(
      history,
      patientPayload(patient),
      consultation,
      slots,
      requestId,
      { mediaContext, allowTerminalReportRepair: repairingIncompleteReport },
    )
    await addProductEvent(ctx, 'diagnosis_attempted', consultation.id, {
      turn_index: consultation.turn_count,
      evidence_bucket: scoreBucket(evidence.score),
      outcome: diagnosis.failure
        ? (diagnosis.unavailable ? 'unavailable' : 'invalid')
        : (diagnosis.valid ? 'valid' : 'invalid'),
      was_speculative: false,
      served_from_cache: false,
      stop_reason: 'report_recovery',
    })
    const diagnosticRunId = await saveDiagnosticRun(
      ctx,
      consultation,
      diagnosis,
      slots,
      calculateMissingSlots(slots),
      evidence.score,
      consultation.turn_count,
      { isSpeculative: false, mediaContext },
    )

    if (!diagnosis.valid || diagnosis.differentials.length !== 3) {
      await emitInferenceFailed(ctx, consultation.id, {
        stage: 'diagnosis',
        error_class: diagnosis.failure === 'timeout'
          ? 'timeout'
          : diagnosis.failure === 'http_error'
            ? 'http_error'
            : diagnosis.failure === 'breaker_open'
              ? 'breaker_open'
              : diagnosis.failure === 'malformed_payload'
                ? 'malformed_payload'
                : 'unavailable',
        outcome: diagnosis.unavailable ? 'holding_candidate' : 'invalid',
      })
      return generationPending(consultation.id, 'diagnosis_retry_required', 5_000)
    }

    const now = new Date().toISOString()
    const reportInput = {
      consultationId: consultation.id,
      userId: ctx.user.id,
      reportData: diagnosis.raw,
      confidenceScore: diagnosis.confidence,
      finalDiagnosticRunId: diagnosticRunId,
      accessStatus: ctx.isAnonymous ? 'withheld' : 'saved',
      releasedAt: ctx.isAnonymous ? null : now,
      retentionExpiresAt: ctx.isAnonymous ? addDays(30) : null,
      modelMetadata: {
        source: 'libertymd-diagnosis-recovery',
        turn_count: consultation.turn_count,
        media_evidence_ids: mediaContext.map((item) => String(item.evidence_id || '')).filter(Boolean),
      },
    }
    const latestStoredReport = await findOwnedReport(ctx, consultation.id)
    const persisted = latestStoredReport
      ? await repairIncompleteReport(ctx, reportInput)
      : await ensureReportInserted(ctx, reportInput)
    const report = persisted.report
    const materializedCompleteReport = 'repaired' in persisted ? persisted.repaired : persisted.inserted
    if (materializedCompleteReport) {
      await addProductEvent(ctx, 'report_gate_reached', consultation.id, {
        confidence_bucket: scoreBucket(diagnosis.confidence),
        evidence_bucket: scoreBucket(evidence.score),
        is_anonymous: ctx.isAnonymous,
      })
      await addProductEvent(ctx, 'report_ready', consultation.id, {
        turn_index: consultation.turn_count,
        confidence_bucket: scoreBucket(diagnosis.confidence),
        evidence_bucket: scoreBucket(evidence.score),
        is_anonymous: ctx.isAnonymous,
      })
    }
    // P5-GUIDE — per-diagnosis guidance is dispatched here and NOT awaited. The
    // report returns at the same speed it always has; the guidance run lands
    // afterwards and the client hydrates the cards on a later poll. Only fires
    // on a freshly materialized report: a re-serve already has its guidance, or
    // already failed to get any.
    if (materializedCompleteReport && report.id) {
      try {
        await dispatchDiagnosisGuidance(ctx, {
          reportId: report.id,
          consultationId: consultation.id,
          reportData: reportInput.reportData,
          language: String(consultation.language || 'en'),
          clinicalContext: diagnosis.raw?.clinical_context,
        })
      } catch (guidanceError) {
        // Never fatal: the report is composed and persisted at this point.
        console.error('Unable to dispatch LibertyMD diagnosis guidance', guidanceError)
      }
    }
    return finalizeFromExistingReport(ctx, consultation, report, {
      turnCount: consultation.turn_count,
      currentVersion,
      evidenceScore: evidence.score,
      diagnosisRan: true,
      resolutionReason: consultation.turn_count >= MAX_TURNS
        ? 'turn_limit_report'
        : 'comprehension_confirmed',
    })
  } finally {
    const { error } = await ctx.db.rpc('libertymd_finish_consultation_request', {
      p_consultation_id: consultation.id,
      p_user_id: ctx.user.id,
      p_request_id: requestId,
    })
    if (error) console.error('Unable to clear LibertyMD report-generation lease', error)
  }
}
