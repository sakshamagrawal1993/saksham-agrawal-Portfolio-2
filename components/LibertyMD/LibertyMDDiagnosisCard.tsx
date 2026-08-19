/**
 * P2-04 — presentational per-diagnosis detail card (shared ReportView path).
 * Ordinal / seriousness / waitlist-honest CTA.
 * P2-11 — mode-aware doctor handoff CTA via shared LibertyMDDoctorHandoffCta.
 *
 * P5-GUIDE — the per-card disclosure now carries only condition-specific
 * guidance produced after the report is delivered. It must never fall back to
 * the consultation-level plan or to canned bullets.
 *
 * The slots are earned: they are
 * produced per condition by the dedicated `libertymd-diagnosis-guidance`
 * workflow, which runs after the report is delivered. Four guidance surfaces
 * exist on a finished report: the
 * consultation-level Recommended Action Plan (unchanged, in ReportView) plus
 * one block per differential here.
 *
 * `guidancePending` renders a skeleton inside an opened disclosure because the
 * guidance lands on a later poll than the report body.
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
  /**
   * P5-GUIDE — the async guidance run is still in flight. Renders a skeleton in
   * the slot the guidance will occupy. Ignored once the item actually carries
   * guidance, so a late poll can never replace real content with a shimmer.
   */
  guidancePending?: boolean
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
  guidancePending = false,
}: LibertyMDDiagnosisCardProps) {
  const { t } = useI18n()
  const detailPanelId = useId()
  const [detailOpen, setDetailOpen] = useState(false)

  const description = item.description
  const why = item.reason

  const supportive = formatClinicalBullets(item.supportiveTreatment, 'selfCare')
  const symptomatic = formatClinicalBullets(item.symptomaticTreatment, 'medical')
  const investigations = formatClinicalBullets(item.furtherInvestigations, 'diagnostic')
  const hasGuidance = Boolean(supportive.length || symptomatic.length || investigations.length)
  const hasDisclosure = hasGuidance || guidancePending
  const showGuidanceSkeleton = detailOpen && guidancePending && !hasGuidance

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
      <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="libertymd-type-body-small min-w-0 break-words font-bold text-libertymd-ink sm:text-base">
          {item.name}
        </p>

        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-start gap-1.5 sm:w-auto sm:justify-end" data-confidence-container>
          {item.requiresClinicalReview || ordinal === 'low' || ordinal === 'minimal' ? (
            <span
              data-clinical-review-badge
              className="libertymd-type-label inline-flex max-w-full items-center whitespace-normal rounded-md border border-amber-500/40 bg-amber-50 px-2 py-1 text-left text-xs font-bold leading-tight text-amber-900"
            >
              {t('report.card.clinicalReviewRequired')}
            </span>
          ) : null}

          {(isSerious || seriousPair || seriousOnly || composedHighSerious) ? (
            <span
              data-serious-badge
              className={`libertymd-type-label inline-flex max-w-full items-center whitespace-normal rounded-md border px-2 py-1 text-left text-xs font-bold leading-tight ${SERIOUS_BADGE_CLASS}`}
            >
              {t('report.card.serious')}
            </span>
          ) : null}

          {ordinal ? (
            <span
              data-ordinal-badge={ordinal}
              data-confidence-badge={ordinal}
              className={`libertymd-type-label inline-flex max-w-full items-center whitespace-normal rounded-md border px-2 py-1 text-left text-xs font-bold leading-tight ${ORDINAL_BADGE_CLASS[ordinal]}`}
            >
              {t(`report.card.ordinal.${ordinal}`)}
            </span>
          ) : null}
        </div>
      </div>

      {/* Keep the medical definition and case-specific reasoning distinct. */}
      {description || why ? (
        <div className="mt-2.5 w-full space-y-2 text-libertymd-slate-600">
          {description ? (
            <p className="libertymd-type-body-small leading-relaxed" data-diagnosis-description>
              <strong className="font-bold text-libertymd-slate-700">{t('report.card.aboutCondition')}:</strong>{' '}
              {description}
            </p>
          ) : null}
          {why ? (
            <p className="libertymd-type-body-small leading-relaxed" data-diagnosis-why>
              <strong className="font-bold text-libertymd-slate-700">{t('report.card.whyConsidered')}:</strong>{' '}
              {why}
            </p>
          ) : null}
        </div>
      ) : null}

      {hasDisclosure ? (
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

          {detailOpen && hasGuidance ? (
            <div
              id={detailPanelId}
              data-diagnosis-guidance
              className="mt-[var(--libertymd-space-xs)] space-y-4 border-t border-libertymd-slate-200 pt-[var(--libertymd-space-sm)]"
            >
              <SlotList
                label={t('report.card.supportiveTreatment')}
                items={supportive}
                slot="supportive_treatment"
              />
              <SlotList
                label={t('report.card.symptomaticTreatment')}
                items={symptomatic}
                slot="symptomatic_treatment"
              />
              <SlotList
                label={t('report.card.furtherInvestigations')}
                items={investigations}
                slot="further_investigations"
              />
            </div>
          ) : null}

          {showGuidanceSkeleton ? (
            <div
              id={detailPanelId}
              data-diagnosis-guidance-skeleton
              aria-hidden
              className="mt-[var(--libertymd-space-xs)] space-y-3 border-t border-libertymd-slate-200 pt-[var(--libertymd-space-sm)]"
            >
              {[0, 1].map((block) => (
                <div key={block} className="space-y-2">
                  <div className="h-2.5 w-32 animate-pulse rounded-sm bg-libertymd-slate-200" />
                  <div className="h-2.5 w-full animate-pulse rounded-sm bg-libertymd-slate-100" />
                  <div className="h-2.5 w-4/5 animate-pulse rounded-sm bg-libertymd-slate-100" />
                </div>
              ))}
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
  // Guidance is per-condition and partial by nature: a condition may warrant
  // investigations but no distinct self-care. Render only what was returned.
  if (!items.length) return null
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
