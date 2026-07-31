/**
 * P1-19 — libertymd_landing_sessions write helpers.
 * P3-06 — keyword allow-list coerce via resolveKeywordAttribution before upsert.
 *
 * Proxy / service_role sole writer. Sanitizes allow-listed attribution only —
 * never persists raw search query / q= / free-text symptom text.
 */
import { resolveKeywordAttribution } from './keyword-content-map.ts'
import { addDays } from './utils.ts'
import type { ProxyContext } from './context.ts'
import type { JsonObject, LandingAttributionFields, RequestPayload } from './types.ts'

/** Max length for UTM label / path / locale strings. */
export const LANDING_ATTR_MAX_LEN = 128
/** Max length for keyword_id / matched_topic_slug. */
export const LANDING_ID_MAX_LEN = 64

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Slug / UUID-like / campaign-label charset (no spaces, no raw query prose). */
const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const KEYWORD_ID_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9][A-Za-z0-9._:-]{0,63})$/i
const PATH_RE = /^\/[A-Za-z0-9/_-]{0,126}$/
const LOCALE_RE = /^[A-Za-z]{2}(?:-[A-Za-z]{2})?$/
const DEVICE_CLASSES = new Set(['mobile', 'desktop', 'tablet', 'unknown'])

/** Params that must never be treated as keyword/campaign attribution. */
export const FORBIDDEN_RAW_QUERY_PARAMS = ['q', 'query', 'search', 's', 'keyword', 'keywords'] as const

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max)
}

function sanitizeLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > LANDING_ATTR_MAX_LEN) return null
  if (!LABEL_RE.test(trimmed)) return null
  return trimmed
}

function sanitizeSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (!trimmed || trimmed.length > LANDING_ID_MAX_LEN) return null
  if (!SLUG_RE.test(trimmed)) return null
  return trimmed
}

function sanitizeKeywordId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > LANDING_ID_MAX_LEN) return null
  if (!KEYWORD_ID_RE.test(trimmed)) return null
  return trimmed
}

function sanitizePath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes('?') || trimmed.includes('#')) return null
  if (!PATH_RE.test(trimmed)) return null
  return clip(trimmed, LANDING_ATTR_MAX_LEN)
}

function sanitizeLocale(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!LOCALE_RE.test(trimmed)) return null
  return trimmed
}

function sanitizeDeviceClass(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  return DEVICE_CLASSES.has(trimmed) ? trimmed : null
}

/**
 * Project payload → sanitized attribution fields.
 * Drops forbidden raw-query keys and any value that fails shape checks.
 * P3-06: catalog allow-list coerce — unknown keyword_id/slug → null both.
 */
export function sanitizeLandingAttribution(
  input: LandingAttributionFields | RequestPayload | JsonObject | null | undefined,
): LandingAttributionFields {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>

  // Explicitly ignore forbidden keys even if a caller stuffed them onto the bag.
  for (const key of FORBIDDEN_RAW_QUERY_PARAMS) {
    if (key in src) {
      // no-op drop — never map into keyword_id
    }
  }

  const topicAlias = src.matched_topic_slug ?? src.topic
  const out: LandingAttributionFields = {}

  const anon = typeof src.anon_session_key === 'string' ? src.anon_session_key.trim() : ''
  if (isUuid(anon)) out.anon_session_key = anon

  const landingId = typeof src.landing_session_id === 'string' ? src.landing_session_id.trim() : ''
  if (isUuid(landingId)) out.landing_session_id = landingId

  const utmSource = sanitizeLabel(src.utm_source)
  if (utmSource) out.utm_source = utmSource
  const utmMedium = sanitizeLabel(src.utm_medium)
  if (utmMedium) out.utm_medium = utmMedium
  const utmCampaign = sanitizeLabel(src.utm_campaign)
  if (utmCampaign) out.utm_campaign = utmCampaign
  const utmContent = sanitizeLabel(src.utm_content)
  if (utmContent) out.utm_content = utmContent

  const keywordId = sanitizeKeywordId(src.keyword_id)
  if (keywordId) out.keyword_id = keywordId

  const topicSlug = sanitizeSlug(topicAlias)
  if (topicSlug) out.matched_topic_slug = topicSlug

  const locale = sanitizeLocale(src.locale)
  if (locale) out.locale = locale
  const device = sanitizeDeviceClass(src.device_class)
  if (device) out.device_class = device
  const path = sanitizePath(src.landing_path)
  if (path) out.landing_path = path

  // P3-06 — persistence SoT: allow-list pair or null both (no half-pairs / unknown ids).
  return resolveKeywordAttribution(out)
}

