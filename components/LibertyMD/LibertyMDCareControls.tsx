import React from 'react';
import { useI18n } from '../../i18n';
import {
  Brain,
  Check,
  ClipboardPlus,
  Clock3,
  FileClock,
  Loader2,
  LogIn,
  Plus,
  RotateCcw,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';

export interface LibertyMDHistoryItem {
  id: string;
  status: string;
  chief_complaint: string | null;
  created_at: string;
}

interface DemographicsPromptProps {
  age: string;
  sex: string;
  loading: boolean;
  error?: string;
  onAgeChange: (value: string) => void;
  onSexChange: (value: string) => void;
  onSubmit: () => void;
}

export function LibertyMDDemographicsPrompt({
  age,
  sex,
  loading,
  error,
  onAgeChange,
  onSexChange,
  onSubmit,
}: DemographicsPromptProps) {
  const { t } = useI18n();
  const canSubmit = Number(age) >= 18 && Number(age) <= 120 && Boolean(sex) && !loading;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}
      className="mx-auto w-full max-w-2xl border-t border-libertymd-green-sage pt-libertymd-lg"
    >
      <div className="grid gap-libertymd-md sm:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
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
          className="h-14 rounded-lg border border-libertymd-slate-300 bg-white px-libertymd-lg text-left text-base font-semibold text-libertymd-ink outline-none transition focus:border-libertymd-blue-600 focus:ring-4 focus:ring-libertymd-blue-50"
        />

        <fieldset className="grid h-14 grid-cols-2 rounded-lg bg-libertymd-blue-50 p-1">
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

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-libertymd-md inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-libertymd-blue-600 text-sm font-bold text-white shadow-lg shadow-libertymd-blue-600/20 transition hover:bg-libertymd-blue-700 disabled:cursor-not-allowed disabled:bg-libertymd-slate-300 disabled:shadow-none"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Submit
      </button>

      <p className="mt-libertymd-sm text-center text-xs leading-5 text-libertymd-slate-500">
        By submitting, you agree to the LibertyMD Terms of Service and Privacy Policy. This is AI guidance, not emergency care.
      </p>
      {error && <p className="mt-libertymd-sm text-center text-sm font-semibold text-red-700">{error}</p>}
    </form>
  );
}

interface AbandonedRecoveryPromptProps {
  loading: boolean;
  error?: string;
  onResume: () => void;
  onStartOver: () => void;
}

export function LibertyMDAbandonedRecoveryPrompt({
  loading,
  error,
  onResume,
  onStartOver,
}: AbandonedRecoveryPromptProps) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-libertymd-slate-900/35 p-libertymd-md backdrop-blur-sm">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="libertymd-recovery-title"
        aria-describedby="libertymd-recovery-description"
        className="w-full max-w-lg rounded-lg border border-white/80 bg-white p-libertymd-xl text-left shadow-2xl sm:p-libertymd-2xl"
      >
        <p className="text-xs font-bold uppercase text-libertymd-blue-600">Consultation paused</p>
        <h2 id="libertymd-recovery-title" className="mt-libertymd-sm font-serif text-3xl font-semibold leading-tight text-libertymd-ink">
          Continue where you left off?
        </h2>
        <p id="libertymd-recovery-description" className="mt-libertymd-md text-base leading-7 text-libertymd-slate-700">
          Your previous answers are still private and available. Resume this consultation, or leave it closed and start over with a new concern.
        </p>

        {error && (
          <p className="mt-libertymd-md rounded-md border border-amber-200 bg-amber-50 px-libertymd-md py-libertymd-sm text-sm font-semibold text-amber-900">
            {error}
          </p>
        )}

        <div className="mt-libertymd-xl grid gap-libertymd-sm sm:grid-cols-2">
          <button
            type="button"
            disabled={loading}
            onClick={onResume}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-libertymd-blue-600 px-5 text-sm font-bold text-white shadow-lg shadow-libertymd-blue-600/20 transition hover:bg-libertymd-blue-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Resume consultation
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onStartOver}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-libertymd-blue-200 bg-white px-5 text-sm font-bold text-libertymd-slate-700 transition hover:border-libertymd-blue-600 hover:text-libertymd-blue-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Start over
          </button>
        </div>
      </section>
    </div>
  );
}

