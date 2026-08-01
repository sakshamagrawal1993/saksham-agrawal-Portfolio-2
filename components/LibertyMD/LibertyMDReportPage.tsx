/**
 * P5-REPORT — the dedicated report surface at `/liberty-md/report/:consultationId`.
 *
 * The report used to render inline in the chat transcript, which had three
 * problems: it inherited the transcript's scroll container so a long report
 * fought the conversation for the viewport, it could not be linked to or
 * refreshed, and a still-generating report had nowhere to live except a
 * message bubble.
 *
 * This page owns those three things instead:
 *   - its own scroll context, so the report reads like a document
 *   - a real URL, so it survives a reload and can be shared with the account
 *   - an explicit loader for `generating`, rather than an empty transcript
 *
 * It deliberately does NOT re-implement the report body. `LibertyMDReportView`
 * stays the single renderer for both this page and the sample sheet — two
 * renderers would drift, and the sample would stop being a truthful preview.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { supabase } from '../../lib/supabaseClient'
import { LibertyMDReportView } from './LibertyMDReportView'
import {
  LibertyMDGuestRetentionWarning,
  LibertyMDReportLifecycleShell,
} from './LibertyMDReportLifecycleShell'
import {
  formatRetentionRemaining,
  isRetentionExpired,
  type ReportLifecycleState,
} from './libertymd-report-lifecycle'
import { normalizeReportData, type LibertyMdNormalizedReport } from './libertymd-report'

/** How often to re-poll while the report is still being generated. */
const POLL_INTERVAL_MS = 3_000
/**
 * Stop polling eventually. A report that has not appeared in two minutes is not
 * about to; continuing to poll would spin a request loop against the proxy for
 * as long as the tab stays open.
 */
const POLL_TIMEOUT_MS = 120_000

type PageState =
  | { kind: 'loading' }
  | { kind: 'generating' }
  | { kind: 'ready'; report: LibertyMdNormalizedReport; saved: boolean; retentionExpiresAt: string | null }
  | { kind: 'lifecycle'; state: Exclude<ReportLifecycleState, 'ready' | 'generating'> }
  | { kind: 'error'; message: string }

