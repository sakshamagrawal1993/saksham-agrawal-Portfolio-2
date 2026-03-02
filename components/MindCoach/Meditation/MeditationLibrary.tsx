import React, { useState, useMemo } from 'react';
import { Clock, Brain } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMindCoachStore, Exercise } from '../../../store/mindCoachStore';
import { MeditationPlayer } from './MeditationPlayer';

const CATEGORY_ORDER = ['calm', 'focus', 'sleep', 'gratitude'];

export const MeditationLibrary: React.FC = () => {
  const exercises = useMindCoachStore((s) => s.exercises);
  const [activeExercise, setActiveExercise] = useState<Exercise | null>(null);

  const meditations = exercises.filter((e) => e.type === 'meditation');

  const grouped = useMemo(() => {
    const map = new Map<string, Exercise[]>();
    for (const ex of meditations) {
      const cat = ex.category.toLowerCase();
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(ex);
    }
    const sorted: [string, Exercise[]][] = [];
    for (const cat of CATEGORY_ORDER) {
      if (map.has(cat)) {
        sorted.push([cat, map.get(cat)!]);
        map.delete(cat);
      }
    }
    for (const [cat, exs] of map) sorted.push([cat, exs]);
    return sorted;
  }, [meditations]);

  if (activeExercise) {
    return <MeditationPlayer exercise={activeExercise} onBack={() => setActiveExercise(null)} />;
  }

  return (
    <div className="p-4 space-y-5">
      <h3 className="text-lg font-semibold text-[#2C2A26]">Meditation</h3>

      {meditations.length === 0 && (
        <p className="text-sm text-[#2C2A26]/50 text-center py-8">
          No meditations available yet
        </p>
      )}

      {grouped.map(([category, items]) => (
        <div key={category}>
          <p className="text-xs font-semibold text-[#2C2A26]/40 uppercase tracking-wider mb-2 capitalize">
            {category}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {items.map((ex, i) => {
              const minutes = Math.ceil(ex.duration_seconds / 60);
              return (
                <motion.button
                  key={ex.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setActiveExercise(ex)}
                  className="text-left bg-white rounded-2xl p-4 shadow-sm border border-[#E8E4DE] hover:border-[#B4A7D6]/40 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#B4A7D6]/15 flex items-center justify-center mb-3">
                    <Brain size={18} className="text-[#B4A7D6]" />
                  </div>
                  <p className="text-sm font-medium text-[#2C2A26] leading-tight mb-1">
                    {ex.title}
                  </p>
                  {ex.description && (
                    <p className="text-[11px] text-[#2C2A26]/40 line-clamp-2 mb-2">
                      {ex.description}
                    </p>
                  )}
                  <span className="inline-flex items-center gap-1 text-[10px] text-[#2C2A26]/40">
                    <Clock size={10} />
                    {minutes} min
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
