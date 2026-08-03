import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { lockLibertyMdScroll, type LibertyMDScrollLockHandle } from './libertymd-scroll-lock';

/**
 * LibertyMDOverlaySheet — P0-22.
 *
 * Reusable dismissible overlay: mobile bottom sheet + desktop centered popup, portalled to
 * `document.body` so `position: fixed` stays viewport-relative (same containing-block lesson
 * as P0-18). Stacks at `z-[90]` — below emergency `z-[120]`.
 *
 * Dismiss policy (opposite of LibertyMDEmergencyAlert):
 *   - Escape → onClose (emergency swallows Escape)
 *   - Backdrop tap → onClose (emergency has no backdrop dismiss)
 *   - Explicit close control (consumer / children)
 *   - Mobile only: drag-down on dedicated handle chrome (not the scrolling body)
 *
 * Focus: hand-rolled Tab cycle; initial focus on the labelled dialog container; restore on
 * close. Scroll lock: body scrollY + consult scroller scrollTop (see libertymd-scroll-lock).
 *
 * P1-14 can mount comprehension content as children without rewriting portal/dismiss/focus/lock.
 */

/** Below emergency (z-120); at/near report-gate band. */
const OVERLAY_LAYER_CLASS = 'z-[90]';

const DESKTOP_MQ = '(min-width: 640px)';
const DRAG_DISMISS_PX = 80;

export interface LibertyMDOverlaySheetProps {
  onClose: () => void;
  children: ReactNode;
  /** Element id of the visible title — wired to `aria-labelledby`. */
  titleId: string;
  /** Optional labelled-by override; defaults to `titleId`. */
  ariaLabelledBy?: string;
  /** Optional described-by id for longer intro copy. */
  ariaDescribedBy?: string;
  className?: string;
  /** Panel chrome classes (width / padding). */
  panelClassName?: string;
  /** When set, freeze this element's scrollTop; else query consult scroller selector. */
  consultScroller?: HTMLElement | null;
}

export function LibertyMDOverlaySheet({
  onClose,
  children,
  titleId,
  ariaLabelledBy,
  ariaDescribedBy,
  className,
  panelClassName,
  consultScroller,
}: LibertyMDOverlaySheetProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const lockRef = useRef<LibertyMDScrollLockHandle | null>(null);
  const dragStartYRef = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(DESKTOP_MQ).matches : true,
  );
  const generatedId = useId();
  const labelledBy = ariaLabelledBy ?? titleId;

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_MQ);
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const active = document.activeElement;
    previousFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;

    lockRef.current = lockLibertyMdScroll({ consultScroller });
    panelRef.current?.focus({ preventScroll: true });

    return () => {
      lockRef.current?.release();
      lockRef.current = null;
      const restore = previousFocusRef.current;
      if (restore && document.contains(restore)) {
        restore.focus({ preventScroll: true });
      }
    };
  }, [consultScroller]);

  /**
   * Hand-rolled focus trap (P0-22 Q1A). Same Tab-cycle shape as LibertyMDEmergencyAlert,
   * but Escape **closes** via onClose — emergency swallows Escape and has no backdrop dismiss.
   * Do not share a helper that conflates the two policies.
   */
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const layer = layerRef.current;
      if (!layer) return;
      const focusable = Array.from(
        layer.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => !node.hasAttribute('disabled') && node.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  const onHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // Desktop omits drag handlers entirely (Q4A) — not a no-op listener.
      if (isDesktop) return;
      dragStartYRef.current = event.clientY;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [isDesktop],
  );

  const onHandlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isDesktop || dragStartYRef.current == null) return;
      const delta = Math.max(0, event.clientY - dragStartYRef.current);
      setDragOffsetY(delta);
    },
    [isDesktop],
  );

  const onHandlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isDesktop || dragStartYRef.current == null) return;
      const delta = Math.max(0, event.clientY - dragStartYRef.current);
      dragStartYRef.current = null;
      setDragOffsetY(0);
      if (delta >= DRAG_DISMISS_PX) onClose();
    },
    [isDesktop, onClose],
  );

  const onHandlePointerCancel = useCallback(() => {
    dragStartYRef.current = null;
    setDragOffsetY(0);
  }, []);

  return createPortal(
    <div
      ref={layerRef}
      data-libertymd-overlay-sheet="open"
      data-libertymd-overlay-mode={isDesktop ? 'popup' : 'sheet'}
      onKeyDown={onKeyDown}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={`fixed inset-0 ${OVERLAY_LAYER_CLASS} flex items-end justify-center bg-libertymd-slate-900/35 p-0 backdrop-blur-sm sm:items-center sm:p-libertymd-md ${className ?? ''}`}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
        data-libertymd-overlay-panel=""
        data-lenis-prevent
        onMouseDown={(event) => event.stopPropagation()}
        style={
          !isDesktop && dragOffsetY > 0
            ? { transform: `translateY(${dragOffsetY}px)` }
            : undefined
        }
        className={`flex max-h-[min(92dvh,100%)] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-white/80 bg-white text-left shadow-2xl outline-none sm:max-h-[min(90vh,100%)] sm:rounded-lg ${panelClassName ?? ''}`}
      >
        {/*
          Dedicated drag handle / header chrome only (Q4A). Sheet body below may
          overflow-y-auto independently. Handlers attached only on the mobile sheet path.
        */}
        {!isDesktop && (
          <div
            data-libertymd-overlay-drag-handle=""
            className="flex shrink-0 cursor-grab touch-none flex-col items-center pt-libertymd-sm pb-libertymd-xs active:cursor-grabbing"
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerCancel}
            aria-hidden="true"
          >
            <span className="h-1.5 w-10 rounded-full bg-libertymd-slate-300" />
          </div>
        )}

        <div
          data-libertymd-overlay-body=""
          data-lenis-prevent
          data-lenis-prevent-wheel
          data-lenis-prevent-touch
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y focus:outline-none"
          // Stable id hook for tests / future P1-14 mounts; not user-facing.
          id={`libertymd-overlay-body-${generatedId}`}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
