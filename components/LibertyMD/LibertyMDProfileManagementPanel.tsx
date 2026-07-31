import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { Loader2, Pencil, Plus, Trash2, UserRound, X } from 'lucide-react';
import {
  LIBERTYMD_MAX_ACTIVE_PATIENTS_CLIENT,
  type LibertyMDManagedPatient,
} from './libertymd-care-proxy-client';
import { patientFacingTechnicalMessage } from './libertymd-failure-taxonomy';
import { LibertyMDOverlaySheet } from './LibertyMDOverlaySheet';

const LIBERTYMD_MIN_PATIENT_AGE_CLIENT = 18;

const SELF_SEX_OPTIONS = [
  'female',
  'male',
  'intersex',
  'prefer_not_to_say',
] as const;

const NON_SELF_SEX_OPTIONS = ['female', 'male'] as const;

export interface ProfileManagementHandlers {
  fetchList: () => Promise<LibertyMDManagedPatient[]>;
  create: (input: {
    display_label: string;
    age: number;
    sex_at_birth: 'female' | 'male';
  }) => Promise<void>;
  update: (input: {
    patient_id: string;
    display_label?: string;
    age: number;
    sex_at_birth: string;
  }) => Promise<void>;
  remove: (patientId: string) => Promise<void>;
}

interface LibertyMDProfileManagementPanelProps {
  handlers: ProfileManagementHandlers;
}

type PanelMode =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; patient: LibertyMDManagedPatient }
  | { kind: 'confirm_delete'; patient: LibertyMDManagedPatient };

function formatSex(sex: string | null | undefined): string {
  if (!sex) return '';
  return sex.replace(/_/g, ' ').replace(/^./, (letter: string) => letter.toUpperCase());
}

/**
 * P4-04 — linked-only profile CRUD list for AccountDrawer.
 * Soft-delete confirm uses OverlaySheet (no native dialogs).
 */
