/**
 * All outbound n8n inference calls: transport, timeouts and response coercion.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 * Lane C owns the transport concerns (timeout budgets, retries, breaker — P0-11).
 *
 * n8n is stateless inference: JSON in, JSON out, never a database write. Every
 * fallback here returns a value the caller decides what to do with; persistence
 * decisions stay in the proxy.
 *
 * The guardrail call lives in lib/safety.ts because it is a safety decision,
 * not merely a transport concern.
 */
import {
  DIAGNOSIS_WEBHOOK,
  GUARDRAIL_WEBHOOK,
  INTERVIEW_WEBHOOK,
  DIFFERENTIAL_WEBHOOK,
  N8N_BREAKER,
  N8N_TIMEOUT_MS,
  WEBHOOK_SECRET,
} from './config.ts'
import { calculateMissingSlots, CORE_SLOTS, sanitizeSlotUpdates } from './slots.ts'
import { cleanMessage, limitConsultationMessage } from './utils.ts'
import type { ConsultationRow, DifferentialResult, InterviewResult, JsonObject } from './types.ts'
import type { ResponseRelevance } from '../clinical-policy.ts'

export function n8nHeaders(correlationId?: string) {
  return {
    'Content-Type': 'application/json',
    ...(WEBHOOK_SECRET ? { 'x-libertymd-secret': WEBHOOK_SECRET } : {}),
    // P0-07 D1 — joinable across client → proxy logs → n8n; never put PHI here.
    ...(correlationId ? { 'x-libertymd-correlation-id': correlationId } : {}),
  }
}

/** PHI-free call outcome for structured boundary logs (P0-07 AC3). */
export type N8nCallStatus =
  | 'ok'
  | `http_${number}`
  | 'timeout'
  | 'breaker_open'
  | 'network'

export type PostJsonOptions = {
  /** Turn / invocation UUID — logs + `x-libertymd-correlation-id` only (no body mutation). */
  correlationId?: string
  /**
   * Observational shadow LLM path. Logs `target: 'guardrail_shadow'` and
   * `shadow_llm: true`; still uses `stage: null` so it cannot trip the breaker.
   */
  shadowLlm?: boolean
}

/**
 * Stage label, `guardrail_shadow`, or URL pathname — never the secret, never a body.
 */
export function n8nCallTarget(
  url: string,
  stage: N8nStage | null,
  options?: Pick<PostJsonOptions, 'shadowLlm'>,
): string {
  if (options?.shadowLlm) return 'guardrail_shadow'
  if (stage) return stage
  try {
    return new URL(url).pathname
  } catch {
    return 'unknown'
  }
}

function classifyN8nCallStatus(error: unknown): N8nCallStatus {
  if (isN8nStageUnavailable(error)) return 'breaker_open'
  const name = error && typeof error === 'object' ? (error as { name?: unknown }).name : undefined
  if (name === 'AbortError' || name === 'TimeoutError') return 'timeout'
  const message = error instanceof Error ? error.message : String(error)
  const http = message.match(/Workflow HTTP (\d+)/)
  if (http) return `http_${Number(http[1])}`
  return 'network'
}

function payloadByteLength(body: unknown): number {
  try {
    return JSON.stringify(body).length
  } catch {
    return 0
  }
}

/** P0-07 AC3 — one PHI-free structured line per postJson attempt (incl. breaker reject). */
function logN8nCall(fields: {
  correlation_id: string | null
  target: string
  status: N8nCallStatus
  duration_ms: number
  payload_bytes: number
  shadow_llm?: boolean
}) {
  const line: Record<string, unknown> = {
    correlation_id: fields.correlation_id,
    target: fields.target,
    status: fields.status,
    duration_ms: fields.duration_ms,
    payload_bytes: fields.payload_bytes,
  }
  if (fields.shadow_llm) line.shadow_llm = true
  console.log('LibertyMD n8n call', line)
}

// ---------------------------------------------------------------------------
// P0-11 · circuit breaker
// ---------------------------------------------------------------------------

