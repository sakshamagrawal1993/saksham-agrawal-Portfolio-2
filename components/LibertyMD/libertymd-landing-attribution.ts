/**
 * P1-19 — LibertyMD landing attribution (forward-only).
 * P3-06 — may map allow-listed `/t/:slug` path → opaque keyword fields (never q=).
 *
 * Mints an opaque sessionStorage UUID, parses allow-listed URL params, stashes
 * across App→Chat (URL query is stripped on navigate), and builds proxy payloads.
 * Never writes clinical / landing tables from the client.
 */
import { opaqueFieldsFromTopicPath, topicSlugFromPathname } from './libertymd-keyword-content'

export const LANDING_SESSION_KEY_STORAGE = 'libertymd.anon_session_key'
export const LANDING_ATTRIBUTION_STASH = 'libertymd.landing_attribution'
export const LANDING_SESSION_ID_STASH = 'libertymd.landing_session_id'

export const LANDING_ATTR_MAX_LEN = 128
export const LANDING_ID_MAX_LEN = 64

export const ALLOWED_LANDING_QUERY_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'keyword_id',
  'matched_topic_slug',
  'topic',
] as const

export const FORBIDDEN_RAW_QUERY_PARAMS = ['q', 'query', 'search', 's', 'keyword', 'keywords'] as const

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const KEYWORD_ID_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9][A-Za-z0-9._:-]{0,63})$/i
const PATH_RE = /^\/[A-Za-z0-9/_-]{0,126}$/
const LOCALE_RE = /^[A-Za-z]{2}(?:-[A-Za-z]{2})?$/
const DEVICE_CLASSES = new Set(['mobile', 'desktop', 'tablet', 'unknown'])

export type LibertyMdDeviceClass = 'mobile' | 'desktop' | 'tablet' | 'unknown'

export interface LibertyMdLandingAttribution {
  anon_session_key?: string
  landing_session_id?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  keyword_id?: string
  matched_topic_slug?: string
  locale?: string
  device_class?: LibertyMdDeviceClass
  landing_path?: string
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

export function isLandingUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}

function sanitizeLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > LANDING_ATTR_MAX_LEN) return undefined
  if (!LABEL_RE.test(trimmed)) return undefined
  return trimmed
}

function sanitizeSlug(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().toLowerCase()
  if (!trimmed || trimmed.length > LANDING_ID_MAX_LEN) return undefined
  if (!SLUG_RE.test(trimmed)) return undefined
  return trimmed
}

function sanitizeKeywordId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > LANDING_ID_MAX_LEN) return undefined
  if (!KEYWORD_ID_RE.test(trimmed)) return undefined
  return trimmed
}

function sanitizePath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes('?') || trimmed.includes('#')) return undefined
  if (!PATH_RE.test(trimmed)) return undefined
  return trimmed.length <= LANDING_ATTR_MAX_LEN ? trimmed : trimmed.slice(0, LANDING_ATTR_MAX_LEN)
}

function sanitizeLocale(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return LOCALE_RE.test(trimmed) ? trimmed : undefined
}

function sanitizeDeviceClass(value: unknown): LibertyMdDeviceClass | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().toLowerCase()
  return DEVICE_CLASSES.has(trimmed) ? (trimmed as LibertyMdDeviceClass) : undefined
}

/**
 * Parse allow-listed query params only. Never maps `q` / `query` into keyword_id.
 */
export function parseLandingQueryParams(
  search: string | URLSearchParams,
): LibertyMdLandingAttribution {
  const params = typeof search === 'string'
    ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    : search

  const out: LibertyMdLandingAttribution = {}

  const utmSource = sanitizeLabel(params.get('utm_source'))
  if (utmSource) out.utm_source = utmSource
  const utmMedium = sanitizeLabel(params.get('utm_medium'))
  if (utmMedium) out.utm_medium = utmMedium
  const utmCampaign = sanitizeLabel(params.get('utm_campaign'))
  if (utmCampaign) out.utm_campaign = utmCampaign
  const utmContent = sanitizeLabel(params.get('utm_content'))
  if (utmContent) out.utm_content = utmContent

  const keywordId = sanitizeKeywordId(params.get('keyword_id'))
  if (keywordId) out.keyword_id = keywordId

  const topic = sanitizeSlug(params.get('matched_topic_slug') || params.get('topic'))
  if (topic) out.matched_topic_slug = topic

  // Explicit raw-query ban: reading these must never populate keyword fields.
  for (const banned of FORBIDDEN_RAW_QUERY_PARAMS) {
    if (params.has(banned)) {
      // dropped — never hash or copy into keyword_id
    }
  }

  return out
}

export function detectLibertyMdDeviceClass(): LibertyMdDeviceClass {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'unknown'
  }
  try {
    if (window.matchMedia('(max-width: 767px)').matches) return 'mobile'
    if (window.matchMedia('(max-width: 1023px)').matches) return 'tablet'
    return 'desktop'
  } catch {
    return 'unknown'
  }
}

