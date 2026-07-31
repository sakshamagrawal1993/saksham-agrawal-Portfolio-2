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
export const COMPREHENSION_SLOT_LABELS: Record<(typeof CLINICAL_SLOTS)[number], string> = {
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
}

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
export function buildComprehensionSummary(filledSlots: JsonObject | null | undefined): ComprehensionSummaryLine[] {
  const slots = filledSlots && typeof filledSlots === 'object' && !Array.isArray(filledSlots)
    ? filledSlots
    : {}
  const lines: ComprehensionSummaryLine[] = []
  for (const slot of CLINICAL_SLOTS) {
    const raw = slots[slot]
    if (!hasPresentValue(raw)) continue
    lines.push({
      slot,
      label: COMPREHENSION_SLOT_LABELS[slot],
      value: formatSlotValue(raw).slice(0, 1000),
    })
  }
  return lines
}

export function buildComprehensionCheckPayload(
  filledSlots: JsonObject | null | undefined,
): ComprehensionCheckPayload {
  const summary_lines = buildComprehensionSummary(filledSlots)
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
