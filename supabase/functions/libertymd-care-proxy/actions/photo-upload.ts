/**
 * P4-06 private photo upload + retryable analysis.
 *
 * JWT-owned consult → validate → strip EXIF → private Storage put under
 * `{consultation_id}/photo/{object_uuid}` → pending analysis row → agent attempt.
 * If the agent is unavailable, the attachment still succeeds and the sanitized
 * private object remains available to `retry_photo_analysis` until P1-24 cleanup.
 */
import {
  LIBERTYMD_CARE_BUCKET,
  buildLibertyMdCarePath,
} from '../../_shared/libertymd-care-path.ts'
import { N8N_TIMEOUT_MS, PHOTO_ANALYSIS_WEBHOOK } from '../lib/config.ts'
import { getOwnedConsultation } from '../lib/consultations.ts'
import { jsonResponse } from '../lib/errors.ts'
import { hasLocationExif, stripImageExif } from '../lib/exif-strip.ts'
import { normalizeObject, postJson } from '../lib/n8n-client.ts'
import {
  PHOTO_SIGNED_URL_TTL_SECONDS,
  PHOTO_UPLOAD_CODES,
  PHOTO_UPLOAD_SAFE_COPY,
  assertPhotoSignedUrlTtl,
  decodePhotoBase64,
  encodePhotoBase64,
  normalizePhotoAnalysis,
  validatePhotoBytes,
  type PhotoAllowedMime,
  type PhotoAnalysisResult,
} from '../lib/photo-upload.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { ConsultationRow, RequestPayload } from '../lib/types.ts'

type StoredPhotoRow = {
  object_uuid: string
  path: string
  content_type: PhotoAllowedMime
  analysis_attempts: number
}

function photoReject(
  code: keyof typeof PHOTO_UPLOAD_SAFE_COPY,
  status = 400,
  extra: Record<string, unknown> = {},
) {
  return jsonResponse(
    {
      error: PHOTO_UPLOAD_SAFE_COPY[code],
      code,
      severity: 'technical' as const,
      consult_continues: true,
      ...extra,
    },
    status,
  )
}

function extensionForMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

async function invokePhotoAgent(
  consultation: ConsultationRow,
  bytes: Uint8Array,
  contentType: PhotoAllowedMime,
): Promise<PhotoAnalysisResult | null> {
  const workflowRaw = normalizeObject(await postJson(
    PHOTO_ANALYSIS_WEBHOOK,
    {
      content_type: contentType,
      image_base64: encodePhotoBase64(bytes),
      chief_complaint: consultation.chief_complaint || '',
    },
    N8N_TIMEOUT_MS.photoAnalysis,
    null,
  ))
  return normalizePhotoAnalysis(workflowRaw)
}

async function signedPhotoUrl(ctx: ProxyContext, path: string): Promise<string | null> {
  assertPhotoSignedUrlTtl(PHOTO_SIGNED_URL_TTL_SECONDS)
  const { data, error } = await ctx.db.storage
    .from(LIBERTYMD_CARE_BUCKET)
    .createSignedUrl(path, PHOTO_SIGNED_URL_TTL_SECONDS)
  if (error || !data?.signedUrl) {
    console.warn('LibertyMD private photo signing failed', { outcome: 'sign_failed' })
    return null
  }
  return data.signedUrl
}

async function saveAnalysisSuccess(
  ctx: ProxyContext,
  consultationId: string,
  row: StoredPhotoRow,
  analysis: PhotoAnalysisResult,
): Promise<boolean> {
  const now = new Date().toISOString()
  const { error } = await ctx.db
    .from('libertymd_photo_analyses')
    .update({
      analysis_status: analysis.usable ? 'analyzed' : 'unusable',
      analysis_data: analysis,
      analysis_attempts: row.analysis_attempts + 1,
      last_analysis_at: now,
      last_analysis_error_code: null,
      updated_at: now,
    })
    .eq('user_id', ctx.user.id)
    .eq('consultation_id', consultationId)
    .eq('object_uuid', row.object_uuid)
  return !error
}

async function saveAnalysisFailure(
  ctx: ProxyContext,
  consultationId: string,
  row: StoredPhotoRow,
): Promise<void> {
  const now = new Date().toISOString()
  await ctx.db
    .from('libertymd_photo_analyses')
    .update({
      analysis_status: 'failed',
      analysis_attempts: row.analysis_attempts + 1,
      last_analysis_at: now,
      last_analysis_error_code: 'workflow_unavailable',
      updated_at: now,
    })
    .eq('user_id', ctx.user.id)
    .eq('consultation_id', consultationId)
    .eq('object_uuid', row.object_uuid)
}

async function analyzeStoredPhoto(
  ctx: ProxyContext,
  consultation: ConsultationRow,
  row: StoredPhotoRow,
  bytes: Uint8Array,
): Promise<PhotoAnalysisResult | null> {
  try {
    const analysis = await invokePhotoAgent(consultation, bytes, row.content_type)
    if (!analysis || !(await saveAnalysisSuccess(ctx, consultation.id, row, analysis))) {
      await saveAnalysisFailure(ctx, consultation.id, row)
      return null
    }
    return analysis
  } catch (error) {
    console.warn('LibertyMD photo analysis unavailable', {
      outcome: 'analysis_failed',
      class: error instanceof Error ? error.name : 'unknown',
    })
    await saveAnalysisFailure(ctx, consultation.id, row)
    return null
  }
}

