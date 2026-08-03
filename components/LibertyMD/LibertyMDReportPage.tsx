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
import { ArrowLeft, Check, Clock, Loader2, LogIn, Menu, RefreshCw } from 'lucide-react'
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
 * Clean & Crisp Clinical Countdown Loader
 *
 * - Background: Dynamic WebGL Silk Ribbon from LibertyMDFooterRibbon
 * - Header: "Creating report..."
 * - Center logo encircled by a circular SVG countdown progress ring (02:00 -> 00:00)
 * - 4 Stepper stages: Symptoms, Differential, SOAP Note, Finalizing
 */
function ReportLoader({ onRefresh }: { onRefresh?: () => void }) {
  const TOTAL_SECONDS = 120
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

  const progressPercent = Math.min(100, Math.round(((TOTAL_SECONDS - secondsLeft) / TOTAL_SECONDS) * 100))
  const minutes = Math.floor(secondsLeft / 60)
  const remSeconds = secondsLeft % 60
  const formattedTime = `0${minutes}:${remSeconds < 10 ? '0' : ''}${remSeconds}`

  // SVG Circle Progress calculation (radius 56 -> circumference ~351.86)
  const radius = 56
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference

  // 4 Stepper stages over 120s
  const stepIndex = secondsLeft > 90 ? 0 : secondsLeft > 60 ? 1 : secondsLeft > 30 ? 2 : 3

  const stages = [
    { title: 'Symptoms', label: 'Summarizing patient symptoms & intake...' },
    { title: 'Differential', label: 'Evaluating clinical probabilities...' },
    { title: 'SOAP Note', label: 'Structuring subjective & objective plan...' },
    { title: 'Finalizing', label: 'Finalizing physician report document...' },
  ]

  const activeStageLabel = stages[stepIndex]?.label ?? 'Finalizing report...'

  return (
    <div className="relative min-h-[580px] w-full overflow-hidden rounded-3xl border border-libertymd-slate-200/80 bg-[#FAFBFD] p-6 sm:p-12 shadow-lg flex flex-col items-center justify-center text-center">
      {/* Dynamic 3D WebGL Ribbon in Background */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-60 overflow-hidden" aria-hidden="true">
        <LibertyMDFooterRibbon />
      </div>

      {/* Main Glass Card Overlay */}
      <section
        data-libertymd-report-loader=""
        aria-live="polite"
        aria-busy="true"
        className="relative z-10 w-full max-w-lg rounded-2xl border border-libertymd-blue-100 bg-white/90 p-8 sm:p-12 text-center backdrop-blur-md shadow-[0_15px_45px_rgba(37,99,235,0.08)] flex flex-col items-center"
      >
        {/* Header */}
        <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-libertymd-ink">
          Creating report...
        </h2>

        {/* Subtitle / Active Stage */}
        <p className="mt-2 text-sm font-medium text-libertymd-blue-700 animate-pulse">
          {activeStageLabel}
        </p>

        {/* Center Logo Encircled by Circular Progress Ring */}
        <div className="relative mt-8 mb-4 flex h-36 w-36 items-center justify-center">
          {/* SVG Circular Progress Ring */}
          <svg className="absolute inset-0 h-full w-full -rotate-90 transform" viewBox="0 0 128 128">
            {/* Background Track Circle */}
            <circle
              cx="64"
              cy="64"
              r={radius}
              className="stroke-libertymd-blue-50"
              strokeWidth="6"
              fill="transparent"
            />
            {/* Animated Progress Circle */}
            <circle
              cx="64"
              cy="64"
              r={radius}
              className="stroke-libertymd-blue-600 transition-all duration-1000 ease-linear"
              strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>

          {/* Logo & Timer in Center */}
          <div className="relative z-10 flex flex-col items-center justify-center text-center">
            <img
              src="/images/libertymd-logo-mark.svg"
              alt="LibertyMD Logo"
              className="h-10 w-10 object-contain mb-1"
            />
            <span className="font-mono text-sm font-bold text-libertymd-ink tracking-tight">
              {formattedTime}
            </span>
          </div>
        </div>

        {/* 4 Clinical Steps */}
        <div className="mt-6 w-full grid grid-cols-4 gap-2 pt-6 border-t border-libertymd-slate-100">
          {stages.map((st, idx) => {
            const isCompleted = idx < stepIndex
            const isCurrent = idx === stepIndex
            return (
              <div key={st.title} className="flex flex-col items-center text-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                    isCompleted
                      ? 'bg-libertymd-blue-600 text-white shadow-xs'
                      : isCurrent
                        ? 'bg-libertymd-blue-50 text-libertymd-blue-700 ring-2 ring-libertymd-blue-600'
                        : 'bg-libertymd-slate-100 text-libertymd-slate-400'
                  }`}
                >
                  {isCompleted ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : idx + 1}
                </div>
                <span
                  className={`mt-2 text-[11px] font-semibold leading-snug ${
                    isCurrent
                      ? 'text-libertymd-blue-700 font-bold'
                      : isCompleted
                        ? 'text-libertymd-ink'
                        : 'text-libertymd-slate-400'
                  }`}
                >
                  {st.title}
                </span>
              </div>
            )
          })}
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
          <p className="mt-6 text-xs text-libertymd-slate-400 font-medium">
            Please stay on this page. Your report will display automatically once complete.
          </p>
        )}
      </section>
    </div>
  )
}
