/**
 * P2-11 — honest waitlist / booking destination panel (replaces App mock roster).
 *
 * Waitlist: network coming + notify + optional email + join ack — no supply claims.
 * Booking: chrome + independently gated claim lines (P2-15 stubs default off).
 * Durable join via P2-12 `record_care_interest`; local ack only if action truly missing.
 * P4-10: already-joined thin ack via consult-scoped sessionStorage (no new telemetry).
 */
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { supabase } from '../../lib/supabaseClient'
import {
  emitDoctorCtaViewed,
  emitWaitlistJoined,
} from './libertymd-analytics'
import {
  isRecordCareInterestActionMissing,
  recordCareInterestBody,
  statusFromFunctionsError,
} from './libertymd-care-proxy-client'
import {
  doctorHandoffProminence,
  readDoctorCtaConfig,
  type DoctorCtaConfig,
  type DoctorCtaPosition,
} from './libertymd-doctor-cta-config'
import {
  readCareInterestJoined,
  writeCareInterestJoined,
} from './libertymd-edge-inventory'
import type { TriageDisplayTier } from './libertymd-report'

export type LibertyMDDoctorHandoffPanelProps = {
  triageTier: TriageDisplayTier
  consultationId?: string
  /** Where this panel was opened from (telemetry). Default footer. */
  position?: DoctorCtaPosition
  sessionKey?: string
  /** When true, omit the compact CTA (panel is the destination after navigate). */
  hideTriggerCta?: boolean
  onTriggerClick?: () => void
  configOverride?: DoctorCtaConfig
  /**
   * Test double: when set, used instead of live invoke.
   * Return `{ ok: true }` or `{ ok: false }`.
   */
  joinInvoker?: (body: ReturnType<typeof recordCareInterestBody>) => Promise<{ ok: boolean }>
}

type JoinPhase = 'idle' | 'submitting' | 'ack' | 'error'

