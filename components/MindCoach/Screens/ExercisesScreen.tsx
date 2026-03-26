import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Wind, Anchor, Sparkles, Clock, PlayCircle } from 'lucide-react';
import { useMindCoachStore, type Exercise } from '../../../store/mindCoachStore';
import { ExercisePlayer } from '../Exercises/ExercisePlayer';

const TYPE_ICONS = {
  breathing: <Wind size={18} />,
  grounding: <Anchor size={18} />,
  meditation: <Sparkles size={18} />,
};

const CATEGORY_COLORS: Record<string, string> = {
  calm: 'bg-blue-50 text-blue-600',
  sleep: 'bg-indigo-50 text-indigo-600',
  anxiety: 'bg-orange-50 text-orange-600',
  stress: 'bg-red-50 text-red-600',
  focus: 'bg-emerald-50 text-emerald-600',
  gratitude: 'bg-amber-50 text-amber-600',
};

export const ExercisesScreen: React.FC = () => {
  const exercises = useMindCoachStore((s) => s.exercises);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'breathing' | 'grounding' | 'meditation'>('all');
  const [activeExercise, setActiveExercise] = useState<Exercise | null>(null);

  const filtered = exercises.filter((ex) => {
    const matchesSearch = ex.title.toLowerCase().includes(search.toLowerCase()) || 
                         ex.description?.toLowerCase().includes(search.toLowerCase());
    const matchesType = selectedType === 'all' || ex.type === selectedType;
    return matchesSearch && matchesType;
  });

  if (activeExercise) {
    return (
      <div className="fixed inset-0 z-50 bg-white">
        <ExercisePlayer 
          exercise={activeExercise} 
          onClose={() => setActiveExercise(null)} 
        />
      </div>
    );
  }

  return (
    <div className="p-5 flex flex-col h-full bg-[#FAFAF7]">
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-[#2C2A26] mb-1">Exercise Library</h2>
        <p className="text-sm text-[#2C2A26]/50">Tools to help you find your center</p>
      </header>

      {/* Search & Filters */}
      <div className="space-y-4 mb-8">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#2C2A26]/30" size={18} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exercises..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-[#E8E4DE] rounded-2xl text-sm outline-none focus:border-[#6B8F71] transition-colors"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {['all', 'breathing', 'grounding', 'meditation'].map((t) => (
            <button
              key={t}
              onClick={() => setSelectedType(t as any)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedType === t 
                  ? 'bg-[#2C2A26] text-white shadow-md' 
                  : 'bg-white border border-[#E8E4DE] text-[#2C2A26]/60 hover:border-[#6B8F71]/30'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 space-y-4">
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {filtered.map((ex, i) => (
              <motion.div
                key={ex.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => setActiveExercise(ex)}
                className="group relative bg-white p-5 rounded-3xl border border-[#E8E4DE] hover:border-[#6B8F71]/30 hover:shadow-lg transition-all cursor-pointer active:scale-[0.98]"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2.5 rounded-2xl ${CATEGORY_COLORS[ex.category] || 'bg-gray-50 text-gray-600'}`}>
                    {TYPE_ICONS[ex.type as keyof typeof TYPE_ICONS]}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-[#2C2A26]/30 uppercase tracking-widest">
                    <Clock size={12} />
                    {Math.floor(ex.duration_seconds / 60)}m
                  </div>
                </div>

                <h3 className="text-base font-bold text-[#2C2A26] group-hover:text-[#6B8F71] transition-colors mb-1">
                  {ex.title}
                </h3>
                <p className="text-xs text-[#2C2A26]/50 leading-relaxed line-clamp-2">
                  {ex.description}
                </p>

                <div className="absolute right-5 bottom-5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <PlayCircle className="text-[#6B8F71]" size={28} />
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
            <Search size={40} className="mb-4" />
            <p className="text-sm font-medium">No exercises found</p>
          </div>
        )}
      </div>
    </div>
  );
};
