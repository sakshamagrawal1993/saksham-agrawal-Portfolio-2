/**
 * P4-07 — dual Photo / Lab report attach chrome on the consult composer.
 *
 * Photo: live image picker (jpeg/png/webp) — Lane F; anon OK.
 * Lab: linked-only; profile attribution via parent sheet; PDF + images.
 * LibertyMD tokens only. Never writes clinical tables / Storage directly.
 */
import { useRef } from 'react';
import { Camera, FileText, Loader2, RotateCw, X } from 'lucide-react';
import { useI18n } from '../../i18n';

export interface LibertyMDPhotoChip {
  object_uuid: string;
  content_type: string;
  analysis_status?: 'ready' | 'retry';
}

export interface LibertyMDLabChip {
  object_uuid: string;
  content_type: string;
  patient_id: string;
}

export interface LibertyMDAttachControlsProps {
  /** Same locks as send — intake composer usable. */
  disabled: boolean;
  uploading?: boolean;
  labUploading?: boolean;
  chips?: LibertyMDPhotoChip[];
  labChips?: LibertyMDLabChip[];
  technicalNotice?: string | null;
  /** Lab enabled only when linked (!isAnonymous). */
  labLinked?: boolean;
  onPhotoFile: (file: File) => void;
  /** Linked: open profile attribution then file pick. */
  onLabClick?: () => void;
  /** Anonymous: sign-in / capability offer (never silent fail). */
  onLabSignInRequired?: () => void;
  onDismissNotice?: () => void;
  onRemoveChip?: (objectUuid: string) => void;
  onRetryChip?: (objectUuid: string) => void;
  retryingObjectUuid?: string | null;
  onRemoveLabChip?: (objectUuid: string) => void;
}

const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

