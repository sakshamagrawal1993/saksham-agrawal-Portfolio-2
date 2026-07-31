/**
 * P2-08 — bearer redeem deep-link host (`/liberty-md/report?t=`).
 *
 * Honest expired / unavailable UX — never promises sign-in restores a deleted
 * guest report. Renders shared LibertyMDReportView on success.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { supabase } from '../../lib/supabaseClient'
import { LibertyMDReportView } from './LibertyMDReportView'
import { LibertyMDRequestErrorNotice } from './LibertyMDCareControls'
import { normalizeReportData, type LibertyMdNormalizedReport } from './libertymd-report'

type RedeemState =
  | { kind: 'loading' }
  | { kind: 'ok'; report: LibertyMdNormalizedReport; saved: boolean }
  | { kind: 'expired' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }

async function ensureProxySession() {
  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData.session) return sessionData.session
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error || !data.session) {
    throw error || new Error('Unable to open a private LibertyMD session.')
  }
  return data.session
}

export default function LibertyMDReportRedeemPage() {
  const { t, language } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = (params.get('t') || '').trim()
  const [state, setState] = useState<RedeemState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!token) {
        if (!cancelled) setState({ kind: 'expired' })
        return
      }
      try {
        await ensureProxySession()
        const { data, error } = await supabase.functions.invoke('libertymd-care-proxy', {
          body: { action: 'redeem_report_link', delivery_token: token },
        })
        if (cancelled) return

        const bodyFromData = data && typeof data === 'object' ? data as Record<string, unknown> : null
        let body = bodyFromData
        if (error) {
          const context = (error as { context?: Response }).context
          try {
            if (context && typeof context.clone === 'function') {
              body = await context.clone().json() as Record<string, unknown>
            }
          } catch {
            /* keep bodyFromData */
          }
        }

        const status = typeof body?.status === 'string' ? body.status : ''
        if (status === 'unavailable') {
          setState({ kind: 'unavailable' })
          return
        }
        if (status === 'expired' || (!body?.report && error)) {
          setState({ kind: 'expired' })
          return
        }
        if (!body?.report || status !== 'ok') {
          setState({
            kind: 'error',
            message: t('report.emailDelivery.redeemError'),
          })
          return
        }

        const access = String(body.access_status || '')
        setState({
          kind: 'ok',
          report: normalizeReportData(body.report),
          saved: access === 'saved',
        })
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: t('report.emailDelivery.redeemError'),
          })
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [token, t])

  return (
    <div
      data-libertymd-report-redeem
      className="min-h-[100svh] bg-libertymd-slate-100 px-[var(--libertymd-space-md)] py-[var(--libertymd-space-xl)]"
    >
      <div className="mx-auto max-w-2xl space-y-[var(--libertymd-space-lg)]">
        <header className="flex items-center justify-between gap-3">
          <p className="libertymd-type-label m-0 font-bold uppercase tracking-wide text-libertymd-blue-700">
            LibertyMD
          </p>
          <button
            type="button"
            onClick={() => navigate(`/liberty-md?lang=${language}`)}
            className="libertymd-type-body-small font-semibold text-libertymd-slate-600 underline-offset-2 hover:underline"
          >
            {t('report.emailDelivery.startNew')}
          </button>
        </header>

        {state.kind === 'loading' ? (
          <p className="libertymd-type-body text-libertymd-slate-600" data-libertymd-redeem-loading>
            {t('report.emailDelivery.redeeming')}
          </p>
        ) : null}

        {state.kind === 'expired' ? (
          <div
            data-libertymd-redeem-expired
            className="space-y-[var(--libertymd-space-sm)] rounded-md border border-libertymd-slate-300 bg-white p-[var(--libertymd-space-lg)]"
          >
            <h1 className="libertymd-type-h3 m-0 font-bold text-libertymd-ink">
              {t('report.emailDelivery.expiredTitle')}
            </h1>
            <p className="libertymd-type-body-small m-0 text-libertymd-slate-600">
              {t('report.emailDelivery.expiredBody')}
            </p>
          </div>
        ) : null}

        {state.kind === 'unavailable' ? (
          <div
            data-libertymd-redeem-unavailable
            className="space-y-[var(--libertymd-space-sm)] rounded-md border border-libertymd-slate-300 bg-white p-[var(--libertymd-space-lg)]"
          >
            <h1 className="libertymd-type-h3 m-0 font-bold text-libertymd-ink">
              {t('report.emailDelivery.unavailableTitle')}
            </h1>
            <p className="libertymd-type-body-small m-0 text-libertymd-slate-600">
              {t('report.emailDelivery.unavailableBody')}
            </p>
          </div>
        ) : null}

        {state.kind === 'error' ? (
          <LibertyMDRequestErrorNotice message={state.message} />
        ) : null}

        {state.kind === 'ok' ? (
          <LibertyMDReportView report={state.report} saved={state.saved} />
        ) : null}
      </div>
    </div>
  )
}
