import { useEffect, useState } from 'react';
import { resolveScrollMode, type ScrollMode } from './SmoothScroll';

/**
 * DevScrollToggle — a tiny fixed control to flip native ↔ Lenis and feel the difference.
 *
 * Writes the choice to localStorage and reloads so Lenis mounts/unmounts cleanly.
 * Intended for local A/B testing; gate it out of production, e.g.:
 *   {import.meta.env.DEV && <DevScrollToggle />}
 *
 * Prefer a fully isolated comparison? Just open two tabs:
 *   /?scroll=native   vs   /?scroll=lenis
 */
export function DevScrollToggle() {
  const [mode, setMode] = useState<ScrollMode>('native');

  useEffect(() => {
    setMode(resolveScrollMode());
  }, []);

  const set = (next: ScrollMode) => {
    try {
      window.localStorage.setItem('smoothScroll', next);
    } catch {
      /* ignore */
    }
    // Drop any ?scroll= override so localStorage wins, then reload to re-init scroll.
    const url = new URL(window.location.href);
    url.searchParams.delete('scroll');
    window.location.replace(url.toString());
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-1 rounded-full border border-border bg-white/90 p-1 text-xs font-medium shadow-lg backdrop-blur">
      <span className="px-2 text-muted-foreground">Scroll</span>
      {(['native', 'lenis'] as ScrollMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => set(m)}
          className={
            'rounded-full px-3 py-1 capitalize transition-colors ' +
            (mode === m
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground hover:bg-secondary')
          }
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export default DevScrollToggle;
