/**
 * P3-08 · Terminal emergency copy resolver (catalog + region + fixture fail-open).
 *
 * REQUIRES EXPERT REVIEW: patient-facing strings remain engineering fixtures
 * pending clinician approval. Engineering Done ≠ clinical approval.
 * Catalog `status='approved'` is engineering serve — not clinicalReleaseGatePassed.
 *
 * Production SoT: `libertymd_message_catalog` (approved) + `libertymd_region_config`.
 * Degraded SoT: embedded EN P0-17 fixture (US 911/988) — never raw keys, never
 * pending_review / non-EN as production clinical copy.
 *
 * BO 2026-07-31 · P0-17: shared heading; medical → emergency_number only;
 * SI → crisis_number only; unknown → medical fallback.
 */

import {
  applyRegionToCatalogTemplate,
  canonicalCatalogLanguage,
  loadApprovedCatalogContent,
  type CatalogLogger,
} from './message-catalog.ts'
import {
  EU_REGION_FIXTURE,
  loadRegionNumbers,
  US_REGION_FIXTURE,
  type RegionConfigLogger,
  type RegionNumbers,
} from './region-config.ts'

export const CLINICAL_CRISIS_TYPES = [
  'acs_chest_pain',
  'anaphylaxis',
  'respiratory_distress',
  'stroke_fast',
  'suicidal_ideation',
  'surgical_abdomen',
  'thunderclap_headache',
] as const

export type ClinicalCrisisType = (typeof CLINICAL_CRISIS_TYPES)[number]

export interface EmergencyCopyVariant {
  crisisType: ClinicalCrisisType | 'generic_medical'
  heading: string
  standingInstruction: string
  detail: string
  clinicianReview: {
    status: 'pending'
    note: string
  }
}

/** Wire shape returned on force_end and get_consultation reopen (Q1). */
export interface EmergencyCopyWire {
  heading: string
  standingInstruction: string
  detail: string
  crisis_type: string
}

const PENDING = {
  status: 'pending' as const,
  note: 'REQUIRES EXPERT REVIEW before clinical release.',
}

/** Shared heading for every terminal stop (BO sample vocabulary). */
export const EMERGENCY_SHARED_HEADING =
  'For safety reasons we have been forced to end this consultation.'

const MEDICAL_STANDING =
  'If you believe this is a medical emergency please call 911 or your local emergency services immediately.'

const SI_STANDING =
  'If you are experiencing emotional distress, please call the Suicide & Crisis Lifeline at 988 or your local crisis services immediately.'

/**
 * Embedded EN P0-17 fixture (US numbers already substituted).
 * Fail-open / hermetic SoT — catalog remains the write path for updates.
 */
export const EMERGENCY_COPY_BY_CRISIS_TYPE: Readonly<Record<ClinicalCrisisType, EmergencyCopyVariant>> = {
  acs_chest_pain: {
    crisisType: 'acs_chest_pain',
    heading: EMERGENCY_SHARED_HEADING,
    standingInstruction: `${MEDICAL_STANDING} Do not drive yourself.`,
    detail:
      'These symptoms can be a cardiac emergency involving the heart. Call 911 or go to the ER now. Do not drive yourself.',
    clinicianReview: PENDING,
  },
  stroke_fast: {
    crisisType: 'stroke_fast',
    heading: EMERGENCY_SHARED_HEADING,
    standingInstruction:
      `${MEDICAL_STANDING} Note when symptoms started, and do not drive yourself.`,
    detail:
      'These symptoms may be a stroke. Call 911 now. Note when they started, and do not drive yourself.',
    clinicianReview: PENDING,
  },
  thunderclap_headache: {
    crisisType: 'thunderclap_headache',
    heading: EMERGENCY_SHARED_HEADING,
    standingInstruction: MEDICAL_STANDING,
    detail:
      'A sudden worst-of-life headache can be a neurological emergency. Call 911 or go to the ER now.',
    clinicianReview: PENDING,
  },
  anaphylaxis: {
    crisisType: 'anaphylaxis',
    heading: EMERGENCY_SHARED_HEADING,
    standingInstruction: `${MEDICAL_STANDING} Use epinephrine if available.`,
    detail:
      'This may be anaphylaxis. Use epinephrine if available and call 911 immediately.',
    clinicianReview: PENDING,
  },
  respiratory_distress: {
    crisisType: 'respiratory_distress',
    heading: EMERGENCY_SHARED_HEADING,
    standingInstruction: MEDICAL_STANDING,
    detail:
      'Severe breathing problems need emergency care. Call 911 or go to the ER now.',
    clinicianReview: PENDING,
  },
  surgical_abdomen: {
    crisisType: 'surgical_abdomen',
    heading: EMERGENCY_SHARED_HEADING,
    standingInstruction: MEDICAL_STANDING,
    detail:
      'Severe abdominal pain with these features can be a surgical emergency. Seek ER care now.',
    clinicianReview: PENDING,
  },
  suicidal_ideation: {
    crisisType: 'suicidal_ideation',
    heading: EMERGENCY_SHARED_HEADING,
    standingInstruction: SI_STANDING,
    detail:
      'Please call or text 988 now to reach the Suicide & Crisis Lifeline. Stay with a trusted person while you connect.',
    clinicianReview: {
      status: 'pending',
      note: 'REQUIRES EXPERT REVIEW: crisis-line copy and SI framing.',
    },
  },
}

