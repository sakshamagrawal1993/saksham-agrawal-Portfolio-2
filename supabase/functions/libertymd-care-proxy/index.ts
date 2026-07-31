/**
 * libertymd-care-proxy — dispatch only.
 *
 * L0-5 decomposed the previous 1508-line monolith into `actions/` (one module
 * per proxy action) and `lib/` (safety, slots, telemetry, errors, n8n client,
 * persistence). This file does four things and nothing else: CORS/method
 * handling, request parsing, context creation, and action dispatch.
 *
 * Architectural rules this function owns (see docs/libertymd/CARE-ARCHITECTURE.md
 * and LibertyMD/tickets/CONTEXT.md):
 *   1. The frontend never writes clinical tables — only this function does.
 *   2. This proxy is the sole clinical writer and the sole decision-maker about
 *      what gets persisted.
 *   3. n8n is stateless inference: JSON in, JSON out, no database writes.
 *   4. Identity comes from the JWT, never from the payload.
 *   5. No PHI in telemetry, logs, client payloads or error strings.
 *
 * Adding an action: add the literal to `ProxyAction` in lib/types.ts, write the
 * handler in `actions/`, register it in HANDLERS below. Do not add logic here.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { handleAbandonConsultation, handleResumeConsultation } from './actions/abandon-resume.ts'
import { handleBootstrap } from './actions/bootstrap.ts'
import { handleCreatePatient } from './actions/create-patient.ts'
import { handleUpdatePatient } from './actions/update-patient.ts'
import { handleDeletePatient } from './actions/delete-patient.ts'
import { handleListOwnedPatients } from './actions/list-owned-patients.ts'
import {
  handleCompleteAccountMerge,
  handlePrepareAccountMerge,
  handleRecordIdentityEvent,
  handleSyncIdentity,
} from './actions/identity.ts'
import {
  handleGetConsultation,
  handleGetHistory,
  handleGetPartialOutcome,
} from './actions/reads.ts'
import { handleReleaseReport } from './actions/report.ts'
import {
  handleRedeemReportLink,
  handleRequestReportEmail,
} from './actions/report-email-delivery.ts'
import { handleSubmitReportFeedback } from './actions/submit-report-feedback.ts'
import { handleRecordCareInterest } from './actions/record-care-interest.ts'
import { handleUploadPhoto } from './actions/photo-upload.ts'
import { handleUploadLab } from './actions/lab-upload.ts'
import {
  handleRespondFollowupCheckin,
  handleUnsubscribeFollowupCheckin,
} from './actions/followup-checkin.ts'
import { handleSaveDemographics } from './actions/save-demographics.ts'
import { handleSendMessage } from './actions/send-message.ts'
import { handleStartConsultation } from './actions/start-consultation.ts'
import { isInvariantViolation } from './lib/consultations.ts'
import { createProxyContext, type ProxyContext } from './lib/context.ts'
import { errorResponse, jsonResponse } from './lib/errors.ts'
import type { ProxyAction, RequestPayload } from './lib/types.ts'

type ActionHandler = (ctx: ProxyContext, payload: RequestPayload) => Promise<Response>

/**
 * A Map, not an object literal: an attacker-supplied action of `toString` or
 * `constructor` would resolve against Object.prototype on a plain object and
 * dispatch something that is not a handler. Map has no prototype chain lookup,
 * so any unknown action falls through to the 400 below exactly as before.
 */
const HANDLERS = new Map<ProxyAction, ActionHandler>([
  ['bootstrap', handleBootstrap],
  ['abandon_consultation', handleAbandonConsultation],
  ['resume_consultation', handleResumeConsultation],
  ['start_consultation', handleStartConsultation],
  ['save_demographics', handleSaveDemographics],
  ['send_message', handleSendMessage],
  ['prepare_account_merge', handlePrepareAccountMerge],
  ['complete_account_merge', handleCompleteAccountMerge],
  ['release_report', handleReleaseReport],
  ['sync_identity', handleSyncIdentity],
  ['record_identity_event', handleRecordIdentityEvent],
  ['get_history', handleGetHistory],
  ['get_consultation', handleGetConsultation],
  ['get_partial_outcome', handleGetPartialOutcome],
  ['create_patient', handleCreatePatient],
  ['update_patient', handleUpdatePatient],
  ['delete_patient', handleDeletePatient],
  ['list_owned_patients', handleListOwnedPatients],
  ['request_report_email', handleRequestReportEmail],
  ['redeem_report_link', handleRedeemReportLink],
  ['submit_report_feedback', handleSubmitReportFeedback],
  ['record_care_interest', handleRecordCareInterest],
  ['upload_photo', handleUploadPhoto],
  ['upload_lab', handleUploadLab],
  ['respond_followup_checkin', handleRespondFollowupCheckin],
  ['unsubscribe_followup_checkin', handleUnsubscribeFollowupCheckin],
])

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const requestStartedAt = performance.now()
  try {
    const payload = await req.json() as RequestPayload
    const context = await createProxyContext(req, requestStartedAt)
    if (!context.ok) return context.response

    const handler = HANDLERS.get(payload.action)
    if (!handler) return jsonResponse({ error: 'Invalid action' }, 400)
    return await handler(context.ctx, payload)
  } catch (error) {
    // P0-13 · dispatch-level invariant handling. A hard invariant (turn cap,
    // post-emergency inference, message_type enum, consultation ownership) is a
    // refusal, not a server fault, so it carries its own status rather than
    // collapsing into the 500 bucket. The guards themselves already logged the
    // violation with context; this only records which action carried it.
    if (isInvariantViolation(error)) {
      console.warn('LibertyMD invariant violation reached dispatch', { invariant: error.invariant })
      return jsonResponse({ error: error.message, invariant: error.invariant }, error.httpStatus)
    }
    return errorResponse(error)
  }
})
