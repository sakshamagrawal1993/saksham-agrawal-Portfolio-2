import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';

/**
 * LibertyMDChatScroll — P0-19, P0-20, P0-23.
 *
 * ## P0-19 · anchor after layout, not on state set
 *
 * The old effect called `scrollIntoView` in the same commit that set the message state.
 * At that moment the browser has not laid out the new content, and — worse — the option
 * chips and the composer live in the footer, which is a `shrink-0` flex sibling of the
 * transcript. When chips appear the footer grows, so the transcript's `clientHeight`
 * *shrinks* after the scroll has already been computed. The anchor therefore lands short
 * by exactly the height of the late-arriving content, which is the reported symptom.
 *
 * Three fixes, all of them "after layout":
 * - a double `requestAnimationFrame` before reading `scrollHeight`, so React has committed
 *   and the browser has laid out;
 * - a `ResizeObserver` on the transcript content, on the footer, and on the scroll
 *   container itself, so any later growth (progressive text, late chips, images, an
 *   acknowledged emergency bar) re-anchors;
 * - a `visualViewport` resize listener, so opening or dismissing the mobile keyboard
 *   re-anchors instead of leaving the newest message under the keyboard.
 *
 * ## P0-20 · don't steal scroll from someone re-reading
 *
 * Re-anchoring only happens while the user is at or near the bottom (a tolerance band, not
 * an exact position). If they have scrolled up, new content raises a "new message" pill
 * instead of yanking the viewport.
 *
 * The subtle part is telling *our* scrolling apart from *theirs*. A naive
 * `scroll`-position check unpins on our own animation: when a tall message arrives the
 * distance-from-bottom jumps past the tolerance band for a frame, the listener concludes
 * the user scrolled away, and auto-scroll disables itself and shows a spurious pill. So a
 * scroll only *unpins* when it follows a real input gesture (`wheel`, `touchstart`,
 * `touchmove`, `pointerdown`, `keydown`) within `USER_INTENT_WINDOW_MS`. Arriving at the
 * bottom always re-pins, whoever caused it — that is also P0-20 AC3, the pill
 * auto-dismissing when the user scrolls back down by themselves.
 *
 * ## Emergency exception (P0-20 AC5)
 *
 * `force` overrides the band completely: an emergency re-pins and anchors regardless of
 * where the user had scrolled to. (The instruction itself does not depend on this — it is
 * a fixed portal, see `LibertyMDEmergencyAlert`. This only keeps the transcript coherent.)
 */

/**
 * P0-20 AC4 — "scrolled away from bottom" is a band, not a position. Roughly one short
 * message, so sub-pixel rounding, elastic overscroll and a partially-visible last line all
 * still count as "at the bottom".
 */
export const NEAR_BOTTOM_TOLERANCE_PX = 120;

/** How long after a real input gesture a scroll is still attributed to the user. */
const USER_INTENT_WINDOW_MS = 1200;

/** How long after a visual-viewport change (keyboard, toolbar) scrolls are the browser's. */
const VIEWPORT_SETTLE_MS = 500;

/**
 * P0-23 — persistent clearance under the newest message so it never sits flush against the
 * composer. Applied as padding on the scrolled content, so it is part of `scrollHeight`
 * and survives every anchor; it is not a margin that collapses, and not a spacer that
 * only exists while some other element does.
 */
export const TRANSCRIPT_BOTTOM_CLEARANCE_CLASS = 'pb-10 sm:pb-12';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

const distanceFromBottom = (element: HTMLElement) =>
  element.scrollHeight - element.scrollTop - element.clientHeight;

interface ChatScrollOptions {
  /**
   * Increment whenever anything in the transcript changes — a message, the thinking
   * bubble, an error, the report. Growth *within* existing content does not need to bump
   * this; the ResizeObserver covers that.
   */
  revision: number;
  /**
   * Increment only on genuinely new messages. Kept separate from `revision` so that the
   * thinking bubble appearing does not announce "new message" to someone who has scrolled
   * up — they would tap it and find nothing new.
   */
  messageRevision: number;
  /** P0-20 AC5 — emergency takes the viewport regardless of scroll position. */
  force: boolean;
}

