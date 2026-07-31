/**
 * P0-22 — iOS-safe scroll lock for dismissible LibertyMD overlays.
 *
 * Locks both:
 *   1. `document.body` via `position: fixed` + saved `window.scrollY` (classic iOS pattern —
 *      naive `overflow: hidden` alone jumps Safari to the top).
 *   2. The consult transcript scroller (`[data-libertymd-consult-scroller]`) via
 *      `overflow: hidden` + saved `scrollTop`.
 *
 * Does not touch `SmoothScroll.tsx` / Lenis. Body lock freezes the layout viewport under
 * App's marketing shell; if Lenis still moves after this, escalate rather than silent-pass.
 *
 * Not wired into AccountDrawer (P0-22 Q3A).
 *
 * P0-24 DoD+ — browser scroll-restore: `release()` restores body `scrollY` and consult
 * `scrollTop`. Soft leave / Back / popstate (P0-24 Q1A) do **not** use this lock — they
 * stash a recoverable consultationId without a history trap; document scroll after leave
 * is the browser's own restore, not overlay lock state.
 */

export const LIBERTYMD_CONSULT_SCROLLER_SELECTOR = '[data-libertymd-consult-scroller]';

export type LibertyMDScrollLockHandle = {
  release: () => void;
};

export function lockLibertyMdScroll(options?: {
  consultScroller?: HTMLElement | null;
}): LibertyMDScrollLockHandle {
  const scrollY = window.scrollY;
  const body = document.body;
  const previousBody = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
  };

  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  body.style.overflow = 'hidden';

  const scroller =
    options?.consultScroller ??
    document.querySelector<HTMLElement>(LIBERTYMD_CONSULT_SCROLLER_SELECTOR);

  let previousConsult: { overflow: string; scrollTop: number } | null = null;
  if (scroller) {
    previousConsult = {
      overflow: scroller.style.overflow,
      scrollTop: scroller.scrollTop,
    };
    scroller.style.overflow = 'hidden';
    scroller.scrollTop = previousConsult.scrollTop;
  }

  return {
    release() {
      body.style.position = previousBody.position;
      body.style.top = previousBody.top;
      body.style.left = previousBody.left;
      body.style.right = previousBody.right;
      body.style.width = previousBody.width;
      body.style.overflow = previousBody.overflow;
      window.scrollTo(0, scrollY);

      if (scroller && previousConsult) {
        scroller.style.overflow = previousConsult.overflow;
        scroller.scrollTop = previousConsult.scrollTop;
      }
    },
  };
}
