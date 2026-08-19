/**
 * P0-12 — pure failure-class classifier + copy + offline queue helpers.
 *
 * UI-free so Deno can table-drive every class without a React harness.
 * Holding (P0-11) is checked *before* this module is consulted; a holding
 * input returns null so it is never reclassified as one of the eight.
 *
 * Classification keys off structured fields only — never scrapes forbidden
 * substrings (`n8n`, `workflow`, `proxy`, …) from error messages.
 */

import {
  normalizeRetryAfterMs,
  RETRY_AFTER_MS_DEFAULT,
  statusFromFunctionsError,
  type LibertyMDHoldingState,
} from './libertymd-care-proxy-client.ts';

/** The eight user-visible send-path classes, plus the documented fallback. */
export type LibertyMDErrorClass =
  | 'n8n_timeout'
  | 'n8n_upstream'
  | 'guardrail_failure'
  | 'lease_conflict'
  | 'version_mismatch'
  | 'offline'
  | 'session_expired'
  | 'rate_limited'
  | 'upstream_unknown';

export const LIBERTYMD_ERROR_CLASSES: readonly LibertyMDErrorClass[] = [
  'n8n_timeout',
  'n8n_upstream',
  'guardrail_failure',
  'lease_conflict',
  'version_mismatch',
  'offline',
  'session_expired',
  'rate_limited',
  'upstream_unknown',
] as const;

export const EIGHT_USER_VISIBLE_CLASSES: readonly Exclude<LibertyMDErrorClass, 'upstream_unknown'>[] = [
  'n8n_timeout',
  'n8n_upstream',
  'guardrail_failure',
  'lease_conflict',
  'version_mismatch',
  'offline',
  'session_expired',
  'rate_limited',
] as const;

/** Tokens that must never appear in user-facing copy (AC10). */
export const FORBIDDEN_USER_COPY_TOKENS = [
  'n8n',
  'workflow',
  'proxy',
  'edge function',
  'Supabase',
  'FunctionsHttpError',
  'stack',
] as const;

export type ClaimRejection = 'lease_conflict' | 'version_mismatch';

export interface FailureClassificationInput {
  /** When truthy, classifier returns null — holding owns the path (P0-11). */
  holding?: LibertyMDHoldingState | true | null;
  /** `navigator.onLine` (or test double). Default assumed online when omitted. */
  online?: boolean;
  status?: number;
  /** Decoded proxy error body (claim_rejection, retry_after_ms, source, …). */
  body?: Record<string, unknown> | null;
  /** Structured failure tag — never scraped from message text. */
  failure?: 'timeout' | 'guardrail' | string | null;
  /** Error.name — AbortError is a trusted timeout shape. */
  errorName?: string | null;
  /** Pre-resolved auth signal; ambiguous auth stays unset (fail closed). */
  authSignal?: 'session_expired' | null;
}

export interface ClassifiedFailure {
  errorClass: LibertyMDErrorClass;
  /** false for silent classes (lease / version). */
  userVisible: boolean;
  /** Whether exhausted handling should offer Try again. */
  showRetry: boolean;
  severity: 'technical';
  message: string;
  retryAfterMs?: number;
}

/** Class-safe 409 body constant — no “already being processed” / refresh instruction. */
export const CLAIM_REJECTION_SAFE_ERROR =
  'This consultation could not accept that answer just now.';

const COPY: Record<LibertyMDErrorClass, string> = {
  n8n_timeout: 'Something went wrong on our side. Please try again.',
  n8n_upstream: 'Something went wrong on our side. Please try again.',
  guardrail_failure:
    'A background safety check could not run just now. That is a problem on our side, not a finding about your health.',
  lease_conflict: '',
  version_mismatch: '',
  // Must not claim “saved” until the queue write succeeds (Chat sets post-persist copy).
  offline: 'You appear to be offline. Reconnect to send your message.',
  session_expired: 'Your session ended. Sign in again to continue — nothing you typed is lost.',
  rate_limited: 'Please wait a moment before sending again.',
  upstream_unknown: 'Something went wrong on our side. Please try again.',
};

export const OFFLINE_QUEUED_COPY =
  'You appear to be offline. Your message is queued and will send when you reconnect.';

