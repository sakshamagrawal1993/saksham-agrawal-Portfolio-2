/**
 * P1-14 — Comprehension check (pre-Diagnosis slots echo).
 *
 * Pure helper: summary lines from `filled_slots` only. Never invents clinical
 * negatives for empty optionals. Never calls n8n.
 *
 * Patient-facing labels / confirm framing → **REQUIRES EXPERT REVIEW**.
 * Engineering Done ≠ clinical approval (same posture as P0-17 / P1-09).
 */
import { CLINICAL_SLOTS } from './slots.ts'
import { asClinicalLanguage, type ClinicalLanguage } from './journey-locale.ts'
import type { JsonObject } from './types.ts'

/** Non-open-ended continue fallback — retires Gap 5 "anything else…?" confirm UX. */
export const CONTINUE_EMPTY_QUESTION_FALLBACK =
  'Could you tell me what has changed since the symptom began?'

/**
 * Brief bridge when the gate opens and the sheet is pending.
 * Not an open-ended confirm question. **REQUIRES EXPERT REVIEW.**
 */
export const COMPREHENSION_BRIDGE_MESSAGE =
  'I have summarised what you have shared so far. Please check the summary.'

const WORKFLOW_COMPLETED_KEY = 'comprehension_completed'
const WORKFLOW_PENDING_KEY = 'comprehension_pending'

/**
 * Provisional echo labels — slots vocabulary only.
 * **REQUIRES EXPERT REVIEW** before clinical release.
 */
type ClinicalSlot = (typeof CLINICAL_SLOTS)[number]
type ComprehensionSlotLabels = Record<ClinicalSlot, string>

/**
 * Complete patient-facing labels for every language the clinical journey can
 * persist. Spanish regional chrome variants normalize to `es`.
 */
export const COMPREHENSION_SLOT_LABELS_BY_LANGUAGE: Record<
  ClinicalLanguage,
  ComprehensionSlotLabels
> = {
  en: {
    chief_complaint: 'Main concern',
    onset: 'When it started',
    duration: 'How long it has lasted',
    severity: 'How severe it feels',
    location: 'Where it is',
    character: 'What it feels like',
    associated_symptoms: 'Other symptoms',
    red_flag_negatives: 'Warning signs checked',
    functional_impact: 'How it affects daily life',
    relevant_history: 'Relevant history',
    medications: 'Medications',
    allergies: 'Allergies',
    pregnancy_status: 'Pregnancy status',
  },
  es: {
    chief_complaint: 'Motivo principal de consulta',
    onset: 'Cuándo comenzó',
    duration: 'Duración de los síntomas',
    severity: 'Intensidad / Gravedad',
    location: 'Ubicación',
    character: 'Características del síntoma',
    associated_symptoms: 'Otros síntomas asociados',
    red_flag_negatives: 'Signos de alarma evaluados',
    functional_impact: 'Impacto en la vida diaria',
    relevant_history: 'Antecedentes médicos',
    medications: 'Medicamentos actuales',
    allergies: 'Alergias',
    pregnancy_status: 'Estado de embarazo',
  },
  hi: {
    chief_complaint: 'मुख्य समस्या',
    onset: 'यह कब शुरू हुई',
    duration: 'यह कितने समय से है',
    severity: 'समस्या कितनी गंभीर है',
    location: 'समस्या कहाँ है',
    character: 'यह कैसा महसूस होता है',
    associated_symptoms: 'साथ में अन्य लक्षण',
    red_flag_negatives: 'जाँचे गए चेतावनी संकेत',
    functional_impact: 'रोज़मर्रा के जीवन पर असर',
    relevant_history: 'प्रासंगिक चिकित्सा इतिहास',
    medications: 'दवाइयाँ',
    allergies: 'एलर्जी',
    pregnancy_status: 'गर्भावस्था की स्थिति',
  },
  'hi-Latn': {
    chief_complaint: 'Mukhya pareshaani',
    onset: 'Yeh kab shuru hui',
    duration: 'Yeh kitne samay se hai',
    severity: 'Pareshaani kitni zyada hai',
    location: 'Pareshaani kahan hai',
    character: 'Yeh kaisa mehsoos hota hai',
    associated_symptoms: 'Saath ke doosre symptoms',
    red_flag_negatives: 'Check kiye gaye warning signs',
    functional_impact: 'Rozmarra ki zindagi par asar',
    relevant_history: 'Zaroori medical history',
    medications: 'Dawaaiyan',
    allergies: 'Allergies',
    pregnancy_status: 'Pregnancy status',
  },
  fr: {
    chief_complaint: 'Motif principal',
    onset: 'Début des symptômes',
    duration: 'Durée des symptômes',
    severity: 'Intensité des symptômes',
    location: 'Localisation',
    character: 'Nature des symptômes',
    associated_symptoms: 'Autres symptômes',
    red_flag_negatives: 'Signes d’alerte vérifiés',
    functional_impact: 'Impact sur la vie quotidienne',
    relevant_history: 'Antécédents médicaux pertinents',
    medications: 'Médicaments',
    allergies: 'Allergies',
    pregnancy_status: 'Statut de grossesse',
  },
  de: {
    chief_complaint: 'Hauptbeschwerde',
    onset: 'Beginn der Beschwerden',
    duration: 'Dauer der Beschwerden',
    severity: 'Stärke der Beschwerden',
    location: 'Ort der Beschwerden',
    character: 'Art der Beschwerden',
    associated_symptoms: 'Weitere Symptome',
    red_flag_negatives: 'Geprüfte Warnzeichen',
    functional_impact: 'Auswirkung auf den Alltag',
    relevant_history: 'Relevante Krankengeschichte',
    medications: 'Medikamente',
    allergies: 'Allergien',
    pregnancy_status: 'Schwangerschaftsstatus',
  },
  pt: {
    chief_complaint: 'Queixa principal',
    onset: 'Quando começou',
    duration: 'Duração dos sintomas',
    severity: 'Intensidade dos sintomas',
    location: 'Localização',
    character: 'Como é o sintoma',
    associated_symptoms: 'Outros sintomas',
    red_flag_negatives: 'Sinais de alerta verificados',
    functional_impact: 'Impacto na vida diária',
    relevant_history: 'Histórico médico relevante',
    medications: 'Medicamentos',
    allergies: 'Alergias',
    pregnancy_status: 'Estado de gravidez',
  },
}