/** Safe medical fallback for other_emergency / unknown / missing / qa_throwaway. */
export const GENERIC_MEDICAL_COPY: EmergencyCopyVariant = {
  crisisType: 'generic_medical',
  heading: EMERGENCY_SHARED_HEADING,
  standingInstruction: MEDICAL_STANDING,
  detail:
    'These symptoms may be a medical emergency. Call 911 or go to the nearest emergency department now.',
  clinicianReview: PENDING,
}

/** Catalog templates with placeholders (mirrors migration seeds; hermetic catalog path). */
export const EMERGENCY_CATALOG_TEMPLATES: Readonly<Record<string, string>> = {
  'emergency.heading': EMERGENCY_SHARED_HEADING,
  'emergency.standing.acs_chest_pain':
    'If you believe this is a medical emergency please call {emergency_number} or your local emergency services immediately. Do not drive yourself.',
  'emergency.standing.stroke_fast':
    'If you believe this is a medical emergency please call {emergency_number} or your local emergency services immediately. Note when symptoms started, and do not drive yourself.',
  'emergency.standing.thunderclap_headache':
    'If you believe this is a medical emergency please call {emergency_number} or your local emergency services immediately.',
  'emergency.standing.anaphylaxis':
    'If you believe this is a medical emergency please call {emergency_number} or your local emergency services immediately. Use epinephrine if available.',
  'emergency.standing.respiratory_distress':
    'If you believe this is a medical emergency please call {emergency_number} or your local emergency services immediately.',
  'emergency.standing.surgical_abdomen':
    'If you believe this is a medical emergency please call {emergency_number} or your local emergency services immediately.',
  'emergency.standing.suicidal_ideation':
    'If you are experiencing emotional distress, please call the Suicide & Crisis Lifeline at {crisis_number} or your local crisis services immediately.',
  'emergency.standing.generic_medical':
    'If you believe this is a medical emergency please call {emergency_number} or your local emergency services immediately.',
  'emergency.detail.acs_chest_pain':
    'These symptoms can be a cardiac emergency involving the heart. Call {emergency_number} or go to the ER now. Do not drive yourself.',
  'emergency.detail.stroke_fast':
    'These symptoms may be a stroke. Call {emergency_number} now. Note when they started, and do not drive yourself.',
  'emergency.detail.thunderclap_headache':
    'A sudden worst-of-life headache can be a neurological emergency. Call {emergency_number} or go to the ER now.',
  'emergency.detail.anaphylaxis':
    'This may be anaphylaxis. Use epinephrine if available and call {emergency_number} immediately.',
  'emergency.detail.respiratory_distress':
    'Severe breathing problems need emergency care. Call {emergency_number} or go to the ER now.',
  'emergency.detail.surgical_abdomen':
    'Severe abdominal pain with these features can be a surgical emergency. Seek ER care now.',
  'emergency.detail.suicidal_ideation':
    'Please call or text {crisis_number} now to reach the Suicide & Crisis Lifeline. Stay with a trusted person while you connect.',
  'emergency.detail.generic_medical':
    'These symptoms may be a medical emergency. Call {emergency_number} or go to the nearest emergency department now.',
}

export function normalizeCrisisTypeKey(crisisType: unknown): string {
  if (crisisType === null || crisisType === undefined) return ''
  return String(crisisType).trim().toLowerCase()
}

export function isClinicalCrisisType(value: string): value is ClinicalCrisisType {
  return (CLINICAL_CRISIS_TYPES as readonly string[]).includes(value)
}

export function resolveVariantKey(crisisType: unknown): ClinicalCrisisType | 'generic_medical' {
  const key = normalizeCrisisTypeKey(crisisType)
  if (isClinicalCrisisType(key)) return key
  return 'generic_medical'
}

/**
 * Sync fixture resolver (US EN). Used by pattern messages, hermetic P0-17 tests,
 * and fail-open when catalog is unavailable.
 */
export function resolveEmergencyCopy(crisisType: unknown): EmergencyCopyVariant {
  const key = resolveVariantKey(crisisType)
  if (key === 'generic_medical') return GENERIC_MEDICAL_COPY
  return EMERGENCY_COPY_BY_CRISIS_TYPE[key]
}

