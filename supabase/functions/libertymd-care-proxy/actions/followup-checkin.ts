/**
 * P4-01 — `respond_followup_checkin` + `unsubscribe_followup_checkin`.
 * P4-02 — one-shot `saw_doctor` / optional `report_match` on same action.
 *
 * Bearer token-hash auth (P2-08-shaped). Session JWT is transport only —
 * never trust client-supplied user_id or slot maps. Worse → live join prior
 * consult → new consult seed (no clinical blob on ledger).
 * `used_at` is observational — do not reject solely on used_at (doctor one-shot).
 */
import { addMessage } from '../lib/consultations.ts'
import { jsonResponse } from '../lib/errors.ts'
import {
  isFollowupAnswer,
  type FollowupAnswer,
} from '../lib/followup-checkin.ts'
import { getOrCreateSelfPatient } from '../lib/profiles.ts'
import { calculateMissingSlots, sanitizeSlotUpdates } from '../lib/slots.ts'
import { addDays, sha256 } from '../lib/utils.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { JsonObject, RequestPayload } from '../lib/types.ts'

const TOKEN_EXPIRED = {
  status: 'expired',
  error: 'This check-in link has expired.',
  severity: 'technical',
} as const

const TOKEN_UNAVAILABLE = {
  status: 'unavailable',
  error: 'This check-in is no longer available.',
  severity: 'technical',
} as const

const PRIOR_PURGED = {
  status: 'unavailable',
  code: 'prior_consult_unavailable',
  error: 'We could not restart from your earlier consultation. You can start a new one anytime.',
  severity: 'technical',
} as const

const SAW_DOCTOR_VALUES = ['yes', 'no', 'not_yet'] as const
export type FollowupSawDoctor = (typeof SAW_DOCTOR_VALUES)[number]

const REPORT_MATCH_VALUES = ['yes', 'no', 'unsure'] as const
export type FollowupReportMatch = (typeof REPORT_MATCH_VALUES)[number]

function isSawDoctor(value: unknown): value is FollowupSawDoctor {
  return typeof value === 'string' &&
    (SAW_DOCTOR_VALUES as readonly string[]).includes(value)
}

function isReportMatch(value: unknown): value is FollowupReportMatch {
  return typeof value === 'string' &&
    (REPORT_MATCH_VALUES as readonly string[]).includes(value)
}

function hasDoctorPatch(payload: RequestPayload): boolean {
  const raw = payload.followup_saw_doctor
  return typeof raw === 'string' && raw.trim().length > 0
}

async function lookupFollowupToken(
  ctx: ProxyContext,
  rawToken: string,
  purpose: 'respond' | 'unsubscribe',
) {
  const tokenHash = await sha256(rawToken)
  const { data, error } = await ctx.db
    .from('libertymd_followup_tokens')
    .select(
      'id,token_hash,purpose,checkin_id,consultation_id,contact_email,user_id,expires_at,used_at',
    )
    .eq('token_hash', tokenHash)
    .eq('purpose', purpose)
    .maybeSingle()
  if (error) throw error
  return data as Record<string, unknown> | null
}

function isExpired(expiresAt: unknown, nowMs = Date.now()): boolean {
  if (typeof expiresAt !== 'string') return true
  const ms = Date.parse(expiresAt)
  return !Number.isFinite(ms) || ms <= nowMs
}

