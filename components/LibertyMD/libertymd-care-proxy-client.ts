/**
 * P0-11 — pure client helpers for `libertymd-care-proxy` non-2xx responses.
 *
 * UI-free so Deno can import this module from `tests/libertymd/n8n-breaker.mts`
 * and table-drive the holding contract without a React harness.
 *
 * ## Holding discriminators (AC1)
 *
 * A response is holding only when **all** of:
 *   - HTTP status is `503`
 *   - body `holding === true`
 *   - body `severity === 'technical'`
 *
 * Fail closed otherwise (malformed JSON, wrong status, missing discriminators).
 * Server `retryable: true` is **not** a recognition requirement and must not
 * trigger auto-retry on its own.
 *
 * ## `retry_after_ms` sanitize bounds (Q1 / AC4)
 *
 * Documented here so AC4's "documented safe bounds" claim is true in-code.
 * Aligned with the landed server breaker (`config.ts` cooldown default / env max):
 *
 * | Input | Result |
 * |---|---|
 * | non-finite / non-number / negative | `RETRY_AFTER_MS_DEFAULT` (`60_000`) |
 * | finite `0` | `0` (unlock immediately; no auto-resend) |
 * | finite positive | clamp to `[0, RETRY_AFTER_MS_MAX]` (`3_600_000`) |
 */

/** Landed calm copy from `send-message.ts` holdingState — client fallback when message is empty/missing. */
export const HOLDING_FALLBACK_MESSAGE =
  'We have paused for a moment because the care service is not responding. Nothing you typed is lost, and this will pick up exactly where it left off.';

/** Server default breaker cooldown (`config.ts` `N8N_BREAKER.cooldownMs`). */
export const RETRY_AFTER_MS_DEFAULT = 60_000;

/** Server env max for breaker cooldown (`config.ts` clamp upper bound). */
export const RETRY_AFTER_MS_MAX = 3_600_000;

export interface LibertyMDHoldingState {
  holding: true;
  severity: 'technical';
  message: string;
  retry_after_ms: number;
}

/** Normalize an untrusted `retry_after_ms` per the Q1 / AC4 bounds above. */
export function normalizeRetryAfterMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return RETRY_AFTER_MS_DEFAULT;
  }
  if (raw === 0) return 0;
  return Math.min(raw, RETRY_AFTER_MS_MAX);
}

/** Extract HTTP status from a Supabase Functions error shape (or bare Response). */
export function statusFromFunctionsError(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const record = error as { status?: unknown; context?: { status?: unknown } };
  if (typeof record.status === 'number') return record.status;
  if (typeof record.context?.status === 'number') return record.context.status;
  return undefined;
}

/**
 * Sync classifier for an already-decoded body. Table-drivable without Response I/O.
 * Returns null when discriminators fail (fail closed).
 */
export function classifyHoldingPayload(
  status: number | undefined,
  body: unknown,
): LibertyMDHoldingState | null {
  if (status !== 503) return null;
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  if (record.holding !== true) return null;
  if (record.severity !== 'technical') return null;

  const rawMessage = typeof record.message === 'string' ? record.message.trim() : '';
  return {
    holding: true,
    severity: 'technical',
    message: rawMessage || HOLDING_FALLBACK_MESSAGE,
    retry_after_ms: normalizeRetryAfterMs(record.retry_after_ms),
  };
}

/**
 * Read the JSON body attached to a Supabase `FunctionsHttpError` (or lookalike)
 * and classify it. Fail closed on unreadable / already-consumed bodies.
 */
export async function parseHoldingFromFunctionsError(
  error: unknown,
): Promise<LibertyMDHoldingState | null> {
  const status = statusFromFunctionsError(error);
  if (status !== 503) return null;
  if (typeof error !== 'object' || error === null) return null;

  const context = (error as { context?: unknown }).context;
  if (!context || typeof context !== 'object') return null;

  const readable = context as { json?: () => Promise<unknown>; clone?: () => { json: () => Promise<unknown> } };
  let body: unknown;
  try {
    if (typeof readable.clone === 'function') {
      body = await readable.clone().json();
    } else if (typeof readable.json === 'function') {
      body = await readable.json();
    } else {
      return null;
    }
  } catch {
    return null;
  }

  return classifyHoldingPayload(status, body);
}

/**
 * Ordinary client retry policy (`>= 500` / 408 / 429 / unknown), with holding
 * exemption (P0-11 AC2). A recognized holding state is never retryable here —
 * even though the HTTP status is 503.
 */
