/**
 * P2-02 — shared doctor-ready report surface (Chat + App).
 * P2-03 — customer-priority hierarchy (triage + next-step dominate type scale);
 *         order regression; footerSlot body placement when ATF threatened.
 * P2-04 — per-diagnosis detail cards inside differential (ordinal / serious / waitlist CTA).
 * P2-05 — condensed sticky triage twin + section disclosure persistence + teasers.
 * P2-09 — client PDF delivery-actions slot (Download → chooser; gesture-safe Both).
 * P3-02 — `variant="sample"` hides PDF/delivery-actions + guest/saved note and
 *         suppresses real-report analytics (landing sample shell owns its own emit).
 *
 * Renders only fields present on normalized report_data. Collapsibles + expand /
 * scroll-depth telemetry ship with the UI (H1). Soft-gate chrome is out of scope.
 * Email delivery (P2-08) may mount beside Download in the shared delivery-actions slot.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { ChevronDown, Download, ShieldCheck } from 'lucide-react'
import { useI18n } from '../../i18n'
import { LibertyMDDiagnosisCard } from './LibertyMDDiagnosisCard'
import { LibertyMDReportEmailDelivery } from './LibertyMDReportEmailDelivery'
import { LibertyMDReportFeedback } from './LibertyMDReportFeedback'
import {
  emitReportDeliveryRequested,
  emitReportScrollDepth,
  emitReportSectionExpanded,
} from './libertymd-analytics'
import {
  doctorHandoffProminence,
  shouldShowDoctorHandoff,
} from './libertymd-doctor-cta-config'
import {
  DEFAULT_REPORT_SECTION_OPEN,
  formatClinicalBullets,
  mergeReportSectionOpen,
  newlyReachedScrollBuckets,
  readReportSections,
  reportScrollDepthPct,
  shouldEnableReportSticky,
  writeReportSections,
  type LibertyMdNormalizedReport,
  type ReportScrollBucket,
  type ReportSectionId,
  type TriageDisplayTier,
} from './libertymd-report'
import {
  buildPatientPdfDoc,
  buildSoapPdfDoc,
  renderPdfBlob,
  revokePdfObjectUrl,
  triggerPdfDownload,
  type LibertyMdPdfCopy,
  type LibertyMdPdfDocKind,
} from './libertymd-report-pdf'

export type LibertyMDReportEmailDeliveryConfig = {
  consultationId: string
  prefillEmail?: string
  onRequest: (email: string) => Promise<void>
}

export type LibertyMDReportViewVariant = 'default' | 'sample'

export type LibertyMDReportViewProps = {
  report: LibertyMdNormalizedReport
  saved: boolean
  /**
   * P3-02 — `sample` hides PDF/delivery-actions + guest/saved note and suppresses
   * real-report analytics. Landing sample shell owns `sample_report_viewed`.
   */
  variant?: LibertyMDReportViewVariant
  /** Consult transcript scroller (Q5) — not a nested report scroller. */
  scrollParentRef?: RefObject<HTMLElement | null>
  /** Opaque consult id for section expansion persistence (P2-05). */
  consultationId?: string
  /** P2-11 — doctor handoff slot (post-summary). Soft gate / delivery / feedback stay out. */
  footerSlot?: ReactNode
  /** P2-11 — per-card doctor CTA (App tab-switch / Chat scroll-to-panel). */
  onDoctorCta?: () => void
  /**
   * P2-08 — email-me delivery (only live delivery CTA; PDF/download out until P2-09).
   * Must not gate report sections. Soft-gate chrome stays outside this view.
   */
  emailDelivery?: LibertyMDReportEmailDeliveryConfig
  /**
   * P2-13 — optional retention ISO for guest pre-lapse warning while body is visible.
   * Warning chrome is owned by the host; ReportView only exposes a marker for tests.
   */
  retentionExpiresAt?: string | null
}

const TRIAGE_BADGE_CLASS: Record<TriageDisplayTier, string> = {
  home: 'border-libertymd-green-600/30 bg-libertymd-green-sage text-libertymd-green-600',
  telehealth: 'border-libertymd-blue-600/30 bg-libertymd-blue-50 text-libertymd-blue-700',
  urgent_care: 'border-amber-500/40 bg-amber-50 text-amber-900',
  emergency_department: 'border-libertymd-blue-900/40 bg-libertymd-blue-50 text-libertymd-blue-900',
  call_911: 'border-red-700/40 bg-red-50 text-red-900',
  crisis_line: 'border-libertymd-indigo/40 bg-libertymd-blue-50 text-libertymd-indigo',
  unknown: 'border-libertymd-slate-300 bg-libertymd-slate-200 text-libertymd-slate-700',
}

