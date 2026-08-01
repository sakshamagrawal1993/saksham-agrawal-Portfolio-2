import React, { useState } from 'react';
import { useI18n } from '../../i18n';
import {
  AlertTriangle,
  Check,
  Clock3,
  FileClock,
  Info,
  Loader2,
  LogIn,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import {
  LIBERTYMD_SEVERITY_PRESENTATION,
  libertyMDSafetyNoticeFromResponse,
  libertyMDSeverityForRequestFailure,
  libertyMDSeverityForSignal,
  type LibertyMDSafetyNoticeContent,
  type LibertyMDSafetySignal,
  type LibertyMDSeverity,
} from './libertymd-severity';
import { LibertyMDOverlaySheet } from './LibertyMDOverlaySheet';
import {
  LibertyMDProfileManagementPanel,
  type ProfileManagementHandlers,
} from './LibertyMDProfileManagementPanel';
import {
  LibertyMDHistoryList,
  type LibertyMDHistoryItem,
} from './LibertyMDHistoryList';

export type { LibertyMDHistoryItem };

// ---------------------------------------------------------------------------
// P0-16 · four-severity presentation
//
// One component draws all four tiers. It takes a severity (or a raw safety
// signal) and looks everything up in LIBERTYMD_SEVERITY_PRESENTATION — no
// caller ever picks a colour, and no caller can invent a fifth treatment.
//
// The defect this closes: today both LibertyMDChat and LibertyMDApp render a
// clinical caution and an app error in the *same* amber box
// (`border-amber-200 bg-amber-50 text-amber-900`), and the guardrail's
// transport-failure verdict arrives with `status: 'high_risk_continue'`, so a
// network timeout is shown to a patient as a warning about their body. Two live
// `error_fail_cautious` rows are two occurrences of exactly that.
//
// Emergency reachability: `LibertyMDSeverityNotice` will render emergency chrome
// if handed `severity="emergency"` directly, so the safe entry point for
// server-derived signals is `LibertyMDSafetyNotice`, which derives the severity
// and therefore cannot reach emergency without a `force_end`.
// tests/libertymd/severity-mapping.test.ts asserts that over the whole matrix.
// ---------------------------------------------------------------------------

const SEVERITY_ICONS = {
  'info': Info,
  'alert-triangle': AlertTriangle,
  'shield-alert': ShieldAlert,
  'wrench': Wrench,
} as const;

interface SeverityNoticeProps {
  severity: LibertyMDSeverity;
  message: string;
  /** Optional override for the tier label. The label is never removed. */
  label?: string;
  className?: string;
}

/**
 * The single rendering of a severity tier.
 *
 * `info` renders `null` on purpose: the info tier is "plain, no chrome", so
 * ordinary assistant content belongs in the normal message bubble, not in a
 * notice box wearing no styling.
 */
export function LibertyMDSeverityNotice({ severity, message, label, className }: SeverityNoticeProps) {
  if (severity === 'info') return null;
  const text = message.trim();
  if (!text) return null;

  const presentation = LIBERTYMD_SEVERITY_PRESENTATION[severity];
  const TierIcon = SEVERITY_ICONS[presentation.iconName];
  const tierLabel = label || presentation.label;

  return (
    <div
      role={presentation.role === 'note' ? undefined : presentation.role}
      aria-live={presentation.live === 'off' ? undefined : presentation.live}
      data-libertymd-severity={severity}
      className={[presentation.container, className].filter(Boolean).join(' ')}
    >
      <div className="flex items-start gap-2.5">
        <TierIcon className={presentation.icon} aria-hidden="true" />
        <div className="min-w-0">
          {/* Text label, always present: the tier must survive greyscale and
              forced-colours mode. P0-16 AC5 — never colour alone. */}
          <p className={presentation.labelClass}>{tierLabel}</p>
          <p className={presentation.body}>{text}</p>
        </div>
      </div>
    </div>
  );
}

interface SafetyNoticeProps {
  /** `status` + `source` straight off the proxy's `safety` object or a stored row. */
  signal: LibertyMDSafetySignal | null | undefined;
  message: string;
  className?: string;
}

/**
 * The safe entry point for anything that came from the guardrail.
 *
 * Derives the tier from `status` + `source` rather than accepting one, so
 * `error_fail_cautious` renders **technical** (P0-16 AC3) and only a `force_end`
 * can reach emergency (P0-16 AC4).
 */
export function LibertyMDSafetyNotice({ signal, message, className }: SafetyNoticeProps) {
  return (
    <LibertyMDSeverityNotice
      severity={libertyMDSeverityForSignal(signal)}
      message={message}
      className={className}
    />
  );
}

/**
 * A failed request to the proxy — network error, timeout, 4xx, 5xx. Always the
 * technical tier. Replaces the amber `{error && ...}` boxes in the chat trees,
 * which currently make an app failure indistinguishable from a clinical caution.
 *
 * P0-12: optional Try again (technical severity only) for exhausted upstream
 * classes that can safely resend the held `client_message_id`.
 */
export function LibertyMDRequestErrorNotice({
  message,
  className,
  onRetry,
}: {
  message: string;
  className?: string;
  onRetry?: () => void;
}) {
  return (
    <div className={className}>
      <LibertyMDSeverityNotice
        severity={libertyMDSeverityForRequestFailure()}
        message={message}
      />
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-libertymd-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-libertymd-slate-700 transition hover:bg-libertymd-slate-200"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </button>
      ) : null}
    </div>
  );
}

