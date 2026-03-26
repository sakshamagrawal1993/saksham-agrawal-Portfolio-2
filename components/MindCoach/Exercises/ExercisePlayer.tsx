import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, RotateCcw, CheckCircle2, ArrowRight } from 'lucide-react';
import { type Exercise } from '../../../store/mindCoachStore';
import { BreathingGuide } from './BreathingGuide';
import { GroundingSteps } from './GroundingSteps';

interface ExercisePlayerProps {
  exercise: Exercise;
  onClose: () => void;
}

export const ExercisePlayer: React.FC<ExercisePlayerProps> = ({ exercise, onClose }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(exercise.steps[0]?.duration || 0);
  const [isCompleted, setIsCompleted] = useState(false);

  const currentStep = exercise.steps[currentStepIndex];

  const handleNext = useCallback(() => {
    if (currentStepIndex < exercise.steps.length - 1) {
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);
      setTimeLeft(exercise.steps[nextIndex].duration);
    } else {
      setIsActive(false);
      setIsCompleted(true);
    }
  }, [currentStepIndex, exercise.steps]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isActive && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      handleNext();
    }
    return () => clearInterval(timer);
  }, [isActive, timeLeft, handleNext]);

  const handleReset = () => {
    setCurrentStepIndex(0);
    setTimeLeft(exercise.steps[0]?.duration || 0);
    setIsActive(false);
    setIsCompleted(false);
  };

  return (
    <div className="flex flex-col h-full bg-white relative overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-[#F5F0EB]">
        <div>
          <span className="text-[10px] font-bold text-[#6B8F71] uppercase tracking-[0.1em] mb-1 block">
            {exercise.type} · {exercise.category}
          </span>
          <h2 className="text-xl font-bold text-[#2C2A26]">{exercise.title}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-[#F5F0EB] text-[#2C2A26]/40 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {!isCompleted ? (
            <motion.div
              key="active"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full flex flex-col items-center space-y-10"
            >
              {/* Specialized Content */}
              <div className="w-full max-w-[280px] aspect-square flex items-center justify-center relative">
                {exercise.type === 'breathing' ? (
                  <BreathingGuide 
                    isActive={isActive} 
                    instruction={currentStep?.instruction} 
                    duration={currentStep?.duration}
                    timeLeft={timeLeft}
                  />
                ) : (
                  <GroundingSteps 
                    step={currentStep} 
                    index={currentStepIndex} 
                    total={exercise.steps.length} 
                  />
                )}
              </div>

              {/* Progress Detail */}
              <div className="text-center space-y-2">
                <p className="text-lg font-medium text-[#2C2A26] px-4">
                  {currentStep?.instruction}
                </p>
                <div className="flex items-center justify-center gap-2 text-[#2C2A26]/40 font-mono text-sm">
                  <span>{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
                  <span>·</span>
                  <span>Step {currentStepIndex + 1} of {exercise.steps.length}</span>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="completed"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6"
            >
              <div className="w-20 h-20 bg-[#6B8F71]/10 rounded-full flex items-center justify-center mx-auto text-[#6B8F71]">
                <CheckCircle2 size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-[#2C2A26]">Well done!</h3>
                <p className="text-[#2C2A26]/60 leading-relaxed max-w-[240px] mx-auto">
                  Take a moment to notice how you feel now compared to when you started.
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-8 py-3 bg-[#6B8F71] text-white font-semibold rounded-2xl hover:bg-[#5A7D60] transition-colors"
              >
                Return to Chat
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      {!isCompleted && (
        <div className="px-6 py-8 border-t border-[#F5F0EB] bg-[#FAFAF8]/50 flex items-center justify-between">
          <button
            onClick={handleReset}
            className="flex flex-col items-center gap-1 text-[#2C2A26]/30 hover:text-[#2C2A26]/60 transition-colors"
          >
            <RotateCcw size={20} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Reset</span>
          </button>

          <button
            onClick={() => setIsActive(!isActive)}
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${
              isActive 
                ? 'bg-[#2C2A26] text-white shadow-[#2C2A26]/20' 
                : 'bg-[#6B8F71] text-white shadow-[#6B8F71]/20'
            }`}
          >
            {isActive ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
          </button>

          <button
            onClick={handleNext}
            className="flex flex-col items-center gap-1 text-[#2C2A26]/30 hover:text-[#2C2A26]/60 transition-colors"
          >
            <ArrowRight size={20} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Skip</span>
          </button>
        </div>
      )}
    </div>
  );
};
