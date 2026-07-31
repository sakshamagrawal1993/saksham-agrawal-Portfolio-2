/**
 * P3-06 — client mirror of the closed EN keyword catalog (exactly 10).
 * Allow-list lookup for chrome only — never free-text / q= inference.
 * Persistence coerce lives on the proxy (keyword-content-map.ts).
 */

export interface LibertyMdKeywordCluster {
  keyword_id: string
  matched_topic_slug: string
  /** i18n key prefix: keywordLanding.<slug>.title / .subtitle */
  framingKeySlug: string
  /** Visual chip highlight only — does not set entry_type. */
  related_chip_id?: string
}

/** Locked Q1 catalog — must stay set-equal with server KEYWORD_CONTENT_CATALOG. */
export const LIBERTYMD_KEYWORD_CONTENT_CATALOG: readonly LibertyMdKeywordCluster[] = [
  {
    keyword_id: 'kw_sore_throat',
    matched_topic_slug: 'sore-throat',
    framingKeySlug: 'sore-throat',
    related_chip_id: 'sore_throat',
  },
  {
    keyword_id: 'kw_cough',
    matched_topic_slug: 'cough',
    framingKeySlug: 'cough',
    related_chip_id: 'cough',
  },
  {
    keyword_id: 'kw_fever',
    matched_topic_slug: 'fever',
    framingKeySlug: 'fever',
    related_chip_id: 'fever',
  },
  {
    keyword_id: 'kw_headache',
    matched_topic_slug: 'headache',
    framingKeySlug: 'headache',
    related_chip_id: 'headache',
  },
  {
    keyword_id: 'kw_stomach_pain',
    matched_topic_slug: 'stomach-pain',
    framingKeySlug: 'stomach-pain',
    related_chip_id: 'stomach_pain',
  },
  {
    keyword_id: 'kw_rash',
    matched_topic_slug: 'rash',
    framingKeySlug: 'rash',
    related_chip_id: 'rash',
  },
  {
    keyword_id: 'kw_sinus',
    matched_topic_slug: 'sinus-congestion',
    framingKeySlug: 'sinus-congestion',
  },
  {
    keyword_id: 'kw_back_pain',
    matched_topic_slug: 'back-pain',
    framingKeySlug: 'back-pain',
  },
  {
    keyword_id: 'kw_allergy',
    matched_topic_slug: 'allergy-itch',
    framingKeySlug: 'allergy-itch',
  },
  {
    keyword_id: 'kw_urinary',
    matched_topic_slug: 'urinary-discomfort',
    framingKeySlug: 'urinary-discomfort',
  },
] as const

const BY_KEYWORD_ID = new Map(
  LIBERTYMD_KEYWORD_CONTENT_CATALOG.map((c) => [c.keyword_id, c] as const),
)
const BY_SLUG = new Map(
  LIBERTYMD_KEYWORD_CONTENT_CATALOG.map((c) => [c.matched_topic_slug, c] as const),
)

export const LIBERTYMD_KEYWORD_IDS: ReadonlySet<string> = new Set(
  LIBERTYMD_KEYWORD_CONTENT_CATALOG.map((c) => c.keyword_id),
)
export const LIBERTYMD_KEYWORD_TOPIC_SLUGS: ReadonlySet<string> = new Set(
  LIBERTYMD_KEYWORD_CONTENT_CATALOG.map((c) => c.matched_topic_slug),
)

const TOPIC_PATH_RE = /^\/liberty-md\/t\/([a-z0-9][a-z0-9_-]{0,63})$/i

export function topicSlugFromPathname(pathname: string | null | undefined): string | null {
  if (typeof pathname !== 'string' || !pathname) return null
  const match = pathname.trim().match(TOPIC_PATH_RE)
  return match ? match[1].toLowerCase() : null
}

export function findKeywordClusterById(
  keywordId: string | null | undefined,
): LibertyMdKeywordCluster | null {
  if (typeof keywordId !== 'string' || !keywordId) return null
  return BY_KEYWORD_ID.get(keywordId) ?? null
}

export function findKeywordClusterBySlug(
  slug: string | null | undefined,
): LibertyMdKeywordCluster | null {
  if (typeof slug !== 'string' || !slug) return null
  return BY_SLUG.get(slug.trim().toLowerCase()) ?? null
}

/**
 * Resolve framing cluster from allow-listed URL tokens only.
 * Unmatched → null (generic chrome).
 */
export function resolveKeywordLandingCluster(input: {
  pathname?: string | null
  keyword_id?: string | null
  matched_topic_slug?: string | null
}): LibertyMdKeywordCluster | null {
  const byId = findKeywordClusterById(input.keyword_id)
  if (byId) return byId

  const bySlug = findKeywordClusterBySlug(input.matched_topic_slug)
  if (bySlug) return bySlug

  return findKeywordClusterBySlug(topicSlugFromPathname(input.pathname))
}

/** Opaque attribution fields from an allow-listed path slug (never from q=). */
export function opaqueFieldsFromTopicPath(
  pathname: string | null | undefined,
): { keyword_id: string; matched_topic_slug: string } | null {
  const cluster = findKeywordClusterBySlug(topicSlugFromPathname(pathname))
  if (!cluster) return null
  return {
    keyword_id: cluster.keyword_id,
    matched_topic_slug: cluster.matched_topic_slug,
  }
}