/** Pattern `message` / transcript SoT — thin read-through of fixture detail. */
export function emergencyCopyDetail(crisisType: unknown): string {
  return resolveEmergencyCopy(crisisType).detail
}

export function toEmergencyCopyWire(
  copy: EmergencyCopyVariant,
  crisisType?: unknown,
): EmergencyCopyWire {
  return {
    heading: copy.heading,
    standingInstruction: copy.standingInstruction,
    detail: copy.detail,
    crisis_type: crisisType !== undefined && crisisType !== null && String(crisisType).trim()
      ? String(crisisType)
      : copy.crisisType,
  }
}

export type EmergencyResolveLog = CatalogLogger & RegionConfigLogger

export interface EmergencyResolveOptions {
  /** Service-role DB client. When omitted, fixture-only path. */
  // deno-lint-ignore no-explicit-any
  db?: any
  region?: unknown
  /** Clinical catalog language. Non-en with no approved rows → EN fail-open. */
  language?: string
  log?: EmergencyResolveLog
  /**
   * Injected approved catalog map for hermetic tests (simulates DB rows).
   * Keys = message_key; values = content templates with placeholders.
   */
  catalogOverride?: Record<string, string> | null
  /** Injected region numbers for hermetic tests. */
  regionOverride?: RegionNumbers | null
}

function fixtureWithRegion(crisisType: unknown, numbers: RegionNumbers): EmergencyCopyVariant {
  const key = resolveVariantKey(crisisType)
  const standingKey = `emergency.standing.${key}`
  const detailKey = `emergency.detail.${key}`
  const heading = applyRegionToCatalogTemplate(
    EMERGENCY_CATALOG_TEMPLATES['emergency.heading'],
    numbers,
  )
  const standing = applyRegionToCatalogTemplate(
    EMERGENCY_CATALOG_TEMPLATES[standingKey] || EMERGENCY_CATALOG_TEMPLATES['emergency.standing.generic_medical'],
    numbers,
  )
  const detail = applyRegionToCatalogTemplate(
    EMERGENCY_CATALOG_TEMPLATES[detailKey] || EMERGENCY_CATALOG_TEMPLATES['emergency.detail.generic_medical'],
    numbers,
  )
  const base = key === 'generic_medical' ? GENERIC_MEDICAL_COPY : EMERGENCY_COPY_BY_CRISIS_TYPE[key]
  return {
    ...base,
    heading,
    standingInstruction: standing,
    detail,
  }
}

/**
 * Load one approved catalog template in the exact language requested.
 * P3-07 Q4: no per-key EN stitch — callers decide whole-surface fallback.
 */
async function loadTemplate(
  opts: EmergencyResolveOptions,
  messageKey: string,
  language: string,
): Promise<{ template: string; fromCatalog: boolean }> {
  if (opts.catalogOverride) {
    const hit = opts.catalogOverride[messageKey]
    if (hit) return { template: hit, fromCatalog: true }
    opts.log?.('missing_key', { key: messageKey, language, reason: 'override_miss' })
    return { template: '', fromCatalog: false }
  }
  const row = await loadApprovedCatalogContent(opts.db, messageKey, language, opts.log)
  if (row) return { template: row.content, fromCatalog: true }
  return { template: '', fromCatalog: false }
}

function buildCatalogCopy(
  variantKey: ClinicalCrisisType | 'generic_medical',
  heading: string,
  standing: string,
  detail: string,
  numbers: RegionNumbers,
): EmergencyCopyVariant {
  return {
    crisisType: variantKey,
    heading: applyRegionToCatalogTemplate(heading, numbers),
    standingInstruction: applyRegionToCatalogTemplate(standing, numbers),
    detail: applyRegionToCatalogTemplate(detail, numbers),
    clinicianReview: variantKey === 'suicidal_ideation'
      ? { status: 'pending', note: 'REQUIRES EXPERT REVIEW: crisis-line copy and SI framing.' }
      : PENDING,
  }
}

/**
 * Resolve patient-facing emergency copy from catalog + region (or fixture).
 * Never returns a raw message key. Pending / unapproved never served.
 *
 * P3-07 Q4 — whole-surface rule for non-en: all three keys must be approved in
 * the requested language; any miss → entire surface from approved EN catalog
 * (or EN fixture). Never stitch ES+EN per key.
 */
