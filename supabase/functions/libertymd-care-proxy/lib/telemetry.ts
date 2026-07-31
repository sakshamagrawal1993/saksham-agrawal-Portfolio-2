/**
 * Product + identity event emission.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 * Lane E owns this module.
 *
 * Two sinks, one emit point (CONTEXT.md §5): `libertymd_product_events` is the
 * auditable source of truth. After a successful Postgres insert, Mixpanel is
 * fire-and-forgotten via `lib/mixpanel.ts` (P1-16). Mixpanel loss never fails
 * the user request; Postgres remains SoT.
 *
 * No PHI in properties. Bucket numerics, never pass raw symptom text.
 *
 * P1-15: closed PRODUCT_EVENT_NAMES; unknown names throw before insert.
 * Postgres CHECK remains the durable guard.
 * P1-08: `diagnosis_attempted` may carry `served_from_cache` (bool) alongside
 * `was_speculative` — no new event name.
 * P1-09: `consult_abandoned.partial_outcome_shown` means eligible payload
 * attached on the abandon response (not intermediate_diagnoses / paint observer).
 */
import type { ProxyContext } from './context.ts'
import { LIBERTYMD_APP_VERSION } from './config.ts'
import { asClinicalLanguage } from './journey-locale.ts'
import {
  LIBERTYMD_EVENT_PREFIX,
  scheduleDetached,
  trackMixpanelEvent,
  type MixpanelPropertyValue,
} from './mixpanel.ts'
import type { JsonObject } from './types.ts'

/**
 * Locked P1-15 closed set — must match the migration CHECK exactly.
 * profile_selected / identity_linked / homepage_bootstrapped may be dormant.
 */
export const PRODUCT_EVENT_NAMES = [
  'homepage_bootstrapped',
  'consultation_started',
  'demographics_saved',
  'emergency_stopped',
  'clinical_review_needed',
  'report_gate_reached',
  'report_released_guest',
  'report_saved_google',
  'inference_failed',
  'question_served',
  'turn_completed',
  'guardrail_evaluated',
  'diagnosis_attempted',
  'report_ready',
  'consult_abandoned',
  'consent_recorded',
  'profile_selected',
  'identity_linked',
] as const

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number]

const PRODUCT_EVENT_NAME_SET: ReadonlySet<string> = new Set(PRODUCT_EVENT_NAMES)

export function isProductEventName(name: string): name is ProductEventName {
  return PRODUCT_EVENT_NAME_SET.has(name)
}

/** §1 confidence / evidence bands. */
export type ScoreBucket = '<50' | '50-64' | '65-79' | '80-89' | '90+'

/** §1 latency bands (ms). */
export type LatencyBucket = '<500' | '500-1500' | '1500-4000' | '4000-10000' | '10000+'

export function scoreBucket(score: number): ScoreBucket {
  if (!Number.isFinite(score) || score < 50) return '<50'
  if (score < 65) return '50-64'
  if (score < 80) return '65-79'
  if (score < 90) return '80-89'
  return '90+'
}

export function latencyBucket(ms: number): LatencyBucket {
  if (!Number.isFinite(ms) || ms < 500) return '<500'
  if (ms < 1500) return '500-1500'
  if (ms < 4000) return '1500-4000'
  if (ms < 10_000) return '4000-10000'
  return '10000+'
}

/** P0-08 AC5 — categorical failure modes for per-stage inference telemetry. */
export type InferenceErrorClass =
  | 'timeout'
  | 'http_error'
  | 'malformed_payload'
  | 'breaker_open'
  | 'unavailable'

export type InferenceStage = 'guardrail' | 'interview' | 'diagnosis'

/**
 * CARE name-map — Postgres suffix → Mixpanel display name.
 * Remaps + default `LibertyMd ` + same snake suffix. Central only.
 */
export function toMixpanelEventName(postgresName: string): string {
  switch (postgresName) {
    case 'consultation_started':
      return `${LIBERTYMD_EVENT_PREFIX}consult_started`
    case 'inference_failed':
      return `${LIBERTYMD_EVENT_PREFIX}turn_failed`
    case 'report_released_guest':
    case 'report_saved_google':
      return `${LIBERTYMD_EVENT_PREFIX}report_released`
    default:
      return `${LIBERTYMD_EVENT_PREFIX}${postgresName}`
  }
}