export function isRetryableCareProxyFailure(
  error: unknown,
  holding: LibertyMDHoldingState | null,
): boolean {
  if (holding) return false;
  const status = statusFromFunctionsError(error);
  if (typeof status === 'number') return status >= 500 || status === 408 || status === 429;
  return true;
}

/** P1-04 — stable create_patient reject code (not history's account_required boolean). */
export const SIGN_IN_REQUIRED_CODE = 'sign_in_required' as const;

/** P1-03 — multi-profile start without patient_id. */
export const PATIENT_SELECTION_REQUIRED_CODE = 'patient_selection_required' as const;

/** P4-04 — active profile cap on create. */
export const PROFILE_CAP_REACHED_CODE = 'profile_cap_reached' as const;

/** Client mirror of proxy `LIBERTYMD_MAX_ACTIVE_PATIENTS` (P4-04 / P4-10 at-limit UX). */
export const LIBERTYMD_MAX_ACTIVE_PATIENTS_CLIENT = 5;

/** P4-04 — self patient cannot be soft-deleted. */
export const SELF_UNDELETABLE_CODE = 'self_undeletable' as const;

/** P1-05 / P4-04 — under-floor age reject. */
export const ADULTS_ONLY_CODE = 'adults_only' as const;

/**
 * True when a create_patient (or equivalent) response is the anonymous
 * capability reject: HTTP 403 + `code: 'sign_in_required'`.
 */
export function isSignInRequiredReject(
  status: number | undefined,
  body: Record<string, unknown> | null | undefined,
): boolean {
  if (status !== 403) return false;
  if (!body || typeof body !== 'object') return false;
  return body.code === SIGN_IN_REQUIRED_CODE;
}

/** True when start rejected because multi-profile pick is required (P1-03). */
export function isPatientSelectionRequiredReject(
  status: number | undefined,
  body: Record<string, unknown> | null | undefined,
): boolean {
  if (status !== 400) return false;
  if (!body || typeof body !== 'object') return false;
  return body.code === PATIENT_SELECTION_REQUIRED_CODE;
}

/** Non-PHI bootstrap / reject patient list row (P1-03 Q8A). */
export interface LibertyMDPatientListItem {
  id: string;
  relationship: string;
  display_label: string | null;
  has_age?: boolean;
  has_sex?: boolean;
  is_complete?: boolean;
}

export function normalizePatientList(raw: unknown): LibertyMDPatientListItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      if (!id) return null;
      return {
        id,
        relationship: typeof row.relationship === 'string' ? row.relationship : 'self',
        display_label: typeof row.display_label === 'string' ? row.display_label : null,
        has_age: Boolean(row.has_age),
        has_sex: Boolean(row.has_sex),
        is_complete: Boolean(row.is_complete),
      } satisfies LibertyMDPatientListItem;
    })
    .filter((item): item is LibertyMDPatientListItem => Boolean(item));
}

/** P4-03 — enriched history summary row (never includes report_data). */
export interface LibertyMDHistorySummaryItem {
  id: string;
  status: string;
  chief_complaint: string | null;
  created_at: string;
  patient_id?: string | null;
  patient_display_label?: string | null;
  headline?: string | null;
  triage_tier?: string | null;
  retention_expires_at?: string | null;
  turn_count?: number | null;
  report_gate?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
}

export function normalizeHistorySummary(raw: unknown): LibertyMDHistorySummaryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      if (!id) return null;
      return {
        id,
        status: typeof row.status === 'string' ? row.status : '',
        chief_complaint: typeof row.chief_complaint === 'string' ? row.chief_complaint : null,
        created_at: typeof row.created_at === 'string' ? row.created_at : '',
        patient_id: typeof row.patient_id === 'string' ? row.patient_id : null,
        patient_display_label:
          typeof row.patient_display_label === 'string' ? row.patient_display_label : null,
        headline: typeof row.headline === 'string' ? row.headline : null,
        triage_tier: typeof row.triage_tier === 'string' ? row.triage_tier : null,
        retention_expires_at:
          typeof row.retention_expires_at === 'string' ? row.retention_expires_at : null,
        turn_count: typeof row.turn_count === 'number' ? row.turn_count : null,
        report_gate: typeof row.report_gate === 'string' ? row.report_gate : null,
        updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
        completed_at: typeof row.completed_at === 'string' ? row.completed_at : null,
      } satisfies LibertyMDHistorySummaryItem;
    })
    .filter((item): item is LibertyMDHistorySummaryItem => Boolean(item));
}