function triageLabelKey(tier: TriageDisplayTier): string {
  return `report.triage.${tier}`
}

type TranslateFn = (key: string, params?: Record<string, string | number>) => string

function buildPdfCopy(t: TranslateFn): LibertyMdPdfCopy {
  const triageTiers: TriageDisplayTier[] = [
    'home',
    'telehealth',
    'urgent_care',
    'emergency_department',
    'call_911',
    'crisis_line',
    'unknown',
  ]
  const triageLabels = {} as Record<TriageDisplayTier, string>
  for (const tier of triageTiers) {
    triageLabels[tier] = t(triageLabelKey(tier))
  }
  return {
    patientTitle: t('report.pdf.patientTitle'),
    soapTitle: t('report.pdf.soapTitle'),
    summaryHeading: t('report.pdf.summaryHeading'),
    aiGenerated: t('report.pdf.aiGenerated'),
    noClinicianReview: t('report.pdf.noClinicianReview'),
    generatedLabel: t('report.pdf.generatedLabel'),
    sections: {
      triage: t('report.sections.triage'),
      nextStep: t('report.sections.nextStep'),
      differential: t('report.sections.differential'),
      assessmentAndPlan: t('report.sections.assessmentAndPlan'),
      redFlags: t('report.sections.redFlags'),
      plan: t('report.pdf.plan'),
      selfCare: t('report.selfCare'),
      soapSubjective: t('report.teasers.soapSubjective'),
      soapObjective: t('report.teasers.soapObjective'),
      soapAssessment: t('report.teasers.soapAssessment'),
      soapPlan: t('report.teasers.soapPlan'),
    },
    ordinal: {
      high: t('report.card.ordinal.high'),
      medium: t('report.card.ordinal.medium'),
      low: t('report.card.ordinal.low'),
      minimal: t('report.card.ordinal.minimal'),
    },
    serious: t('report.card.serious'),
    triageLabels,
  }
}

type PdfReadyLink = {
  kind: LibertyMdPdfDocKind
  filename: string
  objectUrl: string
}

function initialSectionOpen(
  consultationId: string | undefined,
): Record<ReportSectionId, boolean> {
  if (!consultationId || typeof window === 'undefined') {
    return { ...DEFAULT_REPORT_SECTION_OPEN }
  }
  return mergeReportSectionOpen(readReportSections(consultationId, window.localStorage))
}

function renderFormattedSessionSummary(headline: string) {
  const lines = headline.split('\n').filter((l) => l.trim())
  return (
    <div className="mt-1.5 space-y-1.5">
      {lines.map((line, idx) => {
        const colonMatch = line.match(/^(\*\*.*?\*\*|[A-Za-z0-9\s()\/_-]+:)(.*)$/)
        if (colonMatch) {
          const headerRaw = colonMatch[1].replace(/^\*\*|\*\*$|:$/g, '').trim()
          const bodyText = colonMatch[2].replace(/^:\s*/, ' ')
          return (
            <p key={idx} className="libertymd-type-body-small font-normal text-libertymd-slate-700 leading-relaxed">
              <strong className="font-bold text-libertymd-ink">{headerRaw}:</strong>{bodyText}
            </p>
          )
        }
        return (
          <p key={idx} className="libertymd-type-body-small font-normal text-libertymd-slate-700 leading-relaxed">
            {line}
          </p>
        )
      })}
    </div>
  )
}

