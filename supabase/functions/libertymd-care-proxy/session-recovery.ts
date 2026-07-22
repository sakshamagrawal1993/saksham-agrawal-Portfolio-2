export type LibertyMDResumableStatus = 'awaiting_demographics' | 'interviewing' | 'high_risk'

interface RecoveryStateInput {
  abandoned_from_status?: unknown
  filled_slots?: unknown
  safety_state?: unknown
}

const RESUMABLE_STATUSES = new Set<LibertyMDResumableStatus>([
  'awaiting_demographics',
  'interviewing',
  'high_risk',
])

export function isLibertyMDResumableStatus(value: unknown): value is LibertyMDResumableStatus {
  return typeof value === 'string' && RESUMABLE_STATUSES.has(value as LibertyMDResumableStatus)
}

export function resolveLibertyMDResumeStatus(input: RecoveryStateInput): LibertyMDResumableStatus {
  if (isLibertyMDResumableStatus(input.abandoned_from_status)) {
    return input.abandoned_from_status
  }

  const slots = input.filled_slots && typeof input.filled_slots === 'object'
    ? input.filled_slots as Record<string, unknown>
    : {}
  const safetyState = input.safety_state && typeof input.safety_state === 'object'
    ? input.safety_state as Record<string, unknown>
    : {}
  const hasDemographics = Number.isInteger(Number(slots.age))
    && typeof slots.sex_at_birth === 'string'
    && slots.sex_at_birth.length > 0

  if (!hasDemographics) return 'awaiting_demographics'
  if (safetyState.status === 'high_risk_continue') return 'high_risk'
  return 'interviewing'
}
