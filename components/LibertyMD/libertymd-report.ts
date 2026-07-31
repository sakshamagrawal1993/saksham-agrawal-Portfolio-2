/**
 * P2-02 — report_data → view-model mapper, triage map, scroll-depth helpers.
 * P2-04 — differential ordinal / seriousness / treatment aliases (patient cards).
 *
 * Pure only: no React, no Mixpanel. Alias map locked in tickets/P2-02/03-clarified.md Q9
 * and tickets/P2-04/03-clarified.md Q1–Q7. Never invent clinical prose; omit missing fields.
 * Patient differential omits numeric confidence (P2-02 Q7 / P2-04 AC2).
 */

export const REPORT_SCROLL_BUCKETS = [0, 25, 50, 75, 100] as const
export type ReportScrollBucket = (typeof REPORT_SCROLL_BUCKETS)[number]

export const REPORT_SECTION_IDS = [
  'assessment_and_plan',
  'differential',
  'soap',
  'red_flags',
] as const
export type ReportSectionId = (typeof REPORT_SECTION_IDS)[number]

export type TriageDisplayTier =
  | 'home'
  | 'telehealth'
  | 'urgent_care'
  | 'emergency_department'
  | 'call_911'
  | 'crisis_line'
  | 'unknown'

/** Patient-facing ordinal bands (CONTEXT §5 / P2-04 Q1). Never paint raw %. */
export type DifferentialOrdinal = 'most_likely' | 'possible' | 'less_likely'

export type LibertyMdDifferentialItem = {
  name: string
  description?: string
  reason?: string
  /** Present only when rank or confidence maps to a band (Q1). */
  ordinal?: DifferentialOrdinal
  /** Elevated seriousness signal (Q3). */
  isSerious?: boolean
  furtherInvestigations?: string[]
  symptomaticTreatment?: string[]
  supportiveTreatment?: string[]
}

export type LibertyMdSoapNote = {
  subjective?: string
  objective?: string
  assessment?: string
  plan?: string
}

export type LibertyMdAssessmentAndPlan = {
  assessment?: string
  plan: string[]
  selfCare: string[]
}

export type LibertyMdNormalizedReport = {
  headline?: string
  patientSummary?: string
  triageTier: TriageDisplayTier
  triageRaw?: string
  nextStep?: string
  assessmentAndPlan?: LibertyMdAssessmentAndPlan
  differentials: LibertyMdDifferentialItem[]
  soap?: LibertyMdSoapNote
  redFlags: string[]
}

const DOSING_LINE_RE =
  /\b\d+(\.\d+)?\s*(mg|mcg|µg|ug|g|ml|mL)\b|\b\d+\s*(tablet|capsule|puff|drop)s?\b|\b(take|dose)\s+\d+\b/i

const SERIOUS_ENUM = new Set(['moderate', 'high', 'critical', 'serious'])
const EMERGENCY_SERIOUS = new Set(['moderate', 'high', 'critical'])

function asOptionalText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function listFrom(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>
          return asOptionalText(record.text || record.content || record.item || record.label) || ''
        }
        return asOptionalText(item) || ''
      })
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/\n|;|\.\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function unwrapReportPayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {}
  const root = raw as Record<string, unknown>
  const nested = root.report || root.output
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>
  }
  return root
}

/** Map composer / guardrail care_setting → display tier (Q2). Never invent a tier. */
export function mapCareSettingToTriage(raw: unknown): TriageDisplayTier {
  const value = asOptionalText(raw)?.toLowerCase().replace(/[\s-]+/g, '_')
  if (!value) return 'unknown'
  switch (value) {
    case 'home':
    case 'home_care':
      return 'home'
    case 'telehealth':
    case 'tele_health':
      return 'telehealth'
    case 'urgent_care':
    case 'urgentcare':
      return 'urgent_care'
    case 'emergency_department':
    case 'emergency_room':
    case 'er':
      return 'emergency_department'
    case 'call_911':
    case 'emergency_services':
    case 'call_emergency_services':
      return 'call_911'
    case 'crisis_line':
    case 'crisis':
      return 'crisis_line'
    default:
      return 'unknown'
  }
}

export function isEmergencyTriageTier(tier: TriageDisplayTier): boolean {
  return tier === 'emergency_department' || tier === 'call_911'
}

