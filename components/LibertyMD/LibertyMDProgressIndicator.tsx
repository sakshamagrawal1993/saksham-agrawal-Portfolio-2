/**
 * P1-06 · Presentational interview progress indicator.
 *
 * BO 2026-08-01 — reduced to a bare determinate line under the header. The
 * qualitative stage label ("Wrapping up") and the ceiling copy ("Up to 15
 * questions") are no longer rendered: naming a stage invited the reader to
 * estimate how much was left, and the ceiling read as a threat rather than a
 * reassurance. The label survives as the accessible name so screen-reader users
 * still get orientation, and the hedged ceiling is still computed upstream.
 *
 * LibertyMD tokens only; does not own emergency / continuation chrome.
 */
import type { ProgressView } from './libertymd-progress'

export type LibertyMDProgressIndicatorProps = {
  view: ProgressView
  className?: string
}

export function LibertyMDProgressIndicator({
  view,
  className = '',
}: LibertyMDProgressIndicatorProps) {
  const pct = Math.round(clampDisplayRatio(view.ratio) * 100)

  return (
    <div
      data-libertymd-progress-indicator
      className={`w-full ${className}`}
    >
      <div
        className="h-1 w-full overflow-hidden bg-libertymd-slate-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={view.label}
      >
        <div
          className="h-full bg-libertymd-blue-600 transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function clampDisplayRatio(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}
