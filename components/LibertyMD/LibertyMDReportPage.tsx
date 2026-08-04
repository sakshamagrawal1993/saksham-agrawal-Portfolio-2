/**
 * P5-REPORT — the dedicated report surface at `/liberty-md/report/:consultationId`.
 *
 * The report used to render inline in the chat transcript.
 * This page owns:
 *   - its own scroll context, so the report reads like a document
 *   - a real URL, so it survives a reload and can be shared with the account
 *   - an explicit loader with a 1-minute countdown timer for `generating`
 *
 * It deliberately does NOT re-implement the report body. `LibertyMDReportView`
 * stays the single renderer.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, LogIn, Menu, RefreshCw } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { useI18n } from '../../i18n'
import { supabase } from '../../lib/supabaseClient'
import { LibertyMDReportView } from './LibertyMDReportView'
import {
  LibertyMDGuestRetentionWarning,
  LibertyMDReportLifecycleShell,
} from './LibertyMDReportLifecycleShell'
import LibertyMDLanguageSwitcher from './LibertyMDLanguageSwitcher'
import LibertyMDFooterRibbon from './LibertyMDFooterRibbon'
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
/** Polling timeout: 2 minutes (120,000 ms) before auto-triggering report generation retry. */
const POLL_TIMEOUT_MS = 120_000
/** Maximum allowed report regenerations per consultation. */
const MAX_REGENERATIONS_PER_CONSULTATION = 2

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
  const [isReportGateOpen, setIsReportGateOpen] = useState<boolean>(() =>
    Boolean(consultationId) && !isSoftGateDismissed(consultationId),
  )
  const [isAuthBusy, setIsAuthBusy] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const isAnonymous = !user || Boolean(user.is_anonymous)
  const startedAtRef = useRef<number>(Date.now())
  const cancelledRef = useRef(false)
  const consecutiveErrorsRef = useRef(0)

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
      consecutiveErrorsRef.current += 1
      // Tolerates transient network hiccups — only trigger hard error after 5 consecutive failures
      if (consecutiveErrorsRef.current >= 5) {
        setState({ kind: 'error', message: t('report.loadFailed') })
        return 'settled'
      }
      return 'pending'
    }

    consecutiveErrorsRef.current = 0
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
      const reportPayload = typeof rawReport === 'object' && rawReport !== null
        ? {
            ...(rawReport as Record<string, unknown>),
            patient: (rawReport as Record<string, unknown>).patient || data?.patient || (consultation?.patient as unknown) || null,
          }
        : rawReport
      setState({
        kind: 'ready',
        report: normalizeReportData(reportPayload),
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

    setState({ kind: 'generating' })
    return 'pending'
  }, [consultationId, navigate, t, ensureIdentity])

  const triggerReload = useCallback(() => {
    consecutiveErrorsRef.current = 0
    startedAtRef.current = Date.now()
    setState({ kind: 'loading' })
    void load()
  }, [load])

  useEffect(() => {
    if (!consultationId) {
      navigate('/liberty-md', { replace: true })
      return
    }
    cancelledRef.current = false
    startedAtRef.current = Date.now()
    consecutiveErrorsRef.current = 0
    let timer: number | undefined
    let regenerationCount = 0

    const tick = async () => {
      const outcome = await load()
      if (cancelledRef.current || outcome === 'settled') return
      if (Date.now() - startedAtRef.current > POLL_TIMEOUT_MS) {
        // Upper limit of 2 regenerations per consultation
        if (regenerationCount < MAX_REGENERATIONS_PER_CONSULTATION) {
          regenerationCount += 1
          startedAtRef.current = Date.now()
          try {
            await ensureIdentity()
            await supabase.functions.invoke('libertymd-care-proxy', {
              body: { action: 'release_report', consultation_id: consultationId, mode: 'skip' },
            })
          } catch {
            // ignore
          }
          timer = window.setTimeout(tick, POLL_INTERVAL_MS)
          return
        }
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

  const backToHome = () => {
    navigate('/liberty-md')
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
              onClick={backToHome}
              aria-label="Back to LibertyMD Home"
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
            onRefresh={triggerReload}
          />
        ) : null}

        {state.kind === 'error' ? (
          <div role="alert" className="rounded-xl border border-rose-200 bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-semibold text-rose-700">{state.message}</p>
            <button
              type="button"
              onClick={triggerReload}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-libertymd-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-libertymd-blue-700"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
          </div>
        ) : null}

        {state.kind === 'lifecycle' ? (
          <LibertyMDReportLifecycleShell
            state={state.state}
            onStartFresh={() => navigate('/liberty-md')}
            onRetry={triggerReload}
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
            onClick={() => navigate('/liberty-md/chat')}
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
 * Unboxed Clinical Loader with Dynamic WebGL Ribbon
 *
 * - Background: WebGL Silk Ribbon from LibertyMDFooterRibbon (occupies full container, unboxed)
 * - Header: "Creating report..."
 * - Center logo encircled by SVG circular progress ring (drains from 100% Full to 0% Empty over 1 min, no numeric countdown text)
 * - 4 Stage items with active verbs (Analyzing Symptoms, Evaluating Differential, Synthesizing SOAP Note, Finalizing Clinical Report)
 */
function ReportLoader({ onRefresh }: { onRefresh?: () => void }) {
  const TOTAL_SECONDS = 60
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS)

  useEffect(() => {
    setSecondsLeft(TOTAL_SECONDS)
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // Full (100%) at 60s down to Empty (0%) at 0s over 1 minute
  const progressRatio = secondsLeft / TOTAL_SECONDS

  // SVG Circle Progress calculation (radius 56 -> circumference ~351.86)
  const radius = 56
  const circumference = 2 * Math.PI * radius
  // Full ring at 60s (offset 0), Empty ring at 0s (offset circumference)
  const strokeDashoffset = circumference * (1 - progressRatio)

  // 4 Stage items with verbs over 60s (15s each)
  const stageItems = [
    { id: 'symptoms', verb: 'Analyzing Symptoms', desc: 'Parsing patient symptoms & intake...' },
    { id: 'differential', verb: 'Evaluating Differential', desc: 'Cross-referencing medical database probabilities...' },
    { id: 'soap', verb: 'Synthesizing SOAP Note', desc: 'Structuring subjective & objective clinical plan...' },
    { id: 'finalizing', verb: 'Finalizing Clinical Report', desc: 'Preparing physician-ready summary document...' },
  ]

  const activeIndex = secondsLeft > 45 ? 0 : secondsLeft > 30 ? 1 : secondsLeft > 15 ? 2 : 3
  const activeItem = stageItems[activeIndex] || stageItems[3]

  return (
    <div className="relative min-h-[560px] w-full py-12 px-4 flex flex-col items-center justify-center text-center">
      {/* Dynamic 3D WebGL Ribbon Occupies Whole Container Background (Unboxed) */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-75 overflow-hidden" aria-hidden="true">
        <LibertyMDFooterRibbon />
      </div>

      {/* Unboxed Content Floating Directly On Top (No Inner Card Enclosure) */}
      <section
        data-libertymd-report-loader=""
        aria-live="polite"
        aria-busy="true"
        className="relative z-10 flex flex-col items-center max-w-lg w-full text-center px-4"
      >
        {/* Header */}
        <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-libertymd-ink">
          Creating report...
        </h2>

        {/* Center Logo Encircled by Circular SVG Countdown Ring (Full to Empty over 1 min, no numeric countdown text) */}
        <div className="relative mt-10 mb-8 flex h-36 w-36 items-center justify-center">
          {/* SVG Circular Progress Ring */}
          <svg className="absolute inset-0 h-full w-full -rotate-90 transform" viewBox="0 0 128 128">
            {/* Background Track Circle */}
            <circle
              cx="64"
              cy="64"
              r={radius}
              className="stroke-libertymd-blue-100/60"
              strokeWidth="5"
              fill="transparent"
            />
            {/* Animated Progress Circle (Starts Full, Drains to Empty) */}
            <circle
              cx="64"
              cy="64"
              r={radius}
              className="stroke-libertymd-blue-600 transition-all duration-1000 ease-linear"
              strokeWidth="5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>

          {/* Logo Mark in Center (No numeric countdown text visible) */}
          <div className="relative z-10 flex items-center justify-center">
            <img
              src="/images/libertymd-logo-mark.svg"
              alt="LibertyMD Logo"
              className="h-12 w-12 object-contain filter drop-shadow-xs"
            />
          </div>
        </div>

        {/* Active Stage Verb Item - Dynamic stage item that comes and goes */}
        <div className="min-h-[72px] flex flex-col items-center justify-center transition-all duration-500">
          <h3 className="font-sans text-xl font-bold text-libertymd-blue-700 tracking-tight transition-all duration-500">
            {activeItem.verb}
          </h3>
          <p className="mt-1 text-xs font-medium text-libertymd-slate-500">
            {activeItem.desc}
          </p>
        </div>

        {secondsLeft === 0 ? (
          <div className="mt-8">
            <button
              type="button"
              onClick={() => onRefresh?.()}
              className="inline-flex items-center gap-2 rounded-xl bg-libertymd-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-libertymd-blue-700 active:scale-95"
            >
              <RefreshCw className="h-4 w-4" />
              Check Report Status
            </button>
          </div>
        ) : (
          <p className="mt-8 text-xs text-libertymd-slate-400 font-medium">
            Please stay on this page. Your report will display automatically once complete.
          </p>
        )}
      </section>
    </div>
  )
}
