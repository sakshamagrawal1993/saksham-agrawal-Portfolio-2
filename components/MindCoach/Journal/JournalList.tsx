import React from 'react';
import { Plus, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMindCoachStore, JournalEntry } from '../../../store/mindCoachStore';

const MOOD_COLORS: Record<string, string> = {
  '😢': '#7C9CBF',
  '😕': '#C4A882',
  '😐': '#B4A7D6',
  '🙂': '#A8C5A0',
  '😊': '#6B8F71',
};

interface JournalListProps {
  onNewEntry: () => void;
  onEditEntry: (entry: JournalEntry) => void;
}

export const JournalList: React.FC<JournalListProps> = ({ onNewEntry, onEditEntry }) => {
  const journalEntries = useMindCoachStore((s) => s.journalEntries);

  const sorted = [...journalEntries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-[60vh]">
        <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center mb-6 zen-card-shadow border border-white/60">
          <BookOpen size={32} className="text-[#6B8F71]" />
        </div>
        <h3 className="text-[#2C2A26] font-medium mb-2">Safe Space for Reflection</h3>
        <p className="text-[#2C2A26]/40 text-sm mb-8 max-w-[240px]">
          Start journaling to capture your thoughts and insights from your growth journey.
        </p>
        <button
          onClick={onNewEntry}
          className="px-6 py-3 bg-[#6B8F71] text-white text-sm font-semibold rounded-2xl shadow-lg shadow-[#6B8F71]/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          Write First Entry
        </button>
      </div>
    );
  }

  return (
    <div className="relative pb-24">
      <div className="space-y-3">
        {sorted.map((entry, i) => {
          const date = new Date(entry.created_at);
          const formatted = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
          const moodColor = entry.mood ? MOOD_COLORS[entry.mood] ?? '#B4A7D6' : undefined;

          return (
            <motion.button
              key={entry.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ 
                duration: 0.5,
                delay: i * 0.05,
                ease: [0.2, 0, 0.2, 1]
              }}
              onClick={() => onEditEntry(entry)}
              className="w-full text-left zen-glass p-4 rounded-2xl border border-white/60 hover:bg-white/40 transition-all zen-card-shadow active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-[#2C2A26] truncate">
                      {entry.title || 'Untitled Entry'}
                    </p>
                    <span className="text-[10px] uppercase tracking-wider text-[#2C2A26]/30 font-bold">
                      {formatted}
                    </span>
                  </div>
                  <p className="text-xs text-[#2C2A26]/50 line-clamp-2 leading-relaxed">
                    {entry.content}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {moodColor && (
                    <div
                      className="w-2.5 h-2.5 rounded-full shadow-inner"
                      style={{ 
                        backgroundColor: moodColor,
                        boxShadow: `0 0 8px ${moodColor}40`
                      }}
                    />
                  )}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <button
        onClick={onNewEntry}
        className="fixed bottom-8 right-6 w-14 h-14 rounded-2xl bg-[#6B8F71] text-white shadow-xl shadow-[#6B8F71]/30 flex items-center justify-center hover:bg-[#5A7D60] active:scale-[0.9] transition-all z-20"
      >
        <Plus size={24} />
      </button>
    </div>
  );
};