const MIXPANEL_FORBIDDEN_KEYS = new Set([
  'message',
  'symptom',
  'diagnosis',
  'email',
  'age',
  'sex',
  'sex_at_birth',
  'report',
  'report_data',
  'content',
  'chief_complaint',
  'name',
  'profile_count',
  // Never claim TTFT on server fan-out
  'latency_bucket_source',
  'latency_bucket',
])

/**
 * PHI-safe Mixpanel projection (supers + event props). Never blind-forward.
 * Omits `profile_count`. Injects `consultation_id` / `emit_origin` / report `method`.
 */
export function projectMixpanelProperties(
  postgresName: string,
  consultationId: string | null,
  properties: JsonObject,
  ctx: ProxyContext,
): Record<string, MixpanelPropertyValue> {
  // P3-07 Q3 — locale = clinical journey language only (never chrome-only es under closed gate).
  // Prefer explicit properties.locale, then ctx.clinicalLocale, else en (path-2 default).
  const clinicalLocale = asClinicalLanguage(properties.locale ?? ctx.clinicalLocale)

  const out: Record<string, MixpanelPropertyValue> = {
    app_surface: 'libertymd',
    surface: 'unknown',
    is_anonymous: ctx.isAnonymous,
    locale: clinicalLocale,
    device_class: 'unknown',
    app_version: LIBERTYMD_APP_VERSION,
    emit_origin: 'server',
  }

  if (consultationId) {
    out.consultation_id = consultationId
  }

  if (postgresName === 'report_released_guest') {
    out.method = 'guest'
  } else if (postgresName === 'report_saved_google') {
    out.method = 'google'
  }

  for (const [key, value] of Object.entries(properties)) {
    if (MIXPANEL_FORBIDDEN_KEYS.has(key)) continue
    // Already projected via asClinicalLanguage — do not blind-forward raw.
    if (key === 'locale') continue

    if (key === 'evidence_score') {
      if (typeof value === 'number') out.evidence_bucket = scoreBucket(value)
      continue
    }
    if (key === 'confidence_score') {
      if (typeof value === 'number') out.confidence_bucket = scoreBucket(value)
      continue
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
    }
  }

  return out
}

function scheduleMixpanelFanOut(
  ctx: ProxyContext,
  eventName: ProductEventName,
  consultationId: string | null,
  properties: JsonObject,
) {
  const displayName = toMixpanelEventName(eventName)
  const projected = projectMixpanelProperties(eventName, consultationId, properties, ctx)
  scheduleDetached(
    trackMixpanelEvent({
      eventName: displayName,
      distinctId: ctx.user.id,
      properties: projected,
    }),
  )
}

/**
 * Durable Postgres product event for a failed inference stage attempt.
 * PHI-free properties only — never response bodies or exception text.
 */
export async function emitInferenceFailed(
  ctx: ProxyContext,
  consultationId: string | null,
  properties: {
    stage: InferenceStage
    error_class: InferenceErrorClass
    outcome?: string
  },
) {
  await addProductEvent(ctx, 'inference_failed', consultationId, {
    stage: properties.stage,
    error_class: properties.error_class,
    ...(properties.outcome ? { outcome: properties.outcome } : {}),
  })
}

/**
 * Sole write path for libertymd_product_events.
 * Unknown event names throw before insert (P1-15 Q6 / AC2).
 * After successful Postgres insert, fire-and-forget Mixpanel (P1-16).
 */
export async function addProductEvent(
  ctx: ProxyContext,
  eventName: string,
  consultationId: string | null = null,
  properties: JsonObject = {},
) {
  if (!isProductEventName(eventName)) {
    throw new Error(`Unknown product event name: ${eventName}`)
  }
  const { error } = await ctx.db.from('libertymd_product_events').insert({
    user_id: ctx.user.id,
    consultation_id: consultationId,
    event_name: eventName,
    properties,
  })
  if (error) throw error
  // Postgres success ⇒ schedule Mixpanel. Soft-fail never reaches the caller.
  scheduleMixpanelFanOut(ctx, eventName, consultationId, properties)
}

/** Optional alias — same write path; P1-16 fans out beside this helper. */
export const emitEvent = addProductEvent

export async function addIdentityEvent(
  ctx: ProxyContext,
  eventType: string,
  consultationId: string | null = null,
  metadata: JsonObject = {},
) {
  const { error } = await ctx.db.from('libertymd_identity_events').insert({
    user_id: ctx.user.id,
    consultation_id: consultationId,
    event_type: eventType,
    provider: ctx.isAnonymous ? 'anonymous' : String(ctx.user.app_metadata?.provider || 'google'),
    metadata,
  })
  if (error) throw error
}