/** Minimal typed body for `create_patient` (P1-04). */
export interface CreatePatientRequestBody {
  action: 'create_patient';
  relationship: 'dependent' | 'other' | 'self';
  display_label?: string;
  age?: number;
  sex_at_birth?: 'female' | 'male';
}

/** Start payload fields for profile-aware bind (P1-03). */
export interface StartConsultationPatientFields {
  patient_id?: string;
  selection_source?: 'picker' | 'someone_else_create';
}

/** P3-05 — entry tagging on start_consultation (server coerces). */
export interface StartConsultationEntryFields {
  entry_type?: 'chip' | 'freetext';
  chip_id?: string;
}

/** Probe payload used by anonymous “add profile” attempts (server rejects before insert). */
export function anonymousAddProfileProbeBody(): Record<string, unknown> {
  const body: CreatePatientRequestBody = {
    action: 'create_patient',
    relationship: 'dependent',
    display_label: 'Family member',
    age: 18,
    sex_at_birth: 'female',
  };
  return { ...body };
}

/** Linked someone-else create body (adults-only; P1-03 Q4A). */
export function someoneElseCreateBody(input: {
  display_label: string;
  age: number;
  sex_at_birth: 'female' | 'male';
}): Record<string, unknown> {
  const body: CreatePatientRequestBody = {
    action: 'create_patient',
    relationship: 'other',
    display_label: input.display_label.slice(0, 80) || 'Other',
    age: input.age,
    sex_at_birth: input.sex_at_birth,
  };
  return { ...body };
}

/** P4-04 Q3A — management list row (age/sex included; linked-only). */
export interface LibertyMDManagedPatient {
  id: string;
  relationship: string;
  display_label: string | null;
  age: number | null;
  sex_at_birth: string | null;
}

export function normalizeManagedPatientList(raw: unknown): LibertyMDManagedPatient[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      if (!id) return null;
      const ageRaw = row.age;
      const age = typeof ageRaw === 'number' && Number.isInteger(ageRaw)
        ? ageRaw
        : (typeof ageRaw === 'string' && Number.isInteger(Number(ageRaw)) ? Number(ageRaw) : null);
      return {
        id,
        relationship: typeof row.relationship === 'string' ? row.relationship : 'other',
        display_label: typeof row.display_label === 'string' ? row.display_label : null,
        age,
        sex_at_birth: typeof row.sex_at_birth === 'string' ? row.sex_at_birth : null,
      } satisfies LibertyMDManagedPatient;
    })
    .filter((item): item is LibertyMDManagedPatient => Boolean(item));
}

export function listOwnedPatientsBody(): Record<string, unknown> {
  return { action: 'list_owned_patients' };
}

export function updatePatientBody(input: {
  patient_id: string;
  display_label?: string;
  age: number;
  sex_at_birth: string;
}): Record<string, unknown> {
  return {
    action: 'update_patient',
    patient_id: input.patient_id,
    ...(input.display_label !== undefined ? { display_label: input.display_label.slice(0, 80) } : {}),
    age: input.age,
    sex_at_birth: input.sex_at_birth,
  };
}

export function deletePatientBody(patientId: string): Record<string, unknown> {
  return {
    action: 'delete_patient',
    patient_id: patientId,
  };
}

export function isProfileCapReachedReject(
  status: number | undefined,
  body: Record<string, unknown> | null | undefined,
): boolean {
  if (status !== 400) return false;
  if (!body || typeof body !== 'object') return false;
  return body.code === PROFILE_CAP_REACHED_CODE;
}

export function isSelfUndeletableReject(
  status: number | undefined,
  body: Record<string, unknown> | null | undefined,
): boolean {
  if (status !== 400) return false;
  if (!body || typeof body !== 'object') return false;
  return body.code === SELF_UNDELETABLE_CODE;
}

export function isAdultsOnlyReject(
  status: number | undefined,
  body: Record<string, unknown> | null | undefined,
): boolean {
  if (status !== 400) return false;
  if (!body || typeof body !== 'object') return false;
  return body.code === ADULTS_ONLY_CODE;
}

/** P2-08 — mint/send email delivery request body. */
export interface RequestReportEmailBody {
  action: 'request_report_email';
  consultation_id: string;
  contact_email: string;
}

/** P2-08 — bearer redeem body (raw token; hash looked up service-role). */
export interface RedeemReportLinkBody {
  action: 'redeem_report_link';
  delivery_token: string;
}