/** Mint or read opaque LibertyMD session key (sessionStorage). */
export function getOrMintAnonSessionKey(): string {
  if (!isBrowser()) return crypto.randomUUID()
  try {
    const existing = window.sessionStorage.getItem(LANDING_SESSION_KEY_STORAGE)
    if (isLandingUuid(existing)) return existing
    const minted = crypto.randomUUID()
    window.sessionStorage.setItem(LANDING_SESSION_KEY_STORAGE, minted)
    return minted
  } catch {
    return crypto.randomUUID()
  }
}

export function stashLandingAttribution(fields: LibertyMdLandingAttribution): void {
  if (!isBrowser()) return
  try {
    const prev = readStashedLandingAttribution()
    const merged: LibertyMdLandingAttribution = { ...prev, ...fields }
    // Drop empties
    const cleaned: Record<string, string> = {}
    for (const [key, value] of Object.entries(merged)) {
      if (typeof value === 'string' && value) cleaned[key] = value
    }
    window.sessionStorage.setItem(LANDING_ATTRIBUTION_STASH, JSON.stringify(cleaned))
    if (isLandingUuid(merged.landing_session_id)) {
      window.sessionStorage.setItem(LANDING_SESSION_ID_STASH, merged.landing_session_id)
    }
  } catch {
    // best-effort
  }
}

export function readStashedLandingAttribution(): LibertyMdLandingAttribution {
  if (!isBrowser()) return {}
  try {
    const raw = window.sessionStorage.getItem(LANDING_ATTRIBUTION_STASH)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    return sanitizeLandingAttributionBag(parsed)
  } catch {
    return {}
  }
}

export function rememberLandingSessionId(id: string | null | undefined): void {
  if (!isBrowser() || !isLandingUuid(id)) return
  try {
    window.sessionStorage.setItem(LANDING_SESSION_ID_STASH, id)
    stashLandingAttribution({ landing_session_id: id })
  } catch {
    // best-effort
  }
}

export function readLandingSessionId(): string | undefined {
  if (!isBrowser()) return undefined
  try {
    const id = window.sessionStorage.getItem(LANDING_SESSION_ID_STASH)
    return isLandingUuid(id) ? id : undefined
  } catch {
    return undefined
  }
}

/** Re-sanitize a bag (stash / URL-derived) before forwarding to the proxy. */
export function sanitizeLandingAttributionBag(
  input: Record<string, unknown> | LibertyMdLandingAttribution | null | undefined,
): LibertyMdLandingAttribution {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const out: LibertyMdLandingAttribution = {}

  if (isLandingUuid(src.anon_session_key)) out.anon_session_key = String(src.anon_session_key).trim()
  if (isLandingUuid(src.landing_session_id)) out.landing_session_id = String(src.landing_session_id).trim()

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

  const topic = sanitizeSlug(src.matched_topic_slug ?? src.topic)
  if (topic) out.matched_topic_slug = topic

  const locale = sanitizeLocale(src.locale)
  if (locale) out.locale = locale
  const device = sanitizeDeviceClass(src.device_class)
  if (device) out.device_class = device
  const path = sanitizePath(src.landing_path)
  if (path) out.landing_path = path

  return out
}

export interface BuildLandingPayloadOptions {
  search?: string | URLSearchParams
  pathname?: string
  locale?: string
  deviceClass?: LibertyMdDeviceClass
  /** When true, merge URL params into stash (App landing). */
  captureUrl?: boolean
}

/**
 * Capture URL (optional) → stash → return proxy-safe attribution fields.
 * Always includes anon_session_key when mint succeeds.
 */
export function buildLandingAttributionPayload(
  options: BuildLandingPayloadOptions = {},
): LibertyMdLandingAttribution {
  const anon_session_key = getOrMintAnonSessionKey()
  const fromUrl = options.captureUrl && options.search != null
    ? parseLandingQueryParams(options.search)
    : {}
  const path = sanitizePath(options.pathname)
  const locale = sanitizeLocale(options.locale)
  const device = options.deviceClass
    ? sanitizeDeviceClass(options.deviceClass)
    : detectLibertyMdDeviceClass()

  // P3-06 — path slug → opaque catalog fields only when allow-listed (never q=).
  const fromPath = opaqueFieldsFromTopicPath(options.pathname)
  const onTopicPath = topicSlugFromPathname(options.pathname) != null

  const next: LibertyMdLandingAttribution = {
    anon_session_key,
    ...fromUrl,
    ...(fromPath ?? {}),
    ...(path ? { landing_path: path } : {}),
    ...(locale ? { locale } : {}),
    ...(device ? { device_class: device } : {}),
  }

  if (options.captureUrl) {
    stashLandingAttribution(next)
  }

  const stashed = readStashedLandingAttribution()
  const landingId = readLandingSessionId() || stashed.landing_session_id

  const merged: LibertyMdLandingAttribution = {
    ...stashed,
    ...next,
    ...(landingId ? { landing_session_id: landingId } : {}),
    anon_session_key,
  }

  // Unmatched /t/:slug — do not inherit prior stashed keyword onto this visit (AC4).
  if (
    onTopicPath &&
    !fromPath &&
    !fromUrl.keyword_id &&
    !fromUrl.matched_topic_slug
  ) {
    delete merged.keyword_id
    delete merged.matched_topic_slug
  }

  return sanitizeLandingAttributionBag(merged)
}
