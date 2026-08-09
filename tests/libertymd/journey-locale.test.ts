/**
 * P3-07 · Journey-wide clinical locale — normalizer, AC6 gate, whole-surface
 * emergency fallback, Mixpanel clinical locale projection.
 */
import {
  US_REGION_FIXTURE,
  resolveEmergencyCopy,
  resolveEmergencyCopyResolved,
} from '../../supabase/functions/libertymd-care-proxy/lib/emergency-copy.ts'
import {
  asClinicalLanguage,
  isClinicalEsUnlocked,
  resolveJourneyLocale,
  toClinicalCandidate,
} from '../../supabase/functions/libertymd-care-proxy/lib/journey-locale.ts'
import { P0_17_CATALOG_KEYS } from '../../supabase/functions/libertymd-care-proxy/lib/message-catalog.ts'
import { projectMixpanelProperties } from '../../supabase/functions/libertymd-care-proxy/lib/telemetry.ts'
import type { ProxyContext } from '../../supabase/functions/libertymd-care-proxy/lib/context.ts'

declare const Deno: {
  test: (name: string, fn: () => unknown | Promise<unknown>) => void
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

Deno.test('P3-09 · toClinicalCandidate normalizes es / es-ES / hi / hi-Latn / pt / fr / de', () => {
  assertEquals(toClinicalCandidate('es'), 'es', 'es')
  assertEquals(toClinicalCandidate('es-ES'), 'es', 'es-ES→es')
  assertEquals(toClinicalCandidate('es_MX'), 'es', 'es_MX')
  assertEquals(toClinicalCandidate('pt'), 'pt', 'pt')
  assertEquals(toClinicalCandidate('hi'), 'hi', 'hi')
  assertEquals(toClinicalCandidate('hi-Latn'), 'hi-Latn', 'hi-Latn')
  assertEquals(toClinicalCandidate('hinglish'), 'hi-Latn', 'hinglish→hi-Latn')
  assertEquals(toClinicalCandidate('fr'), 'fr', 'fr')
  assertEquals(toClinicalCandidate('de'), 'de', 'de')
  assertEquals(toClinicalCandidate('en'), 'en', 'en')
  assertEquals(toClinicalCandidate(''), 'en', 'empty')
  assertEquals(asClinicalLanguage('es'), 'es', 'asClinical es')
  assertEquals(asClinicalLanguage('hi'), 'hi', 'asClinical hi')
  assertEquals(asClinicalLanguage('hi-Latn'), 'hi-Latn', 'asClinical hi-Latn')
})

Deno.test('P3-07 AC6 path(2) · Spanish request blocked→en when gate closed', async () => {
  const logs: Array<{ event: string; candidate?: string }> = []
  const result = await resolveJourneyLocale({
    requestedLanguage: 'es',
    clinicalEsUnlockedOverride: false,
    log: (event, props) => {
      logs.push({ event, candidate: typeof props.candidate === 'string' ? props.candidate : undefined })
    },
  })
  assertEquals(result.language, 'en', 'persisted language en')
  assertEquals(result.candidate, 'es', 'candidate es')
  assertEquals(result.blocked, true, 'blocked')
  assert(logs.some((l) => l.event === 'clinical_locale_blocked'), 'clinical_locale_blocked logged')
})

Deno.test('P3-07 flip-ready path(1) · gate open allows clinical es', async () => {
  const result = await resolveJourneyLocale({
    requestedLanguage: 'es-ES',
    clinicalEsUnlockedOverride: true,
  })
  assertEquals(result.language, 'es', 'persisted es')
  assertEquals(result.blocked, false, 'not blocked')
})

Deno.test('P3-07 Q5 · unlock requires review + full ES emergency catalog', async () => {
  assertEquals(await isClinicalEsUnlocked({ clinicalEsUnlockedOverride: false }), false, 'override false')
  assertEquals(
    await isClinicalEsUnlocked({
      approvedEsReviewOverride: true,
      approvedEsCatalogKeysOverride: P0_17_CATALOG_KEYS.slice(0, 3),
    }),
    false,
    'partial catalog not enough',
  )
  assertEquals(
    await isClinicalEsUnlocked({
      approvedEsReviewOverride: true,
      approvedEsCatalogKeysOverride: [...P0_17_CATALOG_KEYS],
    }),
    true,
    'review + full catalog unlocks',
  )
  assertEquals(
    await isClinicalEsUnlocked({
      approvedEsReviewOverride: false,
      approvedEsCatalogKeysOverride: [...P0_17_CATALOG_KEYS],
    }),
    false,
    'catalog alone insufficient',
  )
})

Deno.test('P3-07 AC4 / Q4 · partial ES catalog → whole-surface EN (no stitch)', async () => {
  const logs: Array<{ event: string; locale?: string; surface?: string }> = []
  const result = await resolveEmergencyCopyResolved('acs_chest_pain', {
    language: 'es',
    catalogOverride: {
      'emergency.heading': 'ENCABEZADO ES SOLO',
      // standing + detail deliberately absent — no per-key EN stitch.
    },
    regionOverride: US_REGION_FIXTURE,
    log: (event, props) => {
      logs.push({
        event,
        locale: typeof props.locale === 'string' ? props.locale : undefined,
        surface: typeof props.surface === 'string' ? props.surface : undefined,
      })
    },
  })
  assert(logs.some((l) => l.event === 'locale_fallback' && l.locale === 'es'), 'locale_fallback logged')
  assertEquals(result.source, 'fixture', 'fixture fail-open')
  assertEquals(result.copy.heading, resolveEmergencyCopy('acs_chest_pain').heading, 'EN fixture heading')
  assert(!result.copy.heading.includes('ENCABEZADO'), 'no ES stitch of heading alone')
  assert(!result.wire.heading.includes('emergency.'), 'no raw key')
})

Deno.test('P3-07 AC4 · complete ES surface served when all three keys present (flip-ready)', async () => {
  const result = await resolveEmergencyCopyResolved('acs_chest_pain', {
    language: 'es',
    catalogOverride: {
      'emergency.heading': 'ES HEADING',
      'emergency.standing.acs_chest_pain': 'ES STANDING {emergency_number}',
      'emergency.detail.acs_chest_pain': 'ES DETAIL {emergency_number}',
    },
    regionOverride: US_REGION_FIXTURE,
  })
  assertEquals(result.source, 'catalog', 'catalog path')
  assertEquals(result.copy.heading, 'ES HEADING', 'es heading')
  assert(result.copy.standingInstruction.includes('ES STANDING'), 'es standing')
  assert(result.copy.detail.includes('ES DETAIL'), 'es detail')
  assert(/\b911\b/.test(result.copy.detail), 'region numbers applied')
})

Deno.test('P3-07 AC5 / Q3 · Mixpanel locale is clinical journey language not unknown', () => {
  const ctx = {
    isAnonymous: true,
    clinicalLocale: 'en' as const,
    user: { id: 'u1' },
  } as unknown as ProxyContext
  const props = projectMixpanelProperties(
    'consultation_started',
    'c1',
    { region: 'US', locale: 'en' },
    ctx,
  )
  assertEquals(props.locale, 'en', 'locale en')

  const blockedChrome = projectMixpanelProperties(
    'consultation_started',
    'c1',
    { region: 'US' },
    { ...ctx, clinicalLocale: 'en' } as ProxyContext,
  )
  assertEquals(blockedChrome.locale, 'en', 'chrome-es still clinical en via ctx')

  const unlocked = projectMixpanelProperties(
    'question_served',
    'c1',
    { locale: 'es' },
    { ...ctx, clinicalLocale: 'es' } as ProxyContext,
  )
  assertEquals(unlocked.locale, 'es', 'flip-ready es')
})
