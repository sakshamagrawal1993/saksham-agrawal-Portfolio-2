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