/**
 * ## §breaker — what it is, and the one thing it must never do
 *
 * Three independent breakers, one per inference stage. A stage that has failed
 * `N8N_BREAKER.failureThreshold` times inside `rollingWindowMs` with no
 * intervening success is treated as **down**: further calls are rejected in
 * ~0 ms with `N8nStageUnavailableError` instead of each one spending its full
 * timeout budget and failing separately. That is what turns an outage into one
 * calm holding state (P0-11 AC3) rather than one alarming failure per turn.
 *
 * States: `closed` → `open` (on trip) → `half_open` (on cooldown expiry) →
 * `closed` (probe succeeded) or `open` again (probe failed). Exactly one probe
 * is admitted per half-open window; concurrent callers are rejected as open, so
 * a recovering n8n is never stampeded.
 *
 * ### Safety: an open guardrail breaker is fail-cautious, never fail-open
 *
 * This lives in `postJson`, which is **below** the safety decision. The order
 * on every screened turn is:
 *
 *   1. `runGuardrail` runs `detectDeterministicEmergency` (clinical-policy.ts)
 *      **first, in-process, with no transport at all**. A textbook ACS message
 *      still force-ends in 0 ms with every breaker wide open. This is P0-14's
 *      whole point and P0-11's fail-safe depends on it (P0-14 AC2).
 *   2. Only if the deterministic screen is silent does the n8n leg run. With
 *      the breaker open that leg throws immediately, `runGuardrail`'s existing
 *      `catch` fires, and the verdict is `high_risk_continue` /
 *      `error_fail_cautious` — a *caution*, i.e. the safety-asymmetric choice.
 *
 * So the breaker changes *how fast* the guardrail's n8n leg fails, and nothing
 * about what a failure means. There is deliberately no code path in which an
 * open breaker yields `status: 'pass'`, `risk_level: 'low'`, or
 * `force_end: false` for a message the deterministic screen would have caught.
 * `tests/libertymd/n8n-breaker.test.ts` asserts exactly that, because it is the
 * assertion most likely to be broken later by someone optimising latency.
 *
 * ### Scope honesty
 *
 * State is per-isolate module state. With `k` warm isolates the effective trip
 * cost is up to `k × failureThreshold` failures, and a cold isolate starts
 * closed. That is the correct trade for an edge function with no shared cache:
 * the breaker's job is to stop *this* isolate from hammering a dead stage, not
 * to be a globally consistent distributed breaker.
 */
export type N8nStage = 'guardrail' | 'interview' | 'diagnosis' | 'differential'

export type N8nBreakerState = 'closed' | 'open' | 'half_open'

/**
 * Thrown instead of attempting transport while a stage's breaker is open.
 *
 * The message is component-free on purpose: `errorResponse` echoes thrown
 * messages to the client, and P0-12 AC2 forbids user-facing copy that names an
 * internal component. The stage lives in a property for logs, not in the text.
 */
export class N8nStageUnavailableError extends Error {
  readonly stage: N8nStage
  readonly retryAfterMs: number
  constructor(stage: N8nStage, retryAfterMs: number) {
    super('Care inference is temporarily unavailable')
    this.name = 'N8nStageUnavailableError'
    this.stage = stage
    this.retryAfterMs = retryAfterMs
  }
}

export const isN8nStageUnavailable = (error: unknown): error is N8nStageUnavailableError =>
  error instanceof N8nStageUnavailableError

interface BreakerRecord {
  state: N8nBreakerState
  /** Timestamps of failures still inside the rolling window. */
  failures: number[]
  openedAt: number
  /** True while the single half-open probe is in flight. */
  probeInFlight: boolean
  trips: number
}

const BREAKERS: Record<N8nStage, BreakerRecord> = {
  guardrail: { state: 'closed', failures: [], openedAt: 0, probeInFlight: false, trips: 0 },
  interview: { state: 'closed', failures: [], openedAt: 0, probeInFlight: false, trips: 0 },
  diagnosis: { state: 'closed', failures: [], openedAt: 0, probeInFlight: false, trips: 0 },
  // P5-DDX — its own breaker so a differential outage cannot open the guardrail
  // or interview stages. The differential is optional; those two are not.
  differential: { state: 'closed', failures: [], openedAt: 0, probeInFlight: false, trips: 0 },
}

/** Stage of a webhook URL. Unknown URLs are not breaker-managed (fail open). */
export function n8nStageForUrl(url: string): N8nStage | null {
  if (url === GUARDRAIL_WEBHOOK) return 'guardrail'
  if (url === INTERVIEW_WEBHOOK) return 'interview'
  if (url === DIAGNOSIS_WEBHOOK) return 'diagnosis'
  if (url === DIFFERENTIAL_WEBHOOK) return 'differential'
  return null
}