/**
 * Parse confidence to [0,100]. Accepts number or `"70%"` / `"70"` strings.
 * Invalid → undefined (never invent a band).
 */
export function parseConfidenceScore(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 0 || value > 100) return undefined
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/%\s*$/, '')
    if (!trimmed) return undefined
    const n = Number(trimmed)
    if (!Number.isFinite(n) || n < 0 || n > 100) return undefined
    return n
  }
  return undefined
}

function parseRank(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim())
  }
  return undefined
}

/**
 * P2-04 Q1 · rank → bands; confidence fallback; omit if both missing.
 * Ties allowed (multiple Most likely OK). Never returns digits for UI paint.
 */
export function mapDifferentialOrdinal(input: {
  rank?: unknown
  confidence?: unknown
}): DifferentialOrdinal | undefined {
  const rank = parseRank(input.rank)
  if (rank !== undefined && rank >= 1 && rank <= 5) {
    if (rank === 1) return 'most_likely'
    if (rank <= 3) return 'possible'
    return 'less_likely'
  }
  const score = parseConfidenceScore(input.confidence)
  if (score === undefined) return undefined
  if (score >= 70) return 'most_likely'
  if (score >= 40) return 'possible'
  return 'less_likely'
}

/** P2-04 Q3 · seriousness from emergency / is_serious / seriousness|severity aliases. */
export function isDifferentialSerious(record: Record<string, unknown>): boolean {
  if (record.is_serious === true) return true
  const emergency = asOptionalText(record.emergency)?.toLowerCase()
  if (emergency && EMERGENCY_SERIOUS.has(emergency)) return true
  for (const key of ['seriousness', 'severity'] as const) {
    const value = asOptionalText(record[key])?.toLowerCase()
    if (value && SERIOUS_ENUM.has(value)) return true
  }
  return false
}

/** P2-04 Q6 · omit lines matching dosing heuristic; empty → []. */
export function omitDosingLines(lines: readonly string[]): string[] {
  return lines.filter((line) => !DOSING_LINE_RE.test(line))
}

function pickAliasList(record: Record<string, unknown>, keys: readonly string[]): string[] {
  for (const key of keys) {
    if (!(key in record) || record[key] == null) continue
    const filtered = omitDosingLines(listFrom(record[key]))
    if (filtered.length) return filtered
  }
  return []
}

function pickNextStep(data: Record<string, unknown>, ap: Record<string, unknown> | null): string | undefined {
  const when = asOptionalText(ap?.when_to_seek_care)
  if (when) return when
  const plan = listFrom(ap?.plan)
  if (plan[0]) return plan[0]
  const selfCare = listFrom(ap?.self_care)
  if (selfCare[0]) return selfCare[0]
  const topPlan = listFrom(data.plan || data.care_plan || data.recommendations)
  return topPlan[0]
}

function normalizeSoap(data: Record<string, unknown>): LibertyMdSoapNote | undefined {
  const soapRaw = data.soap_note || data.soap || data.SOAP
  if (!soapRaw || typeof soapRaw !== 'object' || Array.isArray(soapRaw)) return undefined
  const soap = soapRaw as Record<string, unknown>
  const subjective = asOptionalText(soap.subjective)
  const objective = asOptionalText(soap.objective)
  const assessment = asOptionalText(soap.assessment)
  const plan = asOptionalText(soap.plan)
  if (!subjective && !objective && !assessment && !plan) return undefined
  return { subjective, objective, assessment, plan }
}

