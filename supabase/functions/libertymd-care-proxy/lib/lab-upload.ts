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
  analysis_failed: 'analysis_failed',
  persistence_failed: 'persistence_failed',
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
  analysis_failed:
    'We could not analyze that lab report just now. Your consultation can continue.',
  persistence_failed:
    'We analyzed the lab report but could not save the results. Your consultation can continue.',
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
 * `libertymd_health_parameter_definitions.id` seeds. LibertyMD owns this
 * dictionary so its lab workflow can move to a separate repository/database.
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

export function encodeLabBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export interface LabParameterDefinition {
  id: string
  name: string
  unit: string | null
}

export type LabRangeClassification =
  | 'below_range'
  | 'within_range'
  | 'above_range'
  | 'borderline'
  | 'flagged'
  | 'unclassified'

export interface StandardizedLabResult {
  raw_name: string
  parameter_id: string | null
  parameter_name: string | null
  value: string
  numeric_value: number | null
  raw_unit: string
  standardized_unit: string | null
  reference_range: string
  printed_flag: string
  classification: LabRangeClassification
  analysis: string
  mapped: boolean
}

export interface LabAnalysisResult {
  usable: boolean
  unusable_reason: string
  panel_name: string
  report_date: string
  extracted_count: number
  standardized_count: number
  unmapped_count: number
  results: StandardizedLabResult[]
  analysis_summary: { headline: string; highlights: string[]; limitations: string[] }
  review_state: 'ai_generated_unreviewed'
  analysis_kind: 'standardized_bounded_analysis'
  raw_retained: false
}

export function normalizeLabAnalysis(
  raw: unknown,
  definitions: LabParameterDefinition[],
): LabAnalysisResult | null {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null
  if (!source) return null
  const allowed = new Map(definitions.map((row) => [row.id, row]))
  const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)
  const classes = new Set<LabRangeClassification>([
    'below_range', 'within_range', 'above_range', 'borderline', 'flagged', 'unclassified',
  ])
  const bannedAnalysis = /\b(diagnos|disease|anemia|infection|cancer|treatment|medication|urgent|emergency)\b/i
  const results = (Array.isArray(source.results) ? source.results : [])
    .map((item): StandardizedLabResult | null => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const rawName = text(row.raw_name, 120)
      if (!rawName) return null
      const requestedId = text(row.parameter_id, 120)
      const canonical = allowed.get(requestedId)
      const numeric = typeof row.numeric_value === 'number' ? row.numeric_value : Number.NaN
      const analysis = text(row.analysis, 280)
      const classification = classes.has(String(row.classification) as LabRangeClassification)
        ? String(row.classification) as LabRangeClassification
        : 'unclassified'
      return {
        raw_name: rawName,
        parameter_id: canonical?.id ?? null,
        parameter_name: canonical?.name ?? null,
        value: text(row.value, 60),
        numeric_value: Number.isFinite(numeric) ? numeric : null,
        raw_unit: text(row.raw_unit, 40),
        standardized_unit: canonical ? canonical.unit || text(row.standardized_unit, 40) || null : null,
        reference_range: text(row.reference_range, 80),
        printed_flag: text(row.printed_flag, 20),
        classification: canonical ? classification : 'unclassified',
        analysis: bannedAnalysis.test(analysis) ? '' : analysis,
        mapped: Boolean(canonical),
      }
    })
    .filter((row): row is StandardizedLabResult => row !== null)
    .slice(0, 80)
  const summary = source.analysis_summary && typeof source.analysis_summary === 'object'
    ? source.analysis_summary as Record<string, unknown>
    : {}
  const safeList = (value: unknown) => (Array.isArray(value) ? value : [])
    .map((item) => text(item, 240))
    .filter((item) => item && !bannedAnalysis.test(item))
    .slice(0, 8)
  const standardizedCount = results.filter((row) => row.mapped).length
  const usable = source.usable !== false && results.length > 0
  return {
    usable,
    unusable_reason: usable ? '' : text(source.unusable_reason, 200) || 'Document could not be read as a lab report.',
    panel_name: text(source.panel_name, 100),
    report_date: text(source.report_date, 40),
    extracted_count: results.length,
    standardized_count: standardizedCount,
    unmapped_count: results.length - standardizedCount,
    results,
    analysis_summary: {
      headline: bannedAnalysis.test(text(summary.headline, 280)) ? '' : text(summary.headline, 280),
      highlights: safeList(summary.highlights),
      limitations: safeList(summary.limitations),
    },
    review_state: 'ai_generated_unreviewed',
    analysis_kind: 'standardized_bounded_analysis',
    raw_retained: false,
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
