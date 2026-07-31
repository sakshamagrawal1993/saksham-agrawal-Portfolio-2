/**
 * P2-04 — presentational per-diagnosis detail card (shared ReportView path).
 * Ordinal / seriousness / waitlist-honest CTA / collapsed treatment slots.
 * P2-11 — mode-aware doctor handoff CTA via shared LibertyMDDoctorHandoffCta.
 */
import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useI18n } from '../../i18n'
import { LibertyMDDoctorHandoffCta } from './LibertyMDDoctorHandoffCta'
import type { DoctorHandoffProminence } from './libertymd-doctor-cta-config'
import type { LibertyMdDifferentialItem, TriageDisplayTier } from './libertymd-report'

export type LibertyMDDiagnosisCardProps = {
  item: LibertyMdDifferentialItem
  /** Optional App tab-switch / Chat scroll. */
  onDoctorCta?: () => void
  /** When false, omit CTA (emergency / crisis hide). */
  showDoctorCta?: boolean
  triageTier?: TriageDisplayTier
  prominence?: DoctorHandoffProminence
  sessionKey?: string
}

const ORDINAL_BADGE_CLASS: Record<string, string> = {
  most_likely: 'border-libertymd-blue-600/30 bg-libertymd-blue-50 text-libertymd-blue-700',
  possible: 'border-libertymd-slate-300 bg-libertymd-slate-200 text-libertymd-slate-700',
  less_likely: 'border-libertymd-slate-300 bg-white text-libertymd-slate-500',
  most_likely_serious: 'border-amber-500/40 bg-amber-50 text-amber-900',
}

const SERIOUS_BADGE_CLASS =
  'border-amber-500/40 bg-amber-50 text-amber-900'

export function LibertyMDDiagnosisCard({
  item,
  onDoctorCta,
  showDoctorCta = true,
  triageTier = 'unknown',
  prominence,
  sessionKey,
}: LibertyMDDiagnosisCardProps) {
  const { t } = useI18n()
  const detailPanelId = useId()
  const [detailOpen, setDetailOpen] = useState(false)

  const why = item.reason || item.description
  const hasFurther = Boolean(item.furtherInvestigations?.length)
  const hasSymptomatic = Boolean(item.symptomaticTreatment?.length)
  const hasSupportive = Boolean(item.supportiveTreatment?.length)
  const hasTreatmentSlots = hasFurther || hasSymptomatic || hasSupportive
  const hasAnyTreatmentBody = hasSymptomatic || hasSupportive

  const ordinal = item.ordinal
  const isSerious = Boolean(item.isSerious)
  const composedMostLikelySerious = isSerious && ordinal === 'most_likely'
  const seriousPair = isSerious && ordinal !== undefined && ordinal !== 'most_likely'
  const seriousOnly = isSerious && ordinal === undefined
  const renderCta = showDoctorCta && Boolean(onDoctorCta)

  return (
    <article
      data-libertymd-diagnosis-card
      data-ordinal={ordinal ?? 'none'}
      data-serious={isSerious ? 'true' : 'false'}
      data-badge-pair={
        composedMostLikelySerious
          ? 'most-likely-serious'
          : seriousPair
            ? 'serious-less-likely'
            : 'none'
      }
      className="rounded-md border border-libertymd-slate-200 bg-white px-3 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        {composedMostLikelySerious ? (
          <span
            data-ordinal-badge="most_likely_serious"
            data-confidence-badge="most_likely_serious"
            className={`libertymd-type-label inline-flex max-w-full rounded-md border px-2 py-0.5 font-bold ${ORDINAL_BADGE_CLASS.most_likely_serious}`}
          >
            {t('report.card.ordinal.most_likely_serious')}
          </span>
        ) : null}

        {!composedMostLikelySerious && ordinal ? (
          <span
            data-ordinal-badge={ordinal}
            data-confidence-badge={ordinal}
            className={`libertymd-type-label inline-flex max-w-full rounded-md border px-2 py-0.5 font-bold ${ORDINAL_BADGE_CLASS[ordinal]}`}
          >
            {t(`report.card.ordinal.${ordinal}`)}
          </span>
        ) : null}

        {(seriousPair || seriousOnly) ? (
          <span
            data-serious-badge
            className={`libertymd-type-label inline-flex max-w-full rounded-md border px-2 py-0.5 font-bold ${SERIOUS_BADGE_CLASS}`}
          >
            {t('report.card.serious')}
          </span>
        ) : null}
      </div>

      <p className="libertymd-type-body-small mt-[var(--libertymd-space-xs)] font-bold text-libertymd-ink">
        {item.name}
      </p>

      {why ? (
        <p className="libertymd-type-body-small mt-1 text-libertymd-slate-500" data-diagnosis-why>
          {why}
        </p>
      ) : null}

      {hasTreatmentSlots ? (
        <div className="mt-[var(--libertymd-space-sm)]">
          <button
            type="button"
            className="libertymd-type-label flex min-h-11 w-full items-center justify-between gap-2 text-left font-semibold text-libertymd-blue-700"
            aria-expanded={detailOpen}
            aria-controls={detailPanelId}
            data-diagnosis-detail-toggle
            onClick={() => setDetailOpen((open) => !open)}
          >
            <span>{detailOpen ? t('report.card.hideDetail') : t('report.card.showDetail')}</span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${detailOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          {detailOpen ? (
            <div
              id={detailPanelId}
              data-diagnosis-detail
              className="mt-[var(--libertymd-space-xs)] space-y-3 border-t border-libertymd-slate-200 pt-[var(--libertymd-space-sm)]"
            >
              {hasAnyTreatmentBody ? (
                <p
                  className="libertymd-type-label font-semibold text-libertymd-slate-500"
                  data-treatment-guidance
                >
                  {t('report.card.treatmentGuidance')}
                </p>
              ) : null}
              {hasFurther ? (
                <SlotList
                  label={t('report.card.furtherInvestigations')}
                  items={item.furtherInvestigations!}
                  slot="further_investigations"
                />
              ) : null}
              {hasSymptomatic ? (
                <SlotList
                  label={t('report.card.symptomaticTreatment')}
                  items={item.symptomaticTreatment!}
                  slot="symptomatic_treatment"
                />
              ) : null}
              {hasSupportive ? (
                <SlotList
                  label={t('report.card.supportiveTreatment')}
                  items={item.supportiveTreatment!}
                  slot="supportive_treatment"
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {renderCta ? (
        <LibertyMDDoctorHandoffCta
          triageTier={triageTier}
          position="card"
          sessionKey={sessionKey}
          prominence={prominence}
          onClick={() => onDoctorCta?.()}
        />
      ) : null}
    </article>
  )
}

function SlotList({
  label,
  items,
  slot,
}: {
  label: string
  items: string[]
  slot: string
}) {
  return (
    <div data-diagnosis-slot={slot}>
      <p className="libertymd-type-label font-bold uppercase text-libertymd-slate-500">{label}</p>
      <ul className="libertymd-type-body-small mt-1 list-disc space-y-1 pl-5 text-libertymd-slate-700">
        {items.map((line, index) => (
          <li key={`${slot}-${index}`}>{line}</li>
        ))}
      </ul>
    </div>
  )
}
