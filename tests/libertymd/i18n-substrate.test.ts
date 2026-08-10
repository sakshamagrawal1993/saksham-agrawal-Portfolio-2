/**
 * P3-08 · i18n substrate — catalog resolve, approved-only, region numbers,
 * missing-key / fail-open, AC6 registry data-driven locale list.
 */
import {
  EMERGENCY_CATALOG_TEMPLATES,
  EU_REGION_FIXTURE,
  US_REGION_FIXTURE,
  applyCanonicalForceEndCopy,
  applyCanonicalForceEndCopyResolved,
  resolveEmergencyCopy,
  resolveEmergencyCopyForClient,
  resolveEmergencyCopyResolved,
  type EmergencyCopyWire,
} from '../../supabase/functions/libertymd-care-proxy/lib/emergency-copy.ts'
import {
  canonicalCatalogLanguage,
  P0_17_CATALOG_KEYS,
} from '../../supabase/functions/libertymd-care-proxy/lib/message-catalog.ts'
import registry from '../../i18n/registry.json' with { type: 'json' }

declare const Deno: {
  test: (name: string, fn: () => unknown | Promise<unknown>) => void
  readTextFileSync: (path: string) => string
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

Deno.test('P3-08 AC1 · required catalog keys cover P0-17 emergency surface only', () => {
  const keys = [...P0_17_CATALOG_KEYS].sort()
  assert(keys.includes('emergency.heading'), 'shared heading')
  assert(keys.includes('emergency.standing.suicidal_ideation'), 'SI standing')
  assert(keys.includes('emergency.detail.acs_chest_pain'), 'ACS detail')
  assert(keys.includes('emergency.detail.generic_medical'), 'generic detail')
  assert(!keys.some((k) => k.startsWith('safety.')), 'no non-P0-17 safety seeds')
  for (const key of P0_17_CATALOG_KEYS) {
    assert(EMERGENCY_CATALOG_TEMPLATES[key], `template for ${key}`)
  }
})

Deno.test('P3-08 AC2 · US 911/988 asymmetry; EU fixture is not hardcoded 911', async () => {
  const us = await resolveEmergencyCopyResolved('acs_chest_pain', {
    catalogOverride: { ...EMERGENCY_CATALOG_TEMPLATES },
    regionOverride: US_REGION_FIXTURE,
  })
  assert(/\b911\b/.test(us.copy.standingInstruction), 'US medical standing 911')
  assert(!/\b988\b/.test(us.copy.standingInstruction), 'US medical standing no 988')
  assertEquals(us.source, 'catalog', 'catalog path')

  const si = await resolveEmergencyCopyResolved('suicidal_ideation', {
    catalogOverride: { ...EMERGENCY_CATALOG_TEMPLATES },
    regionOverride: US_REGION_FIXTURE,
  })
  assert(/\b988\b/.test(si.copy.standingInstruction), 'SI standing 988')
  assert(!/\b911\b/.test(si.copy.standingInstruction), 'SI standing no 911')

  const eu = await resolveEmergencyCopyResolved('acs_chest_pain', {
    catalogOverride: { ...EMERGENCY_CATALOG_TEMPLATES },
    regionOverride: EU_REGION_FIXTURE,
  })
  assert(/\b112\b/.test(eu.copy.detail), 'EU medical uses 112')
  assert(!/\b911\b/.test(eu.copy.detail), 'EU medical not hardcoded 911')
})

Deno.test('P3-09 · canonical locale lookup preserves Hinglish and serves complete German emergency copy', async () => {
  assertEquals(canonicalCatalogLanguage('hi-Latn'), 'hi-Latn', 'canonical Hinglish case')
  assertEquals(canonicalCatalogLanguage('hi_latn'), 'hi-Latn', 'underscore Hinglish alias')
  assertEquals(canonicalCatalogLanguage('de-DE'), 'de', 'German regional code')
  assertEquals(canonicalCatalogLanguage('unsupported'), 'en', 'unsupported fallback')

  const german = await resolveEmergencyCopyResolved('acs_chest_pain', {
    language: 'de',
    catalogOverride: {
      'emergency.heading': 'Aus Sicherheitsgründen mussten wir diese Konsultation beenden.',
      'emergency.standing.acs_chest_pain': 'Rufen Sie sofort {emergency_number} an. Fahren Sie nicht selbst.',
      'emergency.detail.acs_chest_pain': 'Dies kann ein Herznotfall sein. Rufen Sie jetzt {emergency_number} an.',
    },
    regionOverride: EU_REGION_FIXTURE,
  })
  assertEquals(german.source, 'catalog', 'German whole-surface catalog path')
  assert(german.copy.heading.startsWith('Aus Sicherheitsgründen'), 'German heading')
  assert(german.copy.standingInstruction.includes('112'), 'German standing receives EU number')
  assert(german.copy.detail.includes('Herznotfall'), 'German detail')
  assert(!/For safety reasons|Call 911|emergency department/i.test(JSON.stringify(german.wire)), 'no English fallback')
})

Deno.test('P3-08 AC3 · pending / incomplete catalog does not serve partial keys — fail-open fixture', async () => {
  // Only heading approved — standing/detail missing → fixture fail-open (never raw key / never partial pending).
  const logs: Array<{ event: string; key?: string }> = []
  const result = await resolveEmergencyCopyResolved('acs_chest_pain', {
    catalogOverride: { 'emergency.heading': 'PENDING HEADING ONLY' },
    regionOverride: US_REGION_FIXTURE,
    log: (event, props) => {
      logs.push({ event, key: typeof props.key === 'string' ? props.key : undefined })
    },
  })
  assertEquals(result.source, 'fixture', 'incomplete catalog → fixture')
  assertEquals(result.copy.heading, resolveEmergencyCopy('acs_chest_pain').heading, 'fixture heading')
  assert(!result.copy.heading.includes('emergency.'), 'no raw key')
  assert(logs.some((l) => l.event === 'missing_key'), 'missing_key logged')
})

Deno.test('P3-08 AC4 · force_end and reopen return emergency_copy wire', async () => {
  type ForcePayload = {
    status: string
    force_end: boolean
    crisis_type: string
    message: string
    raw: { message: string }
    emergency_copy?: EmergencyCopyWire
  }
  const force = await applyCanonicalForceEndCopyResolved({
    status: 'force_end',
    force_end: true,
    crisis_type: 'stroke_fast',
    message: 'model junk with 988',
    raw: { message: 'model junk with 988' },
  } as ForcePayload, {
    catalogOverride: { ...EMERGENCY_CATALOG_TEMPLATES },
    regionOverride: US_REGION_FIXTURE,
  })
  const wire = force.emergency_copy
  assert(wire, 'emergency_copy present')
  assertEquals(wire.detail, force.message, 'message synced to detail')
  assert(/\b911\b/.test(wire.detail), 'stroke detail 911')
  assert(!/\b988\b/.test(wire.detail), 'stroke detail no 988')
  assert(wire.heading.length > 0, 'heading')
  assert(wire.standingInstruction.length > 0, 'standing')

  const reopen = await resolveEmergencyCopyForClient('suicidal_ideation', {
    catalogOverride: { ...EMERGENCY_CATALOG_TEMPLATES },
    regionOverride: US_REGION_FIXTURE,
  })
  assertEquals(reopen.crisis_type, 'suicidal_ideation', 'reopen crisis_type')
  assert(/\b988\b/.test(reopen.standingInstruction), 'reopen SI standing')
  assert(reopen.heading.length > 0 && reopen.detail.length > 0, 'reopen full wire')
})

Deno.test('P3-08 AC5 · catalog unavailable fail-open to EN fixture; never raw key', async () => {
  const logs: string[] = []
  const result = await resolveEmergencyCopyResolved('anaphylaxis', {
    db: null,
    log: (event) => { logs.push(event) },
  })
  assertEquals(result.source, 'fixture', 'no db → fixture')
  assertEquals(result.copy.detail, resolveEmergencyCopy('anaphylaxis').detail, 'EN fixture detail')
  assert(!result.wire.heading.includes('emergency.'), 'no raw key in heading')
  assert(logs.includes('catalog_unavailable'), 'catalog_unavailable logged')

  // Sync path still works for hermetic force_end.
  const sync = applyCanonicalForceEndCopy({
    status: 'force_end',
    force_end: true,
    crisis_type: 'anaphylaxis',
    message: 'junk',
  } as {
    status: string
    force_end: boolean
    crisis_type: string
    message: string
    emergency_copy?: EmergencyCopyWire
  })
  assert(sync.emergency_copy?.detail.includes('epinephrine'), 'sync fixture wire')
})

Deno.test('P3-08 AC6 · registry.json is data-driven (no TS allowlist required to add locale)', () => {
  const locales = (registry as { locales: Array<{ code: string; label: string; nativeLabel: string }> }).locales
  assert(Array.isArray(locales) && locales.length >= 2, 'registry has locales')
  assert(locales.every((l) => l.code && l.label && l.nativeLabel), 'entries complete')
  assert(locales.some((l) => l.code === 'en'), 'en present')
  assert(locales.some((l) => l.code === 'es'), 'es present in chrome registry')
  // Contract: adding a locale = edit registry.json + drop locales/<code>.json — not a Language union.
  const registryText = Deno.readTextFileSync(
    new URL('../../i18n/registry.json', import.meta.url).pathname,
  )
  const indexText = Deno.readTextFileSync(
    new URL('../../i18n/index.tsx', import.meta.url).pathname,
  )
  assert(indexText.includes("from './registry.json'"), 'index imports registry')
  assert(!indexText.includes("export type Language = 'en' | 'es'"), 'no hardcoded Language union')
  assert(registryText.includes('"code": "en"'), 'registry data file')
})

Deno.test('P3-08 migration · neutralized draft cannot create tables', () => {
  const draft = Deno.readTextFileSync(
    new URL('../../supabase/migrations/20260720100000_libertymd_i18n.sql', import.meta.url).pathname,
  )
  assert(/NEUTRALIZED|no-op/i.test(draft), 'draft marked neutralized')
  assert(!/create table if not exists public\.libertymd_message_catalog/i.test(draft), 'no catalog create')
  assert(!/sakshamagrawal1993@gmail\.com/i.test(draft), 'no email-owner RLS')

  const mig = Deno.readTextFileSync(
    new URL('../../supabase/migrations/20260731270000_libertymd_i18n_p3_08.sql', import.meta.url).pathname,
  )
  assert(/libertymd_message_catalog/i.test(mig), 'p3_08 creates catalog')
  assert(/crisis_number/i.test(mig), 'crisis_number column')
  assert(/'911'/.test(mig) && /'988'/.test(mig), 'US 911/988 seeds')
  assert(!/insert into public\.libertymd_message_catalog[\s\S]*safety\.high_risk_continue/i.test(mig), 'no high_risk_continue seed')
  assert(!/'safety\.high_risk_continue'/i.test(mig), 'no high_risk_continue key literal insert')
  assert(!/sakshamagrawal1993@gmail\.com/i.test(mig), 'no email-owner policy')
})

Deno.test('P3-09 migration · approved emergency catalog covers every approved clinical locale', () => {
  const migration = Deno.readTextFileSync(
    new URL('../../supabase/migrations/20260810110000_libertymd_approved_multilingual_emergency_copy.sql', import.meta.url).pathname,
  )
  for (const locale of ['hi', 'hi-Latn', 'fr', 'de', 'pt']) {
    assert(migration.includes(`('${locale}',`), `${locale}: approved translation review row`)
    assert(migration.includes(`'${locale}', 'machine'`) || migration.includes(`'${locale}', 'human'`), `${locale}: catalog bundle`)
  }
  for (const key of P0_17_CATALOG_KEYS) {
    const count = migration.split(`'${key}'`).length - 1
    assert(count === 5, `${key}: one translated row per newly enabled locale`)
  }
  assert(migration.includes("status = excluded.status"), 'approval upsert is idempotent')
})

Deno.test('FULL-REPORT · every supported locale has complete report chrome', () => {
  const locales = (registry as { locales: Array<{ code: string }> }).locales
  for (const { code } of locales) {
    const locale = JSON.parse(Deno.readTextFileSync(
      new URL(`../../i18n/locales/${code}.json`, import.meta.url).pathname,
    )) as Record<string, any>
    const report = locale.report
    for (const key of ['sessionSummary', 'patientSummary', 'differential', 'assessmentAndPlan', 'redFlags', 'soap']) {
      assert(report?.sections?.[key], `${code}: report.sections.${key}`)
    }
    for (const key of ['aboutCondition', 'whyConsidered', 'clinicalAssessment', 'furtherInvestigations']) {
      assert(report?.card?.[key], `${code}: report.card.${key}`)
    }
    for (const key of ['patientName', 'gender', 'age', 'date', 'anonymous', 'notSpecified', 'page', 'pdfFooter']) {
      assert(report?.meta?.[key], `${code}: report.meta.${key}`)
    }
    assert(report?.headerTitle, `${code}: report.headerTitle`)
    assert(report?.pdf?.patientTitle, `${code}: report.pdf.patientTitle`)
  }
})
