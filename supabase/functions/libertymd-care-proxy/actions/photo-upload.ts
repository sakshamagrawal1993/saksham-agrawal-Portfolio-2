/**
 * P4-06 — `upload_photo`
 *
 * Anonymous-safe photo ingest for a JWT-owned consult:
 *   validate MIME/size → server EXIF strip → service_role put to libertymd-care
 *   path `{consultation_id}/photo/{object_uuid}` → short-TTL (900s) signed read URL.
 *
 * Durable SoT = Storage path only (no attachments table).
 * Analysis = stub (no live vision / no HT lab-OCR edge / no n8n photo bytes).
 * Never issue public URLs. Never log filenames / paths / EXIF in telemetry.
 */
import {
  LIBERTYMD_CARE_BUCKET,
  buildLibertyMdCarePath,
} from '../../_shared/libertymd-care-path.ts'
import { getOwnedConsultation } from '../lib/consultations.ts'
import { jsonResponse } from '../lib/errors.ts'
import { hasLocationExif, stripImageExif } from '../lib/exif-strip.ts'
import {
  PHOTO_SIGNED_URL_TTL_SECONDS,
  PHOTO_UPLOAD_CODES,
  PHOTO_UPLOAD_SAFE_COPY,
  assertPhotoSignedUrlTtl,
  decodePhotoBase64,
  photoAnalysisStub,
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
  assertPhotoSignedUrlTtl(PHOTO_SIGNED_URL_TTL_SECONDS)

  if (!payload.consultation_id) {
    return photoReject(PHOTO_UPLOAD_CODES.missing_consultation)
  }

  // JWT ownership — never trust client user id (CONTEXT §3).
  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)

  const bytes = decodePhotoBase64(payload.image_base64)
  if (!bytes) return photoReject(PHOTO_UPLOAD_CODES.decode_failed)

  const validated = validatePhotoBytes(bytes, payload.content_type)
  if (!validated.ok) return photoReject(validated.code)

  const stripped = stripImageExif(bytes, validated.mime)
  if (hasLocationExif(stripped)) {
    // Fail closed rather than store GPS — technical, consult continues.
    console.warn('LibertyMD photo ingest refused residual location metadata', {
      outcome: 'reject',
      reject_reason: 'exif_residual',
      size_bucket: stripped.byteLength > 1024 * 1024 ? 'gt_1mb' : 'lte_1mb',
    })
    return photoReject(PHOTO_UPLOAD_CODES.invalid_payload)
  }

  const objectUuid = crypto.randomUUID()
  const path = buildLibertyMdCarePath(consultation.id, 'photo', objectUuid)
  const contentType = validated.mime

  const { error: uploadError } = await ctx.db.storage
    .from(LIBERTYMD_CARE_BUCKET)
    .upload(path, stripped, {
      contentType,
      upsert: false,
      // Hint only — path itself never embeds original filename.
      cacheControl: 'private, max-age=0',
    })

  if (uploadError) {
    console.warn('LibertyMD photo storage put failed', {
      outcome: 'storage_failed',
      reject_reason: 'storage_failed',
      size_bucket: stripped.byteLength > 1024 * 1024 ? 'gt_1mb' : 'lte_1mb',
    })
    return photoReject(PHOTO_UPLOAD_CODES.storage_failed, 502)
  }

  const { data: signed, error: signError } = await ctx.db.storage
    .from(LIBERTYMD_CARE_BUCKET)
    .createSignedUrl(path, PHOTO_SIGNED_URL_TTL_SECONDS)

  if (signError || !signed?.signedUrl) {
    console.warn('LibertyMD photo signed URL failed', {
      outcome: 'sign_failed',
      reject_reason: 'sign_failed',
    })
    return photoReject(PHOTO_UPLOAD_CODES.sign_failed, 502)
  }

  // Analysis stub — never invoke HT lab-OCR edge or n8n vision this ticket.
  const analysis = photoAnalysisStub()

  return jsonResponse({
    ok: true,
    consultation_id: consultation.id,
    path,
    object_uuid: objectUuid,
    content_type: contentType,
    // Extension hint for session chip only — not a Storage path segment.
    extension: extensionForMime(contentType),
    signed_url: signed.signedUrl,
    expires_in: PHOTO_SIGNED_URL_TTL_SECONDS,
    analysis,
    consult_continues: true,
  })
}
