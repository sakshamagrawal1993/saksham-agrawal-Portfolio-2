/**
 * P5-CHAT — WhatsApp-style attachment chooser.
 *
 * One paperclip beside the composer opens a chooser; the chooser decides what
 * kind of thing is being attached. Two always-visible buttons were louder than
 * the composer itself and made "attach something" look like the primary action
 * of a clinical conversation, which it is not.
 *
 * Presentation follows the platform convention rather than one shape stretched
 * to fit both:
 *   - mobile: a bottom sheet, thumb-reachable, rising from the composer edge
 *   - desktop: a small popover card anchored above the paperclip
 *
 * The lab fence is presented, never hidden. An anonymous user still sees the
 * Lab report row with its reason and a sign-in affordance; silently omitting it
 * would leave them unable to discover a capability they can have (P4-07 AC:
 * "never silent fail").
 */
import { useEffect, useRef } from 'react'
import { Camera, FileText, LogIn, X } from 'lucide-react'
import { useI18n } from '../../i18n'

export type LibertyMDAttachKind = 'photo' | 'lab'

export interface LibertyMDAttachSheetProps {
  open: boolean
  /** Lab is linked-only; anonymous users see it with a sign-in row instead. */
  labLinked: boolean
  onClose: () => void
  onChoosePhoto: () => void
  onChooseLab: () => void
  onLabSignInRequired: () => void
}

export function LibertyMDAttachSheet({
  open,
  labLinked,
  onClose,
  onChoosePhoto,
  onChooseLab,
  onLabSignInRequired,
}: LibertyMDAttachSheetProps) {
  const { t } = useI18n()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const firstItemRef = useRef<HTMLButtonElement | null>(null)

  // Escape closes, and focus moves into the panel on open. A chooser that traps
  // a keyboard user with no way out is worse than no chooser.
  useEffect(() => {
    if (!open) return
    firstItemRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const rows = (
    <div className="flex flex-col gap-[var(--libertymd-space-xs)]">
      <button
        ref={firstItemRef}
        type="button"
        data-libertymd-attach-choice="photo"
        onClick={() => { onChoosePhoto(); onClose() }}
        className="flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-left transition hover:bg-libertymd-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-libertymd-blue-600"
      >
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-libertymd-blue-50 text-libertymd-blue-600">
          <Camera className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block libertymd-type-body font-semibold text-libertymd-ink">{t('attach.photoTitle')}</span>
          <span className="block libertymd-type-body-small text-libertymd-slate-500">{t('attach.photoHint')}</span>
        </span>
      </button>

      <button
        type="button"
        data-libertymd-attach-choice={labLinked ? 'lab' : 'lab-sign-in'}
        onClick={() => { labLinked ? onChooseLab() : onLabSignInRequired(); onClose() }}
        className="flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-left transition hover:bg-libertymd-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-libertymd-blue-600"
      >
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-libertymd-blue-50 text-libertymd-blue-600">
          <FileText className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block libertymd-type-body font-semibold text-libertymd-ink">{t('attach.labTitle')}</span>
          <span className="block libertymd-type-body-small text-libertymd-slate-500">
            {labLinked ? t('attach.labHint') : t('attach.labSignInHint')}
          </span>
        </span>
        {!labLinked ? (
          <LogIn className="ml-auto h-4 w-4 shrink-0 text-libertymd-slate-500" aria-hidden="true" />
        ) : null}
      </button>
    </div>
  )

  return (
    <>
      {/* Scrim. Click-through close on both breakpoints. */}
      <div
        data-libertymd-attach-scrim=""
        onClick={onClose}
        className="fixed inset-0 z-40 bg-libertymd-slate-900/25 sm:bg-transparent"
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('attach.title')}
        data-libertymd-attach-sheet=""
        className={[
          'z-50 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.18)]',
          // mobile: bottom sheet
          'fixed inset-x-0 bottom-0 rounded-t-2xl p-[var(--libertymd-space-md)] pb-[calc(var(--libertymd-space-lg)+env(safe-area-inset-bottom))]',
          // desktop: popover card anchored above the paperclip
          'sm:absolute sm:inset-x-auto sm:bottom-full sm:left-0 sm:mb-2 sm:w-80 sm:rounded-lg sm:border sm:border-libertymd-slate-200 sm:p-[var(--libertymd-space-sm)] sm:pb-[var(--libertymd-space-sm)]',
        ].join(' ')}
      >
        {/* Grab handle: mobile affordance only. */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-libertymd-slate-300 sm:hidden" aria-hidden="true" />

        <div className="mb-2 flex items-center justify-between sm:mb-1">
          <p className="libertymd-type-label font-bold uppercase tracking-wide text-libertymd-slate-500">
            {t('attach.title')}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-libertymd-slate-500 transition hover:bg-libertymd-slate-200 sm:min-h-8 sm:min-w-8"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {rows}
      </div>
    </>
  )
}
