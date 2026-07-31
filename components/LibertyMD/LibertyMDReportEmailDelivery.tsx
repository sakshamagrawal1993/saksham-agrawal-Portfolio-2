/**
 * P2-08 — "Email me my report" capture chrome.
 *
 * Additive delivery UX only. Does not hide/blur ReportView. Soft-gate chrome
 * stays in CareControls. No PDF/download. No native dialogs.
 */
import { useId, useState } from 'react'
import { Mail } from 'lucide-react'
import { useI18n } from '../../i18n'
import { LibertyMDOverlaySheet } from './LibertyMDOverlaySheet'
import { LibertyMDRequestErrorNotice } from './LibertyMDCareControls'

export type LibertyMDReportEmailDeliveryProps = {
  consultationId: string
  /** Linked Google email may prefill; editable; ≠ marketing opt-in. */
  prefillEmail?: string
  /** Parent wires proxy `request_report_email`; must not write clinical tables. */
  onRequest: (email: string) => Promise<void>
  consultScroller?: HTMLElement | null
}

export function LibertyMDReportEmailDelivery({
  consultationId,
  prefillEmail = '',
  onRequest,
  consultScroller,
}: LibertyMDReportEmailDeliveryProps) {
  const { t } = useI18n()
  const titleId = useId()
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(prefillEmail)
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [failure, setFailure] = useState('')
  const [invalid, setInvalid] = useState(false)

  const resetTransient = () => {
    setFailure('')
    setInvalid(false)
    setSuccess(false)
  }

  const openSheet = () => {
    resetTransient()
    setEmail((current) => current || prefillEmail)
    setOpen(true)
  }

  const closeSheet = () => {
    if (sending) return
    setOpen(false)
  }

  const submit = async () => {
    const trimmed = email.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setInvalid(true)
      setFailure('')
      return
    }
    setInvalid(false)
    setFailure('')
    setSending(true)
    try {
      await onRequest(trimmed)
      setSuccess(true)
    } catch (err) {
      setSuccess(false)
      // P4-10 AC2 — catalog failure copy only; never echo raw Error.message.
      void err
      setFailure(t('report.emailDelivery.failure'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      data-libertymd-email-delivery
      data-consultation-id={consultationId}
      className="pt-[var(--libertymd-space-xs)]"
    >
      <button
        type="button"
        data-libertymd-email-delivery-cta
        onClick={openSheet}
        className="libertymd-type-body inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-libertymd-blue-600 bg-white px-[var(--libertymd-space-lg)] py-[var(--libertymd-space-sm)] font-semibold text-libertymd-blue-700 transition hover:bg-libertymd-blue-50"
      >
        <Mail className="h-4 w-4 shrink-0" aria-hidden />
        {t('report.emailDelivery.cta')}
      </button>

      {open ? (
        <LibertyMDOverlaySheet
          onClose={closeSheet}
          titleId={titleId}
          consultScroller={consultScroller}
          panelClassName="max-w-md"
        >
          <div data-libertymd-email-delivery-sheet className="space-y-[var(--libertymd-space-md)]">
            <h2
              id={titleId}
              className="libertymd-type-h3 m-0 font-bold text-libertymd-ink"
            >
              {t('report.emailDelivery.title')}
            </h2>
            <p className="libertymd-type-body-small m-0 text-libertymd-slate-600">
              {t('report.emailDelivery.description')}
            </p>

            {success ? (
              <p
                data-libertymd-email-delivery-success
                data-libertymd-edge="report-actions-emailed"
                className="libertymd-type-body-small m-0 rounded-md border border-libertymd-green-600/30 bg-libertymd-green-sage px-[var(--libertymd-space-md)] py-[var(--libertymd-space-sm)] text-libertymd-green-600"
              >
                {t('report.emailDelivery.success')}
              </p>
            ) : (
              <>
                <div className="space-y-[var(--libertymd-space-xs)]">
                  <label
                    htmlFor={inputId}
                    className="libertymd-type-label font-semibold text-libertymd-slate-700"
                  >
                    {t('report.emailDelivery.emailLabel')}
                  </label>
                  <input
                    id={inputId}
                    data-libertymd-email-delivery-input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    disabled={sending}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      setInvalid(false)
                    }}
                    placeholder={t('report.emailDelivery.emailPlaceholder')}
                    className="libertymd-type-body w-full rounded-md border border-libertymd-slate-300 bg-white px-[var(--libertymd-space-md)] py-[var(--libertymd-space-sm)] text-libertymd-ink outline-none focus:border-libertymd-blue-600"
                  />
                  {invalid ? (
                    <p className="libertymd-type-body-small m-0 text-red-700">
                      {t('report.emailDelivery.invalidEmail')}
                    </p>
                  ) : null}
                </div>

                {failure ? (
                  <div
                    data-libertymd-email-delivery-failure
                    data-libertymd-edge="report-actions-email-fail"
                  >
                    <LibertyMDRequestErrorNotice
                      message={failure}
                      onRetry={() => {
                        void submit()
                      }}
                    />
                  </div>
                ) : null}

                <button
                  type="button"
                  data-libertymd-email-delivery-submit
                  data-libertymd-edge={sending ? 'report-actions-emailing' : undefined}
                  disabled={sending}
                  onClick={() => {
                    void submit()
                  }}
                  className="libertymd-type-body inline-flex min-h-11 w-full items-center justify-center rounded-md bg-libertymd-blue-600 px-[var(--libertymd-space-lg)] font-semibold text-white transition hover:bg-libertymd-blue-700 disabled:opacity-60"
                >
                  {sending ? t('report.emailDelivery.sending') : t('report.emailDelivery.submit')}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={closeSheet}
              disabled={sending}
              className="libertymd-type-body-small w-full text-center font-medium text-libertymd-slate-500 underline-offset-2 hover:underline"
            >
              {t('report.emailDelivery.close')}
            </button>
          </div>
        </LibertyMDOverlaySheet>
      ) : null}
    </div>
  )
}
