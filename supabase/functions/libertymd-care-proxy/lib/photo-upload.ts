/**
 * P4-06 — pure photo ingest validators + analysis stub (no Deno.env / Storage I/O).
 * Wired by actions/photo-upload.ts; unit-tested from tests/libertymd/.
 */

export const PHOTO_SIGNED_URL_TTL_SECONDS = 900
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024 // 5 MiB product max
export const PHOTO_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const
export type PhotoAllowedMime = (typeof PHOTO_ALLOWED_MIME)[number]

export const PHOTO_UPLOAD_CODES = {
  missing_consultation: 'missing_consultation',
  invalid_mime: 'invalid_mime',
  too_large: 'too_large',
  invalid_payload: 'invalid_payload',
  decode_failed: 'decode_failed',
  storage_failed: 'storage_failed',
  sign_failed: 'sign_failed',
} as const

export type PhotoUploadRejectCode = (typeof PHOTO_UPLOAD_CODES)[keyof typeof PHOTO_UPLOAD_CODES]

/** Safe technical copy — never clinical caution / emergency clothing. */
export const PHOTO_UPLOAD_SAFE_COPY: Record<PhotoUploadRejectCode, string> = {
  missing_consultation: 'We could not attach that photo just now. Please try again.',
  invalid_mime: 'That file type is not supported. Please use a JPEG, PNG, or WebP image under 5 MB.',
  too_large: 'That image is too large. Please use a file under 5 MB.',
  invalid_payload: 'We could not read that photo. Please try another image.',
  decode_failed: 'We could not read that photo. Please try another image.',
  storage_failed: 'Something went wrong on our side while saving the photo. Your consultation can continue.',
  sign_failed: 'Something went wrong on our side while saving the photo. Your consultation can continue.',
}

export function normalizePhotoMime(raw: unknown): PhotoAllowedMime | null {
  if (typeof raw !== 'string') return null
  const mime = raw.toLowerCase().split(';')[0]?.trim() || ''
  if (mime === 'image/jpg') return 'image/jpeg'
  if ((PHOTO_ALLOWED_MIME as readonly string[]).includes(mime)) {
    return mime as PhotoAllowedMime
  }
  return null
}

export function validatePhotoBytes(
  bytes: Uint8Array,
  contentType: unknown,
):
  | { ok: true; mime: PhotoAllowedMime }
  | { ok: false; code: PhotoUploadRejectCode } {
  const mime = normalizePhotoMime(contentType)
  if (!mime) return { ok: false, code: PHOTO_UPLOAD_CODES.invalid_mime }
  if (bytes.byteLength <= 0) return { ok: false, code: PHOTO_UPLOAD_CODES.invalid_payload }
  if (bytes.byteLength > PHOTO_MAX_BYTES) return { ok: false, code: PHOTO_UPLOAD_CODES.too_large }
  return { ok: true, mime }
}

/** Decode base64 (optionally data-URL) → bytes. No PHI logging. */
export function decodePhotoBase64(raw: unknown): Uint8Array | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  let b64 = raw.trim()
  const dataUrl = /^data:([^;,]+)?(;base64)?,(.+)$/i.exec(b64)
  if (dataUrl) b64 = dataUrl[3] || ''
  b64 = b64.replace(/\s+/g, '')
  if (!b64) return null
  try {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/**
 * Analysis Done bar for P4-06 = stub only.
 * Future pattern (CARE): service-role re-sign → LibertyMD-configured vision webhook →
 * JSON inside proxy. HT `process-lab-report` is NOT a runtime dependency.
 */
export function photoAnalysisStub() {
  return {
    status: 'stub' as const,
    analyzed: false,
    runtime_dependency: null,
    note: 'Photo analysis deferred; ingest + EXIF strip + signed URL only.',
  }
}

export function assertPhotoSignedUrlTtl(ttlSeconds: number): void {
  if (!(ttlSeconds > 0) || ttlSeconds > PHOTO_SIGNED_URL_TTL_SECONDS) {
    throw new Error(`PHOTO_SIGNED_URL_TTL_SECONDS must be in (0, ${PHOTO_SIGNED_URL_TTL_SECONDS}]`)
  }
}
