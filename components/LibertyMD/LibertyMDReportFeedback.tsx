import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
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

type FeedbackPhase = 'idle' | 'submitting' | 'thanks' | 'error' | 'dismissed'

export function LibertyMDReportFeedback({ consultationId }: LibertyMDReportFeedbackProps) {
  const { t } = useI18n()
  const [rating, setRating] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [phase, setPhase] = useState<FeedbackPhase>('idle')

  if (phase === 'dismissed') {
    return null
  }

  const locked = phase === 'thanks' || phase === 'submitting'

  async function submit(selectedRating: number | null) {
    if (locked || !consultationId) return
    setPhase('submitting')

    const helpful = selectedRating !== null ? selectedRating >= 7 : true
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
        className="rounded-xl border border-libertymd-slate-200 bg-white p-6 shadow-xs text-left"
        role="status"
      >
        <p className="libertymd-type-body font-semibold text-libertymd-ink">
          {t('report.feedback.thanks')}
        </p>
        <p className="mt-1 text-sm text-libertymd-slate-500">
          Thank you for helping us improve LibertyMD!
        </p>
      </div>
    )
  }

  return (
    <div
      data-libertymd-report-feedback="form"
      className="relative rounded-2xl border border-libertymd-slate-200 bg-white p-6 shadow-sm text-left"
    >
      <button
        type="button"
        onClick={() => setPhase('dismissed')}
        aria-label="Close feedback"
        className="absolute right-4 top-4 rounded-full p-1 text-libertymd-slate-400 hover:bg-libertymd-slate-100 hover:text-libertymd-slate-600"
      >
        <X className="h-5 w-5" />
      </button>

      <h3
        id="libertymd-report-feedback-prompt"
        className="pr-8 font-serif text-lg font-semibold text-libertymd-ink sm:text-xl"
      >
        On a scale from 0 to 10, how likely are you to recommend LibertyMD to a friend or colleague?
      </h3>
      <p className="mt-1 text-xs text-libertymd-slate-500">
        Your feedback helps us improve our service
      </p>

      {/* 0 to 10 Rating Buttons */}
      <div className="mt-5">
        <div
          className="grid grid-cols-11 gap-1 sm:gap-2"
          role="group"
          aria-labelledby="libertymd-report-feedback-prompt"
        >
          {Array.from({ length: 11 }, (_, i) => i).map((score) => {
            const isSelected = rating === score
            return (
              <button
                key={score}
                type="button"
                data-libertymd-feedback-score={score}
                disabled={locked}
                aria-pressed={isSelected}
                onClick={() => setRating(score)}
                className={`flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold transition ${
                  isSelected
                    ? 'bg-libertymd-blue-600 text-white shadow-xs'
                    : 'bg-libertymd-slate-100 text-libertymd-slate-700 hover:bg-libertymd-blue-50 hover:text-libertymd-blue-700'
                }`}
              >
                {score}
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-libertymd-slate-400 font-medium">
          <span>Not likely</span>
          <span>Very likely</span>
        </div>
      </div>

      {/* Optional Free-text Comment */}
      <div className="mt-5">
        <label
          htmlFor="libertymd-report-feedback-comment"
          className="block text-xs font-semibold text-libertymd-slate-700"
        >
          Tell us more about your experience (optional)
        </label>
        <textarea
          id="libertymd-report-feedback-comment"
          data-libertymd-report-feedback-comment=""
          rows={3}
          maxLength={REPORT_FEEDBACK_COMMENT_MAX}
          value={comment}
          disabled={locked}
          onChange={(e) => setComment(e.target.value.slice(0, REPORT_FEEDBACK_COMMENT_MAX))}
          className="mt-1.5 w-full rounded-lg border border-libertymd-slate-200 bg-white p-3 text-sm text-libertymd-ink placeholder:text-libertymd-slate-400 focus:border-libertymd-blue-600 focus:outline-none focus:ring-2 focus:ring-libertymd-blue-600/20 disabled:opacity-50"
          placeholder="What could we improve? What do you love most?"
        />
      </div>

      {/* Action Buttons */}
      <div className="mt-5 flex items-center justify-end gap-3 border-t border-libertymd-slate-100 pt-4">
        <button
          type="button"
          disabled={locked}
          onClick={() => setPhase('dismissed')}
          className="px-4 py-2 text-sm font-medium text-libertymd-slate-500 hover:text-libertymd-slate-800 disabled:opacity-50"
        >
          Skip
        </button>
        <button
          type="button"
          data-libertymd-report-feedback-submit=""
          disabled={locked}
          onClick={() => void submit(rating)}
          className="inline-flex items-center gap-2 rounded-lg bg-libertymd-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-libertymd-blue-700 disabled:opacity-50"
        >
          {phase === 'submitting' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            'Submit'
          )}
        </button>
      </div>

      {phase === 'error' ? (
        <div
          data-libertymd-report-feedback-error=""
          className="mt-3 rounded-lg border border-rose-200 bg-rose-50/60 p-3"
          role="alert"
        >
          <p className="text-xs text-rose-700 font-medium">
            {t('report.feedback.error')}
          </p>
          <button
            type="button"
            data-libertymd-report-feedback-retry=""
            className="mt-1 text-xs font-bold text-rose-800 underline"
            onClick={() => setPhase('idle')}
          >
            {t('report.feedback.retry')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