export function LibertyMDAttachControls({
  disabled,
  uploading = false,
  labUploading = false,
  chips = [],
  labChips = [],
  technicalNotice = null,
  labLinked = false,
  onPhotoFile,
  onLabClick,
  onLabSignInRequired,
  onDismissNotice,
  onRemoveChip,
  onRetryChip,
  retryingObjectUuid = null,
  onRemoveLabChip,
}: LibertyMDAttachControlsProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const photoDisabled = disabled || uploading || labUploading;
  const labBusy = disabled || uploading || labUploading;
  const labEnabled = labLinked && !labBusy;

  return (
    <div className="mb-[var(--libertymd-space-sm)] space-y-[var(--libertymd-space-xs)]">
      {chips.length > 0 && (
        <ul
          className="flex flex-wrap gap-[var(--libertymd-space-xs)]"
          data-libertymd-photo-chips=""
          aria-label={t('chatx.photoAttachedLabel')}
        >
          {chips.map((chip) => (
            <li
              key={chip.object_uuid}
              className="inline-flex items-center gap-1 rounded-full border border-libertymd-slate-200 bg-libertymd-slate-50 px-[var(--libertymd-space-sm)] py-1 libertymd-type-label text-libertymd-slate-700"
            >
              <Camera className="h-3.5 w-3.5 text-libertymd-blue-600" aria-hidden="true" />
              <span>{t('chatx.photoChip')}</span>
              {chip.analysis_status === 'retry' && onRetryChip && (
                <button
                  type="button"
                  onClick={() => onRetryChip(chip.object_uuid)}
                  disabled={retryingObjectUuid === chip.object_uuid}
                  className="inline-flex min-h-7 items-center gap-1 rounded-full px-2 font-semibold text-libertymd-blue-700 hover:bg-white disabled:opacity-60"
                >
                  {retryingObjectUuid === chip.object_uuid ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t('chatx.photoRetry')}
                </button>
              )}
              {onRemoveChip && (
                <button
                  type="button"
                  aria-label={t('chatx.photoRemove')}
                  onClick={() => onRemoveChip(chip.object_uuid)}
                  className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-full text-libertymd-slate-500 hover:bg-libertymd-slate-100 hover:text-libertymd-slate-800"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {labChips.length > 0 && (
        <ul
          className="flex flex-wrap gap-[var(--libertymd-space-xs)]"
          data-libertymd-lab-chips=""
          aria-label={t('chatx.labAttachedLabel')}
        >
          {labChips.map((chip) => (
            <li
              key={chip.object_uuid}
              className="inline-flex items-center gap-1 rounded-full border border-libertymd-slate-200 bg-libertymd-slate-50 px-[var(--libertymd-space-sm)] py-1 libertymd-type-label text-libertymd-slate-700"
            >
              <FileText className="h-3.5 w-3.5 text-libertymd-blue-600" aria-hidden="true" />
              <span>{t('chatx.labChip')}</span>
              <span className="text-libertymd-slate-500">{t('chatx.labUnreviewed')}</span>
              {onRemoveLabChip && (
                <button
                  type="button"
                  aria-label={t('chatx.labRemove')}
                  onClick={() => onRemoveLabChip(chip.object_uuid)}
                  className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-full text-libertymd-slate-500 hover:bg-libertymd-slate-100 hover:text-libertymd-slate-800"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-[var(--libertymd-space-xs)]">
        <input
          ref={inputRef}
          type="file"
          accept={PHOTO_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          data-libertymd-attach-photo-input=""
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onPhotoFile(file);
          }}
        />
        <button
          type="button"
          data-libertymd-attach-photo=""
          disabled={photoDisabled}
          aria-label={t('chatx.attachPhoto')}
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-libertymd-slate-300 bg-white px-[var(--libertymd-space-md)] libertymd-type-label font-semibold text-libertymd-slate-700 transition hover:border-libertymd-blue-600 hover:text-libertymd-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-libertymd-blue-600" aria-hidden="true" />
          ) : (
            <Camera className="h-4 w-4 text-libertymd-blue-600" aria-hidden="true" />
          )}
          {t('chatx.attachPhoto')}
        </button>

        <button
          type="button"
          data-libertymd-attach-lab=""
          data-libertymd-lab-linked={labLinked ? 'true' : 'false'}
          disabled={!labEnabled && labLinked}
          aria-disabled={!labEnabled ? 'true' : undefined}
          title={labLinked ? t('chatx.attachLab') : t('chatx.attachLabSignIn')}
          onClick={() => {
            if (!labLinked) {
              onLabSignInRequired?.();
              return;
            }
            if (labEnabled) onLabClick?.();
          }}
          className={
            labLinked
              ? 'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-libertymd-slate-300 bg-white px-[var(--libertymd-space-md)] libertymd-type-label font-semibold text-libertymd-slate-700 transition hover:border-libertymd-blue-600 hover:text-libertymd-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
              : 'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-libertymd-slate-200 bg-libertymd-slate-50 px-[var(--libertymd-space-md)] libertymd-type-label font-semibold text-libertymd-slate-500'
          }
        >
          {labUploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-libertymd-blue-600" aria-hidden="true" />
          ) : (
            <FileText className="h-4 w-4" aria-hidden="true" />
          )}
          {t('chatx.attachLab')}
        </button>
        {!labLinked && (
          <span className="libertymd-type-label text-libertymd-slate-500" data-libertymd-lab-signin-hint="">
            {t('chatx.attachLabSignIn')}
          </span>
        )}
      </div>

      {technicalNotice ? (
        <div
          role="status"
          data-libertymd-severity="technical"
          data-libertymd-photo-notice=""
          className="flex items-start justify-between gap-2 rounded-lg border border-libertymd-slate-300 bg-libertymd-slate-100 px-[var(--libertymd-space-md)] py-[var(--libertymd-space-sm)]"
        >
          <p className="libertymd-type-body-small text-libertymd-slate-700">{technicalNotice}</p>
          {onDismissNotice && (
            <button
              type="button"
              aria-label={t('chatx.photoNoticeDismiss')}
              onClick={onDismissNotice}
              className="inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded-full text-libertymd-slate-500 hover:bg-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