function photoResponse(input: {
  consultation: ConsultationRow
  row: StoredPhotoRow
  signedUrl: string | null
  analysis: PhotoAnalysisResult | null
}) {
  const { consultation, row, signedUrl, analysis } = input
  return jsonResponse({
    ok: true,
    consultation_id: consultation.id,
    object_uuid: row.object_uuid,
    patient_id: consultation.patient_id,
    content_type: row.content_type,
    extension: extensionForMime(row.content_type),
    path: row.path,
    signed_url: signedUrl,
    expires_in: signedUrl ? PHOTO_SIGNED_URL_TTL_SECONDS : 0,
    raw_retained: true,
    analysis: analysis || {
      status: 'pending_retry',
      analyzed: false,
      retry_available: true,
    },
    analysis_retry_available: !analysis,
    consult_continues: true,
  })
}

export async function handleUploadPhoto(ctx: ProxyContext, payload: RequestPayload) {
  if (!payload.consultation_id) return photoReject(PHOTO_UPLOAD_CODES.missing_consultation)

  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)
  const bytes = decodePhotoBase64(payload.image_base64)
  if (!bytes) return photoReject(PHOTO_UPLOAD_CODES.decode_failed)

  const validated = validatePhotoBytes(bytes, payload.content_type)
  if (!validated.ok) return photoReject(validated.code)

  const stripped = stripImageExif(bytes, validated.mime)
  if (hasLocationExif(stripped)) return photoReject(PHOTO_UPLOAD_CODES.invalid_payload)

  const objectUuid = crypto.randomUUID()
  const path = buildLibertyMdCarePath(consultation.id, 'photo', objectUuid)
  const row: StoredPhotoRow = {
    object_uuid: objectUuid,
    path,
    content_type: validated.mime,
    analysis_attempts: 0,
  }

  const { error: storageError } = await ctx.db.storage
    .from(LIBERTYMD_CARE_BUCKET)
    .upload(path, stripped, {
      contentType: validated.mime,
      cacheControl: 'private, max-age=0',
      upsert: false,
    })
  if (storageError) return photoReject(PHOTO_UPLOAD_CODES.storage_failed, 502)

  const { error: insertError } = await ctx.db.from('libertymd_photo_analyses').insert({
    user_id: ctx.user.id,
    consultation_id: consultation.id,
    patient_id: consultation.patient_id,
    object_uuid: objectUuid,
    path,
    content_type: validated.mime,
    analysis_status: 'pending',
    analysis_data: {},
    analysis_attempts: 0,
    raw_deleted_at: null,
  })
  if (insertError) {
    await ctx.db.storage.from(LIBERTYMD_CARE_BUCKET).remove([path])
    return photoReject(PHOTO_UPLOAD_CODES.persistence_failed, 502)
  }

  const analysis = await analyzeStoredPhoto(ctx, consultation, row, stripped)
  const signedUrl = await signedPhotoUrl(ctx, path)
  return photoResponse({ consultation, row, signedUrl, analysis })
}

export async function handleRetryPhotoAnalysis(ctx: ProxyContext, payload: RequestPayload) {
  if (!payload.consultation_id) return photoReject(PHOTO_UPLOAD_CODES.missing_consultation)
  const objectUuid = typeof payload.object_uuid === 'string' ? payload.object_uuid.trim() : ''
  if (!objectUuid) return photoReject(PHOTO_UPLOAD_CODES.invalid_payload)

  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)
  const { data, error } = await ctx.db
    .from('libertymd_photo_analyses')
    .select('object_uuid,path,content_type,analysis_attempts')
    .eq('user_id', ctx.user.id)
    .eq('consultation_id', consultation.id)
    .eq('object_uuid', objectUuid)
    .maybeSingle()
  if (error || !data?.path) return photoReject(PHOTO_UPLOAD_CODES.invalid_payload, 404)

  const expectedPath = buildLibertyMdCarePath(consultation.id, 'photo', objectUuid)
  if (data.path !== expectedPath) return photoReject(PHOTO_UPLOAD_CODES.invalid_payload, 409)
  const row = data as StoredPhotoRow

  const { data: stored, error: downloadError } = await ctx.db.storage
    .from(LIBERTYMD_CARE_BUCKET)
    .download(row.path)
  if (downloadError || !stored) {
    return photoReject(PHOTO_UPLOAD_CODES.storage_failed, 502, {
      object_uuid: objectUuid,
      retry_available: false,
    })
  }

  const storedBytes = new Uint8Array(await stored.arrayBuffer())
  const validated = validatePhotoBytes(storedBytes, row.content_type)
  if (!validated.ok || hasLocationExif(storedBytes)) {
    return photoReject(PHOTO_UPLOAD_CODES.invalid_payload, 422, {
      object_uuid: objectUuid,
      retry_available: false,
    })
  }

  const analysis = await analyzeStoredPhoto(ctx, consultation, row, storedBytes)
  if (!analysis) {
    return photoReject(PHOTO_UPLOAD_CODES.analysis_failed, 502, {
      object_uuid: objectUuid,
      retry_available: true,
    })
  }

  const signedUrl = await signedPhotoUrl(ctx, row.path)
  return photoResponse({ consultation, row, signedUrl, analysis })
}
