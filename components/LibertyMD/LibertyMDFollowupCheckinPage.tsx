/**
 * P4-01/P4-02 — feeling check-in respond landing (`/liberty-md/checkin?t=&a=`).
 *
 * Records feeling via proxy; emits client Mixpanel `followup_responded` (fire 1).
 * After success: skippable “Did you see a doctor?” (+ optional match) on thanks
 * and worse holding — page-only; never blocks worse CTA. Doctor answer →
 * one-shot persist + fire 2 with `{ answer, saw_doctor [, report_match] }`.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { supabase } from '../../lib/supabaseClient'
import { LibertyMDRequestErrorNotice } from './LibertyMDCareControls'
import {
  emitFollowupResponded,
  type FollowupReportMatch,
  type FollowupRespondAnswer,
  type FollowupSawDoctor,
} from './libertymd-analytics'
import { respondFollowupCheckinBody } from './libertymd-care-proxy-client'

type PageState =
  | { kind: 'loading' }
  | { kind: 'thanks'; answer: FollowupRespondAnswer }
  | { kind: 'worse_ready'; answer: FollowupRespondAnswer; consultationId: string }
  | { kind: 'expired' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }

type DoctorUi =
  | { phase: 'ask' }
  | { phase: 'match'; sawDoctor: 'yes' }
  | { phase: 'done' }
  | { phase: 'saving' }
  | { phase: 'skipped' }

const ANSWERS = new Set(['better', 'same', 'worse'])
const SAW_OPTIONS: FollowupSawDoctor[] = ['yes', 'no', 'not_yet']
const MATCH_OPTIONS: FollowupReportMatch[] = ['yes', 'no', 'unsure']

async function ensureProxySession() {
  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData.session) return sessionData.session
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error || !data.session) {
    throw error || new Error('Unable to open a private LibertyMD session.')
  }
  return data.session
}

export default function LibertyMDFollowupCheckinPage() {
  const { t, language } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = (params.get('t') || '').trim()
  const answerRaw = (params.get('a') || '').trim().toLowerCase()
  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [doctorUi, setDoctorUi] = useState<DoctorUi>({ phase: 'ask' })
  const [doctorError, setDoctorError] = useState<string | null>(null)
  const feelingEmittedRef = useRef(false)
  const doctorEmittedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!token || !ANSWERS.has(answerRaw)) {
        if (!cancelled) setState({ kind: 'expired' })
        return
      }
      const answer = answerRaw as FollowupRespondAnswer
      try {
        await ensureProxySession()
        const { data, error } = await supabase.functions.invoke('libertymd-care-proxy', {
          body: respondFollowupCheckinBody(token, answer),
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
        if (status === 'expired') {
          setState({ kind: 'expired' })
          return
        }
        if (status !== 'ok') {
          setState({
            kind: 'error',
            message: t('followup.checkin.error'),
          })
          return
        }

        if (!feelingEmittedRef.current) {
          feelingEmittedRef.current = true
          emitFollowupResponded({ answer })
        }

        const newId = typeof body?.new_consultation_id === 'string'
          ? body.new_consultation_id
          : ''
        if (answer === 'worse' && newId) {
          setState({ kind: 'worse_ready', answer, consultationId: newId })
          return
        }
        if (answer === 'worse' && !newId) {
          setState({ kind: 'unavailable' })
          return
        }
        setState({ kind: 'thanks', answer })
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: t('followup.checkin.error'),
          })
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [token, answerRaw, t])

  const feelingAnswer: FollowupRespondAnswer | null =
    state.kind === 'thanks' || state.kind === 'worse_ready' ? state.answer : null

  const showDoctorPanel =
    feelingAnswer != null &&
    (doctorUi.phase === 'ask' || doctorUi.phase === 'match' || doctorUi.phase === 'saving')

  async function persistDoctor(
    sawDoctor: FollowupSawDoctor,
    reportMatch?: FollowupReportMatch,
  ) {
    if (!feelingAnswer || !token) return
    setDoctorError(null)
    setDoctorUi({ phase: 'saving' })
    try {
      await ensureProxySession()
      const { data, error } = await supabase.functions.invoke('libertymd-care-proxy', {
        body: respondFollowupCheckinBody(token, feelingAnswer, {
          saw_doctor: sawDoctor,
          ...(reportMatch ? { report_match: reportMatch } : {}),
        }),
      })
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
      if (body?.status !== 'ok') {
        setDoctorError(t('followup.checkin.error'))
        setDoctorUi(
          sawDoctor === 'yes' && !reportMatch
            ? { phase: 'match', sawDoctor: 'yes' }
            : { phase: 'ask' },
        )
        return
      }
      if (!doctorEmittedRef.current) {
        doctorEmittedRef.current = true
        emitFollowupResponded({
          answer: feelingAnswer,
          saw_doctor: sawDoctor,
          ...(reportMatch ? { report_match: reportMatch } : {}),
        })
      }
      setDoctorUi({ phase: 'done' })
    } catch (err) {
      setDoctorError(t('followup.checkin.error'))
      setDoctorUi({ phase: 'ask' })
    }
  }

  function onSawDoctor(choice: FollowupSawDoctor) {
    if (choice === 'yes') {
      setDoctorUi({ phase: 'match', sawDoctor: 'yes' })
      return
    }
    void persistDoctor(choice)
  }

  function onReportMatch(choice: FollowupReportMatch) {
    void persistDoctor('yes', choice)
  }

  function onSkipDoctor() {
    setDoctorUi({ phase: 'skipped' })
  }

  function onSkipMatch() {
    void persistDoctor('yes')
  }

  const doctorPanel = showDoctorPanel ? (
    <div
      data-libertymd-followup-doctor
      className="space-y-[var(--libertymd-space-sm)] border-t border-libertymd-slate-200 pt-[var(--libertymd-space-md)]"
    >
      {doctorUi.phase === 'ask' || doctorUi.phase === 'saving' ? (
        <>
          <p className="libertymd-type-body m-0 font-semibold text-libertymd-slate-900">
            {t('followup.checkin.doctorQuestion')}
          </p>
          <div className="flex flex-wrap gap-[var(--libertymd-space-sm)]">
            {SAW_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                data-libertymd-followup-saw-doctor={opt}
                disabled={doctorUi.phase === 'saving'}
                onClick={() => onSawDoctor(opt)}
                className="inline-flex items-center justify-center rounded-[var(--libertymd-radius-md)] border border-libertymd-slate-300 bg-white px-[var(--libertymd-space-md)] py-[var(--libertymd-space-sm)] libertymd-type-body font-semibold text-libertymd-slate-800 hover:border-libertymd-blue-600"
              >
                {opt === 'yes'
                  ? t('followup.checkin.doctorYes')
                  : opt === 'no'
                  ? t('followup.checkin.doctorNo')
                  : t('followup.checkin.doctorNotYet')}
              </button>
            ))}
          </div>
          <button
            type="button"
            data-libertymd-followup-doctor-skip
            disabled={doctorUi.phase === 'saving'}
            onClick={onSkipDoctor}
            className="libertymd-type-body-small font-semibold text-libertymd-slate-600 underline-offset-2 hover:underline"
          >
            {t('followup.checkin.doctorSkip')}
          </button>
        </>
      ) : null}

      {doctorUi.phase === 'match' ? (
        <>
          <p className="libertymd-type-body m-0 font-semibold text-libertymd-slate-900">
            {t('followup.checkin.matchQuestion')}
          </p>
          <p className="libertymd-type-body-small m-0 text-libertymd-slate-600">
            {t('followup.checkin.matchHint')}
          </p>
          <div className="flex flex-wrap gap-[var(--libertymd-space-sm)]">
            {MATCH_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                data-libertymd-followup-report-match={opt}
                onClick={() => onReportMatch(opt)}
                className="inline-flex items-center justify-center rounded-[var(--libertymd-radius-md)] border border-libertymd-slate-300 bg-white px-[var(--libertymd-space-md)] py-[var(--libertymd-space-sm)] libertymd-type-body font-semibold text-libertymd-slate-800 hover:border-libertymd-blue-600"
              >
                {opt === 'yes'
                  ? t('followup.checkin.matchYes')
                  : opt === 'no'
                  ? t('followup.checkin.matchNo')
                  : t('followup.checkin.matchUnsure')}
              </button>
            ))}
          </div>
          <button
            type="button"
            data-libertymd-followup-match-skip
            onClick={onSkipMatch}
            className="libertymd-type-body-small font-semibold text-libertymd-slate-600 underline-offset-2 hover:underline"
          >
            {t('followup.checkin.matchSkip')}
          </button>
        </>
      ) : null}

      {doctorError ? (
        <p className="libertymd-type-body-small m-0 text-libertymd-slate-700" role="alert">
          {doctorError}
        </p>
      ) : null}
    </div>
  ) : null

  return (
    <div
      data-libertymd-followup-checkin
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
            {t('followup.checkin.home')}
          </button>
        </header>

        {state.kind === 'loading' && (
          <p className="libertymd-type-body text-libertymd-slate-700 m-0">
            {t('followup.checkin.loading')}
          </p>
        )}

        {state.kind === 'thanks' && (
          <div className="space-y-[var(--libertymd-space-md)]">
            <h1 className="libertymd-type-title m-0 text-libertymd-slate-900">
              {t('followup.checkin.thanksTitle')}
            </h1>
            <p className="libertymd-type-body m-0 text-libertymd-slate-700">
              {t('followup.checkin.thanksBody')}
            </p>
            {doctorPanel}
          </div>
        )}

        {state.kind === 'worse_ready' && (
          <div className="space-y-[var(--libertymd-space-md)]">
            <h1 className="libertymd-type-title m-0 text-libertymd-slate-900">
              {t('followup.checkin.worseTitle')}
            </h1>
            <p className="libertymd-type-body m-0 text-libertymd-slate-700">
              {t('followup.checkin.worseBody')}
            </p>
            <button
              type="button"
              data-libertymd-followup-worse-cta
              onClick={() =>
                navigate(`/liberty-md/chat?consultationId=${encodeURIComponent(state.consultationId)}&lang=${language}`)
              }
              className="inline-flex items-center justify-center rounded-[var(--libertymd-radius-md)] bg-libertymd-blue-600 px-[var(--libertymd-space-md)] py-[var(--libertymd-space-sm)] libertymd-type-body font-semibold text-white"
            >
              {t('followup.checkin.worseCta')}
            </button>
            {doctorPanel}
          </div>
        )}

        {state.kind === 'expired' && (
          <div className="space-y-[var(--libertymd-space-sm)]">
            <h1 className="libertymd-type-title m-0 text-libertymd-slate-900">
              {t('followup.checkin.expiredTitle')}
            </h1>
            <p className="libertymd-type-body m-0 text-libertymd-slate-700">
              {t('followup.checkin.expiredBody')}
            </p>
          </div>
        )}

        {state.kind === 'unavailable' && (
          <div className="space-y-[var(--libertymd-space-sm)]">
            <h1 className="libertymd-type-title m-0 text-libertymd-slate-900">
              {t('followup.checkin.unavailableTitle')}
            </h1>
            <p className="libertymd-type-body m-0 text-libertymd-slate-700">
              {t('followup.checkin.unavailableBody')}
            </p>
            <button
              type="button"
              onClick={() => navigate(`/liberty-md?lang=${language}`)}
              className="inline-flex items-center justify-center rounded-[var(--libertymd-radius-md)] bg-libertymd-blue-600 px-[var(--libertymd-space-md)] py-[var(--libertymd-space-sm)] libertymd-type-body font-semibold text-white"
            >
              {t('followup.checkin.startNew')}
            </button>
          </div>
        )}

        {state.kind === 'error' && (
          <LibertyMDRequestErrorNotice message={state.message} />
        )}
      </div>
    </div>
  )
}