/**
 * P0-11 AC4 — breaker state is observable. No PHI: stage names, counts and
 * durations only, never message content.
 */
export function n8nBreakerSnapshot() {
  const now = Date.now()
  return (Object.keys(BREAKERS) as N8nStage[]).map((stage) => {
    const record = BREAKERS[stage]
    return {
      stage,
      state: record.state,
      recent_failures: record.failures.length,
      failure_threshold: N8N_BREAKER.failureThreshold,
      trips: record.trips,
      retry_after_ms: record.state === 'open'
        ? Math.max(0, N8N_BREAKER.cooldownMs - (now - record.openedAt))
        : 0,
    }
  })
}

/** Whether a stage would reject right now. Read-only — does not admit a probe. */
export function isN8nStageAvailable(stage: N8nStage): boolean {
  const record = BREAKERS[stage]
  if (record.state === 'closed') return true
  if (record.state === 'half_open') return !record.probeInFlight
  return Date.now() - record.openedAt >= N8N_BREAKER.cooldownMs
}

/** Test seam. Never called from request paths. */
export function resetN8nBreakers() {
  for (const stage of Object.keys(BREAKERS) as N8nStage[]) {
    BREAKERS[stage] = { state: 'closed', failures: [], openedAt: 0, probeInFlight: false, trips: 0 }
  }
}

function openBreaker(stage: N8nStage, record: BreakerRecord) {
  record.state = 'open'
  record.openedAt = Date.now()
  record.probeInFlight = false
  record.trips += 1
  console.warn('LibertyMD n8n breaker opened', {
    stage,
    failures: record.failures.length,
    threshold: N8N_BREAKER.failureThreshold,
    cooldown_ms: N8N_BREAKER.cooldownMs,
    trips: record.trips,
  })
}

/**
 * Admission control. Returns whether this call is the half-open probe, or
 * throws `N8nStageUnavailableError` when the stage is down.
 */
function admit(stage: N8nStage): { isProbe: boolean } {
  const record = BREAKERS[stage]
  const now = Date.now()

  if (record.state === 'open') {
    const elapsed = now - record.openedAt
    if (elapsed < N8N_BREAKER.cooldownMs) {
      const retryAfterMs = N8N_BREAKER.cooldownMs - elapsed
      console.warn('LibertyMD n8n call rejected by open breaker', { stage, retry_after_ms: retryAfterMs })
      throw new N8nStageUnavailableError(stage, retryAfterMs)
    }
    record.state = 'half_open'
    record.probeInFlight = false
    console.log('LibertyMD n8n breaker half_open', { stage, cooldown_ms: N8N_BREAKER.cooldownMs })
  }

  if (record.state === 'half_open') {
    if (record.probeInFlight) {
      // One probe at a time: a recovering stage must not be stampeded.
      console.warn('LibertyMD n8n call rejected while half_open probe is in flight', { stage })
      throw new N8nStageUnavailableError(stage, N8N_BREAKER.cooldownMs)
    }
    record.probeInFlight = true
    console.log('LibertyMD n8n breaker probe issued', { stage })
    return { isProbe: true }
  }

  return { isProbe: false }
}

function recordSuccess(stage: N8nStage) {
  const record = BREAKERS[stage]
  const wasRecovering = record.state !== 'closed'
  record.failures = []
  record.probeInFlight = false
  record.state = 'closed'
  record.openedAt = 0
  if (wasRecovering) {
    // P0-11 AC4 — auto-recovery on a successful probe.
    console.log('LibertyMD n8n breaker closed', { stage, trips: record.trips })
  }
}

function recordFailure(stage: N8nStage, isProbe: boolean) {
  const record = BREAKERS[stage]
  const now = Date.now()
  if (isProbe) {
    // A failed probe means the stage is still down — straight back to open with
    // a fresh cooldown, no partial credit.
    record.failures = [now]
    console.warn('LibertyMD n8n breaker probe failed', { stage })
    openBreaker(stage, record)
    return
  }
  record.failures = record.failures.filter((at) => now - at < N8N_BREAKER.rollingWindowMs)
  record.failures.push(now)
  if (record.failures.length >= N8N_BREAKER.failureThreshold) openBreaker(stage, record)
}

