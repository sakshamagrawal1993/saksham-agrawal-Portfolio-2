import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, MessageCircle, Calendar } from 'lucide-react';
import { useMindCoachStore } from '../../../store/mindCoachStore';

interface DiaryEntry {
  id: string;
  type: 'session' | 'journal';
  title: string;
  preview: string;
  date: string;
  mood?: string | null;
}

export const DiaryScreen: React.FC = () => {
  const sessions = useMindCoachStore((s) => s.sessions);
  const journalEntries = useMindCoachStore((s) => s.journalEntries);

  const entries = useMemo(() => {
    const sEntries: DiaryEntry[] = sessions
      .filter((s) => s.session_state === 'completed' && s.summary_data)
      .map((s) => {
        const data = s.summary_data as any;
        return {
          id: s.id,
          type: 'session' as const,
          title: data?.title || s.dynamic_theme || 'Session Summary',
          preview: data?.opening_reflection || 'Session completed',
          date: s.ended_at || s.started_at,
        };
      });

    const jEntries: DiaryEntry[] = journalEntries.map((j) => ({
      id: j.id,
      type: 'journal' as const,
      title: j.title || 'Journal Entry',
      preview: j.content?.substring(0, 100) || '',
      date: j.created_at,
      mood: j.mood,
    }));

    return [...sEntries, ...jEntries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [sessions, journalEntries]);

  // Group entries by month
  const grouped = useMemo(() => {
    const res: Record<string, DiaryEntry[]> = {};
    entries.forEach((e) => {
      const d = new Date(e.date);
      if (isNaN(d.getTime())) return;
      const monthKey = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!res[monthKey]) res[monthKey] = [];
      res[monthKey].push(e);
    });
    return res;
  }, [entries]);

  return (
    <div className="p-5 space-y-5">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-xl font-semibold text-[#2C2A26]">My Diary</h2>
        <p className="text-xs text-[#2C2A26]/40 mt-1">Session reflections & journal entries</p>
      </motion.div>

      {entries.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <div className="w-14 h-14 rounded-full bg-[#F5F0EB] flex items-center justify-center mx-auto mb-3">
            <BookOpen size={24} className="text-[#2C2A26]/25" />
          </div>
          <p className="text-sm text-[#2C2A26]/50">Your diary is empty</p>
          <p className="text-xs text-[#2C2A26]/30 mt-1">
            Session summaries and journal entries will appear here
          </p>
        </motion.div>
      ) : (
        Object.entries(grouped).map(([month, monthEntries]) => (
          <div key={month} className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Calendar size={12} className="text-[#2C2A26]/30" />
              <p className="text-xs font-medium text-[#2C2A26]/40 uppercase tracking-wide">{month}</p>
            </div>

            {monthEntries.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-white rounded-2xl p-4 border border-[#E8E4DE] shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    entry.type === 'session'
                      ? 'bg-[#B4A7D6]/15'
                      : 'bg-[#6B8F71]/10'
                  }`}>
                    {entry.type === 'session' ? (
                      <MessageCircle size={16} className="text-[#B4A7D6]" />
                    ) : (
                      <BookOpen size={16} className="text-[#6B8F71]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                        entry.type === 'session'
                          ? 'bg-[#B4A7D6]/15 text-[#B4A7D6]'
                          : 'bg-[#6B8F71]/10 text-[#6B8F71]'
                      }`}>
                        {entry.type === 'session' ? 'Session' : 'Journal'}
                      </span>
                      <span className="text-[10px] text-[#2C2A26]/30">
                        {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      {entry.mood && (
                        <span className="text-[10px] text-[#D4A574] font-medium">· {entry.mood}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-[#2C2A26] truncate">{entry.title}</p>
                    <p className="text-xs text-[#2C2A26]/50 mt-0.5 line-clamp-2">{entry.preview}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ))
      )}
    </div>
  );
};
