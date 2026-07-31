/**
 * P4-07 — lab redaction gate (fail-closed for model egress).
 *
 * Prefer OCR-and-drop of name/DOB/MRN-like tokens (and/or crop of header band)
 * before any model/n8n receives bytes or a model-intended signed URL.
 * If redaction cannot run → do not call model (Q3A / S4).
 *
 * Durable store of the original under private libertymd-care is allowed when
 * the model path is gated. Never log OCR text.
 */

/** Synthetic identifier patterns for OCR-and-drop (fixture + future OCR text). */
const NAME_LINE = /\b(?:patient\s*name|name)\s*[:#]?\s*[A-Za-z][A-Za-z .'-]{1,80}/gi
const DOB_LINE =
  /\b(?:dob|date\s*of\s*birth|birth\s*date)\s*[:#]?\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/gi
const MRN_LINE = /\b(?:mrn|medical\s*record\s*(?:no|number|#)?)\s*[:#]?\s*[A-Za-z0-9\-]{3,32}/gi
const PHONE_LINE = /\b(?:phone|tel|mobile)\s*[:#]?\s*[\d().\-\s]{7,20}/gi

export type LabRedactSuccess = {
  ok: true
  /** Bytes safe to bind to a model path (may equal original when text-only redact N/A). */
  modelBytes: Uint8Array
  /** True when identifier tokens were dropped from an OCR/text layer. */
  identifiersDropped: boolean
  redactedText: string | null
}

export type LabRedactFailure = {
  ok: false
  reason: 'redaction_error' | 'unavailable'
}

export type LabRedactResult = LabRedactSuccess | LabRedactFailure

/**
 * Drop name/DOB/MRN/phone-like tokens from extracted OCR / synthetic text.
 * Never logs the input or output text.
 */
export function dropIdentifierTokens(text: string): { text: string; dropped: boolean } {
  const before = text
  let out = text
    .replace(NAME_LINE, '[REDACTED_NAME]')
    .replace(DOB_LINE, '[REDACTED_DOB]')
    .replace(MRN_LINE, '[REDACTED_MRN]')
    .replace(PHONE_LINE, '[REDACTED_PHONE]')
  const dropped = out !== before
  return { text: out, dropped }
}

/**
 * Fail-closed redaction gate for model egress.
 *
 * - When `ocrText` is provided: OCR-and-drop → success with redacted text;
 *   modelBytes stay the durable original only when callers keep model_egress=false
 *   OR pass pre-cropped bytes. For Eng Done stub path, callers must not send
 *   unredacted bytes to a model even on success if identifiers remain on-disk.
 * - When `forceError`: simulates redaction failure → fail closed.
 * - When no OCR available (`ocrText` unset and `requireOcr`): unavailable →
 *   fail closed for model path (analysis stays stub/pending_redaction).
 */
export function redactLabForModel(input: {
  bytes: Uint8Array
  mime: string
  ocrText?: string | null
  requireOcr?: boolean
  forceError?: boolean
}): LabRedactResult {
  try {
    if (input.forceError) {
      return { ok: false, reason: 'redaction_error' }
    }

    const ocr = typeof input.ocrText === 'string' ? input.ocrText : null
    if (ocr != null) {
      const { text, dropped } = dropIdentifierTokens(ocr)
      // Model-bound payload must not equal the raw OCR text when drop claimed success.
      const modelBoundText = text
      if (dropped && modelBoundText === ocr) {
        return { ok: false, reason: 'redaction_error' }
      }
      return {
        ok: true,
        modelBytes: input.bytes,
        identifiersDropped: dropped,
        redactedText: modelBoundText,
      }
    }

    if (input.requireOcr !== false) {
      // Live OCR unset — fail closed for model egress (Q3A stub path).
      return { ok: false, reason: 'unavailable' }
    }

    // Explicit requireOcr=false: allow pass-through only when caller gates model_egress.
    return {
      ok: true,
      modelBytes: input.bytes,
      identifiersDropped: false,
      redactedText: null,
    }
  } catch {
    return { ok: false, reason: 'redaction_error' }
  }
}

/**
 * Decide analysis status + whether model/n8n may be invoked.
 * Unredacted egress is forbidden — never returns model_egress=true without
 * a successful redact that produced redactedText (or an explicit future
 * cropped-bytes path).
 */
export function gateLabModelEgress(redact: LabRedactResult): {
  model_egress: false
  analysis_status: 'stub' | 'pending_redaction' | 'redacted'
  redact_ok: boolean
} {
  if (!redact.ok) {
    return {
      model_egress: false,
      analysis_status: redact.reason === 'unavailable' ? 'pending_redaction' : 'stub',
      redact_ok: false,
    }
  }
  if (redact.identifiersDropped && redact.redactedText) {
    // Redaction succeeded for text layer — still no live model this ship (Q3A).
    return {
      model_egress: false,
      analysis_status: 'redacted',
      redact_ok: true,
    }
  }
  return {
    model_egress: false,
    analysis_status: 'stub',
    redact_ok: true,
  }
}

/** Assert model-bound OCR text ≠ raw unredacted when redaction claims drop. */
export function assertModelBoundTextRedacted(
  rawOcr: string,
  redacted: string | null,
  identifiersDropped: boolean,
): boolean {
  if (!identifiersDropped) return true
  if (redacted == null) return false
  return redacted !== rawOcr
}
