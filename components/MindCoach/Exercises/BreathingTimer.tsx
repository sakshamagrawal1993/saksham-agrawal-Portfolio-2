import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BreathingStep {
  instruction: string;
  duration: number;
}

interface BreathingTimerProps {
  steps: BreathingStep[];
  onComplete: () => void;
}

function getScaleForInstruction(instruction: string): number {
  const lower = instruction.toLowerCase();
  if (lower.includes('inhale') || lower.includes('breathe in')) return 1.5;
  if (lower.includes('hold')) return 1.5;
  return 1;
}

export const BreathingTimer: React.FC<BreathingTimerProps> = ({ steps, onComplete }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(steps[0]?.duration ?? 0);

  const currentStep = steps[stepIndex];
  const targetScale = currentStep ? getScaleForInstruction(currentStep.instruction) : 1;

  const advance = useCallback(() => {
    if (stepIndex < steps.length - 1) {
      const next = stepIndex + 1;
      setStepIndex(next);
      setSecondsLeft(steps[next].duration);
    } else {
      onComplete();
    }
  }, [stepIndex, steps, onComplete]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      advance();
      return;
    }
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [secondsLeft, advance]);

  const totalDuration = steps.reduce((acc, s) => acc + s.duration, 0);
  const elapsedBefore = steps.slice(0, stepIndex).reduce((acc, s) => acc + s.duration, 0);
  const elapsed = elapsedBefore + (currentStep ? currentStep.duration - secondsLeft : 0);
  const progress = totalDuration > 0 ? elapsed / totalDuration : 0;

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6">
      <div className="relative flex items-center justify-center w-52 h-52 mb-8">
        <motion.div
          animate={{ scale: targetScale }}
          transition={{ duration: currentStep?.duration ?? 2, ease: 'easeInOut' }}
          className="absolute w-40 h-40 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(107,143,113,0.25) 0%, rgba(107,143,113,0.08) 70%, transparent 100%)',
          }}
        />
        <motion.div
          animate={{ scale: targetScale }}
          transition={{ duration: currentStep?.duration ?? 2, ease: 'easeInOut' }}
          className="absolute w-28 h-28 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(107,143,113,0.4) 0%, rgba(107,143,113,0.15) 100%)',
          }}
        />
        <motion.div
          animate={{ scale: targetScale }}
          transition={{ duration: currentStep?.duration ?? 2, ease: 'easeInOut' }}
          className="absolute w-16 h-16 rounded-full bg-[#6B8F71]/30"
        />
        <span className="relative z-10 text-2xl font-semibold text-[#6B8F71]">
          {secondsLeft}
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={stepIndex}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="text-base font-medium text-[#2C2A26] text-center mb-6"
        >
          {currentStep?.instruction}
        </motion.p>
      </AnimatePresence>

      <div className="w-full max-w-[200px] h-1.5 bg-[#E8E4DE] rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-[#6B8F71] rounded-full"
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <p className="text-[10px] text-[#2C2A26]/40 mt-1.5">
        Step {stepIndex + 1} of {steps.length}
      </p>
    </div>
  );
};