function parseDoctorFields(payload: RequestPayload): {
  ok: true
  sawDoctor: FollowupSawDoctor
  reportMatch: FollowupReportMatch | null
} | {
  ok: false
  response: Response
} {
  const sawRaw = typeof payload.followup_saw_doctor === 'string'
    ? payload.followup_saw_doctor.trim().toLowerCase()
    : ''
  if (!isSawDoctor(sawRaw)) {
    return {
      ok: false,
      response: jsonResponse({
        error: 'saw_doctor must be yes, no, or not_yet.',
        code: 'invalid_saw_doctor',
      }, 400),
    }
  }
  const matchRaw = payload.followup_report_match
  if (matchRaw === undefined || matchRaw === null || matchRaw === '') {
    return { ok: true, sawDoctor: sawRaw, reportMatch: null }
  }
  const matchNorm = typeof matchRaw === 'string'
    ? matchRaw.trim().toLowerCase()
    : ''
  if (!isReportMatch(matchNorm)) {
    return {
      ok: false,
      response: jsonResponse({
        error: 'report_match must be yes, no, or unsure.',
        code: 'invalid_report_match',
      }, 400),
    }
  }
  return { ok: true, sawDoctor: sawRaw, reportMatch: matchNorm }
}

export async function handleRespondFollowupCheckin(
  ctx: ProxyContext,
  payload: RequestPayload,
) {
  const rawToken = typeof payload.followup_token === 'string'
    ? payload.followup_token.trim()
    : ''
  const answerRaw = payload.followup_answer
  if (!rawToken) {
    return jsonResponse({ error: 'Missing check-in token', ...TOKEN_EXPIRED }, 400)
  }
  if (!isFollowupAnswer(answerRaw)) {
    return jsonResponse({
      error: 'Answer must be better, same, or worse.',
      code: 'invalid_answer',
    }, 400)
  }
  const answer = answerRaw as FollowupAnswer
  const doctorPatchRequested = hasDoctorPatch(payload)

  const token = await lookupFollowupToken(ctx, rawToken, 'respond')
  if (!token) return jsonResponse({ ...TOKEN_UNAVAILABLE }, 404)
  if (isExpired(token.expires_at)) return jsonResponse({ ...TOKEN_EXPIRED }, 410)

  const checkinId = String(token.checkin_id || '')
  const priorConsultationId = String(token.consultation_id || '')

  const { data: checkin, error: checkinError } = await ctx.db
    .from('libertymd_followup_checkins')
    .select(
      'id,consultation_id,status,answer,sent_at,new_consultation_id,saw_doctor,report_match',
    )
    .eq('id', checkinId)
    .maybeSingle()
  if (checkinError) throw checkinError
  if (!checkin) return jsonResponse({ ...TOKEN_UNAVAILABLE }, 404)

  // --- Doctor one-shot while feeling already recorded (Open Q4) ---
  if (checkin.status === 'responded' && doctorPatchRequested) {
    const parsed = parseDoctorFields(payload)
    if (!parsed.ok) return parsed.response

    // Feeling answer must match locked value (or same replay).
    if (checkin.answer && checkin.answer !== answer) {
      return jsonResponse({
        status: 'ok',
        answer: checkin.answer,
        already_recorded: true,
        code: 'answer_locked',
        saw_doctor: checkin.saw_doctor ?? null,
        report_match: checkin.report_match ?? null,
        new_consultation_id: checkin.new_consultation_id ?? null,
      })
    }

    const existingSaw = typeof checkin.saw_doctor === 'string' ? checkin.saw_doctor : null
    if (existingSaw) {
      const same =
        existingSaw === parsed.sawDoctor &&
        (checkin.report_match ?? null) === parsed.reportMatch
      return jsonResponse({
        status: 'ok',
        answer: checkin.answer,
        already_recorded: true,
        code: same ? 'doctor_already_recorded' : 'doctor_locked',
        saw_doctor: existingSaw,
        report_match: checkin.report_match ?? null,
        new_consultation_id: checkin.new_consultation_id ?? null,
      })
    }

    const nowIso = new Date().toISOString()
    const doctorUpdate: Record<string, unknown> = {
      saw_doctor: parsed.sawDoctor,
      updated_at: nowIso,
    }
    if (parsed.reportMatch) {
      doctorUpdate.report_match = parsed.reportMatch
    }
    const { error: doctorError } = await ctx.db
      .from('libertymd_followup_checkins')
      .update(doctorUpdate)
      .eq('id', checkinId)
    if (doctorError) throw doctorError

    return jsonResponse({
      status: 'ok',
      answer: checkin.answer,
      already_recorded: false,
      saw_doctor: parsed.sawDoctor,
      report_match: parsed.reportMatch,
      new_consultation_id: checkin.new_consultation_id ?? null,
    })
  }

  // Idempotent feeling replay (no doctor patch).
  if (checkin.status === 'responded' && checkin.answer === answer) {
    return jsonResponse({
      status: 'ok',
      answer,
      already_recorded: true,
      saw_doctor: checkin.saw_doctor ?? null,
      report_match: checkin.report_match ?? null,
      new_consultation_id: checkin.new_consultation_id ?? null,
    })
  }
  if (checkin.status === 'responded' && checkin.answer && checkin.answer !== answer) {
    return jsonResponse({
      status: 'ok',
      answer: checkin.answer,
      already_recorded: true,
      code: 'answer_locked',
      saw_doctor: checkin.saw_doctor ?? null,
      report_match: checkin.report_match ?? null,
      new_consultation_id: checkin.new_consultation_id ?? null,
    })
  }
  if (checkin.status !== 'sent' && checkin.status !== 'responded') {
    return jsonResponse({ ...TOKEN_UNAVAILABLE }, 409)
  }

  let parsedDoctor: {
    sawDoctor: FollowupSawDoctor
    reportMatch: FollowupReportMatch | null
  } | null = null
  if (doctorPatchRequested) {
    const parsed = parseDoctorFields(payload)
    if (!parsed.ok) return parsed.response
    parsedDoctor = { sawDoctor: parsed.sawDoctor, reportMatch: parsed.reportMatch }
  }

  let newConsultationId: string | null = null

  if (answer === 'worse') {
    const seeded = await seedWorseConsult(ctx, priorConsultationId)
    if (!seeded.ok) {
      return jsonResponse({ ...PRIOR_PURGED }, 410)
    }
    newConsultationId = seeded.consultationId
  }

  const nowIso = new Date().toISOString()
  const feelingUpdate: Record<string, unknown> = {
    status: 'responded',
    answer,
    responded_at: nowIso,
    new_consultation_id: newConsultationId,
    updated_at: nowIso,
  }
  if (parsedDoctor) {
    feelingUpdate.saw_doctor = parsedDoctor.sawDoctor
    if (parsedDoctor.reportMatch) {
      feelingUpdate.report_match = parsedDoctor.reportMatch
    }
  }

  const { error: updateError } = await ctx.db
    .from('libertymd_followup_checkins')
    .update(feelingUpdate)
    .eq('id', checkinId)
  if (updateError) throw updateError

  await ctx.db
    .from('libertymd_followup_tokens')
    .update({ used_at: nowIso })
    .eq('id', token.id)
    .is('used_at', null)

  return jsonResponse({
    status: 'ok',
    answer,
    already_recorded: false,
    saw_doctor: parsedDoctor?.sawDoctor ?? null,
    report_match: parsedDoctor?.reportMatch ?? null,
    new_consultation_id: newConsultationId,
  })
}

