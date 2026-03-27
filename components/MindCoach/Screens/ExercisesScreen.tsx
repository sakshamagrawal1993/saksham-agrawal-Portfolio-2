import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Play, Clock, Sparkles } from 'lucide-react';
import {
  useMindCoachStore,
  type Exercise,
  UNLOCK_MAP,
  firstPhaseWhereFeatureUnlocks,
} from '../../../store/mindCoachStore';
import { ExercisePlayer } from '../Exercises/ExercisePlayer';
import { FeatureLockedPlaceholder } from '../shared/FeatureLockedPlaceholder';

export const ExercisesScreen: React.FC = () => {
  const phase = useMindCoachStore((s) => s.journey?.current_phase ?? 1);
  const exercises = useMindCoachStore((s) => s.exercises);
  const unlocked =
    UNLOCK_MAP[Math.min(Math.max(phase, 1), 4)] ?? UNLOCK_MAP[1];
  const exercisesUnlocked = unlocked.includes('exercises');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeExercise, setActiveExercise] = useState<Exercise | null>(null);

  const categories = Array.from(new Set(exercises.map((e) => e.category)));

  const filteredExercises = exercises.filter((e) => {
    const matchesSearch = e.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         (e.description?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || e.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (!exercisesUnlocked) {
    return (
      <div className="flex flex-col h-full bg-[#FAFAF7]">
        <FeatureLockedPlaceholder
          title="Wellness library"
          description="Guided exercises unlock in phase 3. Keep progressing with your plan to access practices here."
          unlockPhase={firstPhaseWhereFeatureUnlocks('exercises')}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#FAFAF7]">
      {/* Header */}
      <div className="px-6 pt-8 pb-6 space-y-6 bg-white/50 backdrop-blur-sm sticky top-0 z-20 border-b border-[#E8E4DE]/50">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-serif text-[#2C2A26]">Wellness Library</h2>
            <p className="text-sm text-[#2C2A26]/50">Find your center with guided practices</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-[#B4A7D6]/10 flex items-center justify-center text-[#B4A7D6]">
            <Sparkles size={20} />
          </div>
        </div>

        {/* Search & Filter */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#2C2A26]/30" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search techniques..."
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white border border-[#E8E4DE] text-sm focus:border-[#6B8F71] transition-all outline-none"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                !selectedCategory ? 'bg-[#6B8F71] text-white' : 'bg-white border border-[#E8E4DE] text-[#2C2A26]/60'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap capitalize ${
                  selectedCategory === cat ? 'bg-[#6B8F71] text-white' : 'bg-white border border-[#E8E4DE] text-[#2C2A26]/60'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid grid-cols-1 gap-4">
          {filteredExercises.map((ex, idx) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              key={ex.id}
              onClick={() => setActiveExercise(ex)}
              className="group relative bg-white p-5 rounded-[2rem] border border-[#E8E4DE] hover:border-[#6B8F71]/30 hover:shadow-lg transition-all cursor-pointer overflow-hidden"
            >
              {/* Decorative background shape */}
              <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 rounded-full bg-[#F5F2EB] group-hover:bg-[#6B8F71]/5 transition-colors -z-0" />
              
              <div className="relative z-10 flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-[#6B8F71]">
                      {ex.type}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-[#2C2A26]/30">•</span>
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-[#2C2A26]/30">
                      <Clock size={10} />
                      {Math.ceil(ex.duration_seconds / 60)} min
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-[#2C2A26]">{ex.title}</h3>
                  <p className="text-sm text-[#2C2A26]/50 line-clamp-2 leading-relaxed">
                    {ex.description}
                  </p>
                </div>
                
                <div className="w-12 h-12 rounded-2xl bg-[#FAFAF7] border border-[#E8E4DE] flex items-center justify-center text-[#6B8F71] group-hover:bg-[#6B8F71] group-hover:text-white transition-all transform group-hover:scale-110">
                  <Play size={20} fill="currentColor" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {filteredExercises.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-[#E8E4DE]/30 flex items-center justify-center text-[#2C2A26]/20">
              <Search size={32} />
            </div>
            <p className="text-[#2C2A26]/40 font-medium">No techniques found matching your search</p>
          </div>
        )}
      </div>

      {/* Player Overlay */}
      <AnimatePresence>
        {activeExercise && (
          <ExercisePlayer
            exercise={activeExercise}
            onClose={() => setActiveExercise(null)}
            onComplete={() => {
              // Maybe add points or update activity log
              console.log('Exercise complete:', activeExercise.title);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
