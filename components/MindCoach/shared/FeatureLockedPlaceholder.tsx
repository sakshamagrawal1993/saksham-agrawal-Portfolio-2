import React from 'react';
import { Lock } from 'lucide-react';

interface FeatureLockedPlaceholderProps {
  title: string;
  /** e.g. "Complete more sessions in your current phase" */
  description: string;
  /** Shown as "Unlocks in phase 2" */
  unlockPhase: number;
}

export const FeatureLockedPlaceholder: React.FC<FeatureLockedPlaceholderProps> = ({
  title,
  description,
  unlockPhase,
}) => (
  <div className="flex flex-col items-center justify-center text-center px-6 py-16 min-h-[280px]">
    <div className="w-14 h-14 rounded-full bg-[#F5F0EB] flex items-center justify-center mb-4">
      <Lock size={24} className="text-[#2C2A26]/30" />
    </div>
    <p className="text-sm font-semibold text-[#2C2A26] mb-1">{title}</p>
    <p className="text-xs text-[#2C2A26]/50 leading-relaxed max-w-[260px] mb-3">{description}</p>
    <span className="text-[10px] uppercase tracking-widest font-bold text-[#6B8F71] bg-[#6B8F71]/10 px-3 py-1 rounded-full">
      Unlocks in phase {unlockPhase}
    </span>
  </div>
);
