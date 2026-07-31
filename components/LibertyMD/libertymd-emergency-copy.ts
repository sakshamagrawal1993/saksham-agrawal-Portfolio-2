/**
 * P3-08 · Demoted EN P0-17 fixture helper (NOT patient-facing SoT).
 *
 * Production emergency chrome must display `emergency_copy` returned by
 * `libertymd-care-proxy` (force_end + get_consultation reopen). This module
 * remains only as:
 *   - hermetic / parity test fixture (byte-identical to proxy fixture)
 *   - last-resort client fail-open if the proxy omitted `emergency_copy`
 *
 * REQUIRES EXPERT REVIEW: engineering fixture ≠ clinical approval.
 *
 * BO 2026-07-31 · P0-17: shared heading; medical → 911 only; SI → 988 only.
 */

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

export interface LibertyMdEmergencyCopyVariant {
  crisisType: ClinicalCrisisType | 'generic_medical'
  heading: string
  standingInstruction: string
  detail: string
  clinicianReview: {
    status: 'pending'
    note: string
  }
}

/** Wire shape from proxy `emergency_copy` (force_end + reopen). */
export interface LibertyMdEmergencyCopyWire {
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

export const EMERGENCY_COPY_BY_CRISIS_TYPE: Readonly<Record<ClinicalCrisisType, LibertyMdEmergencyCopyVariant>> = {
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

export const GENERIC_MEDICAL_COPY: LibertyMdEmergencyCopyVariant = {
  crisisType: 'generic_medical',
  heading: EMERGENCY_SHARED_HEADING,
  standingInstruction: MEDICAL_STANDING,
  detail:
    'These symptoms may be a medical emergency. Call 911 or go to the nearest emergency department now.',
  clinicianReview: PENDING,
}

export function normalizeCrisisTypeKey(crisisType: unknown): string {
  if (crisisType === null || crisisType === undefined) return ''
  return String(crisisType).trim().toLowerCase()
}

export function isClinicalCrisisType(value: string): value is ClinicalCrisisType {
  return (CLINICAL_CRISIS_TYPES as readonly string[]).includes(value)
}

/**
 * Fixture-only resolver. Prefer proxy `emergency_copy` in UI; call this only as
 * last-resort fail-open when the wire object is absent.
 */
export function resolveLibertyMdEmergencyCopy(crisisType: unknown): LibertyMdEmergencyCopyVariant {
  const key = normalizeCrisisTypeKey(crisisType)
  if (isClinicalCrisisType(key)) return EMERGENCY_COPY_BY_CRISIS_TYPE[key]
  return GENERIC_MEDICAL_COPY
}

/** Prefer proxy wire; never render a raw key. */
export function pickEmergencyCopyForDisplay(
  wire: LibertyMdEmergencyCopyWire | null | undefined,
  crisisType: unknown,
): { heading: string; standingInstruction: string; detail: string; crisis_type: string } {
  if (
    wire
    && typeof wire.heading === 'string' && wire.heading.trim()
    && typeof wire.standingInstruction === 'string' && wire.standingInstruction.trim()
    && typeof wire.detail === 'string' && wire.detail.trim()
  ) {
    return {
      heading: wire.heading,
      standingInstruction: wire.standingInstruction,
      detail: wire.detail,
      crisis_type: String(wire.crisis_type || crisisType || ''),
    }
  }
  const fixture = resolveLibertyMdEmergencyCopy(crisisType)
  return {
    heading: fixture.heading,
    standingInstruction: fixture.standingInstruction,
    detail: fixture.detail,
    crisis_type: String(crisisType || fixture.crisisType),
  }
}

export function emergencyCopyFromPayload(payload: unknown): LibertyMdEmergencyCopyWire | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const top = record.emergency_copy
  if (top && typeof top === 'object') {
    const copy = top as Record<string, unknown>
    if (typeof copy.heading === 'string' && typeof copy.standingInstruction === 'string' && typeof copy.detail === 'string') {
      return {
        heading: copy.heading,
        standingInstruction: copy.standingInstruction,
        detail: copy.detail,
        crisis_type: String(copy.crisis_type || ''),
      }
    }
  }
  const safety = record.safety && typeof record.safety === 'object'
    ? record.safety as Record<string, unknown>
    : null
  const nested = safety?.emergency_copy
  if (nested && typeof nested === 'object') {
    const copy = nested as Record<string, unknown>
    if (typeof copy.heading === 'string' && typeof copy.standingInstruction === 'string' && typeof copy.detail === 'string') {
      return {
        heading: copy.heading,
        standingInstruction: copy.standingInstruction,
        detail: copy.detail,
        crisis_type: String(copy.crisis_type || ''),
      }
    }
  }
  return null
}