interface ReportGateProps {
  loading: boolean;
  identityConflict?: boolean;
  onGoogle: () => void;
  onExistingGoogle?: () => void;
  onSkip: () => void;
  onClose: () => void;
}

export function LibertyMDReportGate({
  loading,
  identityConflict = false,
  onGoogle,
  onExistingGoogle,
  onSkip,
  onClose,
}: ReportGateProps) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-libertymd-slate-900/35 p-libertymd-md backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="libertymd-report-gate-title"
        className="relative w-full max-w-4xl rounded-lg border border-white/80 bg-white p-libertymd-xl text-left shadow-2xl sm:p-libertymd-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full text-libertymd-slate-700 transition hover:bg-libertymd-blue-50"
        >
          <X className="h-5 w-5" />
        </button>

        <p className="text-xs font-bold uppercase text-libertymd-blue-600">{t('reportGate.title')}</p>
        <h2 id="libertymd-report-gate-title" className="mt-libertymd-sm max-w-2xl font-serif text-4xl font-semibold leading-tight text-libertymd-ink sm:text-5xl">
          Don&apos;t lose this consult
        </h2>
        <p className="mt-libertymd-md text-base text-libertymd-slate-700 sm:text-lg">
          Link Google to save this report and revisit your consultation history.
        </p>

        <div className="mt-libertymd-xl grid gap-libertymd-sm sm:grid-cols-3">
          {[
            [Clock3, 'Free 24/7 care'],
            [Brain, 'Guidance that knows you'],
            [ClipboardPlus, 'One health history'],
          ].map(([Icon, label]) => {
            const BenefitIcon = Icon as typeof Clock3;
            return (
              <div key={label as string} className="flex items-center gap-3 rounded-full bg-libertymd-blue-50 px-4 py-3 text-sm font-bold text-libertymd-ink">
                <BenefitIcon className="h-5 w-5 shrink-0" />
                {label as string}
              </div>
            );
          })}
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
          className="mt-libertymd-sm h-11 w-full text-sm font-bold text-libertymd-slate-500 transition hover:text-libertymd-blue-600 disabled:opacity-50"
        >
          {t('careControls.skipOnce')}
        </button>

        <div className="mt-libertymd-lg flex items-center justify-center gap-2 text-xs text-libertymd-slate-500">
          <ShieldCheck className="h-4 w-4" />
          {t('careControls.privateDefault')}
        </div>
      </section>
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
          <div className="mt-libertymd-xl">
            <p className="text-sm leading-6 text-libertymd-slate-700">
              Your private session is active. Complete a consultation to link Google, save the report, and revisit it on any device.
            </p>
          </div>
        ) : (
          <div className="mt-libertymd-xl min-h-0 flex-1 overflow-y-auto">
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-libertymd-slate-500">
              <FileClock className="h-4 w-4" />
              Consultation history
            </div>
            {loading ? (
              <div className="mt-libertymd-lg flex items-center gap-2 text-sm text-libertymd-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading history...</div>
            ) : history.length ? (
              <div className="mt-libertymd-md divide-y divide-libertymd-slate-200">
                {history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectConsultation(item.id)}
                    className="w-full py-4 text-left transition hover:text-libertymd-blue-600"
                  >
                    <p className="line-clamp-2 text-sm font-bold">{item.chief_complaint || 'LibertyMD consultation'}</p>
                    <p className="mt-1 text-xs text-libertymd-slate-500">{new Date(item.created_at).toLocaleDateString()} · {item.status.replaceAll('_', ' ')}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-libertymd-lg text-sm text-libertymd-slate-500">{t('careControls.emptyHistory')}</p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
