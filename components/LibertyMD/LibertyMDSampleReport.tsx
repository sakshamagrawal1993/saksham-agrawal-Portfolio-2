/**
 * P3-02 — Landing sample-report shell.
 *
 * Hosts OverlaySheet + LibertyMDReportView(variant="sample") on a synthetic
 * `uri_mundane` fixture. Owns `sample_report_viewed` scroll telemetry — does
 * **not** pass scrollParentRef into ReportView (avoids real-consult
 * `report_scroll_depth`). Soft-gate / doctor / email / feedback props omitted.
 */
import { useEffect, useId, useRef } from 'react'
import { Download, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { emitSampleReportViewed } from './libertymd-analytics'
import { LibertyMDOverlaySheet } from './LibertyMDOverlaySheet'
import { LibertyMDReportView } from './LibertyMDReportView'
import {
  newlyReachedScrollBuckets,
  normalizeReportData,
  reportScrollDepthPct,
  type ReportScrollBucket,
} from './libertymd-report'
import {
  getSampleReportData,
  URI_MUNDANE_SAMPLE_COMPLAINT,
  type LibertyMdSampleClusterId,
} from './libertymd-sample-report'

export const SAMPLE_REPORT_PDF_URL =
  'https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/libertymd-assets/Sample_Report.pdf'

export type LibertyMDSampleReportProps = {
  open: boolean
  onClose: () => void
  /** Primary CTA → beginConsultation(freetext). Default complaint = Sore throat. */
  onStartConsult: (complaint: string) => void
  conditionClusterId?: LibertyMdSampleClusterId
}

export function LibertyMDSampleReport({
  open,
  onClose,
  onStartConsult,
  conditionClusterId = 'uri_mundane',
}: LibertyMDSampleReportProps) {
  const { t, language } = useI18n()
  const titleId = useId()
  const badgeId = useId()
  const contentRef = useRef<HTMLDivElement | null>(null)
  const reportAnchorRef = useRef<HTMLDivElement | null>(null)
  const emittedBucketsRef = useRef<Set<ReportScrollBucket>>(new Set())

  const report = normalizeReportData(getSampleReportData(conditionClusterId, language))

  // Open → bucket 0 once; then monotonic newly-reached buckets on scroll host.
  useEffect(() => {
    if (!open) {
      emittedBucketsRef.current = new Set()
      return
    }

    emittedBucketsRef.current = new Set()
    emitSampleReportViewed({
      condition_cluster_id: conditionClusterId,
      scroll_depth_bucket: 0,
    })
    emittedBucketsRef.current.add(0)

    const content = contentRef.current
    const scroller =
      content?.closest<HTMLElement>('[data-libertymd-overlay-body]') ?? null
    const reportRoot = reportAnchorRef.current
    if (!scroller || !reportRoot) return

    const measure = () => {
      const pct = reportScrollDepthPct({
        scrollTop: scroller.scrollTop,
        clientHeight: scroller.clientHeight,
        reportOffsetTop: reportRoot.offsetTop,
        reportHeight: reportRoot.offsetHeight,
      })
      const newly = newlyReachedScrollBuckets(pct, emittedBucketsRef.current)
      for (const bucket of newly) {
        emittedBucketsRef.current.add(bucket)
        emitSampleReportViewed({
          condition_cluster_id: conditionClusterId,
          scroll_depth_bucket: bucket,
        })
      }
    }

    // Defer one frame so OverlaySheet body + ReportView layout settle.
    const raf = window.requestAnimationFrame(measure)
    scroller.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      window.cancelAnimationFrame(raf)
      scroller.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [open, conditionClusterId])

  if (!open) return null

  return (
    <LibertyMDOverlaySheet
      onClose={onClose}
      titleId={titleId}
      ariaDescribedBy={badgeId}
      panelClassName="relative"
    >
      <div
        ref={contentRef}
        data-libertymd-sample-report=""
        data-libertymd-sample-cluster={conditionClusterId}
        className="flex min-h-full flex-col bg-white"
      >
        {/* Simple Header: Title "Sample Report" + Close Button */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between border-b border-libertymd-slate-200 bg-white/95 px-6 py-4 backdrop-blur-sm"
          data-libertymd-sample-badge-chrome=""
        >
          <h2 id={titleId} className="font-serif text-xl font-bold text-libertymd-ink">
            {t('sampleReport.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            data-libertymd-sample-close=""
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-libertymd-slate-700 transition hover:bg-libertymd-blue-50"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div ref={reportAnchorRef} className="p-4 sm:p-6 flex-1">
          <div className="mx-auto mb-4 max-w-5xl rounded-xl border border-libertymd-blue-200/80 bg-libertymd-blue-50 p-4">
            <p id={badgeId} className="text-xs font-bold uppercase tracking-wider text-libertymd-blue-700">
              {t('sampleReport.badge')}
            </p>
            <p className="mt-1 text-sm text-libertymd-slate-700">{t('sampleReport.subtitle')}</p>
          </div>

          <div className="mx-auto max-w-5xl space-y-4">
            <LibertyMDReportView report={report} saved={false} variant="sample" />
            <a
              href={SAMPLE_REPORT_PDF_URL}
              download="LibertyMD_Sample_Report.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-libertymd-blue-200 bg-white px-4 py-2 text-sm font-semibold text-libertymd-blue-700 transition hover:bg-libertymd-blue-50"
            >
              <Download className="h-4 w-4" aria-hidden />
              {t('report.download')}
            </a>
          </div>
        </div>

        <div
          className="sticky bottom-0 border-t border-libertymd-slate-200 bg-white/95 px-[var(--libertymd-space-lg)] py-[var(--libertymd-space-md)] backdrop-blur-sm sm:px-[var(--libertymd-space-xl)]"
          data-libertymd-sample-cta-chrome=""
        >
          <button
            type="button"
            data-libertymd-sample-cta=""
            className="inline-flex h-14 w-full items-center justify-center rounded-full bg-libertymd-blue-600 px-6 text-base font-bold text-white shadow-xl shadow-libertymd-blue-600/20 transition hover:bg-libertymd-blue-700"
            onClick={() => {
              onClose()
              onStartConsult(URI_MUNDANE_SAMPLE_COMPLAINT)
            }}
          >
            {t('sampleReport.cta')}
          </button>
          <button
            type="button"
            data-libertymd-sample-cta-own=""
            className="libertymd-type-body-small mt-[var(--libertymd-space-sm)] inline-flex h-11 w-full items-center justify-center font-semibold text-libertymd-blue-700 underline-offset-2 hover:underline"
            onClick={onClose}
          >
            {t('sampleReport.ctaOwnSymptoms')}
          </button>
        </div>
      </div>
    </LibertyMDOverlaySheet>
  )
}
