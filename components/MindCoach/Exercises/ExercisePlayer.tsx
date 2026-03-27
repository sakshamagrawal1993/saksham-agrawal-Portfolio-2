import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, RotateCcw, ChevronRight, CheckCircle2 } from 'lucide-react';
import { BreathingGuide } from './BreathingGuide.tsx';
import { GroundingSteps } from './GroundingSteps.tsx';
import { type Exercise } from '../../../store/mindCoachStore';

const EMPTY_STEPS: Exercise['steps'] = [];

interface ExercisePlayerShellProps {
  isInline: boolean;
  containerClassName: string;
  children: React.ReactNode;
}

function ExercisePlayerShell({ isInline, containerClassName, children }: ExercisePlayerShellProps) {
  if (isInline) {
    return <div className={containerClassName}>{children}</div>;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={containerClassName}
      >
        {children}
      </motion.div>
    </div>
  );
}

interface ExercisePlayerProps {
  exercise: Exercise;
  onClose: () => void;
  onComplete?: () => void;
  isInline?: boolean;
}

export const ExercisePlayer: React.FC<ExercisePlayerProps> = ({ exercise, onClose, onComplete, isInline = false }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const steps = exercise.steps?.length ? exercise.steps : EMPTY_STEPS;
  const currentStep = steps[currentStepIndex];

  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Initialize time for first step
  useEffect(() => {
    if (currentStep && !isPlaying) {
      setTimeLeft(currentStep.duration);
    }
  }, [currentStepIndex, steps.length]);

  // Robust Timer logic
  useEffect(() => {
    if (isPlaying && !isFinished) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            // Step complete - handle in next tick or here? 
            // Better to handle in a separate effect or by checking prev
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, isFinished]);

  // Handle phase transitions when timeLeft hits 0
  useEffect(() => {
    if (timeLeft === 0 && isPlaying && !isFinished) {
      if (currentStepIndex < steps.length - 1) {
        const nextIndex = currentStepIndex + 1;
        setCurrentStepIndex(nextIndex);
        setTimeLeft(steps[nextIndex].duration);
      } else {
        // LOOP: Restart from first step
        setCurrentStepIndex(0);
        setTimeLeft(steps[0].duration);
      }
    }
  }, [timeLeft, isPlaying, isFinished, currentStepIndex, exercise.id, steps.length]);

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
    setTimeLeft(steps[0]?.duration || 0);
    setIsFinished(false);
  };

  const handleEndExercise = () => {
    setIsFinished(true);
    setIsPlaying(false);
    onComplete?.();
  };

  const renderGuide = () => {
    const isBreathing = exercise.type === 'breathing' || 
                       exercise.title.toLowerCase().includes('breathing') ||
                       steps.some(s => s.instruction.toLowerCase().includes('breathe'));

    if (isBreathing) {
      return (
        <BreathingGuide
          instruction={currentStep?.instruction}
          duration={currentStep?.duration}
          timeLeft={timeLeft}
          phase={currentStep?.instruction.toLowerCase().includes('in') ? 'inhale' : 
                 currentStep?.instruction.toLowerCase().includes('out') ? 'exhale' : 'hold'}
          isPlaying={isPlaying}
        />
      );
    }
    
    if (exercise.type === 'grounding' || exercise.type === 'meditation') {
      return (
        <GroundingSteps
          instruction={currentStep?.instruction}
          stepNumber={currentStepIndex + 1}
          totalSteps={steps.length}
          timeLeft={timeLeft}
        />
      );
    }

    return (
      <div className="text-center p-8">
        <p className="text-[#2C2A26]/60">{currentStep?.instruction}</p>
        <p className="text-4xl font-serif text-[#2C2A26] mt-4 tabular-nums">{timeLeft}s</p>
      </div>
    );
  };

  const containerClasses = isInline
    ? "w-full bg-[#FAFAF7] rounded-3xl border border-[#E8E4DE] overflow-hidden flex flex-col min-h-[400px]"
    : "relative w-full max-w-lg bg-[#FAFAF7] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col min-h-[500px]";

  return (
    <ExercisePlayerShell isInline={isInline} containerClassName={containerClasses}>
        {/* Header */}
        <div className={`px-6 pt-6 pb-2 flex items-center justify-between ${isInline ? 'bg-white/50 backdrop-blur-sm sticky top-0 z-20' : ''}`}>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-[#2C2A26]">{exercise.title}</h3>
            <p className="text-[10px] text-[#6B8F71] uppercase tracking-widest font-bold">
              {isFinished ? 'Session Complete' : `${exercise.type} • Looping`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white border border-[#E8E4DE] flex items-center justify-center text-[#2C2A26]/40 hover:text-[#2C2A26] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <AnimatePresence mode="wait">
            {isFinished ? (
              <motion.div
                key="finished"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-4 py-8"
              >
                <div className="w-16 h-16 rounded-full bg-[#6B8F71]/10 flex items-center justify-center mx-auto text-[#6B8F71]">
                  <CheckCircle2 size={32} />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xl font-serif text-[#2C2A26]">Well done</h4>
                  <p className="text-xs text-[#2C2A26]/60 max-w-[200px] mx-auto">Take a moment to notice how you feel now.</p>
                </div>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-[#2C2A26] text-white rounded-xl text-sm font-medium hover:bg-[#2C2A26]/90 transition-all"
                >
                  Return to Chat
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="active"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full flex items-center justify-center"
              >
                {renderGuide()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls */}
        {!isFinished && (
          <div className="px-6 pb-6 pt-2 flex flex-col gap-4 items-center">
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={handleReset}
                className="w-10 h-10 rounded-full border border-[#E8E4DE] flex items-center justify-center text-[#2C2A26]/40 hover:text-[#2C2A26] transition-colors"
                title="Restart"
              >
                <RotateCcw size={18} />
              </button>

              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-16 h-16 rounded-full bg-[#6B8F71] text-white flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all"
              >
                {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
              </button>

              <button
                onClick={() => {
                  if (currentStepIndex < steps.length - 1) {
                    setCurrentStepIndex((prev) => prev + 1);
                  } else {
                    setCurrentStepIndex(0);
                  }
                }}
                className="w-10 h-10 rounded-full border border-[#E8E4DE] flex items-center justify-center text-[#2C2A26]/40 hover:text-[#2C2A26] transition-colors"
                title="Next Step"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            
            <button
              onClick={handleEndExercise}
              className="text-xs font-semibold text-[#2C2A26]/40 hover:text-red-500 transition-colors uppercase tracking-widest pb-2"
            >
              End Exercise
            </button>
          </div>
        )}
    </ExercisePlayerShell>
  );
};
