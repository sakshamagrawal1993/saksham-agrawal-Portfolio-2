/**
 * P3-03 · Above-footer trust band (honest process + disclaimer-forward).
 * Mounts immediately above the frozen marketing footer. No seals, stars,
 * HIPAA invent, numeric accuracy, or named likenesses.
 */
import { AlertTriangle, FileText, ShieldAlert } from 'lucide-react'
import { useI18n } from '../../i18n'

export function LibertyMDTrustRow() {
  const { t } = useI18n()

  return (
    <section
      data-libertymd-trust-band=""
      aria-labelledby="libertymd-trust-band-heading"
      className="libertymd-page-gutter libertymd-section-spacing border-t border-libertymd-slate-200 bg-libertymd-blue-50 text-center"
    >
      <div className="libertymd-content-shell mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-normal text-libertymd-blue-600">
          {t('trust.kicker')}
        </p>
        <h2
          id="libertymd-trust-band-heading"
          className="mt-3 font-serif text-3xl font-semibold leading-tight text-libertymd-ink sm:text-4xl"
        >
          {t('trust.title')}
        </h2>

        <ul className="mt-8 grid gap-5 text-left sm:grid-cols-2 sm:gap-6">
          <li className="rounded-lg border border-libertymd-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="flex items-start gap-3">
              <ShieldAlert
                className="mt-0.5 h-5 w-5 shrink-0 text-libertymd-blue-600"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-bold text-libertymd-ink">{t('trust.aiNotClinicianTitle')}</p>
                <p className="mt-2 text-sm leading-6 text-libertymd-slate-muted">
                  {t('trust.aiNotClinicianBody')}
                </p>
              </div>
            </div>
          </li>
          <li className="rounded-lg border border-libertymd-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-bold text-libertymd-ink">{t('trust.emergencyTitle')}</p>
                <p className="mt-2 text-sm leading-6 text-libertymd-slate-muted">
                  {t('trust.emergencyBody')}
                </p>
              </div>
            </div>
          </li>
        </ul>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-libertymd-navy">
            <FileText className="h-4 w-4 shrink-0 text-libertymd-blue-600" aria-hidden="true" />
            {t('trust.processProof')}
          </p>
          <p className="text-sm text-libertymd-slate-muted">{t('trust.certHonesty')}</p>
        </div>

        <p className="mt-6 text-xs leading-5 text-libertymd-slate-500">{t('trust.adultsNote')}</p>
      </div>
    </section>
  )
}

export default LibertyMDTrustRow
