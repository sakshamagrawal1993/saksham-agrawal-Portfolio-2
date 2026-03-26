import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface GroundingStepsProps {
  instruction: string;
  stepNumber: number;
  totalSteps: number;
  timeLeft: number;
}

export const GroundingSteps: React.FC<GroundingStepsProps> = ({ instruction, stepNumber, totalSteps, timeLeft }) => {
  return (
    <div className="flex flex-col items-center justify-center space-y-10 py-4 w-full">
      {/* Step Counter */}
      <div className="flex flex-col items-center gap-2">
        <div className="w-16 h-16 rounded-3xl bg-white border-2 border-[#E8E4DE] flex items-center justify-center shadow-sm">
          <span className="text-2xl font-bold text-[#6B8F71]">{stepNumber}</span>
        </div>
        <span className="text-xs uppercase tracking-widest font-semibold text-[#2C2A26]/40">
          Step {stepNumber} of {totalSteps}
        </span>
      </div>

      {/* Main Instruction */}
      <div className="w-full bg-white rounded-[2.5rem] p-8 border border-[#E8E4DE] shadow-sm min-h-[220px] flex flex-col items-center justify-center text-center space-y-6">
        <AnimatePresence mode="wait">
          <motion.p
            key={instruction}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="text-2xl font-serif text-[#2C2A26] leading-relaxed"
          >
            {instruction}
          </motion.p>
        </AnimatePresence>

        {/* Local step timer */}
        <div className="pt-4 flex flex-col items-center gap-1">
          <div className="w-32 h-1.5 bg-[#E8E4DE] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#D4A574]"
              initial={false}
              animate={{ width: `${(timeLeft / 60) * 100}%` }} // Normalizing to 1min for visual feel if duration varies
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
