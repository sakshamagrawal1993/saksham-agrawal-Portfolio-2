/**
 * P2-11 — compact doctor handoff CTA (footer + per-card).
 * Modes waitlist | booking via config. Emits Spec Mixpanel names only.
 */
import { useEffect } from 'react'
import { useI18n } from '../../i18n'
import {
  emitDoctorCtaClicked,
  emitDoctorCtaViewed,
} from './libertymd-analytics'
import {
  doctorHandoffProminence,
  readDoctorCtaConfig,
  type DoctorCtaPosition,
  type DoctorHandoffProminence,
} from './libertymd-doctor-cta-config'
import type { TriageDisplayTier } from './libertymd-report'

export type LibertyMDDoctorHandoffCtaProps = {
  triageTier: TriageDisplayTier
  position: DoctorCtaPosition
  /** Opaque consult / report-session key for once-per-position viewed. */
  sessionKey?: string
  onClick?: () => void
  /** Override prominence; default from triage tier. */
  prominence?: DoctorHandoffProminence
  /** Optional className merge. */
  className?: string
  /** Test / Storybook config override. */
  configOverride?: ReturnType<typeof readDoctorCtaConfig>
}

export function LibertyMDDoctorHandoffCta({
  triageTier,
  position,
  sessionKey,
  onClick,
  prominence: prominenceProp,
  className = '',
  configOverride,
}: LibertyMDDoctorHandoffCtaProps) {
  const { t } = useI18n()
  const config = configOverride ?? readDoctorCtaConfig()
  const prominence = prominenceProp ?? doctorHandoffProminence(triageTier)
  const label =
    config.mode === 'booking'
      ? t('report.doctor.ctaBooking')
      : t('report.doctor.ctaWaitlist')

  useEffect(() => {
    emitDoctorCtaViewed({
      triage_tier: triageTier,
      cta_mode: config.mode,
      position,
      session_key: sessionKey,
    })
  }, [triageTier, config.mode, position, sessionKey])

  const recommended = prominence === 'recommended'
  const baseClass =
    position === 'footer'
      ? recommended
        ? 'w-max rounded-full bg-libertymd-blue-600 px-[var(--libertymd-space-lg)] py-[var(--libertymd-space-sm)] libertymd-type-body-small font-bold text-white hover:bg-libertymd-blue-700'
        : 'w-max rounded-full border border-libertymd-slate-300 bg-white px-[var(--libertymd-space-lg)] py-[var(--libertymd-space-sm)] libertymd-type-body-small font-bold text-libertymd-ink hover:bg-libertymd-slate-200'
      : recommended
        ? 'libertymd-type-body-small mt-[var(--libertymd-space-sm)] min-h-11 w-full rounded-md border border-libertymd-blue-600 bg-libertymd-blue-600 px-3 py-2 font-bold text-white hover:bg-libertymd-blue-700'
        : 'libertymd-type-body-small mt-[var(--libertymd-space-sm)] min-h-11 w-full rounded-md border border-libertymd-slate-300 bg-libertymd-slate-200 px-3 py-2 font-bold text-libertymd-ink hover:bg-libertymd-slate-300'

  return (
    <button
      type="button"
      data-libertymd-doctor-handoff-cta=""
      data-diagnosis-doctor-cta={position === 'card' ? '' : undefined}
      data-cta-mode={config.mode}
      data-cta-position={position}
      data-cta-prominence={prominence}
      className={`${baseClass} ${className}`.trim()}
      onClick={() => {
        emitDoctorCtaClicked({
          triage_tier: triageTier,
          cta_mode: config.mode,
          position,
        })
        onClick?.()
      }}
    >
      {label}
    </button>
  )
}
