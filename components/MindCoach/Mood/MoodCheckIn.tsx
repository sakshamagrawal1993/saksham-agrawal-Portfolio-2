import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../../lib/supabaseClient';
import { useMindCoachStore, MoodEntry } from '../../../store/mindCoachStore';

const MOODS = [
  { emoji: '😢', score: 1 },
  { emoji: '😕', score: 2 },
  { emoji: '😐', score: 3 },
  { emoji: '🙂', score: 4 },
  { emoji: '😊', score: 5 },
] as const;

export const MoodCheckIn: React.FC = () => {
  const profile = useMindCoachStore((s) => s.profile);
  const moodEntries = useMindCoachStore((s) => s.moodEntries);
  const setMoodEntries = useMindCoachStore((s) => s.setMoodEntries);

  const [selected, setSelected] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (selected === null || !profile) return;
    setSaving(true);

    try {
      const { data, error } = await supabase
        .from('mind_coach_mood_entries')
        .insert({
          profile_id: profile.id,
          score: selected,
          notes: notes.trim() || null,
        })
        .select()
        .single();

      if (!error && data) {
        setMoodEntries([data as MoodEntry, ...moodEntries]);
        setSaved(true);
        setTimeout(() => {
          setSaved(false);
          setSelected(null);
          setNotes('');
        }, 2000);
      }
    } catch {
      // silently fail for demo
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E4DE]">
      <p className="text-sm font-medium text-[#2C2A26] mb-3">How are you feeling?</p>

      <AnimatePresence mode="wait">
        {saved ? (
          <motion.div
            key="saved"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center gap-2 py-3"
          >
            <div className="w-6 h-6 rounded-full bg-[#6B8F71]/15 flex items-center justify-center">
              <Check size={14} className="text-[#6B8F71]" />
            </div>
            <span className="text-sm text-[#6B8F71] font-medium">Logged!</span>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex justify-between mb-3">
              {MOODS.map(({ emoji, score }) => (
                <button
                  key={score}
                  onClick={() => setSelected(score)}
                  className={`text-2xl transition-all ${
                    selected === score
                      ? 'scale-125'
                      : selected !== null
                        ? 'opacity-40 hover:opacity-70'
                        : 'hover:scale-110'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <AnimatePresence>
              {selected !== null && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any notes? (optional)"
                    className="w-full text-xs text-[#2C2A26] placeholder:text-[#2C2A26]/30 bg-[#FAFAF7] rounded-lg px-3 py-2 mb-2 outline-none border border-[#E8E4DE] focus:border-[#6B8F71]/40"
                  />
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full py-2 text-xs font-medium rounded-lg bg-[#6B8F71] text-white disabled:opacity-50 transition-opacity"
                  >
                    {saving ? 'Saving…' : 'Log Mood'}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
