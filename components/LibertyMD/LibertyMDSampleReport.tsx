/**
 * P3-02 — Landing sample-report shell.
 *
 * Hosts OverlaySheet + LibertyMDReportView(variant="sample") on a synthetic
 * `uri_mundane` fixture. Owns `sample_report_viewed` scroll telemetry — does
 * **not** pass scrollParentRef into ReportView (avoids real-consult
 * `report_scroll_depth`). Soft-gate / doctor / email / feedback props omitted.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Download, FileText, X } from 'lucide-react'
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

  const [viewMode, setViewMode] = useState<'pdf' | 'interactive'>('pdf')
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
          {/* Desktop View: Show PDF Document */}
          <div className="hidden sm:flex sm:flex-col sm:items-center w-full">
            <iframe
              src={`${SAMPLE_REPORT_PDF_URL}#toolbar=1&navpanes=0`}
              title="LibertyMD Sample Report PDF"
              className="h-[82vh] w-full max-w-5xl rounded-xl border border-libertymd-slate-200 shadow-md bg-white"
            />
          </div>

          {/* Mobile View: Interactive View for mobile browsers that do not support inline PDF view */}
          <div className="block sm:hidden space-y-4">
            <a
              href={SAMPLE_REPORT_PDF_URL}
              download="LibertyMD_Sample_Report.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-xl bg-libertymd-blue-50 border border-libertymd-blue-200/80 p-4 text-libertymd-blue-700 shadow-xs transition active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-libertymd-blue-600 shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-libertymd-blue-600">Sample Report PDF</p>
                  <p className="text-sm font-semibold text-libertymd-ink">Download original medical PDF</p>
                </div>
              </div>
              <Download className="h-5 w-5 text-libertymd-blue-600 shrink-0" />
            </a>

            <LibertyMDReportView report={report} saved={false} variant="sample" />
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