function rowFromSanitized(fields: LandingAttributionFields): JsonObject {
  return {
    anon_session_key: fields.anon_session_key,
    utm_source: fields.utm_source ?? null,
    utm_medium: fields.utm_medium ?? null,
    utm_campaign: fields.utm_campaign ?? null,
    utm_content: fields.utm_content ?? null,
    keyword_id: fields.keyword_id ?? null,
    matched_topic_slug: fields.matched_topic_slug ?? null,
    locale: fields.locale ?? null,
    device_class: fields.device_class ?? null,
    landing_path: fields.landing_path ?? null,
    retention_expires_at: addDays(30),
  }
}

export interface LandingSessionRow {
  id: string
  anon_session_key: string
}

/**
 * Upsert by anon_session_key. Returns null when key missing (no invent).
 * Soft-fails on DB errors so consult start is never blocked by attribution.
 */
export async function upsertLandingSession(
  ctx: ProxyContext,
  input: LandingAttributionFields | RequestPayload | JsonObject | null | undefined,
): Promise<LandingSessionRow | null> {
  const fields = sanitizeLandingAttribution(input)
  if (!fields.anon_session_key) return null

  const row = rowFromSanitized(fields)
  try {
    const { data, error } = await ctx.db
      .from('libertymd_landing_sessions')
      .upsert(row, { onConflict: 'anon_session_key' })
      .select('id, anon_session_key')
      .single()
    if (error || !data) return null
    const id = String((data as { id?: string }).id || '')
    const key = String((data as { anon_session_key?: string }).anon_session_key || '')
    if (!isUuid(id) || !key) return null
    return { id, anon_session_key: key }
  } catch {
    return null
  }
}

/**
 * Resolve opaque id if the row exists. Invalid / unknown → null (never throw).
 */
export async function findLandingSessionById(
  ctx: ProxyContext,
  landingSessionId: string | null | undefined,
): Promise<LandingSessionRow | null> {
  if (!isUuid(landingSessionId)) return null
  try {
    const { data, error } = await ctx.db
      .from('libertymd_landing_sessions')
      .select('id, anon_session_key')
      .eq('id', landingSessionId)
      .maybeSingle()
    if (error || !data) return null
    const id = String((data as { id?: string }).id || '')
    const key = String((data as { anon_session_key?: string }).anon_session_key || '')
    if (!isUuid(id)) return null
    return { id, anon_session_key: key || '' }
  } catch {
    return null
  }
}

/**
 * Q4(C): prefer valid landing_session_id; else upsert by anon_session_key;
 * if neither → null (direct visit). Never throws.
 */
export async function resolveLandingSessionIdForStart(
  ctx: ProxyContext,
  payload: RequestPayload,
): Promise<string | null> {
  const fields = sanitizeLandingAttribution(payload)

  if (fields.landing_session_id) {
    const existing = await findLandingSessionById(ctx, fields.landing_session_id)
    if (existing) return existing.id
    // Invalid / unknown id → fall through to key upsert; do not 500.
  }

  if (fields.anon_session_key) {
    const upserted = await upsertLandingSession(ctx, fields)
    return upserted?.id ?? null
  }

  return null
}
