/**
 * P4-07 — pure lab ingest validators + analysis/taxonomy stub (no Deno.env / Storage I/O).
 * Wired by actions/lab-upload.ts; unit-tested from tests/libertymd/.
 */

export const LAB_SIGNED_URL_TTL_SECONDS = 900
export const LAB_MAX_BYTES = 10 * 1024 * 1024 // 10 MiB product max (≤ bucket 20 MiB)
export const LAB_ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
export type LabAllowedMime = (typeof LAB_ALLOWED_MIME)[number]

export const LAB_UPLOAD_CODES = {
  missing_consultation: 'missing_consultation',
  missing_patient: 'missing_patient',
  patient_not_owned: 'patient_not_owned',
  patient_inactive: 'patient_inactive',
  invalid_mime: 'invalid_mime',
  too_large: 'too_large',
  invalid_payload: 'invalid_payload',
  decode_failed: 'decode_failed',
  storage_failed: 'storage_failed',
  sign_failed: 'sign_failed',
  attribution_failed: 'attribution_failed',
  redaction_failed: 'redaction_failed',
} as const

export type LabUploadRejectCode = (typeof LAB_UPLOAD_CODES)[keyof typeof LAB_UPLOAD_CODES]

/** Safe technical copy — never clinical caution / emergency clothing. */
export const LAB_UPLOAD_SAFE_COPY: Record<LabUploadRejectCode, string> = {
  missing_consultation: 'We could not attach that lab report just now. Please try again.',
  missing_patient: 'Choose which profile this lab report belongs to, then try again.',
  patient_not_owned: 'That profile is not available for this lab upload. Choose another profile.',
  patient_inactive: 'That profile is no longer active. Choose another profile for this lab upload.',
  invalid_mime:
    'That file type is not supported. Please use a PDF, JPEG, PNG, or WebP file under 10 MB.',
  too_large: 'That file is too large. Please use a file under 10 MB.',
  invalid_payload: 'We could not read that lab report. Please try another file.',
  decode_failed: 'We could not read that lab report. Please try another file.',
  storage_failed:
    'Something went wrong on our side while saving the lab report. Your consultation can continue.',
  sign_failed:
    'Something went wrong on our side while saving the lab report. Your consultation can continue.',
  attribution_failed:
    'Something went wrong on our side while saving the lab report. Your consultation can continue.',
  redaction_failed:
    'We could not prepare that lab report for analysis. Your consultation can continue.',
}

/** AC4 / S5 — never persist these as queryable columns or structured_results keys. */
export const LAB_IDENTIFIER_BAN_KEYS = [
  'patient_name',
  'dob',
  'date_of_birth',
  'mrn',
  'address',
  'phone',
] as const

/**
 * Synthetic taxonomy stub map (Eng Done Q3A).
 * Keys are lowercased analyte labels from a stub extract; values are
 * `health_parameter_definitions.id` seeds (SELECT reuse — no parallel dictionary).
 */
export const LAB_TAXONOMY_STUB_MAP: Record<string, string> = {
  hba1c: 'HbA1c Bld-mCnc',
  'glycated hemoglobin': 'HbA1c Bld-mCnc',
  glucose: 'Glucose p fast BldV-mCnc',
  'fasting blood sugar': 'Glucose p fast BldV-mCnc',
  ldl: 'LDLc SerPl Calc-mCnc',
  'ldl cholesterol': 'LDLc SerPl Calc-mCnc',
  tsh: 'TSH SerPl-aCnc',
}

export function normalizeLabMime(raw: unknown): LabAllowedMime | null {
  if (typeof raw !== 'string') return null
  const mime = raw.toLowerCase().split(';')[0]?.trim() || ''
  if (mime === 'image/jpg') return 'image/jpeg'
  if ((LAB_ALLOWED_MIME as readonly string[]).includes(mime)) {
    return mime as LabAllowedMime
  }
  return null
}

