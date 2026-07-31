import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

/**
 * LibertyMDEmergencyAlert — P0-18 · safety-grade.
 *
 * An emergency instruction must be in the viewport **by construction, not by scroll**.
 * Appending it to the transcript is what let "call emergency services" render below the
 * fold in ~20% of consults (`emergency_stopped`). Two things follow from that:
 *
 * 1. `LibertyMDEmergencyAlert` is a *portal* into `document.body` with `position: fixed`.
 *    A fixed box's containing block is the viewport, so no scroll position of any ancestor
 *    scroller can move it (P0-18 AC1, AC3). The portal matters as well as the fixed
 *    positioning: `transform`, `filter`, `backdrop-filter`, `perspective`, `will-change`
 *    and `contain: paint` on *any* ancestor would silently re-parent a fixed element to
 *    that ancestor's box. `LibertyMDChat`'s header and footer both use `backdrop-blur-xl`,
 *    and the site root mounts a grain layer and Lenis, so rendering the alert inside the
 *    chat tree would leave that guarantee dependent on styling elsewhere. Portalling to
 *    `body` removes the dependency: there is nothing between the alert and the viewport.
 *
 * 2. Nothing except an explicit acknowledgement removes it (P0-18 AC4). There is no
 *    backdrop click handler, no Escape handler, no drag-to-dismiss and no history entry
 *    tied to its visibility — a back gesture cannot dismiss it because visibility is a
 *    function of consult state plus one acknowledgement flag, not of navigation state.
 *
 * The panel is a three-row flex column: the instruction row and the acknowledge row never
 * scroll, only the model-authored detail in between does. At 320×480 with the keyboard up
 * that is what keeps the actual instruction visible without any scrolling at all.
 *
 * Copy is passed in. This component moves emergency copy into the viewport; it does not
 * author or reword it (P0-17 owns clinical copy, and it is flagged for clinician review).
 */

/** Above the report gate (z-90) and the account drawer (z-85) — an emergency outranks both. */
const EMERGENCY_LAYER_CLASS = 'z-[120]';

interface LibertyMDEmergencyAlertProps {
  /** Short heading, e.g. "Seek emergency care now". */
  heading: string;
  /** The condition-specific instruction produced by the safety lane. */
  message: string;
  /** The standing instruction that must be present even when `message` is vague. */
  standingInstruction: string;
  acknowledgeLabel: string;
  /** Reassurance that acknowledging does not throw the guidance away (AC5). */
  persistenceNote: string;
  onAcknowledge: () => void;
}

export function LibertyMDEmergencyAlert({
  heading,
  message,
  standingInstruction,
  acknowledgeLabel,
  persistenceNote,
  onAcknowledge,
}: LibertyMDEmergencyAlertProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [visualViewportStyle, setVisualViewportStyle] = useState<CSSProperties | undefined>(undefined);

  // AC6 — announce immediately and move focus. Focus lands on the panel itself (not the
  // button) so a screen reader reads the instruction rather than just "I understand".
  // Blurring the composer first is load-bearing on iOS: `position: fixed` is resolved
  // against the *layout* viewport, so with the software keyboard up a fixed layer can be
  // pushed under it. Dropping focus retracts the keyboard, and the visual-viewport sync
  // below covers the case where something else re-opens it.
  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  // Keep the layer inside the *visual* viewport, not just the layout viewport, so the
  // keyboard and iOS Safari's dynamic toolbar cannot cover it (AC2).
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const sync = () => {
      setVisualViewportStyle({
        top: viewport.offsetTop,
        left: viewport.offsetLeft,
        width: viewport.width,
        height: viewport.height,
      });
    };
    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
    };
  }, []);

  // Keep keyboard focus inside the alert while it is unacknowledged. Escape is swallowed
  // rather than handled: the only exit is the acknowledge button (AC4).
  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key !== 'Tab') return;
    const layer = layerRef.current;
    if (!layer) return;
    const focusable = Array.from(
      layer.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])'),
    ).filter((node) => !node.hasAttribute('disabled'));
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
  }, []);

  return createPortal(
    <div
      ref={layerRef}
      data-libertymd-emergency-layer="unacknowledged"
      onKeyDown={onKeyDown}
      // No onClick / onMouseDown: a tap outside must not dismiss an emergency (AC4).
      className={`fixed inset-0 ${EMERGENCY_LAYER_CLASS} flex items-end justify-center bg-libertymd-slate-900/50 p-3 sm:items-center sm:p-6`}
      style={visualViewportStyle}
    >
      <div
        ref={panelRef}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        tabIndex={-1}
        className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border-2 border-red-300 bg-white text-left shadow-[0_28px_80px_rgba(23,50,95,0.28)] outline-none"
      >
        <div className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-600" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-base font-bold leading-6 text-red-900 sm:text-lg">{heading}</h2>
              <p className="mt-1.5 text-[15px] font-bold leading-6 text-red-900">{standingInstruction}</p>
            </div>
          </div>
        </div>

        {/*
          Only this middle row scrolls. The instruction above it and the acknowledge button
          below it are `shrink-0`, so at 320×480 with the keyboard up the instruction and the
          exit are both on screen without scrolling anything — the verbose detail is what
          gives way. If the safety lane produced no detail text, the row is absent entirely
          rather than an empty box.
        */}
        {message.trim() !== '' && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            <p className="whitespace-pre-line text-sm leading-6 text-libertymd-slate-700">{message}</p>
          </div>
        )}

        <div className="shrink-0 border-t border-libertymd-slate-200 px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={onAcknowledge}
            className="flex min-h-11 w-full items-center justify-center rounded-full bg-red-600 px-6 text-sm font-bold text-white shadow-md transition hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            {acknowledgeLabel}
          </button>
          <p className="mt-2 text-center text-[11px] leading-4 text-libertymd-slate-500">{persistenceNote}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface LibertyMDEmergencyPinnedBarProps {
  heading: string;
  standingInstruction: string;
  reopenLabel: string;
  onReopen: () => void;
}

/**
 * The acknowledged state of P0-18 (AC5). Rendered inside the chat's footer region, which
 * is a `shrink-0` flex sibling of the scrolling transcript inside a `h-[100svh]`
 * `overflow-hidden` column — so it occupies viewport space that the transcript can never
 * scroll over. It is in normal flow rather than fixed on purpose: being part of the
 * footer's layout means it *reserves* space instead of covering the last message, which is
 * the failure mode P0-23 exists to prevent.
 */
export function LibertyMDEmergencyPinnedBar({
  heading,
  standingInstruction,
  reopenLabel,
  onReopen,
}: LibertyMDEmergencyPinnedBarProps) {
  const reopenRef = useRef<HTMLButtonElement | null>(null);

  // The alert that was just acknowledged held focus; without this, focus falls back to
  // `body` and a keyboard or screen-reader user is dropped at the top of the document.
  // This bar only ever mounts as the direct result of that acknowledgement.
  useEffect(() => {
    reopenRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      data-libertymd-emergency-layer="acknowledged"
      className="mb-3 flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 text-left"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wide text-red-700">{heading}</p>
        <p className="mt-0.5 text-[13px] font-bold leading-5 text-red-900">{standingInstruction}</p>
      </div>
      <button
        ref={reopenRef}
        type="button"
        onClick={onReopen}
        className="min-h-11 shrink-0 rounded-full border border-red-300 bg-white px-3 text-xs font-bold text-red-800 transition hover:border-red-500 hover:text-red-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
      >
        {reopenLabel}
      </button>
    </div>
  );
}
