import { useEffect } from 'react';

/**
 * SmoothScroll — Lenis smooth scroll (default), with a native-scroll escape hatch for A/B.
 *
 * Renders nothing. When the active mode is "lenis" it lazy-loads Lenis (installed package,
 * CDN fallback) and drives it with a requestAnimationFrame loop; when "native" it loads
 * NOTHING and the browser's own scroll is used.
 *
 * Pick the mode three ways (first match wins):
 *   1. prop:            <SmoothScroll mode="native" />
 *   2. URL query:       ?scroll=native   or   ?scroll=lenis      ← side-by-side comparison
 *   3. localStorage:    key "smoothScroll" = "lenis" | "native"  ← set by <DevScrollToggle/>
 * Default is "lenis".
 */

export type ScrollMode = 'native' | 'lenis';

// The slice of the Lenis instance API we actually use.
type LenisInstance = { raf: (t: number) => void; destroy: () => void };
type LenisModule = { default: new (opts?: unknown) => LenisInstance };

// Fallback only — used if the installed `lenis` package can't be imported for some reason.
const CDN_LENIS = 'https://cdn.jsdelivr.net/npm/lenis@1/+esm';

export function resolveScrollMode(propMode?: ScrollMode): ScrollMode {
  if (propMode) return propMode;
  if (typeof window === 'undefined') return 'lenis';
  const q = new URLSearchParams(window.location.search).get('scroll');
  if (q === 'lenis' || q === 'native') return q;
  try {
    const stored = window.localStorage.getItem('smoothScroll');
    if (stored === 'lenis' || stored === 'native') return stored;
  } catch {
    /* localStorage blocked — fall through */
  }
  return 'lenis';
}

// Load Lenis from the installed package; fall back to CDN if resolution ever fails.
async function loadLenis(): Promise<LenisModule> {
  try {
    return (await import('lenis')) as unknown as LenisModule;
  } catch {
    // @ts-ignore — runtime CDN ESM fallback
    return (await import(/* @vite-ignore */ CDN_LENIS)) as LenisModule;
  }
}

// Lenis's recommended base CSS, injected only when smooth scroll is active.
function injectLenisCss() {
  if (document.getElementById('lenis-css')) return;
  const style = document.createElement('style');
  style.id = 'lenis-css';
  style.textContent = [
    'html.lenis,html.lenis body{height:auto}',
    '.lenis.lenis-smooth{scroll-behavior:auto !important}',
    '.lenis.lenis-smooth [data-lenis-prevent]{overscroll-behavior:contain}',
    '.lenis.lenis-stopped{overflow:hidden}',
    '.lenis.lenis-smooth iframe{pointer-events:none}',
  ].join('');
  document.head.appendChild(style);
}

export function SmoothScroll({ mode }: { mode?: ScrollMode }) {
  useEffect(() => {
    if (resolveScrollMode(mode) !== 'lenis') return;

    // Respect reduced-motion: never force smoothing on users who opted out.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let lenis: LenisInstance | undefined;
    let rafId = 0;
    let cancelled = false;

    (async () => {
      try {
        const mod = await loadLenis();
        if (cancelled) return;
        const Lenis = mod.default;
        injectLenisCss();
        lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
        const raf = (time: number) => {
          lenis?.raf(time);
          rafId = requestAnimationFrame(raf);
        };
        rafId = requestAnimationFrame(raf);
      } catch (err) {
        // Fail safe: if the CDN is blocked, native scroll just stays in effect.
        console.warn('[SmoothScroll] Lenis failed to load; using native scroll.', err);
      }
    })();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      lenis?.destroy();
      document.getElementById('lenis-css')?.remove();
    };
  }, [mode]);

  return null;
}

export default SmoothScroll;