export const OFFLINE_QUEUE_PREFIX = 'libertymd:offline-queue:';
export const OFFLINE_QUEUE_TTL_MS = 24 * 60 * 60 * 1000;

export interface OfflineQueueEntry {
  v: 1;
  consultationId: string;
  message: string;
  clientMessageId: string;
  enqueuedAt: number;
}

export function offlineQueueKey(consultationId: string): string {
  return `${OFFLINE_QUEUE_PREFIX}${consultationId}`;
}

export function formatRateLimitCopy(retryAfterMs: number): string {
  const ms = normalizeRetryAfterMs(retryAfterMs);
  if (ms <= 0) {
    return 'Please wait a moment before sending again.';
  }
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds >= 60) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return minutes === 1
      ? 'Please wait about a minute before sending again.'
      : `Please wait about ${minutes} minutes before sending again.`;
  }
  return `Please wait about ${seconds} seconds before sending again.`;
}

export function copyForErrorClass(
  errorClass: LibertyMDErrorClass,
  opts?: { retryAfterMs?: number; offlinePersisted?: boolean },
): string {
  if (errorClass === 'rate_limited') {
    return formatRateLimitCopy(opts?.retryAfterMs ?? RETRY_AFTER_MS_DEFAULT);
  }
  if (errorClass === 'offline' && opts?.offlinePersisted) {
    return OFFLINE_QUEUED_COPY;
  }
  return COPY[errorClass];
}

/**
 * Unambiguous session/JWT expiry signals only. Ambiguous auth failures stay
 * out of `session_expired` (fail closed → upstream_unknown / n8n_upstream).
 */
export function detectSessionExpiredSignal(error: unknown, status?: number): 'session_expired' | null {
  if (status === 401) return 'session_expired';

  if (typeof error !== 'object' || error === null) return null;
  const record = error as { name?: unknown; message?: unknown; code?: unknown };
  const name = typeof record.name === 'string' ? record.name : '';
  const code = typeof record.code === 'string' ? record.code : '';
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';

  if (
    name === 'AuthSessionMissingError'
    || name === 'AuthApiError'
    || code === 'session_not_found'
    || code === 'bad_jwt'
  ) {
    if (
      /session.*expired|jwt expired|invalid jwt|refresh.?token|not authenticated|auth session missing/i.test(
        `${name} ${code} ${message}`,
      )
      || code === 'bad_jwt'
      || code === 'session_not_found'
      || name === 'AuthSessionMissingError'
    ) {
      return 'session_expired';
    }
  }

  if (
    /jwt expired|session expired|invalid jwt|refresh token.*expired|auth session missing/i.test(message)
  ) {
    return 'session_expired';
  }

  return null;
}

/**
 * Pure classifier. Returns null when holding owns the path.
 * Never scrapes forbidden tokens from messages to decide class.
 */
export function classifySendFailure(input: FailureClassificationInput): ClassifiedFailure | null {
  if (input.holding) return null;

  if (input.online === false) {
    return visible('offline', { showRetry: false });
  }

  const body = input.body && typeof input.body === 'object' ? input.body : null;
  const claimRejection = body && typeof body.claim_rejection === 'string' ? body.claim_rejection : null;

  if (claimRejection === 'version_mismatch') {
    return silent('version_mismatch');
  }
  if (claimRejection === 'lease_conflict') {
    return silent('lease_conflict');
  }

  if (
    input.failure === 'guardrail'
    || (body && (body.source === 'error_fail_cautious' || body.crisis_type === 'guardrail_unavailable'))
  ) {
    return visible('guardrail_failure', { showRetry: false });
  }

  if (input.status === 429) {
    const retryAfterMs = normalizeRetryAfterMs(
      body?.retry_after_ms ?? parseRetryAfterHeader(body?.retry_after),
    );
    return {
      errorClass: 'rate_limited',
      userVisible: true,
      showRetry: false,
      severity: 'technical',
      message: formatRateLimitCopy(retryAfterMs),
      retryAfterMs,
    };
  }

  if (input.status === 401 || input.authSignal === 'session_expired') {
    return visible('session_expired', { showRetry: false });
  }

  if (input.failure === 'timeout' || input.errorName === 'AbortError') {
    return visible('n8n_timeout', { showRetry: true });
  }

  if (typeof input.status === 'number' && (input.status >= 500 || input.status === 408)) {
    return visible('n8n_upstream', { showRetry: true });
  }

  // Exhausted unknown-network (no status, still online) → upstream bucket.
  if (input.status === undefined || input.status === null) {
    return visible('n8n_upstream', { showRetry: true });
  }

  // Recognized non-retryable 4xx that is not one of the eight → technical fallback.
  return visible('upstream_unknown', { showRetry: false });
}

