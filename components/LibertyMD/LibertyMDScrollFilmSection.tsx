import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useI18n } from '../../i18n';

/**
 * Ambient Clinical Care Film, scrubbed by scroll.
 *
 * The section is SCRUB_VIEWPORTS tall and holds a sticky, viewport-height pane, so the film
 * stays put while the page scrolls past it. Frame position is derived from scroll offset
 * rather than played, which is what makes scrolling back up run the film backwards for free.
 *
 * Smoothness comes from the same two ideas as the hero logo (LibertyMDPremiumLogo):
 *   1. A continuous rAF loop EASES the frame position toward its scroll target every frame
 *      (critically-damped follow). Reacting to scroll events directly is what makes a scrub
 *      stutter — wheel deltas arrive in coarse bursts, so the film lurches then stalls.
 *   2. The eased position is fractional, and adjacent frames are cross-faded by the
 *      fraction. Without this the 60 frames read as 60 discrete steps; with it the sequence
 *      is continuous, so we get smoothness without shipping more frames.
 *
 * Frames are a pre-rendered AVIF sequence in public/film (see scripts/generate-film-frames.swift).
 * Scrubbing a real <video> via currentTime was the other option, but seeking is unreliable on
 * iOS Safari; decoded stills are smooth everywhere and here they are smaller than the mp4.
 */

const FRAME_COUNT = 60;
/**
 * Total section height in viewports. The sticky pane occupies one of them, so the film scrubs
 * over (SCRUB_VIEWPORTS - 1) viewports of travel — that difference, not this number, is what
 * sets the scrub speed. 3.5 gives 2.5 viewports of travel: 40% slower than the 1.5 it began at.
 */
const SCRUB_VIEWPORTS = 3.5;
const MOBILE_TIER_QUERY = '(max-width: 639px)';
/** Frame widths on disk. 1280 is the source's native width and the band's container width. */
const DESKTOP_TIER = 1280;
const MOBILE_TIER = 800;
const FRAME_ASPECT = '1280 / 676';

/** Fraction of the remaining distance covered per frame. Matches the hero logo's feel. */
const DAMP = 0.18;
/** Below this the eased position has effectively arrived, so the loop can idle. */
const SETTLE_EPSILON = 0.002;

const framePath = (tier: number, index: number) =>
  `/film/${tier}/f${String(index).padStart(3, '0')}.avif`;