export function useLibertyMDChatScroll({ revision, messageRevision, force }: ChatScrollOptions) {
  /** The scrolling transcript container. */
  const scrollRef = useRef<HTMLElement | null>(null);
  /** The content inside the scroller, observed for late growth. */
  const contentRef = useRef<HTMLDivElement | null>(null);
  /** The composer/action region, observed because growing it shrinks the scroller. */
  const footerRef = useRef<HTMLElement | null>(null);

  const pinnedRef = useRef(true);
  const forceRef = useRef(force);
  const lastUserIntentAtRef = useRef(0);
  const viewportSettlingUntilRef = useRef(0);
  const frameRef = useRef(0);
  const hasAnchoredOnceRef = useRef(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  forceRef.current = force;

  const anchorToBottom = useCallback((mode: 'smooth' | 'instant') => {
    const element = scrollRef.current;
    if (!element) return;
    // A burst of growth events collapses into the *already scheduled* anchor rather than
    // repeatedly rescheduling it. Rescheduling would be the obvious way to "wait until
    // growth stops", but content that resizes every frame would then starve the anchor
    // forever. Keeping the earliest schedule guarantees progress, and anything that grows
    // after it has run raises a fresh ResizeObserver callback that corrects the position.
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        const current = scrollRef.current;
        if (!current) return;
        const target = current.scrollHeight - current.clientHeight;
        // Already there. Skipping avoids restarting an animation every growth tick, which
        // is what reads as jank / a double jump (P0-19 AC4).
        if (target - current.scrollTop <= 1) return;
        const behavior: ScrollBehavior = mode === 'smooth' && !prefersReducedMotion() ? 'smooth' : 'auto';
        current.scrollTo({ top: target, behavior });
      });
    });
  }, []);

  const jumpToLatest = useCallback(() => {
    pinnedRef.current = true;
    setShowJumpToLatest(false);
    anchorToBottom('smooth');
  }, [anchorToBottom]);

  // Position + intent tracking.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const markIntent = () => { lastUserIntentAtRef.current = Date.now(); };
    const onScroll = () => {
      if (distanceFromBottom(element) <= NEAR_BOTTOM_TOLERANCE_PX) {
        pinnedRef.current = true;
        setShowJumpToLatest(false);
        return;
      }
      // Never unpin during a viewport change. Opening the keyboard shrinks the scroller, so
      // the distance-from-bottom jumps and the browser re-adjusts `scrollTop` — a scroll
      // nobody asked for. Treating that as "the user scrolled up" would leave the newest
      // message under the keyboard, which is the failure P0-19 AC3 forbids.
      if (Date.now() < viewportSettlingUntilRef.current) return;
      if (Date.now() - lastUserIntentAtRef.current <= USER_INTENT_WINDOW_MS) pinnedRef.current = false;
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    element.addEventListener('wheel', markIntent, { passive: true });
    element.addEventListener('touchstart', markIntent, { passive: true });
    element.addEventListener('touchmove', markIntent, { passive: true });
    element.addEventListener('pointerdown', markIntent, { passive: true });
    // On `window`, not the container: PageUp / Home / arrow keys scroll the transcript even
    // when focus is on `body`, so a container-scoped listener would miss keyboard scrolling
    // and we would keep yanking the viewport back from someone reading with the keyboard.
    window.addEventListener('keydown', markIntent);
    return () => {
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('wheel', markIntent);
      element.removeEventListener('touchstart', markIntent);
      element.removeEventListener('touchmove', markIntent);
      element.removeEventListener('pointerdown', markIntent);
      window.removeEventListener('keydown', markIntent);
    };
  }, []);

  // Any transcript change: anchor if we still hold the bottom, or if an emergency overrides.
  useEffect(() => {
    if (revision <= 0) return;
    const firstAnchor = !hasAnchoredOnceRef.current;
    hasAnchoredOnceRef.current = true;
    if (force) {
      pinnedRef.current = true;
      setShowJumpToLatest(false);
      anchorToBottom('instant');
      return;
    }
    if (pinnedRef.current) anchorToBottom(firstAnchor ? 'instant' : 'smooth');
  }, [revision, force, anchorToBottom]);

  // A genuinely new message while the user is reading further up: offer, never take.
  useEffect(() => {
    if (messageRevision <= 0 || force) return;
    if (!pinnedRef.current) setShowJumpToLatest(true);
  }, [messageRevision, force]);

  // Late layout growth: progressive text, late chips, images, an action bar appearing.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current || forceRef.current) anchorToBottom('smooth');
    });
    observer.observe(element);
    if (contentRef.current) observer.observe(contentRef.current);
    if (footerRef.current) observer.observe(footerRef.current);
    return () => observer.disconnect();
  }, [anchorToBottom]);

  // Keyboard open/close and iOS Safari's dynamic toolbar (P0-19 AC3).
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const onViewportChange = () => {
      viewportSettlingUntilRef.current = Date.now() + VIEWPORT_SETTLE_MS;
      // Instant, not smooth: a smooth scroll racing the keyboard animation is visible jank.
      if (pinnedRef.current || forceRef.current) anchorToBottom('instant');
    };
    viewport.addEventListener('resize', onViewportChange);
    return () => viewport.removeEventListener('resize', onViewportChange);
  }, [anchorToBottom]);

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  return { scrollRef, contentRef, footerRef, showJumpToLatest, jumpToLatest };
}

/**
 * P0-20 · the affordance. Rendered inside the footer's `relative` wrapper and pulled above
 * its top edge, so it floats over the bottom of the transcript without needing fixed
 * positioning — which keeps it immune to the ancestor-`backdrop-filter` problem that
 * `LibertyMDEmergencyAlert` documents.
 */
export function LibertyMDNewMessagePill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-5 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className="pointer-events-auto inline-flex min-h-11 items-center gap-1.5 rounded-full border border-libertymd-blue-600/25 bg-white px-4 text-xs font-bold text-libertymd-blue-600 shadow-[0_10px_28px_rgba(23,50,95,0.18)] transition hover:border-libertymd-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-libertymd-blue-600"
      >
        {label}
        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