export async function resolveEmergencyCopyResolved(
  crisisType: unknown,
  opts: EmergencyResolveOptions = {},
): Promise<{ copy: EmergencyCopyVariant; wire: EmergencyCopyWire; source: 'catalog' | 'fixture' }> {
  const language = canonicalCatalogLanguage(opts.language)
  const variantKey = resolveVariantKey(crisisType)

  let numbers: RegionNumbers
  let regionSource: 'catalog' | 'fixture' = 'fixture'
  if (opts.regionOverride) {
    numbers = opts.regionOverride
    regionSource = 'catalog'
  } else {
    const loaded = await loadRegionNumbers(opts.db, opts.region ?? 'US', opts.log)
    numbers = loaded.numbers
    regionSource = loaded.source
  }

  const headingKey = 'emergency.heading'
  const standingKey = `emergency.standing.${variantKey}`
  const detailKey = `emergency.detail.${variantKey}`

  const [headingLoad, standingLoad, detailLoad] = await Promise.all([
    loadTemplate(opts, headingKey, language),
    loadTemplate(opts, standingKey, language),
    loadTemplate(opts, detailKey, language),
  ])

  const allFromCatalog = headingLoad.fromCatalog && standingLoad.fromCatalog && detailLoad.fromCatalog
  if (allFromCatalog) {
    const copy = buildCatalogCopy(
      variantKey,
      headingLoad.template,
      standingLoad.template,
      detailLoad.template,
      numbers,
    )
    return { copy, wire: toEmergencyCopyWire(copy, crisisType), source: 'catalog' }
  }

  // Non-en partial/miss → whole-surface EN (catalog EN if complete, else fixture).
  if (language !== 'en') {
    const missingKey = !headingLoad.fromCatalog
      ? headingKey
      : !standingLoad.fromCatalog
        ? standingKey
        : detailKey
    opts.log?.('locale_fallback', {
      locale: language,
      surface: 'emergency',
      key: missingKey,
      reason: 'whole_surface_en',
    })
    const [enHeading, enStanding, enDetail] = await Promise.all([
      loadTemplate(opts, headingKey, 'en'),
      loadTemplate(opts, standingKey, 'en'),
      loadTemplate(opts, detailKey, 'en'),
    ])
    if (enHeading.fromCatalog && enStanding.fromCatalog && enDetail.fromCatalog) {
      const copy = buildCatalogCopy(
        variantKey,
        enHeading.template,
        enStanding.template,
        enDetail.template,
        numbers,
      )
      return { copy, wire: toEmergencyCopyWire(copy, crisisType), source: 'catalog' }
    }
  }

  // Catalog miss / unavailable → EN fixture fail-open, optionally
  // re-substituted for non-US region when region_config was available.
  const copy = regionSource === 'catalog' || opts.regionOverride
    ? fixtureWithRegion(crisisType, numbers)
    : resolveEmergencyCopy(crisisType)
  return { copy, wire: toEmergencyCopyWire(copy, crisisType), source: 'fixture' }
}

/**
 * Overwrite patient-facing `message` on force_end and attach `emergency_copy`.
 * Sync path (no opts / no db) uses fixture — hermetic tests + pattern parity.
 * Async catalog path when `opts.db` or overrides provided.
 */
export function applyCanonicalForceEndCopy<T extends {
  status: string
  force_end?: boolean
  crisis_type?: unknown
  message: string
  raw?: Record<string, unknown>
  emergency_copy?: EmergencyCopyWire
}>(result: T): T {
  const isForceEnd = result.force_end === true || result.status === 'force_end'
  if (!isForceEnd) return result
  const copy = resolveEmergencyCopy(result.crisis_type)
  const wire = toEmergencyCopyWire(copy, result.crisis_type)
  const nextRaw = result.raw && typeof result.raw === 'object'
    ? { ...result.raw, message: copy.detail }
    : result.raw
  return { ...result, message: copy.detail, raw: nextRaw, emergency_copy: wire }
}

export async function applyCanonicalForceEndCopyResolved<T extends {
  status: string
  force_end?: boolean
  crisis_type?: unknown
  message: string
  raw?: Record<string, unknown>
  emergency_copy?: EmergencyCopyWire
}>(result: T, opts: EmergencyResolveOptions = {}): Promise<T> {
  const isForceEnd = result.force_end === true || result.status === 'force_end'
  if (!isForceEnd) return result
  const { copy, wire } = await resolveEmergencyCopyResolved(result.crisis_type, opts)
  const nextRaw = result.raw && typeof result.raw === 'object'
    ? { ...result.raw, message: copy.detail }
    : result.raw
  return { ...result, message: copy.detail, raw: nextRaw, emergency_copy: wire }
}

/** Build emergency_copy for reopen / get_consultation (always resolved strings). */
export async function resolveEmergencyCopyForClient(
  crisisType: unknown,
  opts: EmergencyResolveOptions = {},
): Promise<EmergencyCopyWire> {
  const { wire } = await resolveEmergencyCopyResolved(crisisType, opts)
  return wire
}

/** Re-export fixtures used by AC2 non-US tests. */
export { EU_REGION_FIXTURE, US_REGION_FIXTURE }
