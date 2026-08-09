/**
 * P3-07 · Journey-wide clinical locale normalizer (SoT).
 *
 * Resolves chrome/request codes → clinical `en` | `es`, applies AC6 gate
 * (path 2 = closed until translation_reviews.es approved + ES emergency keys).
 * Persist once on start_consultation; immutable mid-consult.
 *
 * P1-19 attribution `locale` remains separate — never use this as marketing SoT.
 *
 * Flip runbook (expert residual — do NOT execute in P3-07):
 *   1. Native-speaker / clinician approve ES emergency catalog rows + reviews.
 *   2. UPDATE libertymd_translation_reviews SET status='approved', …
 *      WHERE locale='es' AND status='pending_review';
 *   3. Confirm all P0_17_CATALOG_KEYS exist as language='es' status='approved'.
 *   4. Gate auto-opens on next start — no architecture ticket.
 */

import { P0_17_CATALOG_KEYS } from './message-catalog.ts'

export type ClinicalLanguage = 'en' | 'es' | 'es-ES' | 'hi' | 'hi-Latn' | 'fr' | 'de' | 'pt' | string

export type JourneyLocaleLog = (
  event: string,
  props: Record<string, string | number | boolean>,
) => void

// deno-lint-ignore no-explicit-any
type DbLike = any

export interface JourneyLocaleResolveOptions {
  /** Explicit start_consultation `language` (preferred) or chrome code. */
  requestedLanguage?: unknown
  db?: DbLike | null
  log?: JourneyLocaleLog
  /**
   * Hermetic inject: force gate open/closed without DB.
   * `true` = clinical es unlocked; `false` = blocked→en; omit = query DB / default closed.
   */
  clinicalEsUnlockedOverride?: boolean
  /** Hermetic: treat these message_keys as approved for `es`. */
  approvedEsCatalogKeysOverride?: readonly string[] | null
  /** Hermetic: pretend an approved es translation_reviews row exists. */
  approvedEsReviewOverride?: boolean | null
}

export interface JourneyLocaleResult {
  /** Persisted clinical language after AC6 gate. */
  language: ClinicalLanguage
  /** Candidate before gate. */
  candidate: ClinicalLanguage
  blocked: boolean
  reason: string | null
}

/**
 * Q6 — Normalize registry / chrome codes to clinical candidate.
 * Preserves exact requested language for en, es, es-ES, hi, hi-Latn, fr, de, pt.
 */
export function toClinicalCandidate(raw: unknown): ClinicalLanguage {
  const s = String(raw ?? '').trim().replace(/_/g, '-')
  if (!s) return 'en'
  const lower = s.toLowerCase()
  if (lower === 'hi-latn' || lower === 'hinglish') return 'hi-Latn'
  if (lower === 'es' || lower.startsWith('es-')) return 'es'
  if (lower === 'hi' || lower.startsWith('hi-')) return 'hi'
  if (lower === 'fr' || lower.startsWith('fr-')) return 'fr'
  if (lower === 'de' || lower.startsWith('de-')) return 'de'
  if (lower === 'pt' || lower.startsWith('pt-')) return 'pt'
  return s
}

/** Clinical super-property / DB language. */
export function asClinicalLanguage(raw: unknown): ClinicalLanguage {
  const candidate = toClinicalCandidate(raw)
  return candidate || 'en'
}

async function hasApprovedEsTranslationReview(
  db: DbLike | null | undefined,
  override?: boolean | null,
): Promise<boolean> {
  if (override === true) return true
  if (override === false) return false
  if (!db) return false
  try {
    const { data, error } = await db
      .from('libertymd_translation_reviews')
      .select('locale')
      .eq('locale', 'es')
      .eq('status', 'approved')
      .limit(1)
      .maybeSingle()
    if (error || !data) return false
    return true
  } catch {
    return false
  }
}

async function hasApprovedEsEmergencyCatalog(
  db: DbLike | null | undefined,
  keysOverride?: readonly string[] | null,
): Promise<boolean> {
  if (keysOverride) {
    const set = new Set(keysOverride)
    return P0_17_CATALOG_KEYS.every((k) => set.has(k))
  }
  if (!db) return false
  try {
    const { data, error } = await db
      .from('libertymd_message_catalog')
      .select('message_key')
      .eq('language', 'es')
      .eq('status', 'approved')
      .in('message_key', [...P0_17_CATALOG_KEYS])
    if (error || !Array.isArray(data)) return false
    const found = new Set(data.map((r: { message_key?: string }) => String(r.message_key || '')))
    return P0_17_CATALOG_KEYS.every((k) => found.has(k))
  } catch {
    return false
  }
}

/**
 * Q5 — Clinical `es` unlock: any approved es translation_reviews row
 * AND all required P0-17 emergency catalog keys approved for `es`.
 * Default (no DB / path 2): closed.
 */
export async function isClinicalEsUnlocked(
  opts: Pick<
    JourneyLocaleResolveOptions,
    'db' | 'clinicalEsUnlockedOverride' | 'approvedEsCatalogKeysOverride' | 'approvedEsReviewOverride'
  > = {},
): Promise<boolean> {
  if (opts.clinicalEsUnlockedOverride === true) return true
  if (opts.clinicalEsUnlockedOverride === false) return false
  const reviewOk = await hasApprovedEsTranslationReview(opts.db, opts.approvedEsReviewOverride)
  if (!reviewOk) return false
  return hasApprovedEsEmergencyCatalog(opts.db, opts.approvedEsCatalogKeysOverride)
}

/**
 * Journey-locale SoT — allow-list → candidate → AC6 gate → persistable language.
 * Never trust client `language=es` when gate is closed.
 */
export async function resolveJourneyLocale(
  opts: JourneyLocaleResolveOptions = {},
): Promise<JourneyLocaleResult> {
  const candidate = toClinicalCandidate(opts.requestedLanguage)
  if (candidate === 'en') {
    return { language: 'en', candidate: 'en', blocked: false, reason: null }
  }

  if (candidate === 'es' || candidate === 'es-ES') {
    const unlocked = await isClinicalEsUnlocked(opts)
    if (unlocked) {
      return { language: 'es', candidate: 'es', blocked: false, reason: null }
    }
    opts.log?.('clinical_locale_blocked', {
      candidate: 'es',
      language: 'en',
      reason: 'ac6_gate_closed',
    })
    return {
      language: 'en',
      candidate: 'es',
      blocked: true,
      reason: 'ac6_gate_closed',
    }
  }

  return {
    language: candidate,
    candidate,
    blocked: false,
    reason: null,
  }
}

/** Structured console log helper (key/locale only — no PHI). */
export function journeyLocaleConsoleLog(
  event: string,
  props: Record<string, string | number | boolean>,
) {
  console.warn(JSON.stringify({ scope: 'libertymd_journey_locale', event, ...props }))
}
