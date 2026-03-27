import React from 'react';
import { Play } from 'lucide-react';
import { motion } from 'framer-motion';
import { findExerciseByPayload } from '../../../lib/mindCoachExerciseResolve';
import { useMindCoachStore } from '../../../store/mindCoachStore';
import { ExercisePlayer } from '../Exercises/ExercisePlayer';

interface DynamicExerciseTriggerProps {
  payload: string; // The exercise ID or key
  messageId: string;
}

export const DynamicExerciseTrigger: React.FC<DynamicExerciseTriggerProps> = ({ payload, messageId }) => {
  const exercises = useMindCoachStore((s) => s.exercises);
  const activeExercise = useMindCoachStore((s) => s.activeExercise);
  const activeExerciseMessageId = useMindCoachStore((s) => s.activeExerciseMessageId);
  const setActiveExercise = useMindCoachStore((s) => s.setActiveExercise);
  const setActiveExerciseMessageId = useMindCoachStore((s) => s.setActiveExerciseMessageId);

  const exercise = findExerciseByPayload(exercises, payload);

  // If this specific message is active, show the player in-line
  if (activeExerciseMessageId === messageId && activeExercise) {
    return (
      <div className="w-full mt-2 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
        <ExercisePlayer 
          exercise={activeExercise} 
          isInline={true}
          onClose={() => {
            setActiveExercise(null);
            setActiveExerciseMessageId(null);
          }}
        />
      </div>
    );
  }

  if (!exercise) {
    return (
      <div className="p-3 bg-[#F5F0EB] text-[#2C2A26] rounded-xl text-xs italic opacity-70">
        Exercise "{payload}" not found.
      </div>
    );
  }

  const ICON_MAP = {
    breathing: '🌬️',
    grounding: '🧘',
    meditation: '✨',
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mt-2 w-full max-w-[340px] rounded-2xl overflow-hidden border border-[#6B8F71]/20 bg-white shadow-sm"
    >
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-[#6B8F71]/10 flex items-center justify-center text-xl">
            {ICON_MAP[exercise.type] || '🎯'}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#2C2A26]">{exercise.title}</h4>
            <p className="text-[10px] uppercase font-bold text-[#6B8F71] tracking-wider">
              {exercise.type} • Guided
            </p>
          </div>
        </div>
        
        {exercise.description && (
          <p className="text-xs text-[#2C2A26]/60 mb-4 line-clamp-2 leading-relaxed">
            {exercise.description}
          </p>
        )}

        <button
          onClick={() => {
            setActiveExercise(exercise);
            setActiveExerciseMessageId(messageId);
          }}
          className="w-full py-2.5 bg-[#6B8F71] hover:bg-[#5A7A5F] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <Play size={14} fill="currentColor" />
          Start Activity
        </button>
      </div>
    </motion.div>
  );
};
