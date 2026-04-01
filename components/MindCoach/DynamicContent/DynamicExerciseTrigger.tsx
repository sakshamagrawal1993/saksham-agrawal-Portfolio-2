import React from 'react';
import { Play } from 'lucide-react';
import { motion } from 'framer-motion';
import { findExerciseByPayload } from '../../../lib/mindCoachExerciseResolve';
import { useMindCoachStore } from '../../../store/mindCoachStore';
import type { Exercise } from '../../../store/mindCoachStore';
import { ExercisePlayer } from '../Exercises/ExercisePlayer';

interface DynamicExerciseTriggerProps {
  payload: string; // The exercise ID or key
  messageId: string;
}

function exerciseTagLine(exercise: Exercise): string {
  const kind =
    exercise.type === 'breathing'
      ? 'BREATHING'
      : exercise.type === 'grounding'
        ? 'GROUNDING'
        : 'MEDITATION';
  const mode = exercise.type === 'breathing' ? 'LOOPING' : 'GUIDED';
  return `${kind} • ${mode}`;
}

export const DynamicExerciseTrigger: React.FC<DynamicExerciseTriggerProps> = ({ payload, messageId }) => {
  const exercises = useMindCoachStore((s) => s.exercises);
  const activeExercise = useMindCoachStore((s) => s.activeExercise);
  const activeExerciseMessageId = useMindCoachStore((s) => s.activeExerciseMessageId);
  const setActiveExercise = useMindCoachStore((s) => s.setActiveExercise);
  const setActiveExerciseMessageId = useMindCoachStore((s) => s.setActiveExerciseMessageId);

  const exercise = findExerciseByPayload(exercises, payload);

  // User chose "Start Activity" — show the in-thread player
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
    if (payload.endsWith('_pathway')) return null;

    return (
      <div className="p-3 bg-[#F5F0EB] text-[#2C2A26] rounded-xl text-xs italic opacity-70">
        Exercise &quot;{payload}&quot; not found.
      </div>
    );
  }

  const ICON_MAP: Record<string, string> = {
    breathing: '🌬️',
    grounding: '🧘',
    meditation: '✨',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 w-full max-w-[340px] rounded-2xl border border-[#E8E4DE] bg-white p-5 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-[#F0EDEA] flex items-center justify-center text-xl shrink-0">
          {ICON_MAP[exercise.type] || '🎯'}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-serif text-base font-semibold text-[#2C2A26] leading-snug">{exercise.title}</h4>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B8F71]">
            {exerciseTagLine(exercise)}
          </p>
        </div>
      </div>

      {exercise.description && (
        <p className="mt-3 text-sm text-[#2C2A26]/55 leading-relaxed line-clamp-3">{exercise.description}</p>
      )}

      <button
        type="button"
        onClick={() => {
          setActiveExercise(exercise);
          setActiveExerciseMessageId(messageId);
        }}
        className="mt-4 w-full py-3 rounded-full bg-[#6B8F71] hover:bg-[#5A7D60] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
      >
        <Play size={16} fill="currentColor" className="shrink-0" />
        Start Activity
      </button>
    </motion.div>
  );
};