export function LibertyMDProfileManagementPanel({
  handlers,
}: LibertyMDProfileManagementPanelProps) {
  const { t } = useI18n();
  const [patients, setPatients] = useState<LibertyMDManagedPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<PanelMode>({ kind: 'list' });

  const [label, setLabel] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await handlers.fetchList();
      setPatients(rows);
    } catch (fetchError) {
      setError(patientFacingTechnicalMessage(fetchError, t('careControls.profileLoadError')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const resetForm = (patient?: LibertyMDManagedPatient) => {
    setLabel(patient?.display_label || '');
    setAge(patient?.age != null ? String(patient.age) : '');
    setSex(patient?.sex_at_birth || '');
    setError('');
  };

  const openCreate = () => {
    resetForm();
    setMode({ kind: 'create' });
  };

  const openEdit = (patient: LibertyMDManagedPatient) => {
    resetForm(patient);
    setMode({ kind: 'edit', patient });
  };

  const ageNum = Number(age);
  const ageUnderFloor = Boolean(String(age).trim())
    && Number.isInteger(ageNum)
    && ageNum < LIBERTYMD_MIN_PATIENT_AGE_CLIENT;

  const isSelfEdit = mode.kind === 'edit' && mode.patient.relationship === 'self';
  const sexOptions: readonly string[] = isSelfEdit ? SELF_SEX_OPTIONS : NON_SELF_SEX_OPTIONS;
  const canSubmitForm = Number.isInteger(ageNum)
    && ageNum >= LIBERTYMD_MIN_PATIENT_AGE_CLIENT
    && ageNum <= 120
    && sexOptions.includes(sex)
    && (isSelfEdit || Boolean(String(label).trim()))
    && !busy;

  const submitForm = async () => {
    if (!canSubmitForm) return;
    setBusy(true);
    setError('');
    try {
      if (mode.kind === 'create') {
        await handlers.create({
          display_label: String(label).trim().slice(0, 80),
          age: ageNum,
          sex_at_birth: sex as 'female' | 'male',
        });
      } else if (mode.kind === 'edit') {
        await handlers.update({
          patient_id: mode.patient.id,
          ...(mode.patient.relationship === 'self'
            ? {}
            : { display_label: String(label).trim().slice(0, 80) }),
          age: ageNum,
          sex_at_birth: sex,
        });
      }
      setMode({ kind: 'list' });
      await refresh();
    } catch (submitError) {
      setError(patientFacingTechnicalMessage(submitError, t('careControls.profileSaveError')));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (mode.kind !== 'confirm_delete') return;
    setBusy(true);
    setError('');
    try {
      await handlers.remove(mode.patient.id);
      setMode({ kind: 'list' });
      await refresh();
    } catch (deleteError) {
      setError(patientFacingTechnicalMessage(deleteError, t('careControls.profileDeleteError')));
    } finally {
      setBusy(false);
    }
  };

  const atProfileLimit = patients.length >= LIBERTYMD_MAX_ACTIVE_PATIENTS_CLIENT;

  return (
    <div
      data-libertymd-profile-management="true"
      data-libertymd-profile-at-limit={atProfileLimit ? 'true' : 'false'}
      data-libertymd-edge={atProfileLimit ? 'entry-at-profile-limit' : undefined}
      className="mt-libertymd-xl border-t border-libertymd-slate-200 pt-libertymd-lg"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase text-libertymd-slate-500">
          <UserRound className="h-4 w-4" />
          {t('careControls.profilesHeading')}
        </div>
        {mode.kind === 'list' && !atProfileLimit && (
          <button
            type="button"
            data-libertymd-profile-create="open"
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-1 rounded-full border border-libertymd-blue-600 px-3 text-xs font-bold text-libertymd-blue-700 hover:bg-libertymd-blue-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('careControls.profileAdd')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-libertymd-md flex items-center gap-2 text-sm text-libertymd-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('careControls.profilesLoading')}
        </div>
      ) : mode.kind === 'list' ? (
        <div className="mt-libertymd-md space-y-2">
          {patients.length === 0 ? (
            <p className="text-sm text-libertymd-slate-500">{t('careControls.profilesEmpty')}</p>
          ) : (
            patients.map((patient) => {
              const isSelf = patient.relationship === 'self';
              const sexLabel = formatSex(patient.sex_at_birth);
              return (
                <div
                  key={patient.id}
                  data-libertymd-profile-row={patient.relationship}
                  data-libertymd-profile-id={patient.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-libertymd-slate-200 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-libertymd-ink">
                      {patient.display_label || (isSelf ? t('careControls.profileSelfFallback') : t('careControls.someoneElse'))}
                    </p>
                    <p className="mt-0.5 text-xs text-libertymd-slate-500">
                      {[
                        isSelf ? t('careControls.profileRelationshipSelf') : t('careControls.profileRelationshipOther'),
                        patient.age != null ? t('careControls.profileAge', { age: patient.age }) : '',
                        sexLabel,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      data-libertymd-profile-edit={patient.id}
                      aria-label={t('careControls.profileEdit')}
                      onClick={() => openEdit(patient)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-libertymd-slate-600 hover:bg-libertymd-blue-50"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {!isSelf && (
                      <button
                        type="button"
                        data-libertymd-profile-delete={patient.id}
                        aria-label={t('careControls.profileRemove')}
                        onClick={() => {
                          setError('');
                          setMode({ kind: 'confirm_delete', patient });
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-libertymd-slate-600 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {atProfileLimit ? (
            <p
              className="text-sm font-semibold text-libertymd-slate-700"
              data-libertymd-profile-at-limit-hint=""
              role="status"
            >
              {t('careControls.profileAtLimit')}
            </p>
          ) : null}
          {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
        </div>
      ) : mode.kind === 'create' || mode.kind === 'edit' ? (
        <form
          data-libertymd-profile-form={mode.kind}
          className="mt-libertymd-md space-y-libertymd-md"
          onSubmit={(event) => {
            event.preventDefault();
            void submitForm();
          }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-libertymd-ink">
              {mode.kind === 'create' ? t('careControls.profileAddTitle') : t('careControls.profileEditTitle')}
            </h3>
            <button
              type="button"
              onClick={() => setMode({ kind: 'list' })}
              aria-label={t('careControls.profileFormCancel')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-libertymd-blue-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {!isSelfEdit && (
            <label className="block text-left text-xs font-bold uppercase tracking-wide text-libertymd-slate-500">
              {t('careControls.displayLabel')}
              <input
                type="text"
                value={label}
                disabled={busy}
                maxLength={80}
                data-libertymd-profile-field="display_label"
                onChange={(event) => setLabel(event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-libertymd-slate-300 bg-white px-3 text-sm font-semibold text-libertymd-ink outline-none focus:border-libertymd-blue-600 focus:ring-4 focus:ring-libertymd-blue-50"
              />
            </label>
          )}

          <input
            inputMode="numeric"
            value={age}
            disabled={busy}
            placeholder={t('careControls.agePlaceholder')}
            data-libertymd-profile-field="age"
            onChange={(event) => setAge(event.target.value.replace(/\D/g, '').slice(0, 3))}
            className="h-11 w-full rounded-lg border border-libertymd-slate-300 bg-white px-3 text-sm font-semibold text-libertymd-ink outline-none focus:border-libertymd-blue-600 focus:ring-4 focus:ring-libertymd-blue-50"
          />

          <fieldset className={`grid gap-1 rounded-lg bg-libertymd-blue-50 p-1 ${isSelfEdit ? 'grid-cols-2' : 'grid-cols-2 h-11'}`}>
            <legend className="sr-only">{t('careControls.sexLegend')}</legend>
            {sexOptions.map((value) => {
              const active = sex === value;
              const labelKey =
                value === 'female' ? 'careControls.female'
                  : value === 'male' ? 'careControls.male'
                    : value === 'intersex' ? 'careControls.intersex'
                      : 'careControls.preferNotToSay';
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  disabled={busy}
                  data-libertymd-profile-sex={value}
                  onClick={() => setSex(value)}
                  className={`inline-flex items-center justify-center rounded-md px-2 py-2 text-xs font-bold transition ${
                    active ? 'bg-white text-libertymd-ink shadow-sm' : 'text-libertymd-slate-500'
                  }`}
                >
                  {t(labelKey)}
                </button>
              );
            })}
          </fieldset>

          {ageUnderFloor && (
            <p
              data-libertymd-adults-only="profile-management"
              role="status"
              className="text-left text-sm leading-5 text-libertymd-slate-500"
            >
              {t('careControls.adultsOnlyNotice')}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode({ kind: 'list' })}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-libertymd-slate-300 text-sm font-bold text-libertymd-slate-700"
            >
              {t('careControls.profileFormCancel')}
            </button>
            <button
              type="submit"
              disabled={!canSubmitForm}
              data-libertymd-profile-save="true"
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-libertymd-blue-600 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-libertymd-slate-300"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('careControls.profileFormSave')}
            </button>
          </div>
          {error && <p className="text-center text-sm font-semibold text-red-700">{error}</p>}
        </form>
      ) : null}

      {mode.kind === 'confirm_delete' && (
        <LibertyMDOverlaySheet
          onClose={() => !busy && setMode({ kind: 'list' })}
          titleId="libertymd-profile-delete-title"
          ariaDescribedBy="libertymd-profile-delete-body"
        >
          <div
            className="p-libertymd-lg sm:p-libertymd-xl"
            data-libertymd-profile-delete-confirm="true"
          >
            <h2
              id="libertymd-profile-delete-title"
              className="font-serif text-2xl font-semibold text-libertymd-ink"
            >
              {t('careControls.profileDeleteTitle')}
            </h2>
            <p
              id="libertymd-profile-delete-body"
              className="mt-libertymd-md text-sm leading-6 text-libertymd-slate-700"
            >
              {t('careControls.profileDeleteBody', {
                label: mode.patient.display_label || t('careControls.someoneElse'),
              })}
            </p>
            <div className="mt-libertymd-xl flex flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                data-libertymd-profile-delete-confirm-yes="true"
                onClick={() => void confirmDelete()}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-libertymd-blue-600 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('careControls.profileDeleteConfirm')}
              </button>
              <button
                type="button"
                disabled={busy}
                data-libertymd-profile-delete-confirm-cancel="true"
                onClick={() => setMode({ kind: 'list' })}
                className="inline-flex h-11 w-full items-center justify-center text-sm font-semibold text-libertymd-slate-600"
              >
                {t('careControls.profileDeleteCancel')}
              </button>
            </div>
            {error && <p className="mt-3 text-center text-sm font-semibold text-red-700">{error}</p>}
          </div>
        </LibertyMDOverlaySheet>
      )}
    </div>
  );
}
