/**
 * Clinical slot vocabulary, slot sanitisation and missing-slot computation.
 *
 * Moved verbatim from index.ts in L0-5 (pure structural refactor).
 * Lane A owns this module.
 *
 * Note: `missing_slots` is recomputed here authoritatively — the proxy, not
 * n8n, decides what is still outstanding.
 */
import type { JsonObject } from './types.ts'

export const CLINICAL_SLOTS = [
  'chief_complaint',
  'onset',
  'duration',
  'severity',
  'location',
  'character',
  'associated_symptoms',
  'red_flag_negatives',
  'functional_impact',
  'relevant_history',
  'medications',
  'allergies',
  'pregnancy_status',
] as const

export const CORE_SLOTS = [
  'onset',
  'duration',
  'severity',
  'associated_symptoms',
  'red_flag_negatives',
  'relevant_history',
]

export function sanitizeSlotUpdates(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const source = value as JsonObject
  const output: JsonObject = {}
  for (const slot of CLINICAL_SLOTS) {
    const item = source[slot]
    if (item === undefined || item === null || item === '') continue
    if (typeof item === 'string') output[slot] = item.slice(0, 1000)
    else if (typeof item === 'number' || typeof item === 'boolean') output[slot] = item
    else if (Array.isArray(item)) output[slot] = item.map(String).filter(Boolean).slice(0, 20)
  }
  return output
}

const TIMING_SLOTS = ['onset', 'duration'] as const

const TIMING_PATTERN_ONLY = /\b(comes?\s+and\s+goes?|on\s+and\s+off|intermittent(?:ly)?|constant(?:ly)?|va\s+y\s+viene|intermitente|constante|aata\s+jaata|kabhi\s+kabhi|lagatar|va\s+et\s+vient|kommt\s+und\s+geht|zeitweise|vai\s+e\s+volta)\b/i
const EXPLICIT_TIMING_ANCHOR = /(?:\d|\b(today|yesterday|tomorrow|ago|since|for|started|began|last\s+(?:night|week|month|year)|hoy|ayer|desde|durante|empez[oó]|comenz[oó]|aaj|kal|parso|se|shuru|aujourd'hui|hier|depuis|pendant|commenc[ée]|heute|gestern|seit|begann|hoje|ontem|h[aá]|come[çc]ou)\b)/i
const UNCERTAIN_TIMING = /\b(unknown|uncertain|unsure|not sure|cannot reliably|contradict|unclear|unspecified|maybe yes|maybe no)\b/i

function hasStoredSlotValue(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

/** Pattern/frequency alone is not onset or elapsed duration. */
export function isUsableTimingSlotValue(value: unknown): boolean {
  if (!hasStoredSlotValue(value)) return false
  const values = Array.isArray(value) ? value : [value]
  return values.some((item) => {
    const text = String(item).trim()
    if (!text) return false
    if (UNCERTAIN_TIMING.test(text)) return false
    return !TIMING_PATTERN_ONLY.test(text) || EXPLICIT_TIMING_ANCHOR.test(text)
  })
}

/**
 * Apply Interview slot updates without letting an incidental timing answer
 * replace an onset/duration that the patient already established.
 *
 * Onset and duration may legitimately contain the same value for an acute
 * illness ("started four days ago" / "for four days"). Equality is therefore
 * never treated as an error. The invariant is about provenance: normal turns
 * may fill an empty timing field, while only the explicit comprehension-
 * correction path may replace an existing one.
 */
export function mergeClinicalSlotUpdates(
  existingSlots: JsonObject,
  proposedUpdates: unknown,
  options: { allowTimingOverwrite?: boolean } = {},
): { slots: JsonObject; appliedUpdates: JsonObject } {
  const appliedUpdates = sanitizeSlotUpdates(proposedUpdates)
  for (const slot of TIMING_SLOTS) {
    if (!isUsableTimingSlotValue(appliedUpdates[slot])) {
      delete appliedUpdates[slot]
      continue
    }
    if (!options.allowTimingOverwrite && hasStoredSlotValue(existingSlots[slot])) {
      delete appliedUpdates[slot]
    }
  }

  return {
    slots: { ...existingSlots, ...appliedUpdates },
    appliedUpdates,
  }
}

export function calculateMissingSlots(slots: JsonObject) {
  const hasOnset = slots.onset != null && String(slots.onset).trim() !== ''
  const hasDuration = slots.duration != null && String(slots.duration).trim() !== ''

  return CORE_SLOTS.filter((slot) => {
    // If onset is filled, consider duration satisfied (and vice versa) to prevent duplicate duration questions
    if (slot === 'duration' && (hasDuration || hasOnset)) return false
    if (slot === 'onset' && (hasOnset || hasDuration)) return false

    const value = slots[slot]
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
  })
}
