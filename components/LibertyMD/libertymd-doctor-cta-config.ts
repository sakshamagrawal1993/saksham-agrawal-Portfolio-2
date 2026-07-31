/**
 * P2-11 — doctor handoff CTA mode + claim-gate stubs (client Vite flags).
 *
 * Modes: waitlist (default) | booking. Claim lines independently gated;
 * P2-15 owns payment / refund / availability mechanisms. Mock roster stays
 * unreachable until a real booking-live signal (default false).
 */
import {
  isEmergencyTriageTier,
  type TriageDisplayTier,
} from './libertymd-report'

export type DoctorCtaMode = 'waitlist' | 'booking'

export type DoctorCtaClaimStrings = {
  /** Approved pilot price label — from config, never sole hardcode in CTA JSX. */
  priceLabel: string
  /** Approved availability phrasing — from config. */
  availabilityLabel: string
  /** Approved refund phrasing — from config. */
  refundLabel: string
}

export type DoctorCtaConfig = {
  mode: DoctorCtaMode
  paymentLive: boolean
  refundLive: boolean
  availabilityLive: boolean
  /**
   * Real booking-handoff signal (P2-15). Default false.
   * Fake roster / Start visit remain unreachable until this is true.
   */
  bookingLive: boolean
  claims: DoctorCtaClaimStrings
}

export type DoctorHandoffProminence = 'optional' | 'recommended'

export type DoctorCtaPosition = 'footer' | 'card'

type EnvLike = Record<string, unknown> | undefined | null

function envBool(raw: unknown): boolean {
  if (raw === true || raw === 1) return true
  if (typeof raw !== 'string') return false
  const v = raw.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

function envString(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const trimmed = raw.trim()
  return trimmed || fallback
}

/** Read Vite `VITE_LIBERTYMD_*` doctor CTA flags. Defaults: waitlist + all live=false. */
export function readDoctorCtaConfig(env?: EnvLike): DoctorCtaConfig {
  const source =
    env ??
    (typeof import.meta !== 'undefined'
      ? ((import.meta as { env?: EnvLike }).env ?? {})
      : {})
  const rawMode = String(source.VITE_LIBERTYMD_DOCTOR_CTA_MODE || 'waitlist')
    .trim()
    .toLowerCase()
  const mode: DoctorCtaMode = rawMode === 'booking' ? 'booking' : 'waitlist'
  return {
    mode,
    paymentLive: envBool(source.VITE_LIBERTYMD_PAYMENT_LIVE),
    refundLive: envBool(source.VITE_LIBERTYMD_REFUND_LIVE),
    availabilityLive: envBool(source.VITE_LIBERTYMD_AVAILABILITY_LIVE),
    bookingLive: envBool(source.VITE_LIBERTYMD_BOOKING_LIVE),
    claims: {
      priceLabel: envString(source.VITE_LIBERTYMD_CLAIM_PRICE, '$39'),
      availabilityLabel: envString(
        source.VITE_LIBERTYMD_CLAIM_AVAILABILITY,
        'within 30 minutes',
      ),
      refundLabel: envString(source.VITE_LIBERTYMD_CLAIM_REFUND, 'full refund'),
    },
  }
}

/** Hide handoff on emergency / crisis — never upsell over 911/988. */
export function shouldShowDoctorHandoff(tier: TriageDisplayTier): boolean {
  return !isEmergencyTriageTier(tier) && tier !== 'crisis_line'
}

/** home/unknown → optional; telehealth/urgent → recommended. */
export function doctorHandoffProminence(tier: TriageDisplayTier): DoctorHandoffProminence {
  if (tier === 'telehealth' || tier === 'urgent_care') return 'recommended'
  return 'optional'
}

/**
 * Mock Elena/Rajiv/Barry roster is unreachable until a real booking-live signal.
 * This ticket never renders that roster — even in booking mode with zero claims.
 */
export function isMockDoctorRosterReachable(config: DoctorCtaConfig): boolean {
  return config.mode === 'booking' && config.bookingLive === true
}
