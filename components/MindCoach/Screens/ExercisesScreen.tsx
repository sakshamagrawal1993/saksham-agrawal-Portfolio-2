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
import { FeaturePreviewLockOverlay } from '../shared/FeaturePreviewLockOverlay';

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

  const headerEl = (
    <div
      className={`relative z-20 px-6 pt-10 pb-6 space-y-6 zen-glass border-b border-white/60 zen-card-shadow ${
        exercisesUnlocked ? 'sticky top-0' : 'pointer-events-none opacity-95'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-[#2C2A26] tracking-tight">Wellness Library</h2>
          <p className="text-sm text-[#2C2A26]/40">Find your center with guided practices</p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-[#6B8F71]/10 flex items-center justify-center text-[#6B8F71] shadow-inner">
          <Sparkles size={24} />
        </div>
      </div>

      {/* Search & Filter */}
      <div className="space-y-5">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#2C2A26]/20 transition-colors group-focus-within:text-[#6B8F71]" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search techniques..."
            className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white/40 backdrop-blur-md border border-white/80 text-sm focus:border-[#6B8F71]/40 focus:bg-white/60 transition-all outline-none zen-card-shadow"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
              !selectedCategory 
                ? 'bg-[#6B8F71] text-white shadow-lg shadow-[#6B8F71]/20' 
                : 'bg-white/40 border border-white/60 text-[#2C2A26]/50 hover:bg-white/60'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap capitalize ${
                selectedCategory === cat 
                  ? 'bg-[#6B8F71] text-white shadow-lg shadow-[#6B8F71]/20' 
                  : 'bg-white/40 border border-white/60 text-[#2C2A26]/50 hover:bg-white/60'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const gridEl = (
    <div className={exercisesUnlocked ? 'relative z-10 flex-1 overflow-y-auto px-6 py-8' : 'relative z-10 px-6 py-8'}>
      <div className="grid grid-cols-1 gap-5">
        {filteredExercises.map((ex, idx) => (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ 
              duration: 0.5,
              delay: idx * 0.04,
              ease: [0.2, 0, 0.2, 1]
            }}
            key={ex.id}
            onClick={() => exercisesUnlocked && setActiveExercise(ex)}
            className={`group relative zen-glass p-5 rounded-3xl border border-white/60 overflow-hidden zen-card-shadow active:scale-[0.98] ${
              exercisesUnlocked
                ? 'hover:bg-white/40 transition-all cursor-pointer'
                : ''
            }`}
          >
            <div className="relative z-10 flex items-start justify-between gap-5">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded-lg bg-[#6B8F71]/10 text-[10px] font-bold uppercase tracking-widest text-[#6B8F71]">
                    {ex.type}
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-[#2C2A26]/30">
                    <Clock size={12} className="opacity-50" />
                    {Math.ceil(ex.duration_seconds / 60)} min
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#2C2A26] mb-1 group-hover:text-[#6B8F71] transition-colors">{ex.title}</h3>
                  <p className="text-sm text-[#2C2A26]/40 line-clamp-2 leading-relaxed">
                    {ex.description}
                  </p>
                </div>
              </div>
              
              <div className="w-14 h-14 rounded-2xl bg-white border border-white flex items-center justify-center text-[#6B8F71] shadow-sm transform group-hover:scale-110 group-hover:bg-[#6B8F71] group-hover:text-white transition-all duration-300">
                <Play size={22} fill="currentColor" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {filteredExercises.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-[#2C2A26]/10 border border-white/60 zen-card-shadow">
            <Search size={36} />
          </div>
          <div className="space-y-1">
            <h4 className="text-[#2C2A26] font-semibold">No results found</h4>
            <p className="text-[#2C2A26]/40 text-sm max-w-[200px]">Try searching for something else or explore a different category.</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative flex flex-col h-full bg-[#FAFAF8] overflow-hidden">
      {/* Zen Atmospheric Aura */}
      <div className="zen-aura-container">
        <img 
          src="https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/mind%20coach/hero_aura_zen_1774777549788.png" 
          alt="" 
          className="zen-aura-img"
        />
      </div>

      {!exercisesUnlocked ? (
        <FeaturePreviewLockOverlay
          unlockPhase={firstPhaseWhereFeatureUnlocks('exercises')}
          featureLabel="Wellness library"
          hint="Guided practices unlock in phase 3. Here is a preview of your library—keep going with your sessions to start one."
        >
          <>
            {headerEl}
            {gridEl}
          </>
        </FeaturePreviewLockOverlay>
      ) : (
        <>
          {headerEl}
          {gridEl}
          <AnimatePresence>
            {activeExercise && (
              <ExercisePlayer
                exercise={activeExercise}
                onClose={() => setActiveExercise(null)}
                onComplete={() => {
                  console.log('Exercise complete:', activeExercise.title);
                }}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
};
