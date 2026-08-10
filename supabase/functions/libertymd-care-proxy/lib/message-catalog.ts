/**
 * P3-08 · Approved message-catalog loader.
 *
 * Production: service_role SELECT of status='approved' rows (defense in depth —
 * code filter even though RLS also restricts anon/auth reads).
 * Never serves pending_review / rejected / superseded / non-approved locales.
 */

import {
  substituteRegionPlaceholders,
  type RegionNumbers,
} from './region-config.ts'

export type CatalogLogger = (event: string, props: Record<string, string | number | boolean>) => void

/** Minimal PostgREST-shaped client (service_role). */
// deno-lint-ignore no-explicit-any
type DbLike = any

/** Canonical case used by the catalog constraint (`hi-Latn` is case-sensitive). */
export function canonicalCatalogLanguage(raw: unknown): string {
  const value = String(raw || 'en').trim().replace(/_/g, '-').toLowerCase()
  if (value === 'hi-latn' || value === 'hinglish') return 'hi-Latn'
  if (value === 'es' || value.startsWith('es-')) return 'es'
  if (value === 'hi' || value.startsWith('hi-')) return 'hi'
  if (value === 'fr' || value.startsWith('fr-')) return 'fr'
  if (value === 'de' || value.startsWith('de-')) return 'de'
  if (value === 'pt' || value.startsWith('pt-')) return 'pt'
  return 'en'
}

/** Required P0-17 emergency catalog keys (approved EN seeds). */
export const P0_17_CATALOG_KEYS = [
  'emergency.heading',
  'emergency.standing.acs_chest_pain',
  'emergency.standing.stroke_fast',
  'emergency.standing.thunderclap_headache',
  'emergency.standing.anaphylaxis',
  'emergency.standing.respiratory_distress',
  'emergency.standing.surgical_abdomen',
  'emergency.standing.suicidal_ideation',
  'emergency.standing.generic_medical',
  'emergency.detail.acs_chest_pain',
  'emergency.detail.stroke_fast',
  'emergency.detail.thunderclap_headache',
  'emergency.detail.anaphylaxis',
  'emergency.detail.respiratory_distress',
  'emergency.detail.surgical_abdomen',
  'emergency.detail.suicidal_ideation',
  'emergency.detail.generic_medical',
] as const

export type P017CatalogKey = (typeof P0_17_CATALOG_KEYS)[number]

/**
 * Fetch one approved catalog string. Returns null on miss / pending / error
 * (caller fail-opens to EN fixture). Logs key name only — never PHI.
 */
export async function loadApprovedCatalogContent(
  db: DbLike | null | undefined,
  messageKey: string,
  language: string,
  log?: CatalogLogger,
): Promise<{ content: string; source: 'catalog' } | null> {
  const lang = canonicalCatalogLanguage(language)
  if (!db) {
    log?.('catalog_unavailable', { table: 'libertymd_message_catalog', reason: 'no_db', key: messageKey })
    return null
  }
  try {
    const { data, error } = await db
      .from('libertymd_message_catalog')
      .select('content, status')
      .eq('message_key', messageKey)
      .eq('language', lang)
      .eq('status', 'approved')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      log?.('catalog_unavailable', {
        table: 'libertymd_message_catalog',
        reason: 'query_error',
        key: messageKey,
        language: lang,
      })
      return null
    }
    if (!data || data.status !== 'approved') {
      log?.('missing_key', { key: messageKey, language: lang, reason: 'not_approved_or_missing' })
      return null
    }
    const content = String(data.content || '').trim()
    if (!content) {
      log?.('missing_key', { key: messageKey, language: lang, reason: 'empty_content' })
      return null
    }
    return { content, source: 'catalog' }
  } catch {
    log?.('catalog_unavailable', {
      table: 'libertymd_message_catalog',
      reason: 'exception',
      key: messageKey,
      language: lang,
    })
    return null
  }
}

export function applyRegionToCatalogTemplate(
  template: string,
  numbers: RegionNumbers,
): string {
  return substituteRegionPlaceholders(template, numbers)
}
