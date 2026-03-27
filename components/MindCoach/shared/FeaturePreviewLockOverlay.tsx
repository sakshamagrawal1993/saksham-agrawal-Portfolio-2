import React from 'react';
import { Lock } from 'lucide-react';

interface FeaturePreviewLockOverlayProps {
  unlockPhase: number;
  /** Short line under the lock badge */
  hint?: string;
  /** Optional uppercase label above the title */
  featureLabel?: string;
  children: React.ReactNode;
}

/**
 * Shows real UI underneath (dimmed, non-interactive) with a frosted overlay and lock messaging
 * so users can preview what unlocks in a later phase.
 */
export const FeaturePreviewLockOverlay: React.FC<FeaturePreviewLockOverlayProps> = ({
  unlockPhase,
  hint = 'Finish sessions in your current phase to unlock full access.',
  featureLabel,
  children,
}) => (
  <div className="relative flex flex-1 flex-col min-h-0 w-full overflow-hidden">
    <div className="flex-1 min-h-0 overflow-y-auto relative">
      <div className="pointer-events-none select-none opacity-[0.88]">{children}</div>
      <div
        className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4 py-10 bg-gradient-to-b from-[#FAFAF7]/25 via-white/60 to-[#FAFAF7]/72 backdrop-blur-[2px]"
        aria-hidden="false"
      >
        <div
          className="rounded-2xl bg-white/95 border border-[#E8E4DE] shadow-[0_12px_40px_rgba(44,42,38,0.1)] px-5 py-5 text-center max-w-[min(100%,288px)]"
          role="status"
        >
          <div className="w-12 h-12 rounded-full bg-[#6B8F71]/10 flex items-center justify-center mx-auto mb-3">
            <Lock size={22} className="text-[#6B8F71]" />
          </div>
          {featureLabel ? (
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#2C2A26]/40 mb-2">{featureLabel}</p>
          ) : null}
          <p className="text-sm font-semibold text-[#2C2A26] mb-1.5">Unlocks in phase {unlockPhase}</p>
          <p className="text-xs text-[#2C2A26]/55 leading-relaxed">{hint}</p>
        </div>
      </div>
    </div>
  </div>
);
