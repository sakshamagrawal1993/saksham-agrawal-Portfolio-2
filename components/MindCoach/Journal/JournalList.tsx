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
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-[#B4A7D6]/20 flex items-center justify-center mb-4">
          <BookOpen size={28} className="text-[#B4A7D6]" />
        </div>
        <p className="text-[#2C2A26]/50 text-sm mb-6">
          Start journaling to reflect on your sessions
        </p>
        <button
          onClick={onNewEntry}
          className="px-5 py-2.5 bg-[#6B8F71] text-white text-sm font-medium rounded-full"
        >
          Write First Entry
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div className="space-y-2">
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
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => onEditEntry(entry)}
              className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-[#E8E4DE] hover:border-[#B4A7D6]/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#2C2A26] truncate">
                    {entry.title || 'Untitled Entry'}
                  </p>
                  <p className="text-xs text-[#2C2A26]/40 mt-0.5">{formatted}</p>
                  <p className="text-xs text-[#2C2A26]/50 mt-1.5 line-clamp-2">
                    {entry.content}
                  </p>
                </div>
                {moodColor && (
                  <span
                    className="w-3 h-3 rounded-full shrink-0 mt-1"
                    style={{ backgroundColor: moodColor }}
                  />
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      <button
        onClick={onNewEntry}
        className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-[#6B8F71] text-white shadow-lg flex items-center justify-center hover:bg-[#5A7D60] transition-colors"
      >
        <Plus size={22} />
      </button>
    </div>
  );
};
