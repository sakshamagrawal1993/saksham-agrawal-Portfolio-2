import React, { useState } from 'react';
import { Clock, Wind, Mountain } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMindCoachStore, Exercise } from '../../../store/mindCoachStore';
import { ExercisePlayer } from './ExercisePlayer';

const TYPE_ICON: Record<string, React.ElementType> = {
  breathing: Wind,
  grounding: Mountain,
};

export const ExerciseLibrary: React.FC = () => {
  const exercises = useMindCoachStore((s) => s.exercises);
  const [activeExercise, setActiveExercise] = useState<Exercise | null>(null);

  const filtered = exercises.filter((e) => e.type === 'breathing' || e.type === 'grounding');

  if (activeExercise) {
    return <ExercisePlayer exercise={activeExercise} onClose={() => setActiveExercise(null)} />;
  }

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-lg font-semibold text-[#2C2A26]">Exercises</h3>

      {filtered.length === 0 && (
        <p className="text-sm text-[#2C2A26]/50 text-center py-8">
          No exercises available yet
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {filtered.map((ex, i) => {
          const Icon = TYPE_ICON[ex.type] ?? Wind;
          const minutes = Math.ceil(ex.duration_seconds / 60);

          return (
            <motion.button
              key={ex.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setActiveExercise(ex)}
              className="text-left bg-white rounded-2xl p-4 shadow-sm border border-[#E8E4DE] hover:border-[#6B8F71]/30 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-[#6B8F71]/10 flex items-center justify-center mb-3">
                <Icon size={18} className="text-[#6B8F71]" />
              </div>
              <p className="text-sm font-medium text-[#2C2A26] leading-tight mb-2">
                {ex.title}
              </p>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] text-[#2C2A26]/40">
                  <Clock size={10} />
                  {minutes} min
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#6B8F71]/10 text-[#6B8F71] font-medium capitalize">
                  {ex.category}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
