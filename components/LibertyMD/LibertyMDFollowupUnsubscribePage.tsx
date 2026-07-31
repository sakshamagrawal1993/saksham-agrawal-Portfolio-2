/**
 * P4-01 — one-click unsubscribe confirmation (`/liberty-md/checkin/unsubscribe?t=`).
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { supabase } from '../../lib/supabaseClient'
import { LibertyMDRequestErrorNotice } from './LibertyMDCareControls'
import { unsubscribeFollowupCheckinBody } from './libertymd-care-proxy-client'

type PageState =
  | { kind: 'loading' }
  | { kind: 'ok' }
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

export default function LibertyMDFollowupUnsubscribePage() {
  const { t, language } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = (params.get('t') || '').trim()
  const [state, setState] = useState<PageState>({ kind: 'loading' })

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
          body: unsubscribeFollowupCheckinBody(token),
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
            /* keep */
          }
        }

        const status = typeof body?.status === 'string' ? body.status : ''
        if (status === 'unavailable') {
          setState({ kind: 'unavailable' })
          return
        }
        if (status === 'expired') {
          setState({ kind: 'expired' })
          return
        }
        if (status !== 'ok') {
          setState({
            kind: 'error',
            message: t('followup.unsubscribe.error'),
          })
          return
        }
        setState({ kind: 'ok' })
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: t('followup.unsubscribe.error'),
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
      data-libertymd-followup-unsubscribe
      className="min-h-[100svh] bg-libertymd-slate-100 px-[var(--libertymd-space-md)] py-[var(--libertymd-space-xl)]"
    >
      <div className="mx-auto max-w-lg space-y-[var(--libertymd-space-lg)]">
        <header className="flex items-center justify-between gap-3">
          <p className="libertymd-type-label m-0 font-bold uppercase tracking-wide text-libertymd-blue-700">
            LibertyMD
          </p>
          <button
            type="button"
            onClick={() => navigate(`/liberty-md?lang=${language}`)}
            className="libertymd-type-body-small font-semibold text-libertymd-slate-600 underline-offset-2 hover:underline"
          >
            {t('followup.unsubscribe.home')}
          </button>
        </header>

        {state.kind === 'loading' && (
          <p className="libertymd-type-body text-libertymd-slate-700 m-0">
            {t('followup.unsubscribe.loading')}
          </p>
        )}

        {state.kind === 'ok' && (
          <div className="space-y-[var(--libertymd-space-sm)]">
            <h1 className="libertymd-type-title m-0 text-libertymd-slate-900">
              {t('followup.unsubscribe.title')}
            </h1>
            <p className="libertymd-type-body m-0 text-libertymd-slate-700">
              {t('followup.unsubscribe.body')}
            </p>
          </div>
        )}

        {(state.kind === 'expired' || state.kind === 'unavailable') && (
          <div className="space-y-[var(--libertymd-space-sm)]">
            <h1 className="libertymd-type-title m-0 text-libertymd-slate-900">
              {t('followup.unsubscribe.expiredTitle')}
            </h1>
            <p className="libertymd-type-body m-0 text-libertymd-slate-700">
              {t('followup.unsubscribe.expiredBody')}
            </p>
          </div>
        )}

        {state.kind === 'error' && (
          <LibertyMDRequestErrorNotice message={state.message} />
        )}
      </div>
    </div>
  )
}
