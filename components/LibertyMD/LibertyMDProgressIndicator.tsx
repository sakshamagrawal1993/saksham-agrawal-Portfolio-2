/**
 * P1-06 · Presentational interview progress indicator.
 * Text-first + slim determinate track from high-water slot ratio.
 * LibertyMD tokens only; compact; does not own emergency / continuation chrome.
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
      className={`flex w-full max-w-sm flex-col items-center gap-[var(--libertymd-space-xs,4px)] text-center ${className}`}
    >
      <p className="text-xs font-semibold text-libertymd-slate-500">
        {view.label}
      </p>
      <div
        className="h-1 w-full max-w-[12rem] overflow-hidden rounded-full bg-libertymd-slate-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={view.label}
      >
        <div
          className="h-full rounded-full bg-libertymd-blue-600 transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] font-medium leading-4 text-libertymd-slate-500">
        {view.ceiling}
      </p>
    </div>
  )
}

function clampDisplayRatio(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}
