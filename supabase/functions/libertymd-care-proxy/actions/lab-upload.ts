/**
 * `upload_lab` — linked-user lab extraction, canonicalization, and bounded analysis.
 *
 * Raw bytes are validated and sent to the LibertyMD n8n workflow only for this
 * request. They are never written to Storage. The durable records are one
 * user/patient-attributed upload analysis and one row per canonical parameter.
 */
import { LAB_ANALYSIS_WEBHOOK, N8N_TIMEOUT_MS } from '../lib/config.ts'
import { getOwnedConsultation } from '../lib/consultations.ts'
import { SignInRequiredError, isSignInRequiredError, jsonResponse } from '../lib/errors.ts'
import {
  LAB_UPLOAD_CODES,
  LAB_UPLOAD_SAFE_COPY,
  decodeLabBase64,
  encodeLabBase64,
  extensionForLabMime,
  normalizeLabAnalysis,
  resolveLabBase64Payload,
  structuredResultsHaveBannedKeys,
  validateLabBytes,
  type LabParameterDefinition,
} from '../lib/lab-upload.ts'
import { normalizeObject, postJson } from '../lib/n8n-client.ts'
import { ensureMediaFollowups, suggestedMediaFollowupQuestions } from '../lib/media-evidence.ts'
import { getOwnedActivePatient, getOwnedPatient } from '../lib/profiles.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { RequestPayload } from '../lib/types.ts'

const LAB_SIGN_IN_COPY =
  'Sign in to upload a lab report. Lab reports are linked to a saved profile.'

function labReject(
  code: keyof typeof LAB_UPLOAD_SAFE_COPY,
  status = 400,
  extra: Record<string, unknown> = {},
) {
  return jsonResponse(
    {
      error: LAB_UPLOAD_SAFE_COPY[code],
      code,
      severity: 'technical' as const,
      consult_continues: true,
      ...extra,
    },
    status,
  )
}

function parsedReportDate(value: string): string | null {
  const raw = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw)) return null
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