/**
 * P0-08 AC3 — HTTP 200 was recorded as breaker success in `postJson` before the
 * stage runner validated shape. An unusable body must revoke that optimism so
 * malformed 200s count toward the breaker like transport failures.
 */
export function revokeStageSuccessAsFailure(stage: N8nStage) {
  recordFailure(stage, false)
}

/**
 * POST to an n8n workflow under a timeout budget and the stage breaker.
 *
 * `stage` is normally inferred from the URL; it stays an explicit parameter so
 * the breaker can be exercised against a stub URL in tests.
 *
 * P0-07 AC3/D1: every attempt (including breaker reject) emits a PHI-free
 * structured log; optional `correlationId` is sent as `x-libertymd-correlation-id`
 * only — never mutated into the n8n JSON body.
 */
export async function postJson(
  url: string,
  body: unknown,
  timeoutMs: number,
  stage: N8nStage | null = n8nStageForUrl(url),
  options: PostJsonOptions = {},
) {
  const correlationId = options.correlationId?.trim() || null
  const target = n8nCallTarget(url, stage, options)
  const payloadBytes = payloadByteLength(body)
  const startedAt = Date.now()
  const emit = (status: N8nCallStatus) => {
    logN8nCall({
      correlation_id: correlationId,
      target,
      status,
      duration_ms: Math.max(0, Date.now() - startedAt),
      payload_bytes: payloadBytes,
      ...(options.shadowLlm ? { shadow_llm: true } : {}),
    })
  }

  let gate: { isProbe: boolean }
  try {
    gate = stage ? admit(stage) : { isProbe: false }
  } catch (error) {
    // Breaker short-circuit — still log before rethrow (AC3 includes reject).
    emit(classifyN8nCallStatus(error))
    throw error
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: n8nHeaders(correlationId || undefined),
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Workflow HTTP ${response.status}`)
    const parsed = await response.json()
    if (stage) recordSuccess(stage)
    emit('ok')
    return parsed
  } catch (error) {
    if (stage) recordFailure(stage, gate.isProbe)
    emit(classifyN8nCallStatus(error))
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export function normalizeObject(raw: unknown): JsonObject {
  if (Array.isArray(raw)) return normalizeObject(raw[0])
  if (!raw || typeof raw !== 'object') return {}
  const record = raw as JsonObject
  if (record.output && typeof record.output === 'object') return normalizeObject(record.output)
  return record
}

// ---------------------------------------------------------------------------
// P0-13 AC2 · no inference after an emergency, enforced rather than instructed
// ---------------------------------------------------------------------------

/**
 * The only consultation statuses in which an Interview or Diagnosis call may be
 * issued at all.
 *
 * `emergency_stopped` is the AC2 case and the reason this is a closed allow-list
 * rather than a deny-list: a status added later is refused inference until
 * someone deliberately adds it here. Terminal statuses (`completed`,
 * `report_pending_auth`, `clinical_review_needed`, `abandoned`) are refused for
 * the same reason — a finished consult has nothing left to infer.
 */
export const INFERENCE_ALLOWED_STATUSES = ['awaiting_demographics', 'interviewing', 'high_risk'] as const

/**
 * Thrown when an inference call is attempted from a status that forbids it.
 * Component-free message, for the same reason as `N8nStageUnavailableError`.
 */
export class PostEmergencyInferenceError extends Error {
  readonly stage: N8nStage
  readonly status: string
  constructor(stage: N8nStage, status: string) {
    super('This consultation can no longer be advanced')
    this.name = 'PostEmergencyInferenceError'
    this.stage = stage
    this.status = status
  }
}

/**
 * P0-13 AC2. Rejected **and logged** (DoD+: warn level, with enough context to
 * identify the caller — consultation id and status are enough; message content
 * is deliberately absent because it is PHI).
 *
 * `status` is optional only because `save_demographics` (outside this ticket's
 * manifest) does not yet pass it; that action already gates on
 * `awaiting_demographics` at its entry, so no reachable path is uncovered
 * today. When Lane F next touches that file it should pass the status through.
 */
export function assertInferenceAllowed(stage: N8nStage, status?: string | null, consultationId?: string | null) {
  if (!status) return
  if ((INFERENCE_ALLOWED_STATUSES as readonly string[]).includes(status)) return
  console.warn('LibertyMD invariant violation: inference attempted in a non-inferable status', {
    invariant: 'no_inference_after_emergency',
    stage,
    status,
    consultation_id: consultationId || null,
  })
  throw new PostEmergencyInferenceError(stage, status)
}

/**
 * P0-08 AC3 / Q2 — minimal shape for a trusted interview screen.
 * Usable when `ready_for_report` is set, or a non-empty question string exists.
 * Empty `{}` and bodies with neither signal are unusable (holding, not clinical).
 */
export function isUsableInterviewPayload(raw: JsonObject): boolean {
  if (Boolean(raw.ready_for_report)) return true
  const question = String(raw.next_question || raw.question || '').trim()
  return question.length > 0
}

/** Holding-path sources consumed by `send_message` (never clinical clothing). */
export function isInterviewHoldingSource(source: string): boolean {
  return source === 'breaker_open' || source === 'unavailable'
}

function interviewHoldingResult(
  missingSlots: string[],
  source: 'breaker_open' | 'unavailable',
): InterviewResult {
  // Placeholders exist only so the type is satisfied; send_message short-circuits
  // on holding sources and must never surface this copy to the user.
  return {
    next_question: '',
    options: [],
    ready_for_report: false,
    target_slot: 'none',
    slot_updates: {},
    missing_slots: missingSlots,
    input_relevance: 'unclear',
    input_relevance_reason: 'Interview workflow unavailable',
    // A holding turn produced no clinical reasoning, so the differential is
    // empty and confidence is 0 — never carry a stale figure across an outage.
    working_differential: [],
    diagnostic_confidence: 0,
    stop_reason: null,
    source,
  }
}

export function classifyInterviewTransportError(error: unknown): 'timeout' | 'http_error' | 'breaker_open' | 'unavailable' {
  if (isN8nStageUnavailable(error)) return 'breaker_open'
  const name = error && typeof error === 'object' ? (error as { name?: unknown }).name : undefined
  if (name === 'AbortError' || name === 'TimeoutError') return 'timeout'
  const message = error instanceof Error ? error.message : String(error)
  if (/Workflow HTTP \d+/.test(message)) return 'http_error'
  return 'unavailable'
}

export async function runInterview(
  history: unknown[],
  patient: JsonObject,
  slots: JsonObject,
  missingSlots: string[],
  targetSlot: string | null,
  turnCount: number,
  status?: string | null,
  consultationId?: string | null,
  correlationId?: string | null,
  /** P3-07 — clinical journey language (`en` | `es`). */
  language?: string | null,
  /**
   * P5-DDX — latest mini-differential, when fresh. Steers WHAT is asked:
   * outstanding red flags first, then the discriminator. Null is normal (no
   * differential yet, or stale) and the agent falls back to missing_slots.
   */
  differentialHint?: JsonObject | null,
): Promise<InterviewResult> {
  // Thrown, not swallowed: a post-emergency interview attempt is a caller bug,
  // and returning a fallback question would hide it behind a plausible reply.
  assertInferenceAllowed('interview', status, consultationId)
  const clinicalLanguage = String(language || 'en').trim().toLowerCase() === 'es' ? 'es' : 'en'
  try {
    const raw = normalizeObject(await postJson(INTERVIEW_WEBHOOK, {
      history,
      patient,
      filled_slots: slots,
      missing_slots: missingSlots,
      target_slot: targetSlot,
      turn_count: turnCount,
      language: clinicalLanguage,
      locale: clinicalLanguage,
      ...(differentialHint ? { differential_hint: differentialHint } : {}),
    }, N8N_TIMEOUT_MS.interview, undefined, {
      correlationId: correlationId || undefined,
    }))
    // P0-08 AC3: unusable HTTP 200 → holding, never fabricate an onset questionnaire.
    if (!isUsableInterviewPayload(raw)) {
      revokeStageSuccessAsFailure('interview')
      return interviewHoldingResult(missingSlots, 'unavailable')
    }
    const ready = Boolean(raw.ready_for_report)
    const question = limitConsultationMessage(raw.next_question || raw.question)
    const options = Array.isArray(raw.options) ? raw.options.map(String).filter(Boolean).slice(0, 4) : []
    const relevance = ['clinical', 'unclear', 'off_topic'].includes(String(raw.input_relevance))
      ? String(raw.input_relevance) as ResponseRelevance
      : 'clinical'
    return {
      // Partial but schema-shaped responses may keep empty-field defaults under n8n.
      next_question: question || (ready ? '' : 'Could you tell me what has changed since the symptom began?'),
      options: ready ? [] : options,
      ready_for_report: ready,
      target_slot: String(raw.target_slot || 'none'),
      slot_updates: sanitizeSlotUpdates(raw.slot_updates),
      missing_slots: Array.isArray(raw.missing_slots) ? raw.missing_slots.map(String).filter((slot) => CORE_SLOTS.includes(slot)) : [],
      input_relevance: relevance,
      input_relevance_reason: cleanMessage(raw.input_relevance_reason),
      // P5-DDX — the interview no longer computes a differential; the
      // mini-differential workflow owns it. These stay on the type as empty
      // defaults so the holding path and older bundles keep type-checking.
      working_differential: [],
      diagnostic_confidence: 0,
      stop_reason: null,
      source: 'n8n',
    }
  } catch (error) {
    if (error instanceof PostEmergencyInferenceError) throw error
    console.error('LibertyMD interview unavailable', error)
    // Transport / breaker → holding path (P0-08 Q2). Never invent a clinical question.
    const breakerOpen = isN8nStageUnavailable(error)
    return interviewHoldingResult(missingSlots, breakerOpen ? 'breaker_open' : 'unavailable')
  }
}

export function parseConfidence(value: unknown) {
  if (typeof value === 'number') return Math.max(0, Math.min(100, value))
  const match = String(value || '').match(/(\d{1,3}(?:\.\d+)?)/)
  return match ? Math.max(0, Math.min(100, Number(match[1]))) : 0
}

export function parseDiagnosis(rawValue: unknown) {
  const raw = normalizeObject(rawValue)
  const differentials = Array.isArray(raw.differential_diagnosis)
    ? raw.differential_diagnosis
    : Array.isArray(raw.diagnoses)
      ? raw.diagnoses
      : []
  const top = differentials[0] && typeof differentials[0] === 'object' ? differentials[0] as JsonObject : {}
  const confidence = parseConfidence(raw.confidence_score || top.confidence || top.confidence_score)
  const workflowValid = typeof raw.valid_report === 'boolean' ? raw.valid_report : true
  return {
    raw,
    differentials,
    confidence,
    valid: workflowValid && differentials.length > 0 && confidence > 0 && raw.error !== 'Failed to parse differential JSON',
  }
}

export function classifyDiagnosisTransportError(error: unknown): 'timeout' | 'http_error' | 'breaker_open' | 'unavailable' {
  if (isN8nStageUnavailable(error)) return 'breaker_open'
  const name = error && typeof error === 'object' ? (error as { name?: unknown }).name : undefined
  if (name === 'AbortError' || name === 'TimeoutError') return 'timeout'
  const message = error instanceof Error ? error.message : String(error)
  if (/Workflow HTTP \d+/.test(message)) return 'http_error'
  return 'unavailable'
}

export type RunDiagnosisOptions = {
  /**
   * P1-08 — detached pre-warm. Uses `postJson(..., stage: null)` so hangs /
   * failures cannot open the acted-upon diagnosis breaker or trip holding UX.
   * Callers must not emit `inference_failed` for speculative soft-fails.
   */
  speculative?: boolean
}

export async function runDiagnosis(
  history: unknown[],
  patient: JsonObject,
  consultation: ConsultationRow,
  slots: JsonObject,
  correlationId?: string | null,
  options: RunDiagnosisOptions = {},
) {
  // P0-13 AC2. The consultation row is already in hand here, so this needs no
  // signature change and covers every diagnosis call site by construction.
  assertInferenceAllowed('diagnosis', consultation.status, consultation.id)
  const speculative = Boolean(options.speculative)
  const clinicalLanguage = String(consultation.language || 'en').trim().toLowerCase() === 'es' ? 'es' : 'en'
  try {
    // Speculative: stage null — isolate from N8N_BREAKER.diagnosis (S1).
    const stage = speculative ? null : undefined
    const parsed = parseDiagnosis(await postJson(DIAGNOSIS_WEBHOOK, {
      history,
      patient,
      filled_slots: slots,
      missing_slots: calculateMissingSlots(slots),
      intermediate_diagnoses: consultation.intermediate_diagnoses || [],
      turn_count: consultation.turn_count,
      language: clinicalLanguage,
      locale: clinicalLanguage,
    }, N8N_TIMEOUT_MS.diagnosis, stage, {
      correlationId: correlationId || undefined,
    }))
    // Unusable diagnosis body: revoke breaker success; callers emit telemetry.
    // Speculative never revokes / trips acted-upon breaker.
    if (!parsed.valid) {
      if (!speculative) revokeStageSuccessAsFailure('diagnosis')
      return { ...parsed, unavailable: false, failure: 'malformed_payload' as const }
    }
    return { ...parsed, unavailable: false, failure: null }
  } catch (error) {
    if (error instanceof PostEmergencyInferenceError) throw error
    if (speculative) {
      console.warn('LibertyMD speculative diagnosis soft-fail', {
        failure: classifyDiagnosisTransportError(error),
      })
    } else {
      console.error('LibertyMD diagnosis unavailable', error)
    }
    // `unavailable` separates "the model withheld a report" from "we never got
    // to ask". Without it, an n8n outage at the turn cap would permanently
    // dead-end a consult as `clinical_review_needed` on purely technical
    // grounds — a failure wearing clinical clothing.
    return {
      raw: {} as JsonObject,
      differentials: [] as unknown[],
      confidence: 0,
      valid: false,
      unavailable: true,
      failure: classifyDiagnosisTransportError(error),
    }
  }
}

export type DiagnosisResult = Awaited<ReturnType<typeof runDiagnosis>>

/**
 * P5-DDX — the async mini-differential.
 *
 * Called detached from the turn, so nothing here may throw into the request
 * path and nothing here may block a response. Failure returns `null` and the
 * caller leaves the previously stored differential in place: a missed run costs
 * one turn of freshness, never a turn of the patient's time.
 *
 * `computed_at_turn` is taken from the workflow's echo of the request, not from
 * anything the model wrote, because the proxy's ordering guard depends on it.
 */
export async function runDifferential(
  history: unknown[],
  patient: JsonObject,
  slots: JsonObject,
  turnCount: number,
  language: string,
  priorDifferential: JsonObject | null,
  correlationId?: string | null,
): Promise<DifferentialResult | null> {
  try {
    const raw = normalizeObject(await postJson(
      DIFFERENTIAL_WEBHOOK,
      {
        history,
        patient,
        filled_slots: slots,
        turn_count: turnCount,
        language,
        prior_differential: priorDifferential,
      },
      N8N_TIMEOUT_MS.differential,
      'differential',
      { correlationId: correlationId || undefined },
    ))

    const entries = Array.isArray(raw.entries)
      ? (raw.entries as unknown[])
        .map((item) => {
          const row = (item || {}) as Record<string, unknown>
          return {
            condition: cleanMessage(row.condition),
            confidence: parseConfidence(row.confidence),
            supporting: Array.isArray(row.supporting) ? row.supporting.map(String).slice(0, 5) : [],
            refuting: Array.isArray(row.refuting) ? row.refuting.map(String).slice(0, 5) : [],
            discriminator: cleanMessage(row.discriminator),
          }
        })
        .filter((entry) => entry.condition)
        .slice(0, 3)
      : []

    if (entries.length === 0) return null

    // Belt to the workflow's braces: the stop rule reads top_confidence, so it
    // is re-clamped here rather than trusted across a network boundary.
    const topConfidence = Math.min(parseConfidence(raw.top_confidence), entries[0].confidence)

    return {
      entries,
      top_confidence: topConfidence,
      discriminator: cleanMessage(raw.discriminator) || entries[0].discriminator,
      red_flags_outstanding: Array.isArray(raw.red_flags_outstanding)
        ? raw.red_flags_outstanding.map(String).map((flag) => flag.trim()).filter(Boolean).slice(0, 6)
        : [],
      delta_reason: cleanMessage(raw.delta_reason),
      computed_at_turn: Number.isInteger(Number(raw.computed_at_turn))
        ? Number(raw.computed_at_turn)
        : turnCount,
    }
  } catch (error) {
    // Soft by contract. A differential outage must never surface to the patient
    // and must never fail the turn that scheduled it.
    console.warn('LibertyMD differential unavailable', {
      class: error instanceof Error ? error.name : 'unknown',
      stage: 'differential',
    })
    return null
  }
}
