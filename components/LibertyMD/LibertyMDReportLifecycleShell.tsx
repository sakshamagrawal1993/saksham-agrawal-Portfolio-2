/**
 * P2-13 · Non-ready report lifecycle shells (Chat + App).
 *
 * Partial / generation_failed / guest_expired / not_yet_eligible.
 * Generating uses WaitingIndicator; ready uses ReportView.
 * Soft gate, delivery, feedback UI, and doctor CTA stay out of these shells (L10).
 */
import { AlertTriangle, Clock3, FileWarning, RefreshCw } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { ReportLifecycleState } from './libertymd-report-lifecycle'

export type LibertyMDReportLifecycleShellProps = {
  state: Exclude<ReportLifecycleState, 'ready' | 'generating'>
  /** Technical retry — only for generation_failed. */
  onRetry?: () => void
  /** Guest-expired sign-in (future linked reports — never restore this guest). */
  onSignIn?: () => void
  /** Optional start-fresh for partial (P1-10 continuation may own footer instead). */
  onStartFresh?: () => void
  className?: string
}

export function LibertyMDReportLifecycleShell({
  state,
  onRetry,
  onSignIn,
  onStartFresh,
  className = '',
}: LibertyMDReportLifecycleShellProps) {
  const { t } = useI18n()

  if (state === 'partial') {
    return (
      <section
        data-libertymd-report-lifecycle="partial"
        data-libertymd-report-lifecycle-incomplete=""
        className={`rounded-2xl border border-libertymd-slate-200 bg-white p-[var(--libertymd-space-lg)] text-left shadow-sm ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-[var(--libertymd-space-sm)]">
          <FileWarning
            className="mt-0.5 h-5 w-5 shrink-0 text-libertymd-slate-500"
            aria-hidden
          />
          <div className="min-w-0 space-y-[var(--libertymd-space-sm)]">
            <p className="libertymd-type-label font-semibold uppercase tracking-wide text-libertymd-slate-500">
              {t('report.lifecycle.partialLabel')}
            </p>
            <h2 className="libertymd-type-body font-bold text-libertymd-ink">
              {t('report.lifecycle.partialTitle')}
            </h2>
            <p className="libertymd-type-body-small text-libertymd-slate-700">
              {t('report.lifecycle.partialBody')}
            </p>
            {/* AC4 — no differential, no confidence chrome */}
            <p className="sr-only">{t('report.lifecycle.partialA11yNoDx')}</p>
            {onStartFresh ? (
              <button
                type="button"
                data-libertymd-lifecycle-start-fresh=""
                onClick={onStartFresh}
                className="mt-[var(--libertymd-space-sm)] inline-flex min-h-11 items-center justify-center rounded-full border border-libertymd-blue-600 bg-white px-[var(--libertymd-space-lg)] text-sm font-semibold text-libertymd-blue-700 transition hover:bg-libertymd-blue-50"
              >
                {t('report.lifecycle.partialStartFresh')}
              </button>
            ) : null}
          </div>
        </div>
      </section>
    )
  }

  if (state === 'generation_failed') {
    return (
      <section
        data-libertymd-report-lifecycle="generation_failed"
        data-libertymd-severity="technical"
        className={`rounded-2xl border border-amber-200 bg-amber-50 p-[var(--libertymd-space-lg)] text-left shadow-sm ${className}`}
        role="alert"
        aria-live="assertive"
      >
        <div className="flex items-start gap-[var(--libertymd-space-sm)]">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
            aria-hidden
          />
          <div className="min-w-0 space-y-[var(--libertymd-space-sm)]">
            <h2 className="libertymd-type-body font-bold text-libertymd-ink">
              {t('report.lifecycle.failedTitle')}
            </h2>
            <p className="libertymd-type-body-small text-libertymd-slate-700">
              {t('report.lifecycle.failedBody')}
            </p>
            {onRetry ? (
              <button
                type="button"
                data-libertymd-lifecycle-retry=""
                onClick={onRetry}
                className="mt-[var(--libertymd-space-sm)] inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-libertymd-blue-600 px-[var(--libertymd-space-lg)] text-sm font-semibold text-white shadow-sm transition hover:bg-libertymd-blue-700"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                {t('report.lifecycle.failedRetry')}
              </button>
            ) : null}
          </div>
        </div>
      </section>
    )
  }

  if (state === 'guest_expired') {
    return (
      <section
        data-libertymd-report-lifecycle="guest_expired"
        className={`rounded-2xl border border-libertymd-slate-200 bg-white p-[var(--libertymd-space-lg)] text-left shadow-sm ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-[var(--libertymd-space-sm)]">
          <Clock3
            className="mt-0.5 h-5 w-5 shrink-0 text-libertymd-slate-500"
            aria-hidden
          />
          <div className="min-w-0 space-y-[var(--libertymd-space-sm)]">
            <h2 className="libertymd-type-body font-bold text-libertymd-ink">
              {t('report.lifecycle.expiredTitle')}
            </h2>
            <p className="libertymd-type-body-small text-libertymd-slate-700">
              {t('report.lifecycle.expiredBody')}
            </p>
            {onSignIn ? (
              <button
                type="button"
                data-libertymd-lifecycle-sign-in=""
                onClick={onSignIn}
                className="mt-[var(--libertymd-space-sm)] inline-flex min-h-11 items-center justify-center rounded-full bg-libertymd-blue-600 px-[var(--libertymd-space-lg)] text-sm font-semibold text-white shadow-sm transition hover:bg-libertymd-blue-700"
              >
                {t('report.lifecycle.expiredSignIn')}
              </button>
            ) : null}
          </div>
        </div>
      </section>
    )
  }

  // not_yet_eligible — lightweight, non-blocking (L7)
  return (
    <div
      data-libertymd-report-lifecycle="not_yet_eligible"
      className={`text-center text-xs font-semibold text-libertymd-slate-500 ${className}`}
      role="status"
      aria-live="polite"
    >
      {t('report.lifecycle.notYetEligible')}
    </div>
  )
}

/** Pre-lapse retention warning while ready body is still visible (L4). */
export function LibertyMDGuestRetentionWarning({
  remainingLabel,
  className = '',
}: {
  remainingLabel: string
  className?: string
}) {
  const { t } = useI18n()
  return (
    <div
      data-libertymd-report-lifecycle-retention-warning=""
      role="status"
      aria-live="polite"
      className={`rounded-xl border border-libertymd-blue-600/20 bg-libertymd-blue-50 px-[var(--libertymd-space-md)] py-[var(--libertymd-space-sm)] text-left text-sm text-libertymd-blue-900 ${className}`}
    >
      {t('report.lifecycle.retentionWarning', { remaining: remainingLabel })}
    </div>
  )
}
