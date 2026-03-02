import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Exercise } from '../../../store/mindCoachStore';
import { BreathingTimer } from './BreathingTimer';

const FEEDBACK_EMOJIS = ['😢', '😕', '😐', '🙂', '😊'] as const;

interface ExercisePlayerProps {
  exercise: Exercise;
  onBack: () => void;
}

export const ExercisePlayer: React.FC<ExercisePlayerProps> = ({ exercise, onBack }) => {
  const [phase, setPhase] = useState<'playing' | 'complete'>('playing');
  const [stepIndex, setStepIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(exercise.steps[0]?.duration ?? 0);
  const [feedback, setFeedback] = useState<string | null>(null);

  const isBreathing = exercise.type === 'breathing';
  const steps = exercise.steps;
  const currentStep = steps[stepIndex];

  const handleComplete = useCallback(() => setPhase('complete'), []);

  const advance = useCallback(() => {
    if (stepIndex < steps.length - 1) {
      const next = stepIndex + 1;
      setStepIndex(next);
      setSecondsLeft(steps[next].duration);
    } else {
      handleComplete();
    }
  }, [stepIndex, steps, handleComplete]);

  useEffect(() => {
    if (isBreathing || phase !== 'playing') return;
    if (secondsLeft <= 0) {
      advance();
      return;
    }
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [secondsLeft, advance, isBreathing, phase]);

  const totalDuration = steps.reduce((acc, s) => acc + s.duration, 0);
  const elapsedBefore = steps.slice(0, stepIndex).reduce((acc, s) => acc + s.duration, 0);
  const elapsed = elapsedBefore + (currentStep ? currentStep.duration - secondsLeft : 0);
  const progress = totalDuration > 0 ? elapsed / totalDuration : 0;

  if (phase === 'complete') {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-16 h-16 rounded-full bg-[#6B8F71]/15 flex items-center justify-center mb-4"
        >
          <span className="text-3xl">✓</span>
        </motion.div>
        <h3 className="text-lg font-semibold text-[#2C2A26] mb-1">Session Complete</h3>
        <p className="text-sm text-[#2C2A26]/50 mb-6">How do you feel?</p>
        <div className="flex gap-4 mb-8">
          {FEEDBACK_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setFeedback(e)}
              className={`text-2xl transition-transform ${
                feedback === e ? 'scale-125' : 'opacity-50 hover:opacity-80'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        <button
          onClick={onBack}
          className="px-5 py-2.5 text-sm font-medium rounded-full bg-[#6B8F71] text-white"
        >
          Back to Library
        </button>
      </div>
    );
  }

  if (isBreathing) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8E4DE]">
          <button onClick={onBack} className="text-[#2C2A26]/60 hover:text-[#2C2A26]">
            <ArrowLeft size={20} />
          </button>
          <h3 className="text-sm font-semibold text-[#2C2A26] truncate">{exercise.title}</h3>
        </div>
        <BreathingTimer steps={steps} onComplete={handleComplete} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8E4DE]">
        <button onClick={onBack} className="text-[#2C2A26]/60 hover:text-[#2C2A26]">
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-sm font-semibold text-[#2C2A26] truncate flex-1">
          {exercise.title}
        </h3>
        <span className="text-xs text-[#2C2A26]/40">{secondsLeft}s</span>
      </div>

      <div className="w-full h-1 bg-[#E8E4DE]">
        <motion.div
          className="h-full bg-[#6B8F71]"
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-xs text-[#2C2A26]/40 mb-2">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <AnimatePresence mode="wait">
          <motion.p
            key={stepIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-base font-medium text-[#2C2A26] leading-relaxed"
          >
            {currentStep?.instruction}
          </motion.p>
        </AnimatePresence>
      </div>

      {exercise.description && (
        <div className="px-6 pb-6">
          <p className="text-xs text-[#2C2A26]/40 text-center">{exercise.description}</p>
        </div>
      )}
    </div>
  );
};
