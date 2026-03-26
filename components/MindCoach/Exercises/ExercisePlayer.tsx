import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, RotateCcw, ChevronRight, CheckCircle2 } from 'lucide-react';
import { BreathingGuide } from './BreathingGuide.tsx';
import { GroundingSteps } from './GroundingSteps.tsx';
import { type Exercise } from '../../../store/mindCoachStore';

interface ExercisePlayerProps {
  exercise: Exercise;
  onClose: () => void;
  onComplete?: () => void;
}

export const ExercisePlayer: React.FC<ExercisePlayerProps> = ({ exercise, onClose, onComplete }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const steps = exercise.steps || [];
  const currentStep = steps[currentStepIndex];

  // Initialize time for first step
  useEffect(() => {
    if (currentStep) {
      setTimeLeft(currentStep.duration);
    }
  }, [currentStepIndex, steps]);

  // Timer logic
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying && timeLeft > 0 && !isFinished) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isPlaying && !isFinished) {
      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex((prev) => prev + 1);
      } else {
        setIsFinished(true);
        setIsPlaying(false);
        onComplete?.();
      }
    }
    return () => clearInterval(timer);
  }, [isPlaying, timeLeft, currentStepIndex, steps.length, isFinished, onComplete]);

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
    setTimeLeft(steps[0]?.duration || 0);
    setIsFinished(false);
  };

  const renderGuide = () => {
    if (exercise.type === 'breathing') {
      return (
        <BreathingGuide
          instruction={currentStep?.instruction}
          duration={currentStep?.duration}
          timeLeft={timeLeft}
          phase={currentStep?.instruction.toLowerCase().includes('in') ? 'inhale' : 
                 currentStep?.instruction.toLowerCase().includes('out') ? 'exhale' : 'hold'}
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg bg-[#FAFAF7] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col min-h-[500px]"
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-[#2C2A26]">{exercise.title}</h3>
            <p className="text-xs text-[#2C2A26]/40 uppercase tracking-widest font-medium">
              {isFinished ? 'Exercise Complete' : `${exercise.type} • ${Math.ceil(exercise.duration_seconds / 60)} min`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white border border-[#E8E4DE] flex items-center justify-center text-[#2C2A26]/40 hover:text-[#2C2A26] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <AnimatePresence mode="wait">
            {isFinished ? (
              <motion.div
                key="finished"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-6"
              >
                <div className="w-20 h-20 rounded-full bg-[#6B8F71]/10 flex items-center justify-center mx-auto text-[#6B8F71]">
                  <CheckCircle2 size={40} />
                </div>
                <div className="space-y-2">
                  <h4 className="text-2xl font-serif text-[#2C2A26]">Well done</h4>
                  <p className="text-[#2C2A26]/60 max-w-[240px]">Take a moment to notice how you feel now.</p>
                </div>
                <button
                  onClick={onClose}
                  className="px-8 py-3 bg-[#2C2A26] text-white rounded-2xl font-medium hover:bg-[#2C2A26]/90 transition-all"
                >
                  Close
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="active"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full"
              >
                {renderGuide()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls */}
        {!isFinished && (
          <div className="px-8 pb-10 pt-4 flex items-center justify-center gap-6">
            <button
              onClick={handleReset}
              className="w-12 h-12 rounded-full border border-[#E8E4DE] flex items-center justify-center text-[#2C2A26]/40 hover:text-[#2C2A26] transition-colors"
              title="Restart"
            >
              <RotateCcw size={20} />
            </button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-20 h-20 rounded-full bg-[#6B8F71] text-white flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
              {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
            </button>

            <button
              onClick={() => {
                if (currentStepIndex < steps.length - 1) {
                  setCurrentStepIndex((prev) => prev + 1);
                } else {
                  setIsFinished(true);
                }
              }}
              className="w-12 h-12 rounded-full border border-[#E8E4DE] flex items-center justify-center text-[#2C2A26]/40 hover:text-[#2C2A26] transition-colors"
              title="Next Step"
            >
              <ChevronRight size={24} />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