/**
 * Build invoke body for request_report_email.
 * Returns `Record<string, unknown>` so it assigns to local `invokeCareProxy`
 * (Chat/App) without introducing a tsc ratchet vs BASELINE.
 */
export function requestReportEmailBody(
  consultationId: string,
  contactEmail: string,
): Record<string, unknown> {
  const body: RequestReportEmailBody = {
    action: 'request_report_email',
    consultation_id: consultationId,
    contact_email: contactEmail,
  };
  return { ...body };
}

export function redeemReportLinkBody(deliveryToken: string): Record<string, unknown> {
  const body: RedeemReportLinkBody = {
    action: 'redeem_report_link',
    delivery_token: deliveryToken,
  };
  return { ...body };
}

/** P4-05 — categorical merge attribution path (not Lexicon merge_outcome). */
export type LibertyMdCollisionPath = 'matched_self' | 'distinct_profile';

export function parseCollisionPath(value: unknown): LibertyMdCollisionPath | null {
  if (value === 'matched_self' || value === 'distinct_profile') return value;
  return null;
}

/** True when sync email send failed with technical severity (AC7). */
export function isReportEmailSendFailure(
  status: number | undefined,
  body: Record<string, unknown> | null | undefined,
): boolean {
  if (status !== 502) return false;
  if (!body || typeof body !== 'object') return false;
  return body.code === 'email_send_failed' || body.severity === 'technical';
}

/** P2-10 — server comment cap (UI + helper stay aligned; proxy is authoritative). */
export const REPORT_FEEDBACK_COMMENT_MAX = 500;

/** P2-10 — typed `submit_report_feedback` payload (clinical via proxy only). */
export const SUBMIT_REPORT_FEEDBACK_ACTION = 'submit_report_feedback' as const;

export interface SubmitReportFeedbackRequestBody {
  action: typeof SUBMIT_REPORT_FEEDBACK_ACTION;
  consultation_id: string;
  helpful: boolean;
  comment?: string;
}

/**
 * Build the invoke body for report feedback. Never writes clinical tables from
 * the client — caller must `supabase.functions.invoke('libertymd-care-proxy', …)`.
 * Comment is optional; empty/whitespace omitted → `has_comment: false` server-side.
 */
export function submitReportFeedbackBody(input: {
  consultation_id: string;
  helpful: boolean;
  comment?: string;
}): SubmitReportFeedbackRequestBody {
  const consultation_id = String(input.consultation_id || '').trim();
  const trimmed =
    typeof input.comment === 'string' ? input.comment.trim().slice(0, REPORT_FEEDBACK_COMMENT_MAX) : '';
  return {
    action: SUBMIT_REPORT_FEEDBACK_ACTION,
    consultation_id,
    helpful: Boolean(input.helpful),
    ...(trimmed ? { comment: trimmed } : {}),
  };
}

/**
 * P2-12 store + proxy action; P2-11 CTA consume — typed `record_care_interest` payload.
 * Never write the care_interest table from the client (proxy invoke only). Never send
 * triage_tier (server derives from report). Contact email optional / separate from intent.
 * Null/omit/empty = demand without contact. Not profiles.email / not marketing.
 */
export const RECORD_CARE_INTEREST_ACTION = 'record_care_interest' as const;

export interface RecordCareInterestRequestBody {
  action: typeof RECORD_CARE_INTEREST_ACTION;
  consultation_id: string;
  /** Optional waitlist notify preference — null/omit = intent without contact. */
  contact_email?: string | null;
}

/**
 * Build invoke body for waitlist / care-interest join.
 * Caller must `supabase.functions.invoke('libertymd-care-proxy', …)`.
 * Empty/whitespace email → null (null-email intent).
 */
export function recordCareInterestBody(input: {
  consultation_id: string;
  contact_email?: string | null;
}): RecordCareInterestRequestBody {
  const consultation_id = String(input.consultation_id || '').trim();
  const raw =
    typeof input.contact_email === 'string' ? input.contact_email.trim() : '';
  return {
    action: RECORD_CARE_INTEREST_ACTION,
    consultation_id,
    ...(raw ? { contact_email: raw } : { contact_email: null }),
  };
}

/** Collect non-PHI error/code text from a proxy JSON body and/or Functions error. */
function careInterestErrorBlob(body: unknown, functionError?: unknown): string {
  const parts: string[] = [];
  if (body && typeof body === 'object') {
    const row = body as Record<string, unknown>;
    if (row.error != null) parts.push(String(row.error));
    if (row.code != null) parts.push(String(row.code));
    if (row.message != null) parts.push(String(row.message));
  }
  if (functionError && typeof functionError === 'object') {
    const err = functionError as { message?: unknown };
    if (err.message != null) parts.push(String(err.message));
  }
  return parts.join(' ').trim();
}

