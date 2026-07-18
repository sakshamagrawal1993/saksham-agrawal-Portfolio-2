import { useMemo } from 'react';
import type { CSSProperties } from 'react';

/**
 * GrainOverlay — a subtle film-grain layer for a premium, tactile background.
 *
 * Uses an inline SVG feTurbulence noise (no image asset, scalable, GPU-cheap) as a
 * fixed, full-viewport, pointer-events-none layer. Desaturated to pure grayscale and
 * blended over the UI at very low opacity, so it adds texture without touching contrast.
 *
 * Mounted globally it grains the whole site; drop it inside a single surface (e.g.
 * LibertyMDApp) to scope it there instead. Tune with the props below.
 *
 * @example  <GrainOverlay />                        // subtle, site-wide
 * @example  <GrainOverlay opacity={0.07} blendMode="overlay" />   // stronger, punchier
 */

type GrainOverlayProps = {
  /** Layer opacity, 0–1. Keep it low; 0.03–0.06 reads as texture, higher reads as noise. */
  opacity?: number;
  /** How the grain blends with what's beneath it. 'soft-light' is the subtlest/premium default. */
  blendMode?: 'soft-light' | 'overlay' | 'multiply' | 'normal';
  /** Noise density. Higher = finer grain, lower = coarser. 0.6–0.9 looks filmic. */
  baseFrequency?: number;
  /** Stacking order. Sits above content but below modals/toasts by default. */
  zIndex?: number;
  /** Extra classes for the wrapper (rarely needed). */
  className?: string;
};

export function GrainOverlay({
  opacity = 0.015,
  blendMode = 'soft-light',
  baseFrequency = 0.9,
  zIndex = 30,
  className = '',
}: GrainOverlayProps) {
  const backgroundImage = useMemo(() => {
    // Grayscale fractal noise tile. #grain is encoded by encodeURIComponent below.
    const svg =
      "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>" +
      "<filter id='grain'>" +
      `<feTurbulence type='fractalNoise' baseFrequency='${baseFrequency}' numOctaves='2' stitchTiles='stitch'/>` +
      "<feColorMatrix type='saturate' values='0'/>" +
      '</filter>' +
      "<rect width='100%' height='100%' filter='url(#grain)'/>" +
      '</svg>';
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }, [baseFrequency]);

  const style: CSSProperties = {
    backgroundImage,
    backgroundRepeat: 'repeat',
    opacity,
    mixBlendMode: blendMode,
    zIndex,
  };

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 ${className}`.trim()}
      style={style}
    />
  );
}

export default GrainOverlay;