export function LibertyMDDoctorHandoffPanel({
  triageTier,
  consultationId,
  position = 'footer',
  sessionKey,
  hideTriggerCta = false,
  onTriggerClick,
  configOverride,
  joinInvoker,
}: LibertyMDDoctorHandoffPanelProps) {
  const { t } = useI18n()
  const config = configOverride ?? readDoctorCtaConfig()
  const prominence = doctorHandoffProminence(triageTier)
  const [email, setEmail] = useState('')
  const alreadyJoined = readCareInterestJoined(consultationId)
  const [phase, setPhase] = useState<JoinPhase>(alreadyJoined ? 'ack' : 'idle')
  const [ackKind, setAckKind] = useState<'joined' | 'already_joined'>(
    alreadyJoined ? 'already_joined' : 'joined',
  )

  useEffect(() => {
    emitDoctorCtaViewed({
      triage_tier: triageTier,
      cta_mode: config.mode,
      position,
      session_key: sessionKey,
    })
  }, [triageTier, config.mode, position, sessionKey])

  useEffect(() => {
    if (readCareInterestJoined(consultationId)) {
      setPhase('ack')
      setAckKind('already_joined')
    }
  }, [consultationId])

  async function submitJoin() {
    if (phase === 'submitting' || phase === 'ack') return
    setPhase('submitting')

    const body = recordCareInterestBody({
      consultation_id: consultationId || '',
      contact_email: email.trim() || null,
    })

    try {
      if (joinInvoker) {
        const result = await joinInvoker(body)
        if (!result.ok) throw new Error('join_failed')
      } else if (consultationId) {
        const { data, error: functionError } = await supabase.functions.invoke(
          'libertymd-care-proxy',
          { body: { region: 'EU', ...body } },
        )
        const status = statusFromFunctionsError(functionError)
        // Local ack only when the action/handler itself is missing (P2-12 not
        // deployed). Live P2-12 400s (invalid_email / missing consult id) and
        // ownership 404s must surface as technical error + retry — never false-ack.
        const actionMissing = isRecordCareInterestActionMissing(
          status,
          data,
          functionError,
        )
        if (functionError && !actionMissing) throw functionError
        if (
          data &&
          typeof data === 'object' &&
          'error' in data &&
          (data as { error?: unknown }).error &&
          !actionMissing
        ) {
          throw Object.assign(new Error(String((data as { error: unknown }).error)), {
            body: data,
          })
        }
      }
      // No consultationId → local/ack only (still registers demand UX)

      emitWaitlistJoined({
        triage_tier: triageTier,
        cta_mode: config.mode,
        position,
      })
      writeCareInterestJoined(consultationId)
      setAckKind('joined')
      setPhase('ack')
    } catch {
      setPhase('error')
    }
  }

  const claimLines: Array<{ key: string; text: string }> = []
  if (config.mode === 'booking') {
    if (config.paymentLive) {
      claimLines.push({
        key: 'price',
        text: t('report.doctor.claimPrice', { price: config.claims.priceLabel }),
      })
    }
    if (config.availabilityLive) {
      claimLines.push({
        key: 'availability',
        text: t('report.doctor.claimAvailability', {
          availability: config.claims.availabilityLabel,
        }),
      })
    }
    if (config.refundLive) {
      claimLines.push({
        key: 'refund',
        text: t('report.doctor.claimRefund', { refund: config.claims.refundLabel }),
      })
    }
  }

  return (
    <section
      data-libertymd-doctor-handoff-panel=""
      data-cta-mode={config.mode}
      data-cta-prominence={prominence}
      data-booking-live={config.bookingLive ? 'true' : 'false'}
      className="rounded-md border border-libertymd-slate-200 bg-white px-[var(--libertymd-space-lg)] py-[var(--libertymd-space-lg)]"
    >
      <p className="libertymd-type-label font-bold uppercase tracking-normal text-libertymd-blue-600">
        {t('app.handoffKicker')}
      </p>
      <h2 className="libertymd-type-body mt-[var(--libertymd-space-xs)] font-black text-libertymd-ink">
        {config.mode === 'booking' ? t('report.doctor.bookingTitle') : t('app.handoffTitle')}
      </h2>
      <p className="libertymd-type-body-small mt-[var(--libertymd-space-sm)] text-libertymd-slate-500">
        {config.mode === 'booking'
          ? t('report.doctor.bookingBody')
          : t('report.doctor.networkComing')}
      </p>

      {config.mode === 'waitlist' ? (
        <p
          className="libertymd-type-body-small mt-[var(--libertymd-space-sm)] font-semibold text-libertymd-ink"
          data-handoff-notify-invite=""
        >
          {t('report.doctor.notifyInvite')}
        </p>
      ) : null}

      {claimLines.length > 0 ? (
        <ul
          className="mt-[var(--libertymd-space-sm)] list-disc space-y-1 pl-5 libertymd-type-body-small text-libertymd-slate-700"
          data-handoff-claim-lines=""
        >
          {claimLines.map((line) => (
            <li key={line.key} data-handoff-claim={line.key}>
              {line.text}
            </li>
          ))}
        </ul>
      ) : null}

      {!hideTriggerCta && onTriggerClick ? (
        <button
          type="button"
          data-libertymd-doctor-handoff-cta=""
          data-cta-mode={config.mode}
          data-cta-position={position}
          data-cta-prominence={prominence}
          className={
            prominence === 'recommended'
              ? 'mt-[var(--libertymd-space-md)] w-max rounded-full bg-libertymd-blue-600 px-[var(--libertymd-space-lg)] py-[var(--libertymd-space-sm)] libertymd-type-body-small font-bold text-white hover:bg-libertymd-blue-700'
              : 'mt-[var(--libertymd-space-md)] w-max rounded-full border border-libertymd-slate-300 bg-white px-[var(--libertymd-space-lg)] py-[var(--libertymd-space-sm)] libertymd-type-body-small font-bold text-libertymd-ink hover:bg-libertymd-slate-200'
          }
          onClick={onTriggerClick}
        >
          {config.mode === 'booking'
            ? t('report.doctor.ctaBooking')
            : t('report.doctor.ctaWaitlist')}
        </button>
      ) : null}

      {phase === 'ack' ? (
        <p
          role="status"
          data-handoff-join-ack=""
          data-handoff-already-joined={ackKind === 'already_joined' ? 'true' : undefined}
          data-libertymd-edge={
            ackKind === 'already_joined' ? 'doctor-already-joined' : 'doctor-joined'
          }
          className="libertymd-type-body-small mt-[var(--libertymd-space-md)] font-semibold text-libertymd-green-600"
        >
          {t('report.doctor.joinAck')}
        </p>
      ) : (
        <form
          className="mt-[var(--libertymd-space-md)] space-y-[var(--libertymd-space-sm)]"
          data-handoff-join-form=""
          onSubmit={(event) => {
            event.preventDefault()
            void submitJoin()
          }}
        >
          <label className="block">
            <span className="libertymd-type-label font-semibold text-libertymd-slate-500">
              {t('report.doctor.emailOptional')}
            </span>
            <input
              type="email"
              name="handoff-contact-email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('report.doctor.emailPlaceholder')}
              data-handoff-contact-email=""
              className="mt-1 w-full min-h-11 rounded-md border border-libertymd-slate-300 bg-white px-3 libertymd-type-body-small text-libertymd-ink outline-none placeholder:text-libertymd-slate-500 focus:border-libertymd-blue-600"
            />
          </label>
          <button
            type="submit"
            disabled={phase === 'submitting'}
            data-handoff-join-submit=""
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-libertymd-ink px-[var(--libertymd-space-lg)] libertymd-type-body-small font-bold text-white hover:bg-libertymd-slate-900 disabled:opacity-50"
          >
            {phase === 'submitting' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              t('report.doctor.join')
            )}
          </button>
          {phase === 'error' ? (
            <div data-handoff-join-error="" role="alert">
              <p className="libertymd-type-body-small text-libertymd-slate-700">
                {t('report.doctor.joinError')}
              </p>
              <button
                type="button"
                className="mt-1 libertymd-type-body-small font-semibold text-libertymd-blue-700 underline"
                onClick={() => {
                  setPhase('idle')
                  void submitJoin()
                }}
              >
                {t('report.doctor.retry')}
              </button>
            </div>
          ) : null}
        </form>
      )}
    </section>
  )
}