async function seedWorseConsult(
  ctx: ProxyContext,
  priorConsultationId: string,
): Promise<{ ok: true; consultationId: string } | { ok: false }> {
  const { data: prior, error } = await ctx.db
    .from('libertymd_consultations')
    .select(
      'id,chief_complaint,filled_slots,patient_id,patient_snapshot,region,status',
    )
    .eq('id', priorConsultationId)
    .maybeSingle()
  if (error) throw error
  if (!prior) return { ok: false }
  if (prior.status === 'emergency_stopped') return { ok: false }

  const priorSlots = sanitizeSlotUpdates(prior.filled_slots || {})
  const complaint = typeof prior.chief_complaint === 'string' && prior.chief_complaint.trim()
    ? prior.chief_complaint.trim().slice(0, 1000)
    : typeof priorSlots.chief_complaint === 'string'
    ? String(priorSlots.chief_complaint).slice(0, 1000)
    : ''
  if (!complaint) return { ok: false }

  const slots: JsonObject = {
    ...priorSlots,
    chief_complaint: complaint,
  }
  const missing = calculateMissingSlots(slots)
  const hasAge = slots.age !== undefined && slots.age !== null && slots.age !== ''
  const hasSex = typeof slots.sex_at_birth === 'string' && slots.sex_at_birth.length > 0
  const initialStatus = hasAge && hasSex ? 'interviewing' : 'awaiting_demographics'

  const patient = await getOrCreateSelfPatient(ctx)
  const patientSnapshot: JsonObject = {
    patient_id: patient.id,
    relationship: patient.relationship,
    age: patient.age,
    sex_at_birth: patient.sex_at_birth,
  }

  const { data: consultation, error: insertError } = await ctx.db
    .from('libertymd_consultations')
    .insert({
      user_id: ctx.user.id,
      patient_id: patient.id,
      patient_snapshot: patientSnapshot,
      status: initialStatus,
      region: 'US',
      chief_complaint: complaint,
      turn_count: 1,
      filled_slots: slots,
      missing_slots: initialStatus === 'interviewing' ? missing : missing,
      retention_expires_at: ctx.isAnonymous ? addDays(30) : null,
      workflow_versions: {
        guardrail: 'libertymd-v1',
        interview: 'libertymd-v1',
        diagnosis: 'libertymd-v2',
        followup_seed: 'p4-01',
      },
    })
    .select('id')
    .single()
  if (insertError) throw insertError
  if (!consultation?.id) return { ok: false }

  await addMessage(ctx, consultation.id, 'user', complaint, {
    slot_updates: slots,
    target_slot: 'chief_complaint',
  })

  return { ok: true, consultationId: String(consultation.id) }
}