function normalizeDifferentials(data: Record<string, unknown>): LibertyMdDifferentialItem[] {
  const list = Array.isArray(data.differential_diagnosis)
    ? data.differential_diagnosis
    : Array.isArray(data.diagnoses)
      ? data.diagnoses
      : []
  const out: LibertyMdDifferentialItem[] = []
  for (const item of list.slice(0, 5)) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    // P2-04 Q7 · common_name first for patient cards
    const name = asOptionalText(
      record.common_name || record.full_name || record.name || record.condition || record.diagnosis,
    )
    if (!name) continue
    const description = asOptionalText(record.description || record.summary)
    const reason = asOptionalText(record.reason || record.rationale || record.supporting_reason)
    const ordinal = mapDifferentialOrdinal({
      rank: record.rank,
      confidence: record.confidence,
    })
    const isSerious = isDifferentialSerious(record)
    const furtherInvestigations = pickAliasList(record, [
      'further_investigations',
      'investigations',
      'recommended_tests',
      'further_tests',
    ])
    const symptomaticTreatment = pickAliasList(record, [
      'symptomatic_treatment',
      'symptomatic',
      'symptom_relief',
    ])
    const supportiveTreatment = pickAliasList(record, [
      'supportive_treatment',
      'supportive',
      'supportive_care',
    ])
    out.push({
      name,
      ...(description ? { description } : {}),
      ...(reason ? { reason } : {}),
      ...(ordinal ? { ordinal } : {}),
      ...(isSerious ? { isSerious: true } : {}),
      ...(furtherInvestigations.length ? { furtherInvestigations } : {}),
      ...(symptomaticTreatment.length ? { symptomaticTreatment } : {}),
      ...(supportiveTreatment.length ? { supportiveTreatment } : {}),
    })
  }
  return out
}

/**
 * Normalize diagnosis/composer `report_data` into a renderable view model.
 * Omits missing sections; never invents clinical fallbacks (AC1/AC2).
 */
export function normalizeReportData(raw: unknown): LibertyMdNormalizedReport {
  const data = unwrapReportPayload(raw)
  const apRaw = data.assessment_and_plan
  const ap = apRaw && typeof apRaw === 'object' && !Array.isArray(apRaw)
    ? (apRaw as Record<string, unknown>)
    : null

  const triageSource =
    (data.triage && typeof data.triage === 'object' && !Array.isArray(data.triage)
      ? (data.triage as Record<string, unknown>).care_setting
      : undefined) ?? data.care_setting

  const triageRaw = asOptionalText(triageSource)
  const triageTier = mapCareSettingToTriage(triageSource)

  const assessmentText = asOptionalText(ap?.assessment)
  const planItems = listFrom(ap?.plan)
  const selfCareItems = listFrom(ap?.self_care)
  const topPlan = listFrom(data.plan || data.care_plan || data.recommendations)
  const hasApBody = Boolean(assessmentText || planItems.length || selfCareItems.length || (ap && topPlan.length))

  const assessmentAndPlan: LibertyMdAssessmentAndPlan | undefined = hasApBody
    ? {
        ...(assessmentText ? { assessment: assessmentText } : {}),
        plan: planItems.length ? planItems : (!ap && topPlan.length ? topPlan : planItems),
        selfCare: selfCareItems,
      }
    : undefined

  // If we only got top-level plan aliases and no assessment_and_plan object, still expose plan via A&P body.
  const resolvedAp =
    assessmentAndPlan
    || (topPlan.length
      ? { plan: topPlan, selfCare: [] as string[] }
      : undefined)

  const redFlags = listFrom(
    ap?.red_flags_to_watch || data.red_flags || data.warning_signs || data.seek_care_if,
  )

  const headline = asOptionalText(data.headline)
  const patientSummary = asOptionalText(
    data.patient_summary || data.summary || data.report_summary,
  )
  const nextStep = pickNextStep(data, ap)
  const soap = normalizeSoap(data)
  const differentials = normalizeDifferentials(data)

  return {
    ...(headline ? { headline } : {}),
    ...(patientSummary ? { patientSummary } : {}),
    triageTier,
    ...(triageRaw ? { triageRaw } : {}),
    ...(nextStep ? { nextStep } : {}),
    ...(resolvedAp ? { assessmentAndPlan: resolvedAp } : {}),
    differentials,
    ...(soap ? { soap } : {}),
    redFlags,
  }
}

/** Report scroll-depth percent from scroller geometry vs report root (Q5). */
export function reportScrollDepthPct(input: {
  scrollTop: number
  clientHeight: number
  reportOffsetTop: number
  reportHeight: number
}): number {
  const height = Math.max(0, Number(input.reportHeight) || 0)
  if (height <= 0) return 0
  const scrolled = Number(input.scrollTop) + Number(input.clientHeight) - Number(input.reportOffsetTop)
  const ratio = scrolled / height
  if (!Number.isFinite(ratio)) return 0
  return Math.max(0, Math.min(100, Math.round(ratio * 100)))
}