/** Backwards-compatible aliases for callers/tests that consume one map. */
export const COMPREHENSION_SLOT_LABELS = COMPREHENSION_SLOT_LABELS_BY_LANGUAGE.en
export const COMPREHENSION_SLOT_LABELS_ES = COMPREHENSION_SLOT_LABELS_BY_LANGUAGE.es

export interface ComprehensionSummaryLine {
  /** Clinical slot key — categorical; safe for optional telemetry counts. */
  slot: string
  /** Provisional patient-facing label — REQUIRES EXPERT REVIEW. */
  label: string
  /** Echo of the stored slot value only — never invented. */
  value: string
}

export interface ComprehensionCheckPayload {
  summary_lines: ComprehensionSummaryLine[]
  pending: true
  /** Categorical count of echoed slots — no PHI. */
  slot_count: number
}

function hasPresentValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  if (Array.isArray(value)) return value.map(String).filter(Boolean).length > 0
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number' || typeof value === 'boolean') return true
  return false
}

function formatSlotValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(', ')
  if (typeof value === 'string') return value.trim()
  return String(value)
}

/**
 * Deterministic slots → summary. Empty optionals are omitted (never "no fever").
 */
export function buildComprehensionSummary(filledSlots: JsonObject | null | undefined, language?: string): ComprehensionSummaryLine[] {
  const labels = COMPREHENSION_SLOT_LABELS_BY_LANGUAGE[asClinicalLanguage(language)]
  const slots = filledSlots && typeof filledSlots === 'object' && !Array.isArray(filledSlots)
    ? filledSlots
    : {}
  const lines: ComprehensionSummaryLine[] = []
  for (const slot of CLINICAL_SLOTS) {
    const raw = slots[slot]
    if (!hasPresentValue(raw)) continue
    lines.push({
      slot,
      label: labels[slot],
      value: formatSlotValue(raw).slice(0, 1000),
    })
  }
  return lines
}

export function buildComprehensionCheckPayload(
  filledSlots: JsonObject | null | undefined,
  language?: string,
): ComprehensionCheckPayload {
  const summary_lines = buildComprehensionSummary(filledSlots, language)
  return {
    summary_lines,
    pending: true,
    slot_count: summary_lines.length,
  }
}

export function isComprehensionCompleted(workflowVersions: JsonObject | null | undefined): boolean {
  const wv = workflowVersions && typeof workflowVersions === 'object' ? workflowVersions : {}
  return wv[WORKFLOW_COMPLETED_KEY] === true
}

export function withComprehensionPending(workflowVersions: JsonObject | null | undefined): JsonObject {
  return {
    ...(workflowVersions && typeof workflowVersions === 'object' ? workflowVersions : {}),
    [WORKFLOW_PENDING_KEY]: true,
  }
}

export function withComprehensionCompleted(workflowVersions: JsonObject | null | undefined): JsonObject {
  return {
    ...(workflowVersions && typeof workflowVersions === 'object' ? workflowVersions : {}),
    [WORKFLOW_COMPLETED_KEY]: true,
    [WORKFLOW_PENDING_KEY]: false,
  }
}

/** Read non-PHI ack / correction flags from a send_message body (no types.ts widen). */
export function readComprehensionFlags(payload: unknown): {
  comprehensionAck: boolean
  comprehensionCorrection: boolean
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { comprehensionAck: false, comprehensionCorrection: false }
  }
  const record = payload as JsonObject
  return {
    comprehensionAck: record.comprehension_ack === true,
    comprehensionCorrection: record.comprehension_correction === true,
  }
}