export default function LibertyMDReportPage() {
  const { consultationId = '' } = useParams<{ consultationId: string }>()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const startedAtRef = useRef<number>(Date.now())
  const cancelledRef = useRef(false)

  const load = useCallback(async (): Promise<'settled' | 'pending'> => {
    const { data, error } = await supabase.functions.invoke('libertymd-care-proxy', {
      body: { action: 'get_consultation', consultation_id: consultationId },
    })
    if (cancelledRef.current) return 'settled'

    if (error) {
      setState({ kind: 'error', message: t('report.loadFailed') })
      return 'settled'
    }

    const consultation = (data?.consultation ?? {}) as Record<string, unknown>
    const status = String(consultation.status || '')
    // Current get_consultation returns report_data directly as `report` and
    // retention metadata at the top level. Keep the nested reads for older
    // deployed proxy responses during rollout, but do not require that envelope.
    const reportEnvelope = data?.report && typeof data.report === 'object' && !Array.isArray(data.report)
      ? data.report as Record<string, unknown>
      : null
    const rawReport = reportEnvelope && 'report_data' in reportEnvelope
      ? reportEnvelope.report_data
      : data?.report ?? data?.report_data ?? null
    const retentionExpiresAt = (
      data?.retention_expires_at
      ?? reportEnvelope?.retention_expires_at
      ?? null
    ) as string | null

    // Retention wins over content: an expired guest report must not render even
    // if the body is still sitting in the row.
    if (retentionExpiresAt && isRetentionExpired(retentionExpiresAt)) {
      setState({ kind: 'lifecycle', state: 'guest_expired' })
      return 'settled'
    }

    if (rawReport) {
      setState({
        kind: 'ready',
        report: normalizeReportData(rawReport),
        // Linked and guest-released reports settle at completed. The withheld
        // anonymous soft-gate remains report_pending_auth and must retain guest
        // treatment even though get_consultation has no top-level is_anonymous.
        saved: status === 'completed',
        retentionExpiresAt,
      })
      return 'settled'
    }

    if (status === 'clinical_review_needed') {
      setState({ kind: 'lifecycle', state: 'partial' })
      return 'settled'
    }
    if (status === 'emergency_stopped') {
      // An emergency consult has no report by design. Send the reader back to
      // the conversation, where the terminal guidance is pinned.
      navigate(`/liberty-md/chat?consultationId=${encodeURIComponent(consultationId)}`, { replace: true })
      return 'settled'
    }

    // Still interviewing or mid-diagnosis: keep waiting.
    setState({ kind: 'generating' })
    return 'pending'
  }, [consultationId, navigate, t])

  useEffect(() => {
    if (!consultationId) {
      navigate('/liberty-md', { replace: true })
      return
    }
    cancelledRef.current = false
    startedAtRef.current = Date.now()
    let timer: number | undefined

    const tick = async () => {
      const outcome = await load()
      if (cancelledRef.current || outcome === 'settled') return
      if (Date.now() - startedAtRef.current > POLL_TIMEOUT_MS) {
        setState({ kind: 'lifecycle', state: 'generation_failed' })
        return
      }
      timer = window.setTimeout(tick, POLL_INTERVAL_MS)
    }
    void tick()

    return () => {
      cancelledRef.current = true
      if (timer) window.clearTimeout(timer)
    }
  }, [consultationId, load, navigate])

  const backToChat = () => {
    navigate(`/liberty-md/chat?consultationId=${encodeURIComponent(consultationId)}`)
  }

  return (
    <div
      data-libertymd-report-page=""
      className="min-h-screen w-full bg-libertymd-blue-50/30"
    >
      <header className="sticky top-0 z-30 border-b border-libertymd-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={backToChat}
            aria-label={t('report.backToConsult')}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-libertymd-slate-500 transition hover:bg-libertymd-blue-50 hover:text-libertymd-blue-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate font-serif text-lg font-semibold text-libertymd-ink sm:text-xl">
              {t('report.pageTitle')}
            </p>
            <p className="truncate text-xs font-medium text-libertymd-slate-500">
              {t('report.pageSubtitle')}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6 sm:px-6">
        {state.kind === 'loading' || state.kind === 'generating' ? (
          <ReportLoader
            heading={state.kind === 'generating' ? t('report.generatingHeading') : t('report.loadingHeading')}
            body={state.kind === 'generating' ? t('report.generatingBody') : ''}
          />
        ) : null}

        {state.kind === 'error' ? (
          <p role="alert" className="rounded-lg border border-libertymd-slate-200 bg-white p-6 text-sm font-medium text-libertymd-slate-700">
            {state.message}
          </p>
        ) : null}

        {state.kind === 'lifecycle' ? (
          <LibertyMDReportLifecycleShell
            state={state.state}
            onStartFresh={() => navigate('/liberty-md')}
            onRetry={() => {
              startedAtRef.current = Date.now()
              setState({ kind: 'loading' })
              void load()
            }}
          />
        ) : null}

        {state.kind === 'ready' ? (
          <>
            {!state.saved && state.retentionExpiresAt ? (
              <LibertyMDGuestRetentionWarning
                remainingLabel={formatRetentionRemaining(state.retentionExpiresAt)}
                className="mb-4"
              />
            ) : null}
            <LibertyMDReportView
              report={state.report}
              saved={state.saved}
              consultationId={consultationId}
              retentionExpiresAt={state.retentionExpiresAt}
              emailDelivery={{
                consultationId,
                onRequest: async (email: string) => {
                  const { error } = await supabase.functions.invoke('libertymd-care-proxy', {
                    body: { action: 'request_report_email', consultation_id: consultationId, contact_email: email },
                  })
                  if (error) throw error
                },
              }}
            />
          </>
        ) : null}
      </main>
    </div>
  )
}

/**
 * The loader.
 *
 * Deliberately calm and specific rather than a bare spinner: the wait here is
 * seconds-to-a-minute while the diagnosis workflow runs, and a patient watching
 * an unexplained spinner after a clinical conversation reads it as something
 * having gone wrong. Naming the step is what makes the wait tolerable.
 */
function ReportLoader({ heading, body }: { heading: string; body: string }) {
  return (
    <section
      data-libertymd-report-loader=""
      aria-live="polite"
      aria-busy="true"
      className="rounded-lg border border-libertymd-slate-200 bg-white p-8 text-center shadow-sm sm:p-12"
    >
      <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-libertymd-blue-50 text-libertymd-blue-600">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      </span>
      <h2 className="mt-6 font-serif text-2xl font-semibold text-libertymd-ink">{heading}</h2>
      {body ? (
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-libertymd-slate-500">{body}</p>
      ) : null}
      {/* Skeleton of the document to come, so the page has the shape of a
          report rather than an empty box while it loads. */}
      <div className="mx-auto mt-10 max-w-xl space-y-3" aria-hidden="true">
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-libertymd-slate-200" />
        <div className="h-3 w-full animate-pulse rounded-full bg-libertymd-slate-200" />
        <div className="h-3 w-5/6 animate-pulse rounded-full bg-libertymd-slate-200" />
        <div className="h-24 w-full animate-pulse rounded-lg bg-libertymd-slate-200" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-libertymd-slate-200" />
      </div>
    </section>
  )
}