function silent(errorClass: 'lease_conflict' | 'version_mismatch'): ClassifiedFailure {
  return {
    errorClass,
    userVisible: false,
    showRetry: false,
    severity: 'technical',
    message: '',
  };
}

/**
 * Pure Chat send-path branch after classify (AC5 / AC8).
 * Mirrors `LibertyMDChat` handling order without a React harness:
 * silent lease → silent rehydrate → first session refresh → offline →
 * rate-limit / technical show (emit). Holding is checked before classify.
 */
export type ChatSendFailureAction =
  | { type: 'silent_ignore'; emit: false }
  | { type: 'silent_rehydrate'; emit: false }
  | { type: 'attempt_session_refresh'; emit: false }
  | { type: 'offline_queue'; emit: true }
  | { type: 'rate_limit'; emit: true; retryAfterMs: number }
  | { type: 'show_technical'; emit: true; showRetry: boolean };

export function resolveChatSendFailureAction(
  classified: ClassifiedFailure,
  opts?: { sessionRefreshAttempted?: boolean; online?: boolean },
): ChatSendFailureAction {
  if (classified.errorClass === 'lease_conflict') {
    return { type: 'silent_ignore', emit: false };
  }
  if (classified.errorClass === 'version_mismatch') {
    return { type: 'silent_rehydrate', emit: false };
  }
  if (classified.errorClass === 'session_expired' && !opts?.sessionRefreshAttempted) {
    return { type: 'attempt_session_refresh', emit: false };
  }
  if (classified.errorClass === 'offline' || opts?.online === false) {
    return { type: 'offline_queue', emit: true };
  }
  if (classified.errorClass === 'rate_limited') {
    return {
      type: 'rate_limit',
      emit: true,
      retryAfterMs: classified.retryAfterMs ?? RETRY_AFTER_MS_DEFAULT,
    };
  }
  return {
    type: 'show_technical',
    emit: true,
    showRetry: classified.showRetry,
  };
}

function visible(
  errorClass: LibertyMDErrorClass,
  opts: { showRetry: boolean },
): ClassifiedFailure {
  return {
    errorClass,
    userVisible: true,
    showRetry: opts.showRetry,
    severity: 'technical',
    message: copyForErrorClass(errorClass),
  };
}

function parseRetryAfterHeader(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return undefined;
  const asInt = Number.parseInt(raw, 10);
  if (Number.isFinite(asInt)) return asInt * 1000;
  return undefined;
}

/**
 * Read status + JSON body from a Supabase FunctionsHttpError (or lookalike).
 * Fail closed on unreadable / already-consumed bodies.
 */
export async function readFunctionsErrorPayload(
  error: unknown,
): Promise<{ status: number | undefined; body: Record<string, unknown> | null }> {
  const status = statusFromFunctionsError(error);
  if (typeof error === 'object' && error !== null) {
    const direct = error as { body?: unknown; claim_rejection?: unknown };
    if (direct.body && typeof direct.body === 'object') {
      return { status, body: direct.body as Record<string, unknown> };
    }
  }

  if (typeof error !== 'object' || error === null) {
    return { status, body: null };
  }

  const context = (error as { context?: unknown }).context;
  if (!context || typeof context !== 'object') {
    return { status, body: null };
  }

  const readable = context as {
    json?: () => Promise<unknown>;
    clone?: () => { json: () => Promise<unknown> };
  };
  let raw: unknown;
  try {
    if (typeof readable.clone === 'function') {
      raw = await readable.clone().json();
    } else if (typeof readable.json === 'function') {
      raw = await readable.json();
    } else {
      return { status, body: null };
    }
  } catch {
    return { status, body: null };
  }

  if (!raw || typeof raw !== 'object') return { status, body: null };
  return { status, body: raw as Record<string, unknown> };
}

