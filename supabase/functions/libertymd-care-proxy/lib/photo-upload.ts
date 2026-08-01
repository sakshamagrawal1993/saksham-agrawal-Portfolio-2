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
  analysis_failed: 'analysis_failed',
  persistence_failed: 'persistence_failed',
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
  analysis_failed: 'We could not analyze that image just now. Your consultation can continue.',
  persistence_failed: 'We analyzed the image but could not save the analysis. Your consultation can continue.',
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

/** Re-encode server-sanitized bytes for one ephemeral n8n request. */
export function encodePhotoBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export interface PhotoAnalysisResult {
  usable: boolean
  unusable_reason: string
  modality: 'clinical_photo' | 'radiograph' | 'other'
  image_quality: 'good' | 'fair' | 'poor'
  body_region: string
  observations: Array<{ feature: string; description: string }>
  limitations: string[]
  analysis_kind: 'observation_only'
}

/** Treat the workflow response as untrusted and keep diagnosis terms out. */
export function normalizePhotoAnalysis(raw: unknown): PhotoAnalysisResult | null {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null
  if (!source) return null
  const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)
  const diagnosisWords = /\b(eczema|psoriasis|ringworm|tinea|cellulitis|shingles|herpes|impetigo|scabies|melanoma|carcinoma|covid|pneumonia|diagnos(?:is|tic)|infection)\b/i
  const observations = (Array.isArray(source.observations) ? source.observations : [])
    .map((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return { feature: text(row.feature, 60), description: text(row.description, 300) }
    })
    .filter((row) => row.feature && row.description)
    .filter((row) => !diagnosisWords.test(row.feature) && !diagnosisWords.test(row.description))
    .slice(0, 10)
  const modality = ['clinical_photo', 'radiograph', 'other'].includes(String(source.modality))
    ? source.modality as PhotoAnalysisResult['modality']
    : 'other'
  const imageQuality = ['good', 'fair', 'poor'].includes(String(source.image_quality))
    ? source.image_quality as PhotoAnalysisResult['image_quality']
    : 'fair'
  const limitations = (Array.isArray(source.limitations) ? source.limitations : [])
    .map((item) => text(item, 240))
    .filter(Boolean)
    .slice(0, 6)
  if (modality === 'radiograph' && !limitations.some((item) => /radiolog/i.test(item))) {
    limitations.push('Diagnostic interpretation requires a qualified radiologist.')
  }
  const usable = source.usable !== false && observations.length > 0
  return {
    usable,
    unusable_reason: usable ? '' : text(source.unusable_reason, 200) || 'Image could not be assessed.',
    modality,
    image_quality: imageQuality,
    body_region: text(source.body_region, 80),
    observations,
    limitations,
    analysis_kind: 'observation_only',
  }
}

/**
 * Legacy stub retained for backward-compatible callers/tests. The live action
 * now stores a private EXIF-stripped object and calls the LibertyMD photo agent.
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