/** Buckets newly reached (monotonic) given prior emitted set and current pct. */
export function newlyReachedScrollBuckets(
  currentPct: number,
  alreadyEmitted: ReadonlySet<ReportScrollBucket>,
): ReportScrollBucket[] {
  const pct = Math.max(0, Math.min(100, Number(currentPct) || 0))
  const next: ReportScrollBucket[] = []
  for (const bucket of REPORT_SCROLL_BUCKETS) {
    if (pct >= bucket && !alreadyEmitted.has(bucket)) next.push(bucket)
  }
  return next
}

export function isReportSectionId(value: unknown): value is ReportSectionId {
  return typeof value === 'string' && (REPORT_SECTION_IDS as readonly string[]).includes(value)
}

// ─── P2-05 · Sticky gate + section expansion persistence (booleans only) ──────

/** Disable sticky when consult scroller clientHeight is below this (CSS px). */
export const LIBERTYMD_REPORT_STICKY_MIN_SCROLLER_PX = 500

export const REPORT_SECTIONS_PREFIX = 'libertymd:report-sections:'

export type ReportSectionOpenMap = Partial<Record<ReportSectionId, boolean>>

export type ReportSectionsRecord = {
  v: 1
  consultationId: string
  sections: ReportSectionOpenMap
}

/** Defaults: differential open; A&P / red_flags / soap closed (P2-03). */
export const DEFAULT_REPORT_SECTION_OPEN: Record<ReportSectionId, boolean> = {
  differential: true,
  assessment_and_plan: false,
  red_flags: false,
  soap: false,
}

export function reportSectionsKey(consultationId: string): string {
  return `${REPORT_SECTIONS_PREFIX}${consultationId}`
}

/** AC5 · pure height gate — scroller clientHeight (or window fallback upstream). */
export function shouldEnableReportSticky(clientHeight: number): boolean {
  const h = Number(clientHeight)
  if (!Number.isFinite(h)) return false
  return h >= LIBERTYMD_REPORT_STICKY_MIN_SCROLLER_PX
}

export function mergeReportSectionOpen(
  stored: ReportSectionOpenMap | null | undefined,
): Record<ReportSectionId, boolean> {
  const out: Record<ReportSectionId, boolean> = { ...DEFAULT_REPORT_SECTION_OPEN }
  if (!stored || typeof stored !== 'object') return out
  for (const id of REPORT_SECTION_IDS) {
    if (typeof stored[id] === 'boolean') out[id] = stored[id] as boolean
  }
  return out
}

type SectionStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Restore section map; unknown keys ignored; never reads clinical strings. */
export function readReportSections(
  consultationId: string,
  storage: SectionStorage,
): ReportSectionOpenMap | null {
  if (!consultationId) return null
  const raw = storage.getItem(reportSectionsKey(consultationId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ReportSectionsRecord>
    if (
      parsed?.v !== 1
      || parsed.consultationId !== consultationId
      || !parsed.sections
      || typeof parsed.sections !== 'object'
    ) {
      storage.removeItem(reportSectionsKey(consultationId))
      return null
    }
    const sections: ReportSectionOpenMap = {}
    for (const id of REPORT_SECTION_IDS) {
      if (typeof parsed.sections[id] === 'boolean') {
        sections[id] = parsed.sections[id]
      }
    }
    return sections
  } catch {
    storage.removeItem(reportSectionsKey(consultationId))
    return null
  }
}

/** Persist section booleans only — never triage/dx/SOAP body. */
export function writeReportSections(
  consultationId: string,
  sections: ReportSectionOpenMap,
  storage: SectionStorage,
): ReportSectionsRecord | null {
  if (!consultationId) return null
  const filtered: ReportSectionOpenMap = {}
  for (const id of REPORT_SECTION_IDS) {
    if (typeof sections[id] === 'boolean') filtered[id] = sections[id]
  }
  const payload: ReportSectionsRecord = {
    v: 1,
    consultationId,
    sections: filtered,
  }
  storage.setItem(reportSectionsKey(consultationId), JSON.stringify(payload))
  return payload
}

export function clearReportSections(consultationId: string, storage: SectionStorage): void {
  if (!consultationId) return
  storage.removeItem(reportSectionsKey(consultationId))
}
