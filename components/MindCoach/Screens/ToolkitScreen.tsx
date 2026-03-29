import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Wind, Brain, Lock, BarChart3 } from 'lucide-react';
import { useMindCoachStore, JournalEntry, UNLOCK_MAP } from '../../../store/mindCoachStore';
import { JournalList } from '../Journal/JournalList';
import { JournalEditor } from '../Journal/JournalEditor';
import { ExerciseLibrary } from '../Exercises/ExerciseLibrary';
import { MeditationLibrary } from '../Meditation/MeditationLibrary';
import { MoodCheckIn } from '../Mood/MoodCheckIn';
import { MoodChart } from '../Mood/MoodChart';

type Section = 'hub' | 'journal' | 'journal-editor' | 'exercises' | 'meditation' | 'mood';

interface ToolkitCard {
  id: Section;
  featureKey: string;
  title: string;
  description: string;
  icon: React.ElementType;
  unlockPhase: number;
  color: string;
}

const TOOLKIT_CARDS: ToolkitCard[] = [
  {
    id: 'journal',
    featureKey: 'journal',
    title: 'Journal',
    description: 'Reflect on your thoughts and track your growth over time.',
    icon: BookOpen,
    unlockPhase: 2,
    color: '#B4A7D6',
  },
  {
    id: 'exercises',
    featureKey: 'exercises',
    title: 'Exercises',
    description: 'Breathing & grounding techniques to calm your body and mind.',
    icon: Wind,
    unlockPhase: 3,
    color: '#6B8F71',
  },
  {
    id: 'meditation',
    featureKey: 'meditation',
    title: 'Meditation',
    description: 'Guided meditations for calm, focus, sleep, and gratitude.',
    icon: Brain,
    unlockPhase: 4,
    color: '#B4A7D6',
  },
  {
    id: 'mood',
    featureKey: 'journal',
    title: 'Mood Trends',
    description: 'Track how you feel over time and spot patterns.',
    icon: BarChart3,
    unlockPhase: 2,
    color: '#6B8F71',
  },
];

export const ToolkitScreen: React.FC = () => {
  const phase = useMindCoachStore((s) => s.journey?.current_phase ?? 1);
  const moodEntries = useMindCoachStore((s) => s.moodEntries);

  const [section, setSection] = useState<Section>('hub');
  const [editEntry, setEditEntry] = useState<JournalEntry | undefined>(undefined);

  const unlocked =
    UNLOCK_MAP[Math.min(Math.max(phase, 1), 4)] ?? UNLOCK_MAP[1];

  const backToHub = () => setSection('hub');

  switch (section) {
    case 'journal':
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8E4DE]">
            <button onClick={backToHub} className="text-xs text-[#6B8F71] font-medium">
              ← Toolkit
            </button>
            <h3 className="text-sm font-semibold text-[#2C2A26]">Journal</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <JournalList
              onNewEntry={() => { setEditEntry(undefined); setSection('journal-editor'); }}
              onEditEntry={(entry) => { setEditEntry(entry); setSection('journal-editor'); }}
            />
          </div>
        </div>
      );

    case 'journal-editor':
      return (
        <JournalEditor
          entry={editEntry}
          onBack={() => setSection('journal')}
        />
      );

    case 'exercises':
      return (
        <div className="flex flex-col h-full">
          <div className="px-4 pt-3 pb-1 border-b border-[#E8E4DE]">
            <button onClick={backToHub} className="text-xs text-[#6B8F71] font-medium mb-1">
              ← Toolkit
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ExerciseLibrary />
          </div>
        </div>
      );

    case 'meditation':
      return (
        <div className="flex flex-col h-full">
          <div className="px-4 pt-3 pb-1 border-b border-[#E8E4DE]">
            <button onClick={backToHub} className="text-xs text-[#6B8F71] font-medium mb-1">
              ← Toolkit
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <MeditationLibrary />
          </div>
        </div>
      );

    case 'mood':
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8E4DE]">
            <button onClick={backToHub} className="text-xs text-[#6B8F71] font-medium">
              ← Toolkit
            </button>
            <h3 className="text-sm font-semibold text-[#2C2A26]">Mood Trends</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <MoodCheckIn />
            <MoodChart entries={moodEntries} />
          </div>
        </div>
      );

    default:
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

          <div className="relative z-10 p-6 pt-10 pb-20 flex-1 overflow-y-auto">
            <div className="mb-10">
              <h2 className="text-3xl font-black text-[#2C2A26] tracking-tighter mb-2">Toolkit</h2>
              <p className="text-xs text-[#2C2A26]/40 font-bold uppercase tracking-[0.1em]">
                Your Sanctuary of Growth
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {TOOLKIT_CARDS.map((card, i) => {
                const isUnlocked = unlocked.includes(card.featureKey);
                const Icon = card.icon;

                return (
                  <motion.button
                    key={card.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.5, ease: [0.2, 0, 0, 1] }}
                    whileHover={isUnlocked ? { y: -4 } : {}}
                    whileTap={isUnlocked ? { scale: 0.98 } : {}}
                    onClick={() => isUnlocked && setSection(card.id)}
                    className={`relative rounded-[2rem] p-6 text-left border-white transition-all overflow-hidden zen-glass zen-card-shadow ${
                      isUnlocked
                        ? 'hover:bg-white/40 cursor-pointer border border-white/60'
                        : 'cursor-default border border-white/20 opacity-80'
                    }`}
                  >
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 zen-card-shadow bg-white/60 border border-white"
                    >
                      <Icon size={22} style={{ color: card.color }} />
                    </div>
                    <p className="text-base font-black text-[#2C2A26] tracking-tight mb-1">{card.title}</p>
                    <p className="text-[10px] text-[#2C2A26]/40 font-semibold leading-relaxed line-clamp-2">
                      {card.description}
                    </p>

                    {!isUnlocked && (
                      <div className="absolute inset-0 bg-white/40 backdrop-blur-[4px] flex flex-col items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-white/80 zen-card-shadow flex items-center justify-center mb-2 border border-white">
                          <Lock size={18} className="text-[#2C2A26]/30" />
                        </div>
                        <span className="text-[9px] text-[#2C2A26]/60 font-black uppercase tracking-widest text-center px-4 leading-tight">
                          Unlocks Final Phase
                        </span>
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>
      );
  }
};
