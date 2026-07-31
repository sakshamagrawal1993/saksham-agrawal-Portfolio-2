/**
 * P3-08 · Region emergency / crisis numbers.
 *
 * Production: read `libertymd_region_config` (service_role).
 * Fail-open: US 911 / 988 embedded fixture (P0-17).
 * EU row exists so resolvers are never hardcoded to "911" only.
 */

export interface RegionNumbers {
  region: string
  emergency_number: string
  crisis_number: string
}

/** Degraded SoT when region_config is unavailable — US P0-17 numbers. */
export const US_REGION_FIXTURE: RegionNumbers = {
  region: 'US',
  emergency_number: '911',
  crisis_number: '988',
}

/** Non-US fixture used in hermetic tests to prove numbers are not hardcoded. */
export const EU_REGION_FIXTURE: RegionNumbers = {
  region: 'EU',
  emergency_number: '112',
  crisis_number: '112',
}

export type RegionConfigLogger = (event: string, props: Record<string, string | number | boolean>) => void

/** Minimal PostgREST-shaped client (service_role). */
// deno-lint-ignore no-explicit-any
type DbLike = any

export function normalizeRegion(region: unknown): string {
  const raw = String(region ?? 'US').trim().toUpperCase()
  if (raw === 'EU') return 'EU'
  return 'US'
}

export function substituteRegionPlaceholders(
  template: string,
  numbers: RegionNumbers,
): string {
  return template
    .replaceAll('{emergency_number}', numbers.emergency_number)
    .replaceAll('{crisis_number}', numbers.crisis_number)
}

/**
 * Load region numbers. On miss / error → US fixture + structured log (no PHI).
 */
export async function loadRegionNumbers(
  db: DbLike | null | undefined,
  region: unknown,
  log?: RegionConfigLogger,
): Promise<{ numbers: RegionNumbers; source: 'catalog' | 'fixture' }> {
  const key = normalizeRegion(region)
  if (!db) {
    log?.('catalog_unavailable', { table: 'libertymd_region_config', reason: 'no_db', region: key })
    return { numbers: key === 'EU' ? EU_REGION_FIXTURE : US_REGION_FIXTURE, source: 'fixture' }
  }
  try {
    const { data, error } = await db
      .from('libertymd_region_config')
      .select('region, emergency_number, crisis_number')
      .eq('region', key)
      .maybeSingle()
    if (error || !data) {
      log?.('catalog_unavailable', {
        table: 'libertymd_region_config',
        reason: error ? 'query_error' : 'missing_row',
        region: key,
      })
      return { numbers: key === 'EU' ? EU_REGION_FIXTURE : US_REGION_FIXTURE, source: 'fixture' }
    }
    const emergency = String(data.emergency_number || '').trim()
    const crisis = String(data.crisis_number || '').trim()
    if (!emergency || !crisis) {
      log?.('catalog_unavailable', {
        table: 'libertymd_region_config',
        reason: 'incomplete_row',
        region: key,
      })
      return { numbers: key === 'EU' ? EU_REGION_FIXTURE : US_REGION_FIXTURE, source: 'fixture' }
    }
    return {
      numbers: {
        region: String(data.region || key),
        emergency_number: emergency,
        crisis_number: crisis,
      },
      source: 'catalog',
    }
  } catch {
    log?.('catalog_unavailable', {
      table: 'libertymd_region_config',
      reason: 'exception',
      region: key,
    })
    return { numbers: key === 'EU' ? EU_REGION_FIXTURE : US_REGION_FIXTURE, source: 'fixture' }
  }
}