export async function handleUnsubscribeFollowupCheckin(
  ctx: ProxyContext,
  payload: RequestPayload,
) {
  const rawToken = typeof payload.followup_token === 'string'
    ? payload.followup_token.trim()
    : ''
  if (!rawToken) {
    return jsonResponse({ error: 'Missing unsubscribe token', ...TOKEN_EXPIRED }, 400)
  }

  const token = await lookupFollowupToken(ctx, rawToken, 'unsubscribe')
  if (!token) return jsonResponse({ ...TOKEN_UNAVAILABLE }, 404)
  if (isExpired(token.expires_at)) return jsonResponse({ ...TOKEN_EXPIRED }, 410)

  const contactEmail = typeof token.contact_email === 'string'
    ? token.contact_email.trim().toLowerCase()
    : ''
  const userId = typeof token.user_id === 'string' ? token.user_id : null

  // Immediate preference — insert email and/or user_id rows (ignore unique conflicts).
  if (contactEmail) {
    const { data: existingEmail } = await ctx.db
      .from('libertymd_followup_unsubscribes')
      .select('id')
      .eq('contact_email', contactEmail)
      .maybeSingle()
    if (!existingEmail) {
      const { error: insertError } = await ctx.db
        .from('libertymd_followup_unsubscribes')
        .insert({
          contact_email: contactEmail,
          user_id: null,
          source: 'one_click',
        })
      if (insertError && (insertError as { code?: string }).code !== '23505') {
        throw insertError
      }
    }
  }
  if (userId) {
    const { data: existingUser } = await ctx.db
      .from('libertymd_followup_unsubscribes')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()
    if (!existingUser) {
      const { error: userInsertError } = await ctx.db
        .from('libertymd_followup_unsubscribes')
        .insert({
          contact_email: null,
          user_id: userId,
          source: 'one_click',
        })
      if (userInsertError && (userInsertError as { code?: string }).code !== '23505') {
        throw userInsertError
      }
    }
  }

  const nowIso = new Date().toISOString()
  await ctx.db
    .from('libertymd_followup_tokens')
    .update({ used_at: nowIso })
    .eq('id', token.id)
    .is('used_at', null)

  return jsonResponse({
    status: 'ok',
    unsubscribed: true,
  })
}