export function validateLabBytes(
  bytes: Uint8Array,
  contentType: unknown,
):
  | { ok: true; mime: LabAllowedMime }
  | { ok: false; code: LabUploadRejectCode } {
  const mime = normalizeLabMime(contentType)
  if (!mime) return { ok: false, code: LAB_UPLOAD_CODES.invalid_mime }
  if (bytes.byteLength <= 0) return { ok: false, code: LAB_UPLOAD_CODES.invalid_payload }
  if (bytes.byteLength > LAB_MAX_BYTES) return { ok: false, code: LAB_UPLOAD_CODES.too_large }
  return { ok: true, mime }
}

/**
 * Decode base64 (optionally data-URL) → bytes.
 * Transport SoT: `file_base64` preferred; `image_base64` accepted as alias (CARE).
 * No PHI logging.
 */
export function decodeLabBase64(raw: unknown): Uint8Array | null {
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

/** Prefer file_base64; fall back to image_base64 (photo-parity alias). */
export function resolveLabBase64Payload(payload: {
  file_base64?: unknown
  image_base64?: unknown
}): unknown {
  if (typeof payload.file_base64 === 'string' && payload.file_base64.trim()) {
    return payload.file_base64
  }
  return payload.image_base64
}

export function assertLabSignedUrlTtl(ttlSeconds: number): void {
  if (!(ttlSeconds > 0) || ttlSeconds > LAB_SIGNED_URL_TTL_SECONDS) {
    throw new Error(`LAB_SIGNED_URL_TTL_SECONDS must be in (0, ${LAB_SIGNED_URL_TTL_SECONDS}]`)
  }
}

export function structuredResultsHaveBannedKeys(results: unknown): boolean {
  if (!results || typeof results !== 'object' || Array.isArray(results)) return false
  const obj = results as Record<string, unknown>
  for (const key of LAB_IDENTIFIER_BAN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) return true
  }
  // Nested analytes[] objects also checked.
  const analytes = obj.analytes
  if (Array.isArray(analytes)) {
    for (const row of analytes) {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        for (const key of LAB_IDENTIFIER_BAN_KEYS) {
          if (Object.prototype.hasOwnProperty.call(row, key)) return true
        }
      }
    }
  }
  return false
}

/**
 * Map stub analyte labels → taxonomy ids. Demography (age/sex) comes from the
 * attributed profile — never OCR DOB. Unmapped → categorical unmapped bucket.
 * Always labels review_state = unreviewed (AC9).
 */
export function mapLabAnalytesStub(
  extracted: Array<{ label: string; value?: string | number | null; unit?: string | null }>,
  demography: { age: number | null; sex_at_birth: string | null },
): {
  analytes: Array<{
    parameter_id: string | null
    label: string
    value: string | number | null
    unit: string | null
    mapped: boolean
    unmapped: boolean
  }>
  demography_source: 'attributed_profile'
  review_state: 'unreviewed'
  age: number | null
  sex_at_birth: string | null
} {
  const analytes = extracted.map((item) => {
    const label = String(item.label || '').trim()
    const key = label.toLowerCase()
    const parameterId = LAB_TAXONOMY_STUB_MAP[key] || null
    const mapped = Boolean(parameterId)
    return {
      parameter_id: parameterId,
      label,
      value: item.value ?? null,
      unit: item.unit ?? null,
      mapped,
      unmapped: !mapped,
    }
  })
  return {
    analytes,
    demography_source: 'attributed_profile',
    review_state: 'unreviewed',
    age: demography.age,
    sex_at_birth: demography.sex_at_birth,
  }
}

/**
 * Analysis Done bar for P4-07 = stub / pending_redaction when live OCR unset.
 * Never invokes HT process-lab-report or n8n with unredacted bytes.
 */
export function labAnalysisStub(opts?: {
  status?: 'stub' | 'pending_redaction'
  model_egress?: boolean
}) {
  const status = opts?.status ?? 'stub'
  return {
    status,
    analyzed: false,
    model_egress: opts?.model_egress === true ? true : false,
    runtime_dependency: null,
    review_state: 'unreviewed' as const,
    note:
      status === 'pending_redaction'
        ? 'Lab stored; redaction unavailable — zero model egress (fail-closed).'
        : 'Lab analysis deferred; ingest + attribution + redact gate only. No model egress this ship.',
  }
}

export function extensionForLabMime(mime: string): string {
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}
