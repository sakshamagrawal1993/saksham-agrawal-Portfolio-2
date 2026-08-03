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
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2, LogIn, Menu } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { useI18n } from '../../i18n'
import { supabase } from '../../lib/supabaseClient'
import { LibertyMDReportView } from './LibertyMDReportView'
import {
  LibertyMDGuestRetentionWarning,
  LibertyMDReportLifecycleShell,
} from './LibertyMDReportLifecycleShell'
import LibertyMDLanguageSwitcher from './LibertyMDLanguageSwitcher'
import { LibertyMDAccountDrawer, LibertyMDReportGate } from './LibertyMDCareControls'
import { isSoftGateDismissed, markSoftGateDismissed } from './libertymd-soft-gate'
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
  const [searchParams] = useSearchParams()
  const { t } = useI18n()
  const awaitingRaw = searchParams.get('awaiting')
  const awaitingTurn = awaitingRaw !== null && Number.isFinite(Number(awaitingRaw))
    ? Number(awaitingRaw)
    : null
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [isReportGateOpen, setIsReportGateOpen] = useState<boolean>(() =>
    Boolean(consultationId) && !isSoftGateDismissed(consultationId),
  )
  const [isAuthBusy, setIsAuthBusy] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const isAnonymous = !user || Boolean(user.is_anonymous)
  const startedAtRef = useRef<number>(Date.now())
  const cancelledRef = useRef(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null))
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })
    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  const ensureIdentity = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData.session) return sessionData.session
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error || !data.session) {
      throw error || new Error('Unable to create a private session.')
    }
    return data.session
  }, [])

  const load = useCallback(async (): Promise<'settled' | 'pending'> => {
    try {
      await ensureIdentity()
    } catch {
      // Fall through to invoke attempt
    }

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

    if (retentionExpiresAt && isRetentionExpired(retentionExpiresAt)) {
      setState({ kind: 'lifecycle', state: 'guest_expired' })
      return 'settled'
    }

    if (rawReport) {
      const isSaved = status === 'completed'
      setState({
        kind: 'ready',
        report: normalizeReportData(rawReport),
        saved: isSaved,
        retentionExpiresAt,
      })
      if (isSaved) {
        setIsReportGateOpen(false)
      }
      return 'settled'
    }

    if (status === 'clinical_review_needed') {
      setState({ kind: 'lifecycle', state: 'partial' })
      return 'settled'
    }
    if (status === 'emergency_stopped') {
      navigate(`/liberty-md/chat?consultationId=${encodeURIComponent(consultationId)}`, { replace: true })
      return 'settled'
    }

    const turnCount = Number(consultation.turn_count)
    if (
      awaitingTurn !== null
      && Number.isFinite(turnCount)
      && turnCount > awaitingTurn
    ) {
      navigate(
        `/liberty-md/chat?consultationId=${encodeURIComponent(consultationId)}`,
        { replace: true },
      )
      return 'settled'
    }

    setState({ kind: 'generating' })
    return 'pending'
  }, [consultationId, navigate, t, awaitingTurn, ensureIdentity])

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

  const startGoogleLink = async () => {
    if (!consultationId) return
    setIsAuthBusy(true)
    try {
      await ensureIdentity()
      const { data: transfer, error: transferError } = await supabase.functions.invoke('libertymd-care-proxy', {
        body: { action: 'prepare_account_merge', consultation_id: consultationId },
      })
      if (transferError || !transfer?.transfer_token) {
        throw transferError || new Error('Unable to prepare secure Google linking.')
      }
      window.sessionStorage.setItem(`libertymd-transfer:${consultationId}`, String(transfer.transfer_token))
      const query = new URLSearchParams({ consultationId, auth: 'complete' })
      const { error: linkError } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/liberty-md/report/${encodeURIComponent(consultationId)}?${query.toString()}` },
      })
      if (linkError) throw linkError
    } catch (err) {
      console.error('Report gate Google link failed:', err)
      setIsAuthBusy(false)
    }
  }

  const skipReportGate = async () => {
    if (!consultationId) return
    setIsAuthBusy(true)
    try {
      await ensureIdentity()
      await supabase.functions.invoke('libertymd-care-proxy', {
        body: { action: 'release_report', consultation_id: consultationId, mode: 'skip' },
      })
      markSoftGateDismissed(consultationId)
      setIsReportGateOpen(false)
      void load()
    } catch (err) {
      console.error('Report gate skip failed:', err)
    } finally {
      setIsAuthBusy(false)
    }
  }

  const dismissReportGate = () => {
    if (consultationId) markSoftGateDismissed(consultationId)
    setIsReportGateOpen(false)
  }

  const backToChat = () => {
    navigate(`/liberty-md/chat?consultationId=${encodeURIComponent(consultationId)}`)
  }

  const showGate = isReportGateOpen && (state.kind === 'loading' || state.kind === 'generating' || (state.kind === 'ready' && !state.saved))

  return (
    <div
      data-libertymd-report-page=""
      className="min-h-screen w-full bg-libertymd-blue-50/30"
    >
      <header className="sticky top-0 z-30 border-b border-libertymd-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={backToChat}
              aria-label={t('report.backToConsult')}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-libertymd-slate-500 transition hover:bg-libertymd-blue-50 hover:text-libertymd-blue-600"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="truncate font-serif text-lg font-bold text-libertymd-ink sm:text-xl">
              {t('report.pageTitle')}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <LibertyMDLanguageSwitcher />
            {isAnonymous && (
              <button
                type="button"
                aria-label="Sign in with Google"
                disabled={isAuthBusy}
                onClick={startGoogleLink}
                className="inline-flex items-center gap-1.5 rounded-full border border-libertymd-blue-600/30 bg-libertymd-blue-600/5 px-2.5 py-1.5 text-xs font-semibold text-libertymd-blue-600 transition-colors hover:bg-libertymd-blue-600 hover:text-white sm:px-4 sm:text-sm"
              >
                <LogIn className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Sign in</span>
              </button>
            )}
            <button
              type="button"
              aria-label="Open profile and consultation history"
              onClick={() => setIsMenuOpen(true)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-libertymd-ink transition hover:bg-libertymd-blue-50 hover:text-libertymd-blue-600"
            >
              <Menu className="h-5 w-5" />
            </button>
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
                onSignIn={() => navigate('/liberty-md')}
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

      {/* Sticky viewport bottom bar for Consult a Doctor (Mobile + Desktop) */}
      <div
        data-libertymd-sticky-doctor-bar=""
        className="fixed bottom-0 inset-x-0 z-40 border-t border-libertymd-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <p className="hidden text-sm font-semibold text-libertymd-slate-700 sm:block">
            Need a professional medical evaluation?
          </p>
          <button
            type="button"
            onClick={backToChat}
            className="w-full rounded-md bg-libertymd-blue-600 px-6 py-3 font-serif text-base font-semibold text-white shadow-md transition hover:bg-libertymd-blue-700 sm:w-auto"
          >
            Consult a Doctor
          </button>
        </div>
      </div>

      {showGate && (
        <LibertyMDReportGate
          loading={isAuthBusy}
          onGoogle={startGoogleLink}
          onSkip={skipReportGate}
          onClose={dismissReportGate}
        />
      )}

      <LibertyMDAccountDrawer
        open={isMenuOpen}
        isAnonymous={isAnonymous}
        displayName={user?.user_metadata?.full_name || user?.email}
        email={user?.email}
        avatarUrl={user?.user_metadata?.avatar_url}
        onClose={() => setIsMenuOpen(false)}
        onSelectConsultation={(id) => {
          setIsMenuOpen(false)
          navigate(`/liberty-md/report/${encodeURIComponent(id)}`)
        }}
        onGoogle={isAnonymous ? startGoogleLink : undefined}
        onStartOver={() => {
          setIsMenuOpen(false)
          navigate('/liberty-md')
        }}
      />
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