/**
 * P0-12 — persistent offline banner (technical severity). Sibling of
 * `LibertyMDRequestErrorNotice`; no Try again (auto-sends on `online`).
 */
export function LibertyMDOfflineBanner({ message, className }: { message: string; className?: string }) {
  return (
    <LibertyMDSeverityNotice
      severity={libertyMDSeverityForRequestFailure()}
      message={message}
      className={className}
      label="Offline"
    />
  );
}

// Re-exported so an adopter needs one import: the components above plus the
// helper that turns a whole proxy response into `{ severity, message } | null`.
//
// The two-step adoption in LibertyMDChat.tsx / LibertyMDApp.tsx (owned by other
// lanes right now, so not done here):
//
//   const [safetyNotice, setSafetyNotice] =
//     useState<LibertyMDSafetyNoticeContent | null>(null);
//   ...
//   setSafetyNotice(libertyMDSafetyNoticeFromResponse(data));
//   ...
//   {safetyNotice && phase === 'intake' && (
//     <LibertyMDSeverityNotice
//       severity={safetyNotice.severity}
//       message={safetyNotice.message}
//       className="ml-10"
//     />
//   )}
//   {error && phase !== 'demographics_required' && (
//     <LibertyMDRequestErrorNotice message={error} className="ml-10" />
//   )}
//
// which replaces the two amber boxes that currently make a clinical caution and
// an app failure look identical.
export { libertyMDSafetyNoticeFromResponse };
export type { LibertyMDSafetyNoticeContent, LibertyMDSafetySignal, LibertyMDSeverity };

/** Presentational profile row for the unified entry picker (P1-01 Q2A). */
export interface LibertyMDEntryProfile {
  id: string;
  label: string;
}

/** Map bootstrap patients[] into entry picker rows (P1-03). */
export function entryProfilesFromPatients(
  patients: Array<{ id: string; display_label?: string | null; relationship?: string }>,
): LibertyMDEntryProfile[] {
  return patients.map((patient) => ({
    id: patient.id,
    label: String(patient.display_label || '').trim()
      || (patient.relationship === 'self' ? 'Me' : 'Profile'),
  }));
}

interface DemographicsPromptProps {
  age: string;
  sex: string;
  loading: boolean;
  error?: string;
  /** Consent checkbox — pre-checked by default (DECISIONS). */
  consentChecked?: boolean;
  /** Presentational only; picker renders only when length > 1 (Q2A). */
  profiles?: LibertyMDEntryProfile[];
  selectedProfileId?: string;
  /** P1-04: when true, show secondary “Care for someone else” → same offer path. */
  isAnonymous?: boolean;
  onAgeChange: (value: string) => void;
  onSexChange: (value: string) => void;
  onConsentChange?: (checked: boolean) => void;
  onProfileChange?: (profileId: string) => void;
  /** P1-04 Q2C secondary — anonymous add-profile attempt (does not gate submit). */
  onCareForSomeoneElse?: () => void;
  onSubmit: () => void;
}

/**
 * P1-01 unified entry control: question hero + options, optional profile slot,
 * compact age/sex, pre-ticked consent. Submit requires age, sex, consent, and a
 * non-empty trimmed clinical answer.
 *
 * Client age floor mirrors server `LIBERTYMD_MIN_PATIENT_AGE` in profiles.ts
 * (numeric 18 here — no Vite-shared module this ticket). Server remains authority.
 */
const LIBERTYMD_MIN_PATIENT_AGE_CLIENT = 18