export function LibertyMDScrollFilmSection() {
  const { t } = useI18n();
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const framesRef = useRef<Array<HTMLImageElement | undefined>>([]);
  const positionRef = useRef(0); // eased frame position, fractional
  const drawnKeyRef = useRef('');
  const rafRef = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

  // Falls back to the poster when AVIF cannot be decoded (Safari < 16.4) or frame 0 fails.
  const [canScrub, setCanScrub] = useState(true);
  const [isReady, setIsReady] = useState(false);

  /** Scroll progress across the section, 0 when its top hits the viewport top, 1 at its end. */
  const readProgress = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return 0;
    const range = section.offsetHeight - window.innerHeight;
    if (range <= 0) return 0;
    const travelled = -section.getBoundingClientRect().top;
    return Math.min(1, Math.max(0, travelled / range));
  }, []);

  /** Nearest frame at or before `index` that has actually decoded. */
  const resolveLoaded = useCallback((index: number) => {
    let i = Math.min(FRAME_COUNT - 1, Math.max(0, index));
    while (i >= 0 && !framesRef.current[i]?.complete) i -= 1;
    return i;
  }, []);

  /** Draw the fractional position, cross-fading the two frames it sits between. */
  const paintAt = useCallback(
    (position: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.width) return;

      const lowerIndex = Math.floor(position);
      const blend = position - lowerIndex;
      const lower = resolveLoaded(lowerIndex);
      const upper = resolveLoaded(lowerIndex + 1);
      if (lower < 0) return;

      // Quantise the blend so tiny sub-pixel changes don't force a redraw every frame.
      const key = `${lower}:${upper}:${Math.round(blend * 32)}`;
      if (key === drawnKeyRef.current) return;

      const context = canvas.getContext('2d');
      if (!context) return;
      const lowerFrame = framesRef.current[lower];
      if (!lowerFrame) return;

      context.imageSmoothingQuality = 'high';
      context.globalAlpha = 1;
      context.drawImage(lowerFrame, 0, 0, canvas.width, canvas.height);

      const upperFrame = upper > lower ? framesRef.current[upper] : undefined;
      if (upperFrame && blend > 0.01) {
        context.globalAlpha = blend;
        context.drawImage(upperFrame, 0, 0, canvas.width, canvas.height);
        context.globalAlpha = 1;
      }

      drawnKeyRef.current = key;
    },
    [resolveLoaded],
  );

  // The damped follow loop. Runs only while the section is on screen, and idles once the
  // eased position has caught up to the scroll target.
  useEffect(() => {
    if (reduceMotion || !canScrub) return;
    const section = sectionRef.current;
    if (!section) return;

    let visible = false;
    let snapNext = true;

    const stop = () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const tick = () => {
      rafRef.current = null;
      const target = readProgress() * (FRAME_COUNT - 1);

      if (snapNext) {
        positionRef.current = target; // entering view: start where scroll already is
        snapNext = false;
      } else {
        positionRef.current += (target - positionRef.current) * DAMP;
        // Land exactly once we are within a hair of the target, so the frame we settle on
        // depends on scroll position alone and not on the direction we arrived from.
        if (Math.abs(target - positionRef.current) <= SETTLE_EPSILON) {
          positionRef.current = target;
        }
      }

      paintAt(positionRef.current);

      // Keep ticking while still easing; otherwise wait for the next scroll to wake us.
      if (visible && Math.abs(target - positionRef.current) > SETTLE_EPSILON) {
        rafRef.current = window.requestAnimationFrame(tick);
      }
    };

    const wake = () => {
      if (!visible || rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) {
          snapNext = true;
          wake();
        } else {
          stop();
        }
      },
      { rootMargin: '100px 0px' },
    );
    observer.observe(section);

    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('resize', wake);
    // rAF is suspended while the tab is hidden, so catch up on the way back rather than
    // sitting on whatever frame was current when the user left.
    document.addEventListener('visibilitychange', wake);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', wake);
      window.removeEventListener('resize', wake);
      document.removeEventListener('visibilitychange', wake);
      stop();
    };
  }, [reduceMotion, canScrub, readProgress, paintAt]);

  // Load the sequence. Frame 0 is awaited first so something is on screen immediately.
  useEffect(() => {
    if (reduceMotion) return;

    const tier = window.matchMedia(MOBILE_TIER_QUERY).matches ? MOBILE_TIER : DESKTOP_TIER;
    let cancelled = false;
    framesRef.current = new Array(FRAME_COUNT);

    const load = (index: number) =>
      new Promise<HTMLImageElement | undefined>((resolve) => {
        const image = new Image();
        image.decoding = 'async';
        image.src = framePath(tier, index);
        image.onload = () => {
          if (!cancelled) framesRef.current[index] = image;
          resolve(image);
        };
        image.onerror = () => resolve(undefined);
      });

    (async () => {
      const first = await load(0);
      if (cancelled) return;
      if (!first) {
        setCanScrub(false);
        return;
      }
      setIsReady(true);

      // Paint once directly, without waiting for the rAF loop. The loop only wakes on scroll,
      // resize or intersection, and rAF is suspended entirely while the tab is hidden — so
      // relying on it alone can leave a blank canvas until the user happens to scroll.
      positionRef.current = readProgress() * (FRAME_COUNT - 1);
      paintAt(positionRef.current);

      for (let index = 1; index < FRAME_COUNT; index += 1) {
        if (cancelled) return;
        await load(index);
      }
      // Later frames may supersede the nearest-loaded fallback currently on screen, so clear
      // the cache key and repaint rather than waiting for the next scroll.
      drawnKeyRef.current = '';
      paintAt(positionRef.current);
    })();

    return () => {
      cancelled = true;
    };
  }, [reduceMotion, readProgress, paintAt]);

  // Size the backing store to the displayed box, capped at 2x for cost.
  useEffect(() => {
    if (reduceMotion || !canScrub) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      drawnKeyRef.current = ''; // resizing clears the canvas
      paintAt(positionRef.current);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [reduceMotion, canScrub, paintAt]);

  const isStatic = reduceMotion || !canScrub;

  return (
    <section
      ref={sectionRef}
      style={isStatic ? undefined : { height: `${SCRUB_VIEWPORTS * 100}vh` }}
      className="relative border-t border-libertymd-green-sage bg-libertymd-green-sage/30"
    >
      <div
        className={`libertymd-page-gutter flex flex-col justify-center overflow-hidden ${
          isStatic ? 'libertymd-section-spacing' : 'sticky top-0 h-screen'
        }`}
      >
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-normal text-libertymd-blue-600">
            {t('app.humanCareKicker')}
          </p>
          <h2 className="mx-auto mt-3 max-w-xl text-3xl font-black tracking-normal text-libertymd-ink sm:text-4xl">
            {t('app.humanCareTitle')}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-libertymd-slate-muted">
            {t('app.humanCareSubtitle')}
          </p>
        </div>

        <div className="relative mx-auto mt-10 w-full max-w-[80rem]">
          {/* Soft blue/peach glow matching the film's palette so the seams disappear */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-6 -inset-y-8 -z-0 bg-[radial-gradient(60%_60%_at_50%_50%,rgba(191,219,254,0.45),rgba(254,226,226,0.22)_55%,transparent_80%)] blur-2xl"
          />
          <div className="relative overflow-hidden rounded-3xl">
            {isStatic ? (
              <img
                src="/film/poster.jpg"
                alt="A doctor gently examining a patient with a stethoscope, in a soft, glowing style"
                className="w-full object-cover [mask-image:linear-gradient(180deg,transparent_0%,black_14%,black_86%,transparent_100%)] [-webkit-mask-image:linear-gradient(180deg,transparent_0%,black_14%,black_86%,transparent_100%)]"
                style={{ aspectRatio: FRAME_ASPECT }}
              />
            ) : (
              <canvas
                ref={canvasRef}
                role="img"
                aria-label="Ambient LibertyMD film, advancing as you scroll: a doctor gently examining a patient with a stethoscope in a soft, glowing style"
                className={`w-full object-cover transition-opacity duration-500 [mask-image:linear-gradient(180deg,transparent_0%,black_14%,black_86%,transparent_100%)] [-webkit-mask-image:linear-gradient(180deg,transparent_0%,black_14%,black_86%,transparent_100%)] ${
                  isReady ? 'opacity-100' : 'opacity-0'
                }`}
                style={{ aspectRatio: FRAME_ASPECT }}
              />
            )}
            {/* Left/right feather so the film blends into the page gutters on wide screens */}
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(247,250,245,0.6)_0%,transparent_11%,transparent_89%,rgba(247,250,245,0.6)_100%)]" />
          </div>
        </div>
      </div>
    </section>
  );
}
