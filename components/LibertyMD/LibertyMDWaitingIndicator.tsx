/**
 * P1-07 · Presentational wait chrome: typing vs diagnosis reviewing.
 * LibertyMD tokens only; one visual contract for Chat (+ App residual typing).
 */
import { Brain, Loader2, MessageCircle } from 'lucide-react'
import type { WaitMode } from './libertymd-waiting'

const TYPING_STAGES = ['Understanding', 'Mulling', 'Correlating', 'Typing'] as const
const STAGE_MS = 500

export type LibertyMDWaitingIndicatorProps = {
  mode: WaitMode
  /** Reviewing copy from i18n (diagnosis-distinct). */
  reviewingLabel: string
  /** Optional typing label override; defaults to cycling stage labels. */
  typingLabel?: string
  stageIndex?: number
  className?: string
}

export function LibertyMDWaitingIndicator({
  mode,
  reviewingLabel,
  typingLabel,
  stageIndex = 0,
  className = '',
}: LibertyMDWaitingIndicatorProps) {
  const isReviewing = mode === 'reviewing'
  const label = isReviewing
    ? reviewingLabel
    : (typingLabel || `${TYPING_STAGES[Math.min(stageIndex, TYPING_STAGES.length - 1)].toLowerCase()}...`)

  return (
    <div
      data-libertymd-waiting-indicator
      data-wait-mode={mode}
      className={`flex min-w-[10rem] items-center gap-[var(--libertymd-space-sm,10px)] rounded-2xl rounded-bl-sm border border-libertymd-slate-200 bg-white px-4 py-3 text-sm text-libertymd-slate-500 shadow-sm ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">
        {isReviewing ? reviewingLabel : 'Preparing a response.'}
      </span>
      <span aria-hidden="true" className="contents">
        {isReviewing ? <ReviewingIcon /> : <TypingStageIcon stageIndex={stageIndex} />}
        <span className="min-w-[5.75rem] text-left transition-opacity duration-150">
          {label}
        </span>
      </span>
    </div>
  )
}

/** App residual: shared typing chrome without diagnosis reviewing. */
export function LibertyMDTypingWaitRow({
  label,
  className = '',
}: {
  label: string
  className?: string
}) {
  return (
    <div
      data-libertymd-waiting-indicator
      data-wait-mode="typing"
      className={`flex items-center gap-2 text-sm text-libertymd-slate-500 ${className}`}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-4 w-4 animate-spin text-libertymd-blue-600 [animation-duration:500ms] motion-reduce:animate-none" />
      <span>{label}</span>
    </div>
  )
}

function ReviewingIcon() {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
      <Brain
        className="h-[18px] w-[18px] animate-pulse text-libertymd-blue-600 [animation-duration:700ms] motion-reduce:animate-none"
        strokeWidth={1.8}
      />
    </span>
  )
}

function TypingStageIcon({ stageIndex }: { stageIndex: number }) {
  if (stageIndex === 0) {
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
        <Loader2 className="h-[18px] w-[18px] animate-spin text-libertymd-blue-600 [animation-duration:500ms] motion-reduce:animate-none" />
      </span>
    )
  }

  if (stageIndex === 1) {
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
        <Brain
          className="h-[18px] w-[18px] animate-pulse text-libertymd-blue-600 [animation-duration:500ms] motion-reduce:animate-none"
          strokeWidth={1.8}
        />
      </span>
    )
  }

  if (stageIndex === 2) {
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-[18px] w-[18px] overflow-visible text-libertymd-blue-600"
          fill="none"
        >
          <g className="animate-pulse motion-reduce:animate-none" style={{ animationDuration: `${STAGE_MS}ms` }}>
            {[
              [10, 2.2],
              [16.8, 6.1],
              [16.8, 13.9],
              [10, 17.8],
              [3.2, 13.9],
              [3.2, 6.1],
            ].map(([x, y], index) => (
              <g key={`${x}-${y}`}>
                <line
                  x1="10"
                  y1="10"
                  x2={x}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="1.15"
                  strokeLinecap="round"
                  opacity={0.35 + index * 0.09}
                />
                <circle cx={x} cy={y} r="1.25" fill="currentColor" opacity={0.55 + index * 0.07} />
              </g>
            ))}
            <circle cx="10" cy="10" r="2.15" fill="currentColor" />
            <circle cx="10" cy="10" r="3.6" stroke="currentColor" strokeWidth="0.9" opacity="0.28" />
          </g>
        </svg>
      </span>
    )
  }

  return (
    <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
      <MessageCircle className="h-[18px] w-[18px] text-libertymd-blue-600" strokeWidth={1.8} />
      <span className="absolute left-[5px] top-[8px] flex gap-[1.5px]">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-[2px] w-[2px] animate-bounce rounded-full bg-libertymd-blue-600 [animation-duration:500ms] motion-reduce:animate-none"
            style={{ animationDelay: `${index * 70}ms` }}
          />
        ))}
      </span>
    </span>
  )
}

export const WAITING_TYPING_STAGE_COUNT = TYPING_STAGES.length
export const WAITING_STAGE_MS = STAGE_MS
