/**
 * `upload_photo` — zero-retention image analysis.
 *
 * Validated bytes are EXIF-stripped, sent to the LibertyMD n8n agent for this
 * request, and then fall out of scope. No Storage object or signed URL exists.
 * Only the observation-only analysis is stored against the JWT user and the
 * consultation's patient.
 */
import { getOwnedConsultation } from '../lib/consultations.ts'
import { N8N_TIMEOUT_MS, PHOTO_ANALYSIS_WEBHOOK } from '../lib/config.ts'
import { jsonResponse } from '../lib/errors.ts'
import { hasLocationExif, stripImageExif } from '../lib/exif-strip.ts'
import { normalizeObject, postJson } from '../lib/n8n-client.ts'
import {
  PHOTO_UPLOAD_CODES,
  PHOTO_UPLOAD_SAFE_COPY,
  decodePhotoBase64,
  encodePhotoBase64,
  normalizePhotoAnalysis,
  validatePhotoBytes,
} from '../lib/photo-upload.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { RequestPayload } from '../lib/types.ts'

function photoReject(code: keyof typeof PHOTO_UPLOAD_SAFE_COPY, status = 400) {
  return jsonResponse(
    {
      error: PHOTO_UPLOAD_SAFE_COPY[code],
      code,
      severity: 'technical' as const,
      consult_continues: true,
    },
    status,
  )
}

function extensionForMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

export async function handleUploadPhoto(ctx: ProxyContext, payload: RequestPayload) {
  if (!payload.consultation_id) return photoReject(PHOTO_UPLOAD_CODES.missing_consultation)

  // User attribution is derived from the verified JWT; no client user_id exists.
  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)
  const bytes = decodePhotoBase64(payload.image_base64)
  if (!bytes) return photoReject(PHOTO_UPLOAD_CODES.decode_failed)

  const validated = validatePhotoBytes(bytes, payload.content_type)
  if (!validated.ok) return photoReject(validated.code)

  const stripped = stripImageExif(bytes, validated.mime)
  if (hasLocationExif(stripped)) return photoReject(PHOTO_UPLOAD_CODES.invalid_payload)

  let analysis
  try {
    const workflowRaw = normalizeObject(await postJson(
      PHOTO_ANALYSIS_WEBHOOK,
      {
        content_type: validated.mime,
        image_base64: encodePhotoBase64(stripped),
        chief_complaint: consultation.chief_complaint || '',
      },
      N8N_TIMEOUT_MS.photoAnalysis,
      null,
    ))
    analysis = normalizePhotoAnalysis(workflowRaw)
  } catch (error) {
    console.warn('LibertyMD photo analysis unavailable', {
      outcome: 'analysis_failed',
      class: error instanceof Error ? error.name : 'unknown',
    })
    return photoReject(PHOTO_UPLOAD_CODES.analysis_failed, 502)
  }
  if (!analysis) return photoReject(PHOTO_UPLOAD_CODES.analysis_failed, 502)

  const objectUuid = crypto.randomUUID()
  const { error: insertError } = await ctx.db.from('libertymd_photo_analyses').insert({
    user_id: ctx.user.id,
    consultation_id: consultation.id,
    patient_id: consultation.patient_id,
    object_uuid: objectUuid,
    content_type: validated.mime,
    analysis_status: analysis.usable ? 'analyzed' : 'unusable',
    analysis_data: analysis,
    raw_deleted_at: new Date().toISOString(),
  })
  if (insertError) {
    console.warn('LibertyMD photo analysis persistence failed', {
      outcome: 'persistence_failed',
      code: insertError.code || null,
    })
    return photoReject(PHOTO_UPLOAD_CODES.persistence_failed, 502)
  }

  return jsonResponse({
    ok: true,
    consultation_id: consultation.id,
    object_uuid: objectUuid,
    patient_id: consultation.patient_id,
    content_type: validated.mime,
    extension: extensionForMime(validated.mime),
    path: null,
    signed_url: null,
    expires_in: 0,
    raw_retained: false,
    analysis,
    consult_continues: true,
  })
}
