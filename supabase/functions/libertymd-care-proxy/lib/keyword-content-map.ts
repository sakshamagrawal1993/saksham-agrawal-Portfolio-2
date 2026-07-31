/**
 * P3-06 — closed static EN keyword→topic catalog (exactly 10).
 * Persistence SoT: resolveKeywordAttribution allow-list coerces before upsert.
 * Never maps raw q=/query into keyword fields.
 */

export interface KeywordCluster {
  keyword_id: string
  matched_topic_slug: string
  /** Optional related complaint chip — visual highlight only; ≠ entry_type axis. */
  related_chip_id?: string
}

/** Locked Q1 catalog — exactly 10 EN clusters. */
export const KEYWORD_CONTENT_CATALOG: readonly KeywordCluster[] = [
  { keyword_id: 'kw_sore_throat', matched_topic_slug: 'sore-throat', related_chip_id: 'sore_throat' },
  { keyword_id: 'kw_cough', matched_topic_slug: 'cough', related_chip_id: 'cough' },
  { keyword_id: 'kw_fever', matched_topic_slug: 'fever', related_chip_id: 'fever' },
  { keyword_id: 'kw_headache', matched_topic_slug: 'headache', related_chip_id: 'headache' },
  { keyword_id: 'kw_stomach_pain', matched_topic_slug: 'stomach-pain', related_chip_id: 'stomach_pain' },
  { keyword_id: 'kw_rash', matched_topic_slug: 'rash', related_chip_id: 'rash' },
  { keyword_id: 'kw_sinus', matched_topic_slug: 'sinus-congestion' },
  { keyword_id: 'kw_back_pain', matched_topic_slug: 'back-pain' },
  { keyword_id: 'kw_allergy', matched_topic_slug: 'allergy-itch' },
  { keyword_id: 'kw_urinary', matched_topic_slug: 'urinary-discomfort' },
] as const

const BY_KEYWORD_ID = new Map(
  KEYWORD_CONTENT_CATALOG.map((c) => [c.keyword_id, c] as const),
)
const BY_SLUG = new Map(
  KEYWORD_CONTENT_CATALOG.map((c) => [c.matched_topic_slug, c] as const),
)

export const KEYWORD_IDS: ReadonlySet<string> = new Set(
  KEYWORD_CONTENT_CATALOG.map((c) => c.keyword_id),
)
export const KEYWORD_TOPIC_SLUGS: ReadonlySet<string> = new Set(
  KEYWORD_CONTENT_CATALOG.map((c) => c.matched_topic_slug),
)

const TOPIC_PATH_RE = /^\/liberty-md\/t\/([a-z0-9][a-z0-9_-]{0,63})$/i

export function topicSlugFromLandingPath(path: string | null | undefined): string | null {
  if (typeof path !== 'string' || !path) return null
  const match = path.trim().match(TOPIC_PATH_RE)
  return match ? match[1].toLowerCase() : null
}

export function findClusterByKeywordId(keywordId: string | null | undefined): KeywordCluster | null {
  if (typeof keywordId !== 'string' || !keywordId) return null
  return BY_KEYWORD_ID.get(keywordId) ?? null
}

export function findClusterByTopicSlug(slug: string | null | undefined): KeywordCluster | null {
  if (typeof slug !== 'string' || !slug) return null
  return BY_SLUG.get(slug.trim().toLowerCase()) ?? null
}

export interface KeywordAttributionFields {
  keyword_id?: string
  matched_topic_slug?: string
  landing_path?: string
}

/**
 * Allow-list coerce for persistence.
 * Matched → catalog pair (slug wins over client mismatch).
 * Unknown / half-pair → null both (omit fields).
 */
export function resolveKeywordAttribution<T extends KeywordAttributionFields>(fields: T): T {
  const byId = findClusterByKeywordId(fields.keyword_id)
  if (byId) {
    return {
      ...fields,
      keyword_id: byId.keyword_id,
      matched_topic_slug: byId.matched_topic_slug,
    }
  }

  const bySlug = findClusterByTopicSlug(fields.matched_topic_slug)
  if (bySlug) {
    return {
      ...fields,
      keyword_id: bySlug.keyword_id,
      matched_topic_slug: bySlug.matched_topic_slug,
    }
  }

  const pathSlug = topicSlugFromLandingPath(fields.landing_path)
  const byPath = findClusterByTopicSlug(pathSlug)
  if (byPath) {
    return {
      ...fields,
      keyword_id: byPath.keyword_id,
      matched_topic_slug: byPath.matched_topic_slug,
    }
  }

  const next = { ...fields }
  delete next.keyword_id
  delete next.matched_topic_slug
  return next
}
