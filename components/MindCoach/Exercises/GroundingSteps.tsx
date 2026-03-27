import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface GroundingStepsProps {
  instruction: string;
  stepNumber: number;
  totalSteps: number;
  timeLeft: number;
  /** Full duration of the current step (for the progress bar). */
  durationSeconds: number;
  /** Tighter layout for in-chat player */
  compact?: boolean;
}

export const GroundingSteps: React.FC<GroundingStepsProps> = ({
  instruction,
  stepNumber,
  totalSteps,
  timeLeft,
  durationSeconds,
  compact = false,
}) => {
  const total = Math.max(1, durationSeconds);
  return (
    <div
      className={`flex flex-col items-center justify-center w-full ${
        compact ? 'space-y-4 py-2' : 'space-y-10 py-4'
      }`}
    >
      {/* Step Counter */}
      <div className={`flex flex-col items-center ${compact ? 'gap-1' : 'gap-2'}`}>
        <div
          className={`rounded-3xl bg-white border-2 border-[#E8E4DE] flex items-center justify-center shadow-sm ${
            compact ? 'w-12 h-12' : 'w-16 h-16'
          }`}
        >
          <span
            className={`font-bold text-[#6B8F71] ${compact ? 'text-lg' : 'text-2xl'}`}
          >
            {stepNumber}
          </span>
        </div>
        <span
          className={`uppercase tracking-widest font-semibold text-[#2C2A26]/40 ${
            compact ? 'text-[10px]' : 'text-xs'
          }`}
        >
          Step {stepNumber} of {totalSteps}
        </span>
      </div>

      {/* Main Instruction */}
      <div
        className={`w-full bg-white border border-[#E8E4DE] shadow-sm flex flex-col items-center justify-center text-center ${
          compact
            ? 'rounded-2xl p-4 min-h-[120px] space-y-3'
            : 'rounded-[2.5rem] p-8 min-h-[220px] space-y-6'
        }`}
      >
        <AnimatePresence mode="wait">
          <motion.p
            key={instruction}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className={`font-serif text-[#2C2A26] leading-relaxed ${
              compact ? 'text-base sm:text-lg' : 'text-2xl'
            }`}
          >
            {instruction}
          </motion.p>
        </AnimatePresence>

        {/* Local step timer */}
        <div className={`flex flex-col items-center gap-1 ${compact ? 'pt-1' : 'pt-4'}`}>
          <div className="w-32 h-1.5 bg-[#E8E4DE] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#D4A574]"
              initial={false}
              animate={{ width: `${Math.min(100, Math.max(0, (timeLeft / total) * 100))}%` }}
            />
          </div>
          <span className="text-[10px] uppercase tracking-widest font-bold text-[#D4A574]/60 tabular-nums">
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')} remaining
          </span>
        </div>
      </div>

      {/* Progress Dots */}
      <div className="flex gap-2">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i + 1 === stepNumber ? 'w-6 bg-[#6B8F71]' : 'w-1.5 bg-[#E8E4DE]'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
