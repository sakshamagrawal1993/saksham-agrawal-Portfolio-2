/**
 * P3-05 — closed landing complaint-chip catalog (plain-language only).
 * Labels are the opening chief_complaint text. Never put labels on Mixpanel.
 * Server CHIP_IDS in start-consultation must stay set-equal (asserted in tests).
 */

export const LIBERTYMD_COMPLAINT_CHIPS = [
  { chip_id: 'sore_throat', label: 'Sore throat' },
  { chip_id: 'cough', label: 'Cough' },
  { chip_id: 'fever', label: 'Fever' },
  { chip_id: 'headache', label: 'Headache' },
  { chip_id: 'stomach_pain', label: 'Stomach pain' },
  { chip_id: 'rash', label: 'Rash' },
] as const

export type LibertyMdComplaintChipId = (typeof LIBERTYMD_COMPLAINT_CHIPS)[number]['chip_id']

export const LIBERTYMD_COMPLAINT_CHIP_IDS: ReadonlySet<LibertyMdComplaintChipId> = new Set(
  LIBERTYMD_COMPLAINT_CHIPS.map((chip) => chip.chip_id),
)

/** Diagnosis-style strings must never appear as chip labels (AC4). */
export const LIBERTYMD_COMPLAINT_CHIP_DIAGNOSIS_BAN = [
  'strep',
  'migraine',
  'uti',
  'covid',
  'flu',
  'pneumonia',
] as const

export function isLibertyMdComplaintChipId(value: string): value is LibertyMdComplaintChipId {
  return LIBERTYMD_COMPLAINT_CHIP_IDS.has(value as LibertyMdComplaintChipId)
}