/**
 * True only when the proxy action / edge handler is absent (P2-12 not deployed yet).
 *
 * Local-ack fallback for sequenced UI — NOT for live P2-12 validation failures.
 * Never treat blanket HTTP 400 as missing-action: live `record_care_interest`
 * returns 400 for `invalid_email` and missing consultation id.
 */
export function isRecordCareInterestActionMissing(
  status: number | undefined,
  body: unknown,
  functionError?: unknown,
): boolean {
  const text = careInterestErrorBlob(body, functionError);
  const code =
    body && typeof body === 'object'
      ? String((body as { code?: unknown }).code || '')
      : '';

  // Known live P2-12 / ownership failures → technical error path (never false-ack).
  if (code === 'invalid_email' || code === 'report_not_ready') return false;
  if (
    /invalid_email|missing consultation|report is not ready|consultation not found/i.test(
      text,
    )
  ) {
    return false;
  }

  // Dispatch: unregistered action → `{ error: 'Invalid action' }` (often HTTP 400).
  if (/\binvalid action\b/i.test(text) || /unknown.?action/i.test(text)) {
    return true;
  }

  // Platform missing edge function / route — not consult-ownership 404.
  if (status === 404) {
    if (/consultation not found/i.test(text)) return false;
    if (
      !text ||
      /function|not found|does not exist|failed to (fetch|deploy)/i.test(text)
    ) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// P4-06 — photo upload (proxy sole writer; analysis SoT, zero raw retention)
// ---------------------------------------------------------------------------

export const UPLOAD_PHOTO_ACTION = 'upload_photo' as const;

/** Product max — mirror of proxy `PHOTO_MAX_BYTES` (5 MiB). */
export const PHOTO_MAX_BYTES_CLIENT = 5 * 1024 * 1024;

export const PHOTO_ALLOWED_MIME_CLIENT = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface UploadPhotoRequestBody {
  action: typeof UPLOAD_PHOTO_ACTION;
  consultation_id: string;
  content_type: string;
  image_base64: string;
}

export interface UploadPhotoSuccess {
  ok: true;
  consultation_id: string;
  path: null;
  object_uuid: string;
  content_type: string;
  signed_url: null;
  expires_in: 0;
  raw_retained: false;
  analysis?: {
    usable: boolean;
    modality: 'clinical_photo' | 'radiograph' | 'other';
    observations: Array<{ feature: string; description: string }>;
    limitations: string[];
  };
  consult_continues?: boolean;
}

/**
 * Build invoke body for anonymous photo upload.
 * Caller must `supabase.functions.invoke('libertymd-care-proxy', …)`.
 * Never write Storage / clinical tables from the client.
 */
export function uploadPhotoBody(input: {
  consultation_id: string;
  content_type: string;
  image_base64: string;
}): UploadPhotoRequestBody {
  return {
    action: UPLOAD_PHOTO_ACTION,
    consultation_id: String(input.consultation_id || '').trim(),
    content_type: String(input.content_type || '').trim(),
    image_base64: String(input.image_base64 || ''),
  };
}

/** Client-side MIME/size gate before invoke (proxy remains authoritative). */
export function validatePhotoFileClient(
  file: File,
): { ok: true } | { ok: false; code: 'invalid_mime' | 'too_large' } {
  const mime = (file.type || '').toLowerCase().split(';')[0]?.trim() || '';
  const normalized = mime === 'image/jpg' ? 'image/jpeg' : mime;
  if (!(PHOTO_ALLOWED_MIME_CLIENT as readonly string[]).includes(normalized)) {
    return { ok: false, code: 'invalid_mime' };
  }
  if (file.size > PHOTO_MAX_BYTES_CLIENT) {
    return { ok: false, code: 'too_large' };
  }
  return { ok: true };
}

/** Read File → base64 (no data-URL prefix). */
export async function readPhotoFileAsBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** True when proxy/body indicates a technical photo failure that must not block consult. */
export function isPhotoUploadTechnicalFailure(
  status: number | undefined,
  body: Record<string, unknown> | null | undefined,
): boolean {
  if (!body || typeof body !== 'object') return false;
  if (
    body.severity === 'technical'
    && typeof body.code === 'string'
    && /mime|too_large|decode|storage|sign|invalid_payload|missing_consultation/i.test(body.code)
  ) {
    return true;
  }
  if (status !== undefined && status >= 400 && body.consult_continues === true) return true;
  return false;
}

// ---------------------------------------------------------------------------
// P4-07 — lab upload (proxy sole writer; standardized rows SoT; linked-only)
// ---------------------------------------------------------------------------

export const UPLOAD_LAB_ACTION = 'upload_lab' as const;

/** Product max — mirror of proxy `LAB_MAX_BYTES` (10 MiB). */
export const LAB_MAX_BYTES_CLIENT = 10 * 1024 * 1024;

export const LAB_ALLOWED_MIME_CLIENT = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export interface UploadLabRequestBody {
  action: typeof UPLOAD_LAB_ACTION;
  consultation_id: string;
  patient_id: string;
  content_type: string;
  /** Preferred transport field (CARE SoT). */
  file_base64: string;
}

export interface UploadLabSuccess {
  ok: true;
  consultation_id: string;
  path: null;
  object_uuid: string;
  patient_id: string;
  content_type: string;
  signed_url: null;
  expires_in: 0;
  raw_retained: false;
  analysis?: {
    usable: boolean;
    extracted_count: number;
    standardized_count: number;
    unmapped_count: number;
    review_state: string;
  };
  structured_results?: {
    review_state?: string;
    extracted_count?: number;
    standardized_count?: number;
    unmapped_count?: number;
    analytes?: unknown[];
  };
  consult_continues?: boolean;
}

/**
 * Build invoke body for linked lab upload.
 * Caller must `supabase.functions.invoke('libertymd-care-proxy', …)`.
 * Never write Storage / clinical tables from the client.
 */
export function uploadLabBody(input: {
  consultation_id: string;
  patient_id: string;
  content_type: string;
  file_base64: string;
}): UploadLabRequestBody {
  return {
    action: UPLOAD_LAB_ACTION,
    consultation_id: String(input.consultation_id || '').trim(),
    patient_id: String(input.patient_id || '').trim(),
    content_type: String(input.content_type || '').trim(),
    file_base64: String(input.file_base64 || ''),
  };
}

/** Client-side MIME/size gate before invoke (proxy remains authoritative). */
export function validateLabFileClient(
  file: File,
): { ok: true } | { ok: false; code: 'invalid_mime' | 'too_large' } {
  const mime = (file.type || '').toLowerCase().split(';')[0]?.trim() || '';
  const normalized = mime === 'image/jpg' ? 'image/jpeg' : mime;
  if (!(LAB_ALLOWED_MIME_CLIENT as readonly string[]).includes(normalized)) {
    return { ok: false, code: 'invalid_mime' };
  }
  if (file.size > LAB_MAX_BYTES_CLIENT) {
    return { ok: false, code: 'too_large' };
  }
  return { ok: true };
}

/** Read File → base64 (no data-URL prefix). Same encoding as photo. */
export async function readLabFileAsBase64(file: File): Promise<string> {
  return readPhotoFileAsBase64(file);
}

/** True when proxy/body indicates a technical lab failure that must not block consult. */
export function isLabUploadTechnicalFailure(
  status: number | undefined,
  body: Record<string, unknown> | null | undefined,
): boolean {
  if (!body || typeof body !== 'object') return false;
  if (
    body.severity === 'technical'
    && typeof body.code === 'string'
    && /mime|too_large|decode|storage|sign|invalid_payload|missing_|patient_|attribution|redaction|sign_in/i.test(
      body.code,
    )
  ) {
    return true;
  }
  if (status !== undefined && status >= 400 && body.consult_continues === true) return true;
  return false;
}

/** P4-01/P4-02 — respond_followup_checkin invoke body (optional doctor/match). */
export function respondFollowupCheckinBody(
  followupToken: string,
  answer: 'better' | 'same' | 'worse',
  extras?: {
    saw_doctor?: 'yes' | 'no' | 'not_yet';
    report_match?: 'yes' | 'no' | 'unsure';
  },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    action: 'respond_followup_checkin',
    followup_token: followupToken,
    followup_answer: answer,
  };
  if (extras?.saw_doctor) {
    body.followup_saw_doctor = extras.saw_doctor;
  }
  if (extras?.report_match) {
    body.followup_report_match = extras.report_match;
  }
  return body;
}

/** P4-01 — unsubscribe_followup_checkin invoke body. */
export function unsubscribeFollowupCheckinBody(followupToken: string): Record<string, unknown> {
  return {
    action: 'unsubscribe_followup_checkin',
    followup_token: followupToken,
  };
}
