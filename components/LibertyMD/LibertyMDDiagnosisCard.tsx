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
import {
  formatClinicalBullets,
  type LibertyMdDifferentialItem,
  type TriageDisplayTier,
} from './libertymd-report'

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

// Color coded confidence badges (right aligned): green for high, amber for medium, slate for low/minimal
const ORDINAL_BADGE_CLASS: Record<string, string> = {
  high: 'border-emerald-600/30 bg-emerald-50 text-emerald-800',
  medium: 'border-amber-500/40 bg-amber-50 text-amber-900',
  low: 'border-libertymd-slate-300 bg-libertymd-slate-100 text-libertymd-slate-700',
  minimal: 'border-libertymd-slate-200 bg-white text-libertymd-slate-500',
  high_serious: 'border-rose-500/40 bg-rose-50 text-rose-900',
}

const SERIOUS_BADGE_CLASS =
  'border-rose-500/40 bg-rose-50 text-rose-900 font-bold'

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

  const ordinal = item.ordinal
  const isSerious = Boolean(item.isSerious)
  const composedHighSerious = isSerious && ordinal === 'high'
  const seriousPair = isSerious && ordinal !== undefined && ordinal !== 'high'
  const seriousOnly = isSerious && ordinal === undefined
  const renderCta = showDoctorCta && Boolean(onDoctorCta)

  return (
    <article
      data-libertymd-diagnosis-card
      data-ordinal={ordinal ?? 'none'}
      data-serious={isSerious ? 'true' : 'false'}
      data-badge-pair={
        composedHighSerious
          ? 'high-serious'
          : seriousPair
            ? 'serious-lower-band'
            : 'none'
      }
      className="rounded-md border border-libertymd-slate-200 bg-white px-4 py-3 shadow-xs"
    >
      {/* Top Header Row: Disease Name (Left) + Confidence Badges (Right) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="libertymd-type-body-small font-bold text-libertymd-ink sm:text-base">
          {item.name}
        </p>

        <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0" data-confidence-container>
          {(isSerious || seriousPair || seriousOnly || composedHighSerious) ? (
            <span
              data-serious-badge
              className={`libertymd-type-label inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${SERIOUS_BADGE_CLASS}`}
            >
              {t('report.card.serious')}
            </span>
          ) : null}

          {ordinal ? (
            <span
              data-ordinal-badge={ordinal}
              data-confidence-badge={ordinal}
              className={`libertymd-type-label inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${ORDINAL_BADGE_CLASS[ordinal]}`}
            >
              {t(`report.card.ordinal.${ordinal}`)}
            </span>
          ) : null}
        </div>
      </div>

      {/* Full-Width Explanation Paragraph */}
      {why ? (
        <p className="libertymd-type-body-small mt-2.5 w-full text-libertymd-slate-600 leading-relaxed" data-diagnosis-why>
          {why}
        </p>
      ) : null}

      <div className="mt-[var(--libertymd-space-sm)]">
        <button
          type="button"
          className="libertymd-type-label flex min-h-11 w-full items-center justify-between gap-2 rounded-md bg-libertymd-slate-50 px-3 py-2 text-left font-semibold text-libertymd-blue-700 hover:bg-libertymd-blue-50/60"
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
            className="mt-[var(--libertymd-space-xs)] space-y-4 border-t border-libertymd-slate-200 pt-[var(--libertymd-space-sm)]"
          >
            <SlotList
              label={t('report.card.supportiveTreatment')}
              items={formatClinicalBullets(item.supportiveTreatment, 'selfCare')}
              slot="supportive_treatment"
            />
            <SlotList
              label={t('report.card.symptomaticTreatment')}
              items={formatClinicalBullets(item.symptomaticTreatment, 'medical')}
              slot="symptomatic_treatment"
            />
            <SlotList
              label={t('report.card.furtherInvestigations')}
              items={formatClinicalBullets(item.furtherInvestigations, 'diagnostic')}
              slot="further_investigations"
            />
          </div>
        ) : null}
      </div>

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
