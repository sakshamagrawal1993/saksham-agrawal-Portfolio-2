/**
 * P4-07 — profile attribution chooser before lab file pick.
 * Reuses OverlaySheet; never writes clinical tables. Soft-deleted not offered.
 */
import { LibertyMDOverlaySheet } from './LibertyMDOverlaySheet';
import { useI18n } from '../../i18n';

export interface LibertyMDLabProfileOption {
  id: string;
  display_label: string | null;
  relationship: string;
}

export interface LibertyMDLabAttributionSheetProps {
  open: boolean;
  profiles: LibertyMDLabProfileOption[];
  defaultPatientId: string | null;
  selectedPatientId: string | null;
  onSelect: (patientId: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function LibertyMDLabAttributionSheet({
  open,
  profiles,
  defaultPatientId,
  selectedPatientId,
  onSelect,
  onConfirm,
  onClose,
}: LibertyMDLabAttributionSheetProps) {
  const { t } = useI18n();
  if (!open) return null;

  const activeId = selectedPatientId || defaultPatientId || profiles[0]?.id || null;
  const canConfirm = Boolean(activeId);

  return (
    <LibertyMDOverlaySheet
      onClose={onClose}
      titleId="libertymd-lab-attribution-title"
      ariaDescribedBy="libertymd-lab-attribution-desc"
      panelClassName="max-w-md w-full p-[var(--libertymd-space-lg)]"
    >
      <h2
        id="libertymd-lab-attribution-title"
        className="libertymd-type-heading-sm font-semibold text-libertymd-slate-900"
      >
        {t('chatx.labAttributionTitle')}
      </h2>
      <p
        id="libertymd-lab-attribution-desc"
        className="mt-[var(--libertymd-space-xs)] libertymd-type-body-small text-libertymd-slate-600"
      >
        {t('chatx.labAttributionBody')}
      </p>

      <ul
        className="mt-[var(--libertymd-space-md)] space-y-[var(--libertymd-space-xs)]"
        data-libertymd-lab-attribution-list=""
        role="listbox"
        aria-label={t('chatx.labAttributionTitle')}
      >
        {profiles.map((profile) => {
          const selected = profile.id === activeId;
          const label =
            (typeof profile.display_label === 'string' && profile.display_label.trim())
            || (profile.relationship === 'self' ? t('chatx.labAttributionSelf') : t('chatx.labAttributionProfile'));
          return (
            <li key={profile.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                data-libertymd-lab-attribution-option={profile.id}
                onClick={() => onSelect(profile.id)}
                className={
                  selected
                    ? 'flex w-full min-h-11 items-center rounded-lg border border-libertymd-blue-600 bg-libertymd-blue-50 px-[var(--libertymd-space-md)] text-left libertymd-type-label font-semibold text-libertymd-blue-700'
                    : 'flex w-full min-h-11 items-center rounded-lg border border-libertymd-slate-200 bg-white px-[var(--libertymd-space-md)] text-left libertymd-type-label font-semibold text-libertymd-slate-700 hover:border-libertymd-blue-600'
                }
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>

      {profiles.length === 0 && (
        <p className="mt-[var(--libertymd-space-md)] libertymd-type-body-small text-libertymd-slate-600">
          {t('chatx.labAttributionEmpty')}
        </p>
      )}

      <div className="mt-[var(--libertymd-space-lg)] flex flex-wrap gap-[var(--libertymd-space-sm)]">
        <button
          type="button"
          data-libertymd-lab-attribution-confirm=""
          disabled={!canConfirm}
          onClick={() => {
            if (activeId) onConfirm();
          }}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-libertymd-blue-600 px-[var(--libertymd-space-md)] libertymd-type-label font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('chatx.labAttributionConfirm')}
        </button>
        <button
          type="button"
          data-libertymd-lab-attribution-cancel=""
          onClick={onClose}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-libertymd-slate-300 bg-white px-[var(--libertymd-space-md)] libertymd-type-label font-semibold text-libertymd-slate-700"
        >
          {t('chatx.labAttributionCancel')}
        </button>
      </div>
    </LibertyMDOverlaySheet>
  );
}