export function LibertyMDDemographicsPrompt({
  age,
  sex,
  loading,
  error,
  consentChecked = true,
  profiles = [],
  selectedProfileId,
  isAnonymous = false,
  onAgeChange,
  onSexChange,
  onConsentChange,
  onProfileChange,
  onCareForSomeoneElse,
  onSubmit,
}: DemographicsPromptProps) {
  const { t } = useI18n();
  const ageNum = Number(age);
  // P1-05 Q1A/Q2 — show care pointer only when parsed age is an integer < floor.
  const ageUnderFloor = Boolean(String(age).trim())
    && Number.isInteger(ageNum)
    && ageNum < LIBERTYMD_MIN_PATIENT_AGE_CLIENT;
  const canSubmit = ageNum >= LIBERTYMD_MIN_PATIENT_AGE_CLIENT
    && ageNum <= 120
    && Boolean(sex)
    && consentChecked
    && !loading;
  const showProfilePick = Array.isArray(profiles) && profiles.length > 1;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}
      className="mx-auto w-full max-w-2xl border-t border-libertymd-green-sage pt-libertymd-lg"
      data-libertymd-unified-entry="true"
    >
      {/* BO 2026-08-01 — demographics-only card. The first clinical question and
          its options used to live here (P1-01 unified entry); they now come as
          the first interview turn once this card is submitted, so this control
          does one job: age, sex, and consent. */}
      <div className="space-y-libertymd-md">
        <h2
          id="libertymd-entry-question"
          className="font-serif text-xl font-semibold leading-snug text-libertymd-ink sm:text-2xl"
        >
          {t('chat.demographicsHeading')}
        </h2>
        <p className="text-sm font-medium leading-5 text-libertymd-slate-500">
          {t('chat.demographicsSubcopy')}
        </p>
      </div>

      {showProfilePick && (
        <fieldset className="mt-libertymd-md">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-libertymd-slate-500">
            Who is this for?
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {profiles.map((profile) => {
              const active = selectedProfileId === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  aria-pressed={active}
                  disabled={loading}
                  onClick={() => onProfileChange?.(profile.id)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition ${
                    active
                      ? 'border-libertymd-blue-600 bg-libertymd-blue-50 text-libertymd-ink'
                      : 'border-libertymd-slate-300 bg-white text-libertymd-slate-700'
                  }`}
                >
                  <UserRound className="h-4 w-4 shrink-0 text-libertymd-blue-600" />
                  {profile.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="mt-libertymd-md grid gap-libertymd-sm sm:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <label className="sr-only" htmlFor="libertymd-age">Age</label>
        <input
          id="libertymd-age"
          inputMode="numeric"
          autoComplete="off"
          min="18"
          max="120"
          value={age}
          onChange={(event) => onAgeChange(event.target.value.replace(/\D/g, '').slice(0, 3))}
          placeholder={t('careControls.agePlaceholder')}
          className="h-12 rounded-lg border border-libertymd-slate-300 bg-white px-libertymd-lg text-left text-base font-semibold text-libertymd-ink outline-none transition focus:border-libertymd-blue-600 focus:ring-4 focus:ring-libertymd-blue-50"
        />

        <fieldset className="grid h-12 grid-cols-2 rounded-lg bg-libertymd-blue-50 p-1">
          <legend className="sr-only">{t('careControls.sexLegend')}</legend>
          {[
            ['female', t('careControls.female')],
            ['male', t('careControls.male')],
          ].map(([value, label]) => {
            const active = sex === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => onSexChange(value)}
                className={`inline-flex items-center justify-center gap-2 rounded-md text-sm font-bold transition ${
                  active
                    ? 'bg-white text-libertymd-ink shadow-sm'
                    : 'text-libertymd-slate-500 hover:text-libertymd-slate-700'
                }`}
              >
                {active && <Check className="h-4 w-4" />}
                {label}
              </button>
            );
          })}
        </fieldset>
      </div>

      {ageUnderFloor && (
        <p
          data-libertymd-adults-only="unified-entry"
          role="status"
          className="mt-libertymd-sm text-left text-sm leading-5 text-libertymd-slate-500"
        >
          {t('careControls.adultsOnlyNotice')}
        </p>
      )}

      <label className="mt-libertymd-md flex items-start gap-2 text-left text-xs leading-5 text-libertymd-slate-500">
        <input
          type="checkbox"
          checked={consentChecked}
          disabled={loading}
          onChange={(event) => onConsentChange?.(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-libertymd-slate-300 text-libertymd-blue-600 focus:ring-libertymd-blue-600"
        />
        <span>
          I agree to the LibertyMD Terms of Service and Privacy Policy. This is AI guidance, not emergency care.
        </span>
      </label>

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-libertymd-md inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-libertymd-blue-600 text-sm font-bold text-white shadow-lg shadow-libertymd-blue-600/20 transition hover:bg-libertymd-blue-700 disabled:cursor-not-allowed disabled:bg-libertymd-slate-300 disabled:shadow-none"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Continue
      </button>

      {isAnonymous && onCareForSomeoneElse && (
        <button
          type="button"
          data-libertymd-add-profile="unified-entry"
          disabled={loading}
          onClick={onCareForSomeoneElse}
          className="mt-libertymd-sm inline-flex w-full items-center justify-center gap-2 text-sm font-semibold text-libertymd-blue-600 transition hover:text-libertymd-blue-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {t('careControls.careForSomeoneElse')}
        </button>
      )}

      {error && <p className="mt-libertymd-sm text-center text-sm font-semibold text-red-700">{error}</p>}
    </form>
  );
}

interface PreStartProfilePickerProps {
  profiles: LibertyMDEntryProfile[];
  loading?: boolean;
  error?: string;
  /** Linked only — opens thin create sheet. Anonymous uses onSomeoneElseAnonymous. */
  showSomeoneElse?: boolean;
  onSelect: (profileId: string) => void;
  onSomeoneElse: () => void;
}

/**
 * P1-03 — picker-first before `start_consultation` when activeOwnedCount > 1.
 * Never silent-defaults a selection.
 */
export function LibertyMDPreStartProfilePicker({
  profiles,
  loading = false,
  error,
  showSomeoneElse = true,
  onSelect,
  onSomeoneElse,
}: PreStartProfilePickerProps) {
  const { t } = useI18n();
  return (
    <div
      className="mx-auto w-full max-w-2xl border-t border-libertymd-green-sage pt-libertymd-lg"
      data-libertymd-profile-picker="true"
    >
      <fieldset>
        <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-libertymd-slate-500">
          {t('careControls.whoIsThisFor')}
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              disabled={loading}
              onClick={() => onSelect(profile.id)}
              className="inline-flex items-center gap-2 rounded-lg border border-libertymd-slate-300 bg-white px-3 py-2.5 text-left text-sm font-semibold text-libertymd-slate-700 transition hover:border-libertymd-blue-600 hover:text-libertymd-ink disabled:opacity-50"
            >
              <UserRound className="h-4 w-4 shrink-0 text-libertymd-blue-600" />
              {profile.label}
            </button>
          ))}
          {showSomeoneElse && (
            <button
              type="button"
              disabled={loading}
              data-libertymd-someone-else="true"
              onClick={onSomeoneElse}
              className="inline-flex items-center gap-2 rounded-lg border border-dashed border-libertymd-slate-300 bg-white px-3 py-2.5 text-left text-sm font-semibold text-libertymd-blue-600 transition hover:border-libertymd-blue-600 disabled:opacity-50"
            >
              <Plus className="h-4 w-4 shrink-0" />
              {t('careControls.someoneElse')}
            </button>
          )}
        </div>
      </fieldset>
      {error && <p className="mt-libertymd-sm text-center text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}

interface SomeoneElseCreateSheetProps {
  loading?: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (input: { display_label: string; age: number; sex_at_birth: 'female' | 'male' }) => void;
}

/**
 * P1-03 Q4A — thin linked create (label + age + sex) before start with new patient_id.
 */
export function LibertyMDSomeoneElseCreateSheet({
  loading = false,
  error,
  onCancel,
  onSubmit,
}: SomeoneElseCreateSheetProps) {
  const { t } = useI18n();
  const [label, setLabel] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<'female' | 'male' | ''>('');
  const ageNum = Number(age);
  // Client floor mirrors server LIBERTYMD_MIN_PATIENT_AGE (profiles.ts).
  const ageUnderFloor = Boolean(String(age).trim())
    && Number.isInteger(ageNum)
    && ageNum < LIBERTYMD_MIN_PATIENT_AGE_CLIENT;
  const canSubmit = Boolean(String(label).trim())
    && Number.isInteger(ageNum)
    && ageNum >= LIBERTYMD_MIN_PATIENT_AGE_CLIENT
    && ageNum <= 120
    && (sex === 'female' || sex === 'male')
    && !loading;

  return (
    <form
      data-libertymd-someone-else-create="true"
      className="mx-auto w-full max-w-2xl space-y-libertymd-md border-t border-libertymd-green-sage pt-libertymd-lg"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit || (sex !== 'female' && sex !== 'male')) return;
        onSubmit({
          display_label: String(label).trim().slice(0, 80),
          age: ageNum,
          sex_at_birth: sex,
        });
      }}
    >
      <h2 className="font-serif text-xl font-semibold text-libertymd-ink">
        {t('careControls.someoneElseTitle')}
      </h2>
      <p className="text-sm text-libertymd-slate-500">{t('careControls.someoneElseBody')}</p>
      <label className="block text-left text-xs font-bold uppercase tracking-wide text-libertymd-slate-500">
        {t('careControls.displayLabel')}
        <input
          type="text"
          value={label}
          disabled={loading}
          maxLength={80}
          onChange={(event) => setLabel(event.target.value)}
          className="mt-1 h-12 w-full rounded-lg border border-libertymd-slate-300 bg-white px-libertymd-lg text-base font-semibold text-libertymd-ink outline-none focus:border-libertymd-blue-600 focus:ring-4 focus:ring-libertymd-blue-50"
        />
      </label>
      <div className="grid gap-libertymd-sm sm:grid-cols-2">
        <input
          inputMode="numeric"
          value={age}
          disabled={loading}
          placeholder={t('careControls.agePlaceholder')}
          onChange={(event) => setAge(event.target.value.replace(/\D/g, '').slice(0, 3))}
          className="h-12 rounded-lg border border-libertymd-slate-300 bg-white px-libertymd-lg text-base font-semibold text-libertymd-ink outline-none focus:border-libertymd-blue-600 focus:ring-4 focus:ring-libertymd-blue-50"
        />
        <fieldset className="grid h-12 grid-cols-2 rounded-lg bg-libertymd-blue-50 p-1">
          <legend className="sr-only">{t('careControls.sexLegend')}</legend>
          {(['female', 'male'] as const).map((value) => {
            const active = sex === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                disabled={loading}
                onClick={() => setSex(value)}
                className={`inline-flex items-center justify-center rounded-md text-sm font-bold transition ${
                  active ? 'bg-white text-libertymd-ink shadow-sm' : 'text-libertymd-slate-500'
                }`}
              >
                {value === 'female' ? t('careControls.female') : t('careControls.male')}
              </button>
            );
          })}
        </fieldset>
      </div>
      {ageUnderFloor && (
        <p
          data-libertymd-adults-only="someone-else"
          role="status"
          className="text-left text-sm leading-5 text-libertymd-slate-500"
        >
          {t('careControls.adultsOnlyNotice')}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={onCancel}
          className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-libertymd-slate-300 text-sm font-bold text-libertymd-slate-700"
        >
          {t('careControls.someoneElseCancel')}
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-libertymd-blue-600 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-libertymd-slate-300"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('careControls.someoneElseContinue')}
        </button>
      </div>
      {error && <p className="text-center text-sm font-semibold text-red-700">{error}</p>}
    </form>
  );
}

/** P1-13 — truncate prior chief complaint for resume invitation body (~100, word boundary). */
export const RESUME_COMPLAINT_MAX_CHARS = 100;

/**
 * P1-13 — resolve display complaint from consultation column, then filled_slots fallback.
 * Never invents a complaint when both are empty.
 */
export function resolveResumeChiefComplaint(consultation: {
  chief_complaint?: string | null;
  filled_slots?: Record<string, unknown> | null;
} | null | undefined): string | null {
  const fromColumn = String(consultation?.chief_complaint ?? '').trim();
  if (fromColumn) return fromColumn;
  const slots = consultation?.filled_slots;
  if (slots && typeof slots === 'object' && !Array.isArray(slots)) {
    const fromSlots = String(slots.chief_complaint ?? '').trim();
    if (fromSlots) return fromSlots;
  }
  return null;
}

/** P1-13 — truncate for invitation body; word-boundary cut + ellipsis when over max. */
export function truncateResumeChiefComplaint(
  raw: string,
  maxChars: number = RESUME_COMPLAINT_MAX_CHARS,
): string {
  const text = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > Math.floor(maxChars * 0.6) ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

/**
 * P1-13 Q3B drive-by — humanize history status so raw "abandoned" is not patient-visible.
 * Ids / DB status values unchanged.
 */
export function formatLibertyMdHistoryStatus(status: string): string {
  if (status === 'abandoned') return 'Incomplete';
  return String(status || '').replaceAll('_', ' ');
}

/**
 * P1-13 invitation body.
 * REQUIRES EXPERT REVIEW — interpolates user chief_complaint (echo-only; no advice).
 */
export function buildResumeInvitationBody(chiefComplaint: string | null | undefined): string {
  const trimmed = String(chiefComplaint ?? '').trim();
  if (trimmed) {
    const echo = truncateResumeChiefComplaint(trimmed);
    return `You were sharing about “${echo}”. Your previous answers are still private and available.`;
  }
  return 'Your previous answers are still private and available. Continue when you\'re ready, or start fresh with a new concern.';
}

interface AbandonedRecoveryPromptProps {
  loading: boolean;
  error?: string;
  /** Prior chief complaint for invitation body echo (P1-13). Never sent to telemetry. */
  chiefComplaint?: string | null;
  onResume: () => void;
  onStartOver: () => void;
}

/**
 * P0-21 · bar-hosted resume prompt (footer continuation slot).
 * P1-13 · invitation copy + optional chief-complaint echo (export/aria ids unchanged).
 * Center `fixed inset-0` / `aria-modal` presentation retired — no focus trap.
 * Hosted by `LibertyMDContinuationActionBar`; not a sole full-screen path.
 */
export function LibertyMDAbandonedRecoveryPrompt({
  loading,
  error,
  chiefComplaint = null,
  onResume,
  onStartOver,
}: AbandonedRecoveryPromptProps) {
  const description = buildResumeInvitationBody(chiefComplaint);
  return (
    <div
      aria-labelledby="libertymd-recovery-title"
      aria-describedby="libertymd-recovery-description"
      className="w-full rounded-lg border border-libertymd-blue-200/80 bg-white p-libertymd-md text-left shadow-sm sm:p-libertymd-lg"
    >
      <h2 id="libertymd-recovery-title" className="font-serif text-xl font-semibold leading-tight text-libertymd-ink sm:text-2xl">
        Pick up where you left off?
      </h2>
      <p id="libertymd-recovery-description" className="mt-libertymd-sm text-sm leading-6 text-libertymd-slate-700">
        {description}
      </p>

      {error && (
        <p className="mt-libertymd-sm rounded-md border border-amber-200 bg-amber-50 px-libertymd-md py-libertymd-sm text-sm font-semibold text-amber-900">
          {error}
        </p>
      )}

      <div className="mt-libertymd-md grid gap-libertymd-sm sm:grid-cols-2">
        <button
          type="button"
          disabled={loading}
          onClick={onResume}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-libertymd-blue-600 px-5 text-sm font-bold text-white shadow-lg shadow-libertymd-blue-600/20 transition hover:bg-libertymd-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Continue
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onStartOver}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-libertymd-blue-200 bg-white px-5 text-sm font-bold text-libertymd-slate-700 transition hover:border-libertymd-blue-600 hover:text-libertymd-blue-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Start fresh
        </button>
      </div>
    </div>
  );
}

interface ReportGateProps {
  loading: boolean;
  identityConflict?: boolean;
  /** P4-05 — post-merge attribution outcome (ReportGate / post-complete only). */
  collisionPath?: 'matched_self' | 'distinct_profile' | null;
  onDismissCollisionOutcome?: () => void;
  onGoogle: () => void;
  onExistingGoogle?: () => void;
  onSkip: () => void;
  onClose: () => void;
}

export function LibertyMDReportGate({
  loading,
  identityConflict = false,
  collisionPath = null,
  onDismissCollisionOutcome,
  onGoogle,
  onExistingGoogle,
  onSkip,
  onClose,
}: ReportGateProps) {
  const { t } = useI18n();
  // Soft report gate (DECISIONS 2026-07-30 / P2-06): dismissible persuasion — portal /
  // trap / lock / sheet chrome live in LibertyMDOverlaySheet (P0-22). Benefits +
  // equal-prominence Continue-as-guest (h-14 outline). Never blocks report body.
  const benefitChips: Array<[typeof Clock3, string]> = [
    [Clock3, t('reportGate.benefitKeep')],
    [FileClock, t('reportGate.benefitHistory')],
    [Users, t('reportGate.benefitFamily')],
  ];
  const collisionCopy =
    collisionPath === 'matched_self'
      ? t('careControls.mergeOutcomeMatchedSelf')
      : collisionPath === 'distinct_profile'
        ? t('careControls.mergeOutcomeDistinctProfile')
        : null;
  return (
    <LibertyMDOverlaySheet
      onClose={onClose}
      titleId="libertymd-report-gate-title"
      panelClassName="relative"
    >
      <div className="relative p-libertymd-lg sm:p-libertymd-xl md:p-libertymd-2xl" data-libertymd-soft-gate-chrome="">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full text-libertymd-slate-700 transition hover:bg-libertymd-blue-50"
        >
          <X className="h-5 w-5" />
        </button>

        <p className="text-xs font-bold uppercase text-libertymd-blue-600">{t('reportGate.title')}</p>
        <h2 id="libertymd-report-gate-title" className="mt-libertymd-sm max-w-2xl font-serif text-3xl font-semibold leading-tight text-libertymd-ink sm:text-4xl md:text-5xl">
          {t('reportGate.headline')}
        </h2>
        <p className="mt-libertymd-md text-base text-libertymd-slate-700 sm:text-lg">
          {t('reportGate.body')}
        </p>

        {collisionCopy ? (
          <div
            className="mt-libertymd-md rounded-lg border border-libertymd-blue-200 bg-libertymd-blue-50 p-libertymd-md"
            data-libertymd-merge-collision-outcome={collisionPath || undefined}
          >
            <p className="text-sm font-semibold text-libertymd-slate-700">{collisionCopy}</p>
            {onDismissCollisionOutcome ? (
              <button
                type="button"
                onClick={onDismissCollisionOutcome}
                className="mt-libertymd-sm text-sm font-bold text-libertymd-blue-700 underline-offset-2 hover:underline"
              >
                {t('careControls.mergeOutcomeAcknowledge')}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-libertymd-xl grid gap-libertymd-sm sm:grid-cols-3" data-libertymd-soft-gate-benefits="">
          {benefitChips.map(([Icon, label]) => (
            <div key={label} className="flex items-center gap-3 rounded-full bg-libertymd-blue-50 px-4 py-3 text-sm font-bold text-libertymd-ink">
              <Icon className="h-5 w-5 shrink-0" />
              {label}
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={onGoogle}
          className="mt-libertymd-xl inline-flex h-14 w-full items-center justify-center gap-3 rounded-full bg-libertymd-blue-600 px-6 text-base font-bold text-white shadow-xl shadow-libertymd-blue-600/20 transition hover:bg-libertymd-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
          {t('reportGate.google')}
        </button>

        {identityConflict && onExistingGoogle && (
          <div className="mt-libertymd-md rounded-lg border border-libertymd-blue-200 bg-libertymd-blue-50 p-libertymd-md text-center">
            <p className="text-sm font-semibold text-libertymd-slate-700">
              {t('careControls.mergeNotice')}
            </p>
            <button
              type="button"
              disabled={loading}
              onClick={onExistingGoogle}
              className="mt-libertymd-sm inline-flex h-11 items-center justify-center gap-2 rounded-full border border-libertymd-blue-600 bg-white px-6 text-sm font-bold text-libertymd-blue-700 transition hover:bg-libertymd-blue-100 disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" />
              {t('careControls.signInMerge')}
            </button>
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={onSkip}
          data-libertymd-soft-gate-continue-guest=""
          className="mt-libertymd-sm inline-flex h-14 w-full items-center justify-center rounded-full border border-libertymd-blue-600 bg-white px-6 text-base font-bold text-libertymd-blue-700 transition hover:bg-libertymd-blue-50 disabled:opacity-50"
        >
          {t('reportGate.skip')}
        </button>

        <div className="mt-libertymd-lg flex items-center justify-center gap-2 text-xs text-libertymd-slate-500">
          <ShieldCheck className="h-4 w-4" />
          {t('careControls.privateDefault')}
        </div>
      </div>
    </LibertyMDOverlaySheet>
  );
}

/** P4-05 — dismissible post-merge outcome on report_ready (P1-25 allowed surface). */
export function LibertyMDMergeCollisionOutcome({
  collisionPath,
  onDismiss,
}: {
  collisionPath: 'matched_self' | 'distinct_profile';
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const copy =
    collisionPath === 'matched_self'
      ? t('careControls.mergeOutcomeMatchedSelf')
      : t('careControls.mergeOutcomeDistinctProfile');
  return (
    <div
      className="ml-10 rounded-lg border border-libertymd-blue-200 bg-libertymd-blue-50 p-libertymd-md"
      data-libertymd-merge-collision-outcome={collisionPath}
      role="status"
    >
      <p className="text-sm font-semibold text-libertymd-slate-700">{copy}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-libertymd-sm text-sm font-bold text-libertymd-blue-700 underline-offset-2 hover:underline"
      >
        {t('careControls.mergeOutcomeAcknowledge')}
      </button>
    </div>
  );
}

interface AccountDrawerProps {
  open: boolean;
  isAnonymous: boolean;
  displayName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  age?: number | null;
  sexAtBirth?: string | null;
  history: LibertyMDHistoryItem[];
  loading: boolean;
  onClose: () => void;
  onSelectConsultation: (id: string) => void;
  /** P1-04 Q2C primary — anonymous add-profile → capability offer path. */
  onCareForSomeoneElse?: () => void;
  /** P4-04 — linked-only profile CRUD handlers. Omit for anonymous. */
  profileManagement?: ProfileManagementHandlers | null;
}

export function LibertyMDAccountDrawer({
  open,
  isAnonymous,
  displayName,
  email,
  avatarUrl,
  age,
  sexAtBirth,
  history,
  loading,
  onClose,
  onSelectConsultation,
  onCareForSomeoneElse,
  profileManagement = null,
}: AccountDrawerProps) {
  const { t } = useI18n();
  if (!open) return null;

  const formattedSex = sexAtBirth
    ? sexAtBirth.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
    : '';

  return (
    <div className="fixed inset-0 z-[85] bg-libertymd-slate-900/25" onMouseDown={onClose}>
      <aside
        className="ml-auto flex h-full w-full max-w-sm flex-col bg-white p-libertymd-lg text-left shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="LibertyMD account and consultation history"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl font-semibold text-libertymd-ink">{t('careControls.yourLibertyMD')}</h2>
          <button type="button" onClick={onClose} aria-label="Close menu" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-libertymd-blue-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-libertymd-xl flex items-center gap-4 border-b border-libertymd-slate-200 pb-libertymd-lg">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-libertymd-blue-50 text-libertymd-blue-600">
              <UserRound className="h-6 w-6" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-bold text-libertymd-ink">{displayName || t('careControls.privateGuest')}</p>
            <p className="truncate text-sm text-libertymd-slate-500">{email || 'No account linked'}</p>
            {!isAnonymous && (age || formattedSex) && (
              <p className="mt-1 truncate text-xs font-semibold text-libertymd-slate-500">
                {[age ? `Age ${age}` : '', formattedSex].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        {isAnonymous ? (
          <div className="mt-libertymd-xl space-y-libertymd-md">
            <p className="text-sm leading-6 text-libertymd-slate-700">
              Your private session is active. Complete a consultation to link Google, save the report, and revisit it on any device.
            </p>
            {onCareForSomeoneElse && (
              <button
                type="button"
                data-libertymd-add-profile="drawer"
                onClick={onCareForSomeoneElse}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-libertymd-blue-600 bg-white px-4 text-sm font-bold text-libertymd-blue-700 transition hover:bg-libertymd-blue-50"
              >
                <Plus className="h-4 w-4" />
                {t('careControls.careForSomeoneElse')}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-libertymd-xl min-h-0 flex-1 overflow-y-auto">
            {profileManagement && (
              <LibertyMDProfileManagementPanel handlers={profileManagement} />
            )}
            <div className={`flex items-center gap-2 text-xs font-bold uppercase text-libertymd-slate-500 ${profileManagement ? 'mt-libertymd-xl' : ''}`}>
              <FileClock className="h-4 w-4" />
              {t('careControls.historyHeading')}
            </div>
            <LibertyMDHistoryList
              history={history}
              loading={loading}
              onSelectConsultation={onSelectConsultation}
              onContinue={onClose}
            />
          </div>
        )}
      </aside>
    </div>
  );
}

interface ProfileCapabilityOfferProps {
  open: boolean;
  loading?: boolean;
  onGoogle: () => void;
  onClose: () => void;
}

/**
 * P1-04 — capability unlock offer (multi-profile / family care).
 * Soft-gate: never blocks consult/report. Same sheet for drawer + unified entry.
 */
export function LibertyMDProfileCapabilityOffer({
  open,
  loading = false,
  onGoogle,
  onClose,
}: ProfileCapabilityOfferProps) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <LibertyMDOverlaySheet
      onClose={onClose}
      titleId="libertymd-profile-capability-title"
      ariaDescribedBy="libertymd-profile-capability-body"
      panelClassName="relative"
    >
      <div className="relative p-libertymd-lg sm:p-libertymd-xl" data-libertymd-profile-capability-offer="true">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full text-libertymd-slate-700 transition hover:bg-libertymd-blue-50"
        >
          <X className="h-5 w-5" />
        </button>

        <p className="text-xs font-bold uppercase text-libertymd-blue-600">{t('careControls.profileOfferEyebrow')}</p>
        <h2
          id="libertymd-profile-capability-title"
          className="mt-libertymd-sm max-w-2xl font-serif text-3xl font-semibold leading-tight text-libertymd-ink sm:text-4xl"
        >
          {t('careControls.profileOfferTitle')}
        </h2>
        <p id="libertymd-profile-capability-body" className="mt-libertymd-md text-base text-libertymd-slate-700 sm:text-lg">
          {t('careControls.profileOfferBody')}
        </p>

        <button
          type="button"
          disabled={loading}
          onClick={onGoogle}
          className="mt-libertymd-xl inline-flex h-14 w-full items-center justify-center gap-3 rounded-full bg-libertymd-blue-600 px-6 text-base font-bold text-white shadow-xl shadow-libertymd-blue-600/20 transition hover:bg-libertymd-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
          {t('careControls.profileOfferGoogle')}
        </button>

        <button
          type="button"
          disabled={loading}
          onClick={onClose}
          className="mt-libertymd-md inline-flex h-11 w-full items-center justify-center text-sm font-semibold text-libertymd-slate-600 transition hover:text-libertymd-ink disabled:opacity-50"
        >
          {t('careControls.profileOfferDismiss')}
        </button>
      </div>
    </LibertyMDOverlaySheet>
  );
}