export function LibertyMDReportView({
  report,
  saved,
  variant = 'default',
  scrollParentRef,
  consultationId,
  footerSlot,
  onDoctorCta,
  emailDelivery,
  retentionExpiresAt = null,
}: LibertyMDReportViewProps) {
  const { t, language } = useI18n()
  const isSample = variant === 'sample'
  const rootRef = useRef<HTMLElement | null>(null)
  const stickyRef = useRef<HTMLDivElement | null>(null)
  const emittedBucketsRef = useRef<Set<ReportScrollBucket>>(new Set())
  const readyLinksRef = useRef<PdfReadyLink[]>([])
  const [sectionOpen, setSectionOpen] = useState<Record<ReportSectionId, boolean>>(() =>
    initialSectionOpen(consultationId),
  )
  const [stickyEnabled, setStickyEnabled] = useState(false)
  const [chooserOpen, setChooserOpen] = useState(false)
  // Real reports begin preparing their client-only PDFs after the first paint.
  // Sample reports never expose delivery actions, so they do no PDF work.
  const [pdfBusy, setPdfBusy] = useState(!isSample)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [readyLinks, setReadyLinks] = useState<PdfReadyLink[]>([])
  const [soapSecondTap, setSoapSecondTap] = useState<PdfReadyLink | null>(null)

  const showTriage = report.triageTier !== 'unknown' || Boolean(report.triageRaw)
  const showDifferentials = report.differentials.length > 0
  const showDoctorHandoff = shouldShowDoctorHandoff(report.triageTier)
  const handoffProminence = doctorHandoffProminence(report.triageTier)
  const showAp = Boolean(
    showTriage
    || report.nextStep
    || (
      report.assessmentAndPlan
      && (
        report.assessmentAndPlan.assessment
        || report.assessmentAndPlan.plan.length
        || report.assessmentAndPlan.selfCare.length
      )
    ),
  )
  const showSoap = Boolean(
    report.soap
    && (report.soap.subjective || report.soap.objective || report.soap.assessment || report.soap.plan),
  )
  const showRedFlags = report.redFlags.length > 0
  const showStickyContent = showTriage || Boolean(report.nextStep)

  // Restore when consultationId arrives/changes (optional prop).
  useEffect(() => {
    setSectionOpen(initialSectionOpen(consultationId))
  }, [consultationId])

  // AC5 · short-viewport gate from scroller clientHeight (fallback: window).
  useEffect(() => {
    const measure = () => {
      const scroller = scrollParentRef?.current
      const height = scroller?.clientHeight
        ?? (typeof window !== 'undefined' ? window.innerHeight : 0)
      setStickyEnabled(showStickyContent && shouldEnableReportSticky(height))
    }
    measure()
    const scroller = scrollParentRef?.current
    window.addEventListener('resize', measure)
    let ro: ResizeObserver | null = null
    if (scroller && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(scroller)
    }
    return () => {
      window.removeEventListener('resize', measure)
      ro?.disconnect()
    }
  }, [scrollParentRef, showStickyContent])

  // AC2 · body clearance from measured sticky height when enabled.
  useEffect(() => {
    if (!stickyEnabled) {
      const scroller = scrollParentRef?.current
      if (scroller) scroller.style.scrollPaddingTop = ''
      return
    }
    const el = stickyRef.current
    const scroller = scrollParentRef?.current
    if (!el) return

    const apply = () => {
      const h = el.offsetHeight
      if (scroller) {
        scroller.style.scrollPaddingTop = h > 0 ? `${h}px` : ''
      }
    }
    apply()
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(apply)
      ro.observe(el)
    }
    return () => {
      ro?.disconnect()
      if (scroller) scroller.style.scrollPaddingTop = ''
    }
  }, [stickyEnabled, scrollParentRef, showTriage, report.nextStep])

  useEffect(() => {
    // P3-02 — sample shell owns `sample_report_viewed`; never emit real-consult scroll depth.
    if (isSample) return
    const scroller = scrollParentRef?.current
    const reportRoot = rootRef.current
    if (!scroller || !reportRoot) return

    const measure = () => {
      const reportOffsetTop = reportRoot.offsetTop
      const reportHeight = reportRoot.offsetHeight
      const pct = reportScrollDepthPct({
        scrollTop: scroller.scrollTop,
        clientHeight: scroller.clientHeight,
        reportOffsetTop,
        reportHeight,
      })
      const newly = newlyReachedScrollBuckets(pct, emittedBucketsRef.current)
      for (const bucket of newly) {
        emittedBucketsRef.current.add(bucket)
        emitReportScrollDepth(bucket)
      }
    }

    measure()
    scroller.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      scroller.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [scrollParentRef, isSample])

  // P2-09 · revoke Blob URLs on unmount / replace (no Storage upload).
  useEffect(() => {
    return () => {
      for (const link of readyLinksRef.current) {
        revokePdfObjectUrl(link.objectUrl)
      }
      readyLinksRef.current = []
    }
  }, [])

  const clearReadyLinks = () => {
    for (const link of readyLinksRef.current) {
      revokePdfObjectUrl(link.objectUrl)
    }
    readyLinksRef.current = []
    setReadyLinks([])
    setSoapSecondTap(null)
  }

  const replaceReadyLinks = (next: PdfReadyLink[]) => {
    clearReadyLinks()
    readyLinksRef.current = next
    setReadyLinks(next)
  }

  // P2-09 · Prepare both downloads after report_data is available. The report
  // body has already rendered before this effect runs, so PDF work never gates
  // diagnosis / plan / red-flag content. Files remain browser-memory Blob URLs;
  // nothing is uploaded to Storage or the proxy. A failed preload falls back to
  // the existing on-demand path in runPdfDownload.
  const pdfPreparationKey = JSON.stringify(report)
  useEffect(() => {
    if (isSample) {
      setPdfBusy(false)
      return
    }

    let cancelled = false
    let timer: number | undefined
    setPdfBusy(true)
    setPdfError(null)
    setChooserOpen(false)

    for (const link of readyLinksRef.current) revokePdfObjectUrl(link.objectUrl)
    readyLinksRef.current = []
    setReadyLinks([])
    setSoapSecondTap(null)

    // Yield one browser task so the clinical report paints before jsPDF loads.
    timer = window.setTimeout(() => {
      const copy = buildPdfCopy(t)
      const when = new Date()
      const patientDoc = buildPatientPdfDoc(report, copy, when)
      const soapDoc = buildSoapPdfDoc(report, copy, when)

      void Promise.all([
        renderPdfBlob(patientDoc),
        renderPdfBlob(soapDoc),
      ]).then(([patientBlob, soapBlob]) => {
        const next: PdfReadyLink[] = [
          {
            kind: 'patient',
            filename: patientDoc.filename,
            objectUrl: URL.createObjectURL(patientBlob),
          },
          {
            kind: 'soap',
            filename: soapDoc.filename,
            objectUrl: URL.createObjectURL(soapBlob),
          },
        ]
        if (cancelled) {
          for (const link of next) revokePdfObjectUrl(link.objectUrl)
          return
        }
        readyLinksRef.current = next
        setReadyLinks(next)
      }).catch(() => {
        if (!cancelled) setPdfError(t('report.pdf.error'))
      }).finally(() => {
        if (!cancelled) setPdfBusy(false)
      })
    }, 0)

    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
    // `pdfPreparationKey` provides content equality when a parent recreates the
    // normalized report object. `language` regenerates localized PDF chrome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSample, language, pdfPreparationKey])

  const triggerReadyLinkDownload = (link: PdfReadyLink) => {
    if (typeof document === 'undefined') return
    const anchor = document.createElement('a')
    anchor.href = link.objectUrl
    anchor.download = link.filename
    anchor.rel = 'noopener'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  const persistSections = (next: Record<ReportSectionId, boolean>) => {
    if (!consultationId || typeof window === 'undefined') return
    writeReportSections(consultationId, next, window.localStorage)
  }

  const onExpand = (section: ReportSectionId, open: boolean) => {
    const nextOpen = !open
    const next = { ...sectionOpen, [section]: nextOpen }
    setSectionOpen(next)
    persistSections(next)
    // P3-02 — sample mode keeps local expand UI; suppresses real-report expand analytics.
    if (nextOpen && !isSample) emitReportSectionExpanded(section)
  }

  const runPdfDownload = async (mode: 'patient' | 'soap' | 'both') => {
    const preparedPatient = readyLinksRef.current.find((link) => link.kind === 'patient')
    const preparedSoap = readyLinksRef.current.find((link) => link.kind === 'soap')

    if (mode === 'patient' && preparedPatient) {
      triggerReadyLinkDownload(preparedPatient)
      setSoapSecondTap(null)
      emitReportDeliveryRequested({ method: 'download' })
      setChooserOpen(false)
      return
    }
    if (mode === 'soap' && preparedSoap) {
      triggerReadyLinkDownload(preparedSoap)
      setSoapSecondTap(null)
      emitReportDeliveryRequested({ method: 'download' })
      setChooserOpen(false)
      return
    }
    if (mode === 'both' && preparedPatient && preparedSoap) {
      // Browser gesture rules still permit only one automatic download. The
      // prepared SOAP file remains available through the existing second tap.
      triggerReadyLinkDownload(preparedPatient)
      setSoapSecondTap(preparedSoap)
      emitReportDeliveryRequested({ method: 'download' })
      setChooserOpen(false)
      return
    }

    // Background preparation can fail or be cancelled by a rapid report
    // transition. Keep the original user-triggered generation as a fallback.
    setPdfBusy(true)
    setPdfError(null)
    try {
      const copy = buildPdfCopy(t)
      const when = new Date()
      const patientDoc = buildPatientPdfDoc(report, copy, when)
      const soapDoc = buildSoapPdfDoc(report, copy, when)

      if (mode === 'patient') {
        const blob = await renderPdfBlob(patientDoc)
        const objectUrl = triggerPdfDownload(blob, patientDoc.filename)
        replaceReadyLinks([{ kind: 'patient', filename: patientDoc.filename, objectUrl }])
        setSoapSecondTap(null)
        emitReportDeliveryRequested({ method: 'download' })
        setChooserOpen(false)
        return
      }

      if (mode === 'soap') {
        const blob = await renderPdfBlob(soapDoc)
        const objectUrl = triggerPdfDownload(blob, soapDoc.filename)
        replaceReadyLinks([{ kind: 'soap', filename: soapDoc.filename, objectUrl }])
        setSoapSecondTap(null)
        emitReportDeliveryRequested({ method: 'download' })
        setChooserOpen(false)
        return
      }

      // Both · gesture-safe: patient downloads immediately; SOAP needs second tap / ready link.
      // Never silent dual auto-download (AC1 / Q2 / AC6).
      const [patientBlob, soapBlob] = await Promise.all([
        renderPdfBlob(patientDoc),
        renderPdfBlob(soapDoc),
      ])
      const patientUrl = triggerPdfDownload(patientBlob, patientDoc.filename)
      const soapUrl = URL.createObjectURL(soapBlob)
      const soapLink: PdfReadyLink = {
        kind: 'soap',
        filename: soapDoc.filename,
        objectUrl: soapUrl,
      }
      replaceReadyLinks([
        { kind: 'patient', filename: patientDoc.filename, objectUrl: patientUrl },
        soapLink,
      ])
      setSoapSecondTap(soapLink)
      emitReportDeliveryRequested({ method: 'download' })
      setChooserOpen(false)
    } catch {
      setPdfError(t('report.pdf.error'))
      // No telemetry on hard fail (S5).
    } finally {
      setPdfBusy(false)
    }
  }

  const onSoapSecondTap = () => {
    if (!soapSecondTap) return
    triggerReadyLinkDownload(soapSecondTap)
    setSoapSecondTap(null)
  }

  const differentialTeaser = showDifferentials
    ? t('report.teasers.differential', { count: report.differentials.length })
    : undefined
  const apItemCount = (report.assessmentAndPlan?.plan.length ?? 0)
    + (report.assessmentAndPlan?.selfCare.length ?? 0)
  const apHasAssessment = Boolean(report.assessmentAndPlan?.assessment)
  const apTeaserParts: string[] = []
  if (apItemCount > 0) {
    apTeaserParts.push(t('report.teasers.assessmentAndPlanItems', { count: apItemCount }))
  }
  if (apHasAssessment) {
    apTeaserParts.push(t('report.teasers.assessmentChip'))
  }
  const apTeaser = showAp && apTeaserParts.length > 0 ? apTeaserParts.join(' · ') : undefined
  const redFlagsTeaser = showRedFlags
    ? t('report.teasers.redFlags', { count: report.redFlags.length })
    : undefined
  const soapChips: string[] = []
  if (report.soap?.subjective) soapChips.push(t('report.teasers.soapSubjective'))
  if (report.soap?.objective) soapChips.push(t('report.teasers.soapObjective'))
  if (report.soap?.assessment) soapChips.push(t('report.teasers.soapAssessment'))
  if (report.soap?.plan) soapChips.push(t('report.teasers.soapPlan'))
  const soapTeaser = showSoap && soapChips.length > 0 ? soapChips.join(' · ') : undefined

  const displayPatientName = report.patientInfo?.name || 'Anonymous Guest'
  const displayPatientAge = report.patientInfo?.age ? String(report.patientInfo.age) : 'Not specified'
  const rawSex = report.patientInfo?.sexAtBirth
  const displayPatientSex = rawSex ? rawSex.split('_').join(' ').replace(/^./, (c: string) => c.toUpperCase()) : 'Not specified'
  const displayReportDate = report.patientInfo?.date || new Date().toISOString().split('T')[0]

  return (
    <section
      ref={rootRef}
      data-libertymd-report
      data-libertymd-report-variant={variant}
      data-libertymd-report-lifecycle="ready"
      data-libertymd-retention-expires-at={retentionExpiresAt || undefined}
      className="relative overflow-hidden mt-[var(--libertymd-space-md)] max-w-full rounded-lg border border-libertymd-blue-200/80 bg-gradient-to-b from-[#F0F6FF]/70 via-[#F8FAFC] to-[#EFF6FF]/60 shadow-[0_20px_65px_rgba(23,50,95,0.09)]"
    >
      {/* Background Rod of Asclepius Watermark Emblem */}
      <div
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden opacity-[0.05] select-none"
        aria-hidden="true"
      >
        <img
          src="/images/asclepius-watermark.svg"
          alt=""
          className="h-[480px] w-auto max-w-none object-contain"
        />
      </div>

      {/* 1. Header Banner (Solid Blue Box with Logo & Title) */}
      <div className="relative overflow-hidden rounded-t-lg bg-[#3B71CA] px-6 py-6 sm:px-8 sm:py-7 text-white shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-sans text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Liberty MD
            </h1>
            <p className="font-sans text-xs sm:text-sm text-white/90 mt-0.5 font-medium">
              LibertyMD.ai
            </p>
          </div>
          <div className="shrink-0">
            <img
              src="/images/libertymd-logo-mark.svg"
              alt="LibertyMD logo mark"
              className="h-16 w-auto sm:h-20 drop-shadow-md"
            />
          </div>
        </div>
        <div className="mt-5 text-center">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide text-white">
            Physician Ready Report
          </h2>
        </div>
      </div>

      {/* 2. Patient Metadata Bar */}
      <div className="border-b border-libertymd-slate-200 bg-libertymd-slate-50/60 px-6 py-4 sm:px-8 text-left text-xs sm:text-sm text-libertymd-slate-700">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-libertymd-ink">
              <span className="font-bold uppercase text-[11px] tracking-wider text-libertymd-slate-500">Patient Name:</span>{' '}
              <span className="font-semibold text-libertymd-ink">{displayPatientName}</span>
            </p>
            <div className="flex items-center gap-4">
              <p>
                <span className="font-bold uppercase text-[11px] tracking-wider text-libertymd-slate-500">Gender:</span>{' '}
                <span className="font-medium text-libertymd-slate-800 capitalize">{displayPatientSex}</span>
              </p>
              <p>
                <span className="font-bold uppercase text-[11px] tracking-wider text-libertymd-slate-500">Age:</span>{' '}
                <span className="font-medium text-libertymd-slate-800">{displayPatientAge}</span>
              </p>
            </div>
          </div>
          <div className="space-y-1 sm:text-right">
            <p>
              <span className="font-bold uppercase text-[11px] tracking-wider text-libertymd-slate-500">Date:</span>{' '}
              <span className="font-medium text-libertymd-slate-800">{displayReportDate}</span>
            </p>
            {consultationId ? (
              <p>
                <span className="font-bold uppercase text-[11px] tracking-wider text-libertymd-slate-500">Ref No.:</span>{' '}
                <span className="font-mono text-xs font-semibold text-libertymd-blue-700">[{consultationId.slice(0, 8)}]</span>
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Consultation Report Framing: Session Summary → Patient Summary. */}
      <div className="border-b border-libertymd-slate-200 px-[var(--libertymd-space-lg)] py-[var(--libertymd-space-lg)] text-left sm:px-[var(--libertymd-space-xl)] space-y-6">
        {report.headline ? (
          <div data-libertymd-report-session-summary>
            <h3 className="libertymd-type-label font-bold uppercase tracking-wide text-libertymd-slate-500">
              {t('report.sections.sessionSummary')}
            </h3>
            {renderFormattedSessionSummary(report.headline)}
          </div>
        ) : null}
        {report.patientSummary ? (
          <div data-libertymd-report-patient-summary>
            <h3 className="libertymd-type-label font-bold uppercase tracking-wide text-libertymd-slate-500">
              {t('report.sections.patientSummary')}
            </h3>
            <p className="libertymd-type-body-small mt-1.5 font-normal text-libertymd-slate-700 leading-relaxed">
              {report.patientSummary}
            </p>
          </div>
        ) : null}
      </div>

      {/* P2-05 · condensed sticky twin — in-scroller sticky; aria-hidden decorative duplicate. */}
      {stickyEnabled ? (
        <div
          ref={stickyRef}
          data-libertymd-report-sticky
          aria-hidden="true"
          className="sticky top-0 z-10 border-b border-libertymd-slate-200 bg-white/95 px-[var(--libertymd-space-lg)] py-[var(--libertymd-space-sm)] shadow-sm backdrop-blur-sm sm:px-[var(--libertymd-space-xl)]"
        >
          <div className="flex flex-col gap-[var(--libertymd-space-xs)]">
            {showTriage ? (
              <span
                className={`libertymd-type-label inline-flex max-w-full flex-wrap items-center self-start rounded-md border px-2 py-1 font-bold ${TRIAGE_BADGE_CLASS[report.triageTier]}`}
                data-libertymd-report-sticky-triage
                data-triage-tier={report.triageTier}
              >
                {t(triageLabelKey(report.triageTier))}
              </span>
            ) : null}
            {report.nextStep ? (
              <p
                className="libertymd-type-body-small line-clamp-2 font-bold text-libertymd-ink"
                data-libertymd-report-sticky-next-step
              >
                {report.nextStep}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* AC2 clearance marker when sticky enabled (scroll-padding-top set on scroller). */}
      {stickyEnabled ? (
        <div
          data-libertymd-report-sticky-clearance
          className="pointer-events-none h-0"
          aria-hidden
        />
      ) : null}

      <div className="space-y-[var(--libertymd-space-lg)] px-[var(--libertymd-space-lg)] py-[var(--libertymd-space-xl)] sm:px-[var(--libertymd-space-xl)] text-left">
        {/* Q5: footerSlot at body start (before differential) so triage+next-step clear the fold. */}
        {/* P2-11: hide handoff on emergency / crisis_line. */}
        {footerSlot && showDoctorHandoff ? (
          <div data-libertymd-report-footer-slot>{footerSlot}</div>
        ) : null}

        {/* 1. Differential Diagnosis section directly follows Patient Summary */}
        {showDifferentials ? (
          <ReportCollapsible
            sectionId="differential"
            title={t('report.sections.differential')}
            teaser={differentialTeaser}
            open={sectionOpen.differential}
            onToggle={() => onExpand('differential', sectionOpen.differential)}
          >
            <ul className="space-y-[var(--libertymd-space-sm)]" data-libertymd-diagnosis-cards>
              {report.differentials.map((item, index) => (
                <li key={`${item.name}-${index}`}>
                  <LibertyMDDiagnosisCard
                    item={item}
                    onDoctorCta={onDoctorCta}
                    showDoctorCta={showDoctorHandoff}
                    triageTier={report.triageTier}
                    prominence={handoffProminence}
                    sessionKey={consultationId}
                  />
                </li>
              ))}
            </ul>
          </ReportCollapsible>
        ) : null}

        {/* 2. Recommended Action Plan for Highest Confidence Disease (3 subsections) */}
        {showAp ? (
          <ReportCollapsible
            sectionId="assessment_and_plan"
            title="Recommended Action Plan"
            teaser={apTeaser}
            open={sectionOpen.assessment_and_plan}
            onToggle={() => onExpand('assessment_and_plan', sectionOpen.assessment_and_plan)}
          >
            <div className="libertymd-type-body-small space-y-4 text-libertymd-slate-700">
              {/* 10.1 Self-Care & Home Management */}
              <div>
                <p className="libertymd-type-label font-bold uppercase text-libertymd-slate-500">
                  {t('report.card.supportiveTreatment')}
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {formatClinicalBullets(
                    report.assessmentAndPlan?.selfCare?.length
                      ? report.assessmentAndPlan.selfCare
                      : report.differentials[0]?.supportiveTreatment,
                    'selfCare',
                  ).map((item, index) => (
                    <li key={`self-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>

              {/* 10.2 Medical Treatments & Therapeutics */}
              <div>
                <p className="libertymd-type-label font-bold uppercase text-libertymd-slate-500">
                  {t('report.card.symptomaticTreatment')}
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {formatClinicalBullets(
                    report.assessmentAndPlan?.plan?.length
                      ? report.assessmentAndPlan.plan
                      : report.differentials[0]?.symptomaticTreatment,
                    'medical',
                  ).map((item, index) => (
                    <li key={`plan-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>

              {/* 10.3 Diagnostic Investigations & Workup */}
              <div>
                <p className="libertymd-type-label font-bold uppercase text-libertymd-slate-500">
                  {t('report.card.furtherInvestigations')}
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {formatClinicalBullets(
                    report.differentials[0]?.furtherInvestigations,
                    'diagnostic',
                  ).map((item, index) => (
                    <li key={`workup-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </ReportCollapsible>
        ) : null}

        {/* 3. Red Flags section */}
        {showRedFlags ? (
          <ReportCollapsible
            sectionId="red_flags"
            title={t('report.sections.redFlags')}
            teaser={redFlagsTeaser}
            open={sectionOpen.red_flags}
            onToggle={() => onExpand('red_flags', sectionOpen.red_flags)}
          >
            <ul className="libertymd-type-body-small list-disc space-y-1 pl-5 text-libertymd-slate-700">
              {report.redFlags.map((item, index) => (
                <li key={`rf-${index}`}>{item}</li>
              ))}
            </ul>
          </ReportCollapsible>
        ) : null}

        {showSoap ? (
          <ReportCollapsible
            sectionId="soap"
            title={t('report.sections.soap')}
            teaser={soapTeaser}
            open={sectionOpen.soap}
            onToggle={() => onExpand('soap', sectionOpen.soap)}
          >
            <div className="grid max-w-full grid-cols-1 gap-[var(--libertymd-space-lg)]">
              {(
                [
                  ['Subjective', report.soap?.subjective],
                  ['Objective', report.soap?.objective],
                  ['Assessment', report.soap?.assessment],
                  ['Plan', report.soap?.plan],
                ] as const
              ).map(([label, value]) => (
                value ? (
                  <div key={label} className="min-w-0 break-words">
                    <p className="libertymd-type-label font-bold uppercase text-libertymd-slate-500">{label}</p>
                    <p className="libertymd-type-body-small mt-1 whitespace-pre-line break-words text-libertymd-slate-700">
                      {value}
                    </p>
                  </div>
                ) : null
              ))}
            </div>
          </ReportCollapsible>
        ) : null}

        {/* 4. Download Report and Email Me My Report at the very bottom, right before Was It Helpful */}
        {!isSample ? (
          <div
            data-libertymd-report-delivery-actions
            className="flex flex-col gap-3 rounded-md border border-libertymd-slate-200 bg-libertymd-slate-50/60 p-4 mt-8"
          >
            {emailDelivery ? (
              <LibertyMDReportEmailDelivery
                consultationId={emailDelivery.consultationId}
                prefillEmail={emailDelivery.prefillEmail}
                onRequest={emailDelivery.onRequest}
                consultScroller={scrollParentRef?.current ?? null}
              />
            ) : null}

            <button
              type="button"
              data-libertymd-report-download
              className="libertymd-type-body-small inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-libertymd-blue-600 bg-white px-4 py-2 font-semibold text-libertymd-blue-700 shadow-xs hover:bg-libertymd-blue-50"
              aria-expanded={chooserOpen}
              aria-controls="libertymd-report-pdf-chooser"
              disabled={pdfBusy}
              onClick={() => {
                setPdfError(null)
                void runPdfDownload('patient')
              }}
            >
              <Download className="h-4 w-4 shrink-0" aria-hidden />
              {t('report.download')}
            </button>

            {pdfBusy ? (
              <p className="libertymd-type-label text-libertymd-slate-500" data-libertymd-report-pdf-busy>
                {t('report.pdf.generating')}
              </p>
            ) : null}

            {pdfError ? (
              <div
                data-libertymd-report-pdf-error
                className="libertymd-type-body-small rounded-md border border-libertymd-slate-300 bg-white px-[var(--libertymd-space-md)] py-[var(--libertymd-space-sm)] text-libertymd-slate-700"
                role="status"
              >
                <p>{pdfError}</p>
                <button
                  type="button"
                  className="mt-[var(--libertymd-space-xs)] font-semibold text-libertymd-blue-700 underline"
                  onClick={() => {
                    setPdfError(null)
                    void runPdfDownload('patient')
                  }}
                >
                  {t('report.pdf.retry')}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* P2-10 — feedback adjacent to saved/guest note; outside delivery-actions and doctor CTA slot */}
        {consultationId && !isSample ? (
          <LibertyMDReportFeedback consultationId={consultationId} />
        ) : null}

        {/* P3-02 — sample mode omits guest/saved retention note (false 7-day implication). */}
        {!isSample ? (
          <div
            data-libertymd-report-saved-guest-note=""
            className="libertymd-type-label flex items-center gap-2 border-t border-libertymd-slate-200 pt-[var(--libertymd-space-lg)] font-semibold text-libertymd-slate-500"
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-libertymd-blue-600" aria-hidden />
            {saved ? t('report.savedNote') : t('report.guestNote')}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function ReportCollapsible({
  sectionId,
  title,
  teaser,
  open,
  onToggle,
  children,
}: {
  sectionId: ReportSectionId
  title: string
  teaser?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const panelId = useId()
  const headingId = useId()

  return (
    <div data-report-section={sectionId} className="min-w-0">
      <h3 id={headingId} className="m-0">
        <button
          type="button"
          className="libertymd-type-body flex w-full min-h-11 items-center justify-between gap-3 text-left font-bold text-libertymd-ink"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="min-w-0">
            <span className="block">{title}</span>
            {!open && teaser ? (
              <span
                data-report-section-teaser
                className="libertymd-type-body-small mt-[var(--libertymd-space-xs)] block font-normal text-libertymd-slate-500"
              >
                {teaser}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-libertymd-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
      </h3>
      {open ? (
        <div id={panelId} role="region" aria-labelledby={headingId} className="mt-[var(--libertymd-space-sm)]">
          {children}
        </div>
      ) : null}
    </div>
  )
}