/** Build a ClassifiedFailure from a thrown send-path error (post holding check). */
export async function classifyThrownSendFailure(
  error: unknown,
  opts?: { online?: boolean; holding?: LibertyMDHoldingState | null },
): Promise<ClassifiedFailure | null> {
  if (opts?.holding) return null;
  const { status, body } = await readFunctionsErrorPayload(error);
  const errorName = error instanceof Error ? error.name : null;
  const failure =
    typeof (error as { failure?: unknown })?.failure === 'string'
      ? String((error as { failure: string }).failure)
      : null;

  return classifySendFailure({
    holding: null,
    online: opts?.online,
    status,
    body,
    failure,
    errorName,
    authSignal: detectSessionExpiredSignal(error, status),
  });
}

// ---------------------------------------------------------------------------
// Offline queue (localStorage) — PHI stays out of telemetry; never log contents.
// ---------------------------------------------------------------------------

export type OfflineStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readOfflineQueue(
  consultationId: string,
  storage: OfflineStorage,
  nowMs: number = Date.now(),
): OfflineQueueEntry | null {
  if (!consultationId) return null;
  const raw = storage.getItem(offlineQueueKey(consultationId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OfflineQueueEntry>;
    if (
      parsed?.v !== 1
      || parsed.consultationId !== consultationId
      || typeof parsed.message !== 'string'
      || typeof parsed.clientMessageId !== 'string'
      || typeof parsed.enqueuedAt !== 'number'
    ) {
      storage.removeItem(offlineQueueKey(consultationId));
      return null;
    }
    if (nowMs - parsed.enqueuedAt > OFFLINE_QUEUE_TTL_MS) {
      storage.removeItem(offlineQueueKey(consultationId));
      return null;
    }
    return parsed as OfflineQueueEntry;
  } catch {
    storage.removeItem(offlineQueueKey(consultationId));
    return null;
  }
}

export function enqueueOfflineMessage(
  entry: Omit<OfflineQueueEntry, 'v' | 'enqueuedAt'> & { enqueuedAt?: number },
  storage: OfflineStorage,
  nowMs: number = Date.now(),
): OfflineQueueEntry {
  const payload: OfflineQueueEntry = {
    v: 1,
    consultationId: entry.consultationId,
    message: entry.message,
    clientMessageId: entry.clientMessageId,
    enqueuedAt: entry.enqueuedAt ?? nowMs,
  };
  storage.setItem(offlineQueueKey(entry.consultationId), JSON.stringify(payload));
  return payload;
}

export function clearOfflineQueue(consultationId: string, storage: OfflineStorage): void {
  if (!consultationId) return;
  storage.removeItem(offlineQueueKey(consultationId));
}

export function userCopyContainsForbiddenToken(text: string): string | null {
  const lower = text.toLowerCase();
  for (const token of FORBIDDEN_USER_COPY_TOKENS) {
    if (lower.includes(token.toLowerCase())) return token;
  }
  return null;
}

/**
 * P1-04 — map create_patient reject → capability offer path.
 * Keys on `code === 'sign_in_required'` + non-2xx. Technical severity only —
 * never clinical clothing. Network/unreachable also routes to offer (Q4A).
 */
export type ProfileCapabilityOfferReason = 'sign_in_required' | 'unreachable';

export function resolveProfileCapabilityOffer(
  status: number | undefined,
  body: Record<string, unknown> | null | undefined,
): ProfileCapabilityOfferReason | null {
  if (status === undefined || status === null) return 'unreachable';
  if (
    status === 403
    && body
    && typeof body === 'object'
    && body.code === 'sign_in_required'
  ) {
    return 'sign_in_required';
  }
  // Non-2xx without the stable code still surfaces offer for anonymous attempt
  // when transport fails mid-flight (never invent a patient client-side).
  if (typeof status === 'number' && (status < 200 || status >= 300) && status !== 400) {
    return 'unreachable';
  }
  return null;
}

/**
 * P4-04 — map profile CRUD reject codes to technical copy.
 * Never clinical clothing. Reuses adults_only / sign_in_required unchanged.
 */
export type ProfileManagementFailureCode =
  | 'profile_cap_reached'
  | 'self_undeletable'
  | 'adults_only'
  | 'sign_in_required'
  | 'upstream_unknown';

const PROFILE_MANAGEMENT_COPY: Record<ProfileManagementFailureCode, string> = {
  profile_cap_reached:
    'You already have the maximum number of active profiles. Remove one before adding another.',
  self_undeletable: 'Your own profile cannot be removed.',
  adults_only:
    'LibertyMD is for adults (18+). For someone under 18, please use a clinician or service that cares for children and adolescents.',
  sign_in_required:
    'Link Google to add family profiles. Your current consult stays available as a guest.',
  upstream_unknown: 'Something went wrong on our side. Please try again.',
};

export interface ClassifiedProfileManagementFailure {
  code: ProfileManagementFailureCode;
  severity: 'technical';
  message: string;
}

export function classifyProfileManagementFailure(
  _status: number | undefined,
  body: Record<string, unknown> | null | undefined,
): ClassifiedProfileManagementFailure {
  const rawCode = body && typeof body.code === 'string' ? body.code : '';
  const known: ProfileManagementFailureCode[] = [
    'profile_cap_reached',
    'self_undeletable',
    'adults_only',
    'sign_in_required',
  ];
  const code = (known.includes(rawCode as ProfileManagementFailureCode)
    ? rawCode
    : 'upstream_unknown') as ProfileManagementFailureCode;
  const fromBody = body && typeof body.error === 'string' ? body.error.trim() : '';
  return {
    code,
    severity: 'technical',
    message: fromBody || PROFILE_MANAGEMENT_COPY[code],
  };
}

// ---------------------------------------------------------------------------
// P4-06 — photo upload failures (technical only; never block send_message)
// ---------------------------------------------------------------------------

export type PhotoUploadFailureCode =
  | 'invalid_mime'
  | 'too_large'
  | 'invalid_payload'
  | 'decode_failed'
  | 'storage_failed'
  | 'sign_failed'
  | 'analysis_failed'
  | 'persistence_failed'
  | 'missing_consultation'
  | 'upstream_unknown';

const PHOTO_UPLOAD_COPY: Record<PhotoUploadFailureCode, string> = {
  invalid_mime: 'That file type is not supported. Please use a JPEG, PNG, or WebP image under 5 MB.',
  too_large: 'That image is too large. Please use a file under 5 MB.',
  invalid_payload: 'We could not read that photo. Please try another image.',
  decode_failed: 'We could not read that photo. Please try another image.',
  storage_failed: 'Something went wrong on our side while saving the photo. Your consultation can continue.',
  sign_failed: 'Something went wrong on our side while saving the photo. Your consultation can continue.',
  analysis_failed: 'We could not analyze that image just now. Your consultation can continue.',
  persistence_failed: 'We analyzed the image but could not save the analysis. Your consultation can continue.',
  missing_consultation: 'We could not attach that photo just now. Please try again.',
  upstream_unknown: 'Something went wrong on our side while saving the photo. Your consultation can continue.',
};

export interface ClassifiedPhotoUploadFailure {
  code: PhotoUploadFailureCode;
  severity: 'technical';
  message: string;
  /** Upload never blocks the consult continuum. */
  consultContinues: true;
}

export function classifyPhotoUploadFailure(
  status: number | undefined,
  body: Record<string, unknown> | null | undefined,
): ClassifiedPhotoUploadFailure {
  const rawCode = body && typeof body.code === 'string' ? body.code : '';
  const known = (Object.keys(PHOTO_UPLOAD_COPY) as PhotoUploadFailureCode[]).includes(
    rawCode as PhotoUploadFailureCode,
  )
    ? (rawCode as PhotoUploadFailureCode)
    : 'upstream_unknown';
  const serverMessage =
    body && typeof body.error === 'string' && body.error.trim() ? body.error.trim() : '';
  const message = serverMessage && !userCopyContainsForbiddenToken(serverMessage)
    ? serverMessage
    : PHOTO_UPLOAD_COPY[known];
  void status;
  return {
    code: known,
    severity: 'technical',
    message,
    consultContinues: true,
  };
}

export function copyForPhotoUploadCode(code: PhotoUploadFailureCode): string {
  return PHOTO_UPLOAD_COPY[code];
}

// ---------------------------------------------------------------------------
// P4-07 — lab upload failures (technical only; never block send_message)
// ---------------------------------------------------------------------------

export type LabUploadFailureCode =
  | 'invalid_mime'
  | 'too_large'
  | 'invalid_payload'
  | 'decode_failed'
  | 'storage_failed'
  | 'sign_failed'
  | 'missing_consultation'
  | 'missing_patient'
  | 'patient_mismatch'
  | 'patient_not_owned'
  | 'patient_inactive'
  | 'attribution_failed'
  | 'redaction_failed'
  | 'sign_in_required'
  | 'upstream_unknown';

const LAB_UPLOAD_COPY: Record<LabUploadFailureCode, string> = {
  invalid_mime:
    'That file type is not supported. Please use a PDF, JPEG, PNG, or WebP file under 10 MB.',
  too_large: 'That file is too large. Please use a file under 10 MB.',
  invalid_payload: 'We could not read that lab report. Please try another file.',
  decode_failed: 'We could not read that lab report. Please try another file.',
  storage_failed:
    'Something went wrong on our side while saving the lab report. Your consultation can continue.',
  sign_failed:
    'Something went wrong on our side while saving the lab report. Your consultation can continue.',
  missing_consultation: 'We could not attach that lab report just now. Please try again.',
  missing_patient: 'Choose which profile this lab report belongs to, then try again.',
  // P4-07 — a lab report may only be attached to the patient this consultation
  // is already for. Distinct copy matters: without it this code degrades to
  // `upstream_unknown`, which tells the patient something broke on our side
  // when in fact the upload was correctly refused and is theirs to resolve.
  patient_mismatch:
    'This lab report must belong to the same person this consultation is for. Start a consultation for that profile to attach it there.',
  patient_not_owned: 'That profile is not available for this lab upload. Choose another profile.',
  patient_inactive: 'That profile is no longer active. Choose another profile for this lab upload.',
  attribution_failed:
    'Something went wrong on our side while saving the lab report. Your consultation can continue.',
  redaction_failed:
    'We could not prepare that lab report for analysis. Your consultation can continue.',
  sign_in_required: 'Sign in to upload a lab report. Lab reports are linked to a saved profile.',
  upstream_unknown:
    'Something went wrong on our side while saving the lab report. Your consultation can continue.',
};

export interface ClassifiedLabUploadFailure {
  code: LabUploadFailureCode;
  severity: 'technical';
  message: string;
  consultContinues: true;
}

export function classifyLabUploadFailure(
  status: number | undefined,
  body: Record<string, unknown> | null | undefined,
): ClassifiedLabUploadFailure {
  const rawCode = body && typeof body.code === 'string' ? body.code : '';
  const known = (Object.keys(LAB_UPLOAD_COPY) as LabUploadFailureCode[]).includes(
    rawCode as LabUploadFailureCode,
  )
    ? (rawCode as LabUploadFailureCode)
    : 'upstream_unknown';
  const message =
    body && typeof body.error === 'string' && body.error.trim() && known !== 'upstream_unknown'
      ? body.error.trim()
      : LAB_UPLOAD_COPY[known];
  void status;
  return {
    code: known,
    severity: 'technical',
    message,
    consultContinues: true,
  };
}

export function copyForLabUploadCode(code: LabUploadFailureCode): string {
  return LAB_UPLOAD_COPY[code];
}

/**
 * P4-10 AC2 — patient chrome never echoes raw proxy/stack `Error.message`.
 * Allows catalog strings we already throw (taxonomy / profile / photo / lab).
 */
export function patientFacingTechnicalMessage(
  error: unknown,
  fallback: string,
  extraAllowlist: readonly string[] = [],
): string {
  if (!(error instanceof Error)) return fallback;
  const msg = error.message.trim();
  if (!msg) return fallback;
  if (userCopyContainsForbiddenToken(msg)) return fallback;

  const known = new Set<string>([
    ...Object.values(COPY).filter(Boolean),
    ...Object.values(PROFILE_MANAGEMENT_COPY),
    ...Object.values(PHOTO_UPLOAD_COPY),
    ...Object.values(LAB_UPLOAD_COPY),
    OFFLINE_QUEUED_COPY,
    CLAIM_REJECTION_SAFE_ERROR,
    ...extraAllowlist,
  ]);
  if (known.has(msg)) return msg;
  return fallback;
}
