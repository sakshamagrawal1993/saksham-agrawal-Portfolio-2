/**
 * P2-10 — one-tap “was this helpful?” + always-visible optional free-text.
 *
 * Mounted from shared ReportView near the saved/guest note — not in footerSlot,
 * not soft-gate chrome, not email/PDF delivery CTAs.
 * Clinical persist via proxy only; Mixpanel gets helpful + has_comment only.
 */
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { supabase } from '../../lib/supabaseClient'
import { emitFeedbackSubmitted } from './libertymd-analytics'
import {
  statusFromFunctionsError,
  submitReportFeedbackBody,
} from './libertymd-care-proxy-client'

export const REPORT_FEEDBACK_COMMENT_MAX = 500

export type LibertyMDReportFeedbackProps = {
  consultationId: string
}

type FeedbackPhase = 'idle' | 'submitting' | 'thanks' | 'error'

export function LibertyMDReportFeedback({ consultationId }: LibertyMDReportFeedbackProps) {
  const { t } = useI18n()
  const [comment, setComment] = useState('')
  const [phase, setPhase] = useState<FeedbackPhase>('idle')
  const [lastHelpful, setLastHelpful] = useState<boolean | null>(null)

  const locked = phase === 'thanks' || phase === 'submitting'

  async function submit(helpful: boolean) {
    if (locked || !consultationId) return
    setLastHelpful(helpful)
    setPhase('submitting')

    const trimmed = comment.trim()
    const body = submitReportFeedbackBody({
      consultation_id: consultationId,
      helpful,
      comment: trimmed || undefined,
    })

    try {
      const { data, error: functionError } = await supabase.functions.invoke('libertymd-care-proxy', {
        body: { region: 'EU', ...body },
      })

      const status = statusFromFunctionsError(functionError)
      // 409 already-submitted → treat as success lock (no nag / no change-of-mind).
      if (status === 409) {
        setPhase('thanks')
        return
      }

      if (functionError) throw functionError
      if (data && typeof data === 'object' && 'error' in data && (data as { error?: unknown }).error) {
        throw Object.assign(new Error(String((data as { error: unknown }).error)), { body: data })
      }

      emitFeedbackSubmitted({
        helpful,
        has_comment: Boolean(trimmed),
      })
      setPhase('thanks')
    } catch {
      setPhase('error')
    }
  }

  if (phase === 'thanks') {
    return (
      <div
        data-libertymd-report-feedback="thanks"
        className="border-t border-libertymd-slate-200 pt-[var(--libertymd-space-lg)]"
        role="status"
      >
        <p className="libertymd-type-body-small font-semibold text-libertymd-slate-700">
          {t('report.feedback.thanks')}
        </p>
      </div>
    )
  }

  return (
    <div
      data-libertymd-report-feedback="form"
      className="border-t border-libertymd-slate-200 pt-[var(--libertymd-space-lg)]"
    >
      <p
        id="libertymd-report-feedback-prompt"
        className="libertymd-type-body font-bold text-libertymd-ink"
      >
        {t('report.feedback.prompt')}
      </p>

      <div
        className="mt-[var(--libertymd-space-sm)] flex flex-wrap gap-[var(--libertymd-space-sm)]"
        role="group"
        aria-labelledby="libertymd-report-feedback-prompt"
      >
        <button
          type="button"
          data-libertymd-report-feedback-yes=""
          disabled={locked}
          aria-pressed={lastHelpful === true}
          onClick={() => void submit(true)}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-libertymd-blue-600 bg-white px-[var(--libertymd-space-lg)] libertymd-type-body-small font-bold text-libertymd-blue-700 transition hover:bg-libertymd-blue-50 disabled:opacity-50"
        >
          {phase === 'submitting' && lastHelpful === true ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            t('report.feedback.yes')
          )}
        </button>
        <button
          type="button"
          data-libertymd-report-feedback-no=""
          disabled={locked}
          aria-pressed={lastHelpful === false}
          onClick={() => void submit(false)}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-libertymd-slate-300 bg-white px-[var(--libertymd-space-lg)] libertymd-type-body-small font-bold text-libertymd-slate-700 transition hover:bg-libertymd-slate-100 disabled:opacity-50"
        >
          {phase === 'submitting' && lastHelpful === false ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            t('report.feedback.no')
          )}
        </button>
      </div>

      <label
        htmlFor="libertymd-report-feedback-comment"
        className="libertymd-type-label mt-[var(--libertymd-space-md)] block font-semibold text-libertymd-slate-500"
      >
        {t('report.feedback.commentOptional')}
      </label>
      <input
        id="libertymd-report-feedback-comment"
        data-libertymd-report-feedback-comment=""
        type="text"
        inputMode="text"
        autoComplete="off"
        maxLength={REPORT_FEEDBACK_COMMENT_MAX}
        value={comment}
        disabled={locked}
        onChange={(e) => setComment(e.target.value.slice(0, REPORT_FEEDBACK_COMMENT_MAX))}
        className="mt-[var(--libertymd-space-xs)] w-full min-h-11 rounded-lg border border-libertymd-slate-300 bg-white px-[var(--libertymd-space-md)] libertymd-type-body-small text-libertymd-ink placeholder:text-libertymd-slate-500 focus:border-libertymd-blue-600 focus:outline-none focus:ring-2 focus:ring-libertymd-blue-600/20 disabled:opacity-50"
        placeholder={t('report.feedback.commentOptional')}
      />

      {phase === 'error' ? (
        <div
          data-libertymd-report-feedback-error=""
          className="mt-[var(--libertymd-space-sm)] rounded-lg border border-libertymd-slate-300 bg-libertymd-slate-100 p-[var(--libertymd-space-sm)]"
          role="alert"
        >
          <p className="libertymd-type-body-small text-libertymd-slate-700">
            {t('report.feedback.error')}
          </p>
          <button
            type="button"
            data-libertymd-report-feedback-retry=""
            className="mt-[var(--libertymd-space-xs)] libertymd-type-label font-bold text-libertymd-blue-700 underline"
            onClick={() => {
              setPhase('idle')
              if (lastHelpful !== null) void submit(lastHelpful)
            }}
          >
            {t('report.feedback.retry')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