export async function handleUploadLab(ctx: ProxyContext, payload: RequestPayload) {
  if (ctx.isAnonymous) {
    return jsonResponse(
      {
        code: new SignInRequiredError().code,
        error: LAB_SIGN_IN_COPY,
        severity: 'technical' as const,
        consult_continues: true,
      },
      403,
    )
  }
  if (!payload.consultation_id) return labReject(LAB_UPLOAD_CODES.missing_consultation)

  const patientId = typeof payload.patient_id === 'string' ? payload.patient_id.trim() : ''
  if (!patientId) return labReject(LAB_UPLOAD_CODES.missing_patient)

  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)
  const consultPatientIdBefore = consultation.patient_id
  const consultSnapshotBefore = consultation.patient_snapshot

  let attributedPatient
  try {
    const owned = await getOwnedPatient(ctx, patientId)
    if (owned.is_active === false) return labReject(LAB_UPLOAD_CODES.patient_inactive)
    const active = await getOwnedActivePatient(ctx, patientId)
    if (!active) return labReject(LAB_UPLOAD_CODES.patient_inactive)
    attributedPatient = active
  } catch {
    return labReject(LAB_UPLOAD_CODES.patient_not_owned)
  }

  if (attributedPatient.id !== consultation.patient_id) {
    return labReject(LAB_UPLOAD_CODES.patient_not_owned, 409, {
      code: 'patient_mismatch',
      error: 'Choose the same patient as this consultation so the report cannot be applied to the wrong person.',
    })
  }

  const bytes = decodeLabBase64(resolveLabBase64Payload(payload))
  if (!bytes) return labReject(LAB_UPLOAD_CODES.decode_failed)
  const validated = validateLabBytes(bytes, payload.content_type)
  if (!validated.ok) return labReject(validated.code)

  const { data: definitionRows, error: definitionError } = await ctx.db
    .from('libertymd_health_parameter_definitions')
    .select('id,name,unit')
    .eq('category', 'Lab Report Parameter')
    .order('name', { ascending: true })
  if (definitionError || !definitionRows?.length) {
    console.warn('LibertyMD lab parameter dictionary unavailable', {
      outcome: 'analysis_failed',
      code: definitionError?.code || null,
    })
    return labReject(LAB_UPLOAD_CODES.analysis_failed, 502)
  }
  const definitions = definitionRows as LabParameterDefinition[]

  const objectUuid = crypto.randomUUID()
  const now = new Date().toISOString()
  const { error: pendingError } = await ctx.db.from('libertymd_lab_uploads').insert({
    user_id: ctx.user.id,
    consultation_id: consultation.id,
    object_uuid: objectUuid,
    patient_id: attributedPatient.id,
    path: null,
    content_type: validated.mime,
    analysis_status: 'pending_redaction',
    structured_results: {},
    analysis_summary: {},
    raw_deleted_at: now,
  })
  if (pendingError) return labReject(LAB_UPLOAD_CODES.persistence_failed, 502)

  const markFailed = async () => {
    await ctx.db
      .from('libertymd_lab_uploads')
      .update({ analysis_status: 'failed', updated_at: new Date().toISOString() })
      .eq('user_id', ctx.user.id)
      .eq('consultation_id', consultation.id)
      .eq('object_uuid', objectUuid)
  }

  let analysis
  try {
    const workflowRaw = normalizeObject(await postJson(
      LAB_ANALYSIS_WEBHOOK,
      {
        content_type: validated.mime,
        file_base64: encodeLabBase64(bytes),
        allowed_parameters: definitions,
      },
      N8N_TIMEOUT_MS.labAnalysis,
      null,
    ))
    analysis = normalizeLabAnalysis(workflowRaw, definitions)
  } catch (error) {
    console.warn('LibertyMD lab analysis unavailable', {
      outcome: 'analysis_failed',
      class: error instanceof Error ? error.name : 'unknown',
    })
    await markFailed()
    return labReject(LAB_UPLOAD_CODES.analysis_failed, 502, { object_uuid: objectUuid })
  }
  if (!analysis || !analysis.usable || analysis.standardized_count === 0) {
    await markFailed()
    return labReject(LAB_UPLOAD_CODES.analysis_failed, 422, { object_uuid: objectUuid })
  }
  if (structuredResultsHaveBannedKeys(analysis)) {
    await markFailed()
    return labReject(LAB_UPLOAD_CODES.persistence_failed, 500, { object_uuid: objectUuid })
  }

  const { data: upload, error: uploadError } = await ctx.db
    .from('libertymd_lab_uploads')
    .update({
      analysis_status: 'mapped',
      structured_results: {
        panel_name: analysis.panel_name,
        report_date: analysis.report_date,
        extracted_count: analysis.extracted_count,
        standardized_count: analysis.standardized_count,
        unmapped_count: analysis.unmapped_count,
        results: analysis.results,
        review_state: analysis.review_state,
        raw_retained: false,
      },
      analysis_summary: analysis.analysis_summary,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', ctx.user.id)
    .eq('consultation_id', consultation.id)
    .eq('object_uuid', objectUuid)
    .select('id')
    .single()
  if (uploadError || !upload?.id) {
    console.warn('LibertyMD lab analysis persistence failed', {
      outcome: 'persistence_failed',
      code: uploadError?.code || null,
    })
    await markFailed()
    return labReject(LAB_UPLOAD_CODES.persistence_failed, 502, { object_uuid: objectUuid })
  }

  const seen = new Set<string>()
  const recordedAt = parsedReportDate(analysis.report_date)
  const resultRows = analysis.results
    .filter((row) => row.mapped && row.parameter_id && !seen.has(row.parameter_id) && seen.add(row.parameter_id))
    .map((row) => ({
      lab_upload_id: upload.id,
      user_id: ctx.user.id,
      consultation_id: consultation.id,
      patient_id: attributedPatient.id,
      parameter_id: row.parameter_id,
      parameter_name: row.parameter_name,
      raw_name: row.raw_name,
      value_text: row.value || null,
      value_numeric: row.numeric_value,
      raw_unit: row.raw_unit || null,
      standardized_unit: row.standardized_unit,
      reference_range: row.reference_range || null,
      printed_flag: row.printed_flag || null,
      range_classification: row.classification,
      analysis_text: row.analysis || null,
      recorded_at: recordedAt,
      review_state: analysis.review_state,
    }))

  const { error: resultsError } = await ctx.db.from('libertymd_lab_results').insert(resultRows)
  if (resultsError) {
    await ctx.db.from('libertymd_lab_results').delete().eq('lab_upload_id', upload.id)
    await markFailed()
    console.warn('LibertyMD standardized result persistence failed', {
      outcome: 'persistence_failed',
      code: resultsError.code || null,
    })
    return labReject(LAB_UPLOAD_CODES.persistence_failed, 502)
  }

  // Object attribution must never rebind the consultation itself.
  const after = await getOwnedConsultation(ctx, consultation.id)
  if (
    after.patient_id !== consultPatientIdBefore
    || JSON.stringify(after.patient_snapshot) !== JSON.stringify(consultSnapshotBefore)
  ) {
    await markFailed()
    return labReject(LAB_UPLOAD_CODES.persistence_failed, 500)
  }

  await ensureMediaFollowups(
    ctx,
    consultation,
    'lab',
    objectUuid,
    suggestedMediaFollowupQuestions('lab', analysis as unknown as Record<string, unknown>, consultation.language),
  )

  return jsonResponse({
    ok: true,
    consultation_id: consultation.id,
    object_uuid: objectUuid,
    patient_id: attributedPatient.id,
    content_type: validated.mime,
    extension: extensionForLabMime(validated.mime),
    path: null,
    signed_url: null,
    expires_in: 0,
    raw_retained: false,
    analysis,
    structured_results: {
      review_state: analysis.review_state,
      extracted_count: analysis.extracted_count,
      standardized_count: resultRows.length,
      unmapped_count: analysis.extracted_count - resultRows.length,
      analytes: resultRows,
    },
    consult_patient_id: after.patient_id,
    consult_continues: true,
  })
}

export { isSignInRequiredError }
