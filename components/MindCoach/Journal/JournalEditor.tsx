import React, { useState, useMemo } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../../../lib/supabaseClient';
import { useMindCoachStore, JournalEntry } from '../../../store/mindCoachStore';

const PROMPTS = [
  'What triggered your stress today?',
  'Write about something you\'re grateful for',
  'How did your last session make you feel?',
  'What would you tell a friend going through this?',
];

const MOODS = ['😢', '😕', '😐', '🙂', '😊'] as const;

interface JournalEditorProps {
  onBack: () => void;
  entry?: JournalEntry;
}

export const JournalEditor: React.FC<JournalEditorProps> = ({ onBack, entry }) => {
  const profile = useMindCoachStore((s) => s.profile);
  const journalEntries = useMindCoachStore((s) => s.journalEntries);
  const setJournalEntries = useMindCoachStore((s) => s.setJournalEntries);

  const [title, setTitle] = useState(entry?.title ?? '');
  const [content, setContent] = useState(entry?.content ?? '');
  const [mood, setMood] = useState<string | null>(entry?.mood ?? null);
  const [saving, setSaving] = useState(false);

  const prompt = useMemo(
    () => PROMPTS[Math.floor(Math.random() * PROMPTS.length)],
    []
  );

  const canSave = content.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || !profile) return;
    setSaving(true);

    try {
      if (entry) {
        const { data, error } = await supabase
          .from('mind_coach_journal_entries')
          .update({ title: title || null, content, mood })
          .eq('id', entry.id)
          .select()
          .single();

        if (!error && data) {
          setJournalEntries(
            journalEntries.map((e) => (e.id === entry.id ? (data as JournalEntry) : e))
          );
        }
      } else {
        const { data, error } = await supabase
          .from('mind_coach_journal_entries')
          .insert({
            profile_id: profile.id,
            title: title || null,
            content,
            mood,
            prompt,
          })
          .select()
          .single();

        if (!error && data) {
          setJournalEntries([data as JournalEntry, ...journalEntries]);
        }
      }
      onBack();
    } catch {
      setSaving(false);
    }
  };

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

      <header className="relative z-10 flex items-center gap-3 px-4 py-4 zen-glass border-b border-white/60 zen-card-shadow">
        <button onClick={onBack} className="p-2 -ml-2 text-[#2C2A26]/40 hover:text-[#2C2A26] hover:bg-white/40 rounded-full transition-all active:scale-[0.85]">
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-sm font-semibold text-[#2C2A26] flex-1">
          {entry ? 'Edit Entry' : 'New Entry'}
        </h3>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="px-5 py-2 text-xs font-semibold rounded-xl bg-[#6B8F71] text-white disabled:opacity-30 transition-all shadow-lg shadow-[#6B8F71]/20 active:scale-[0.95]"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto p-6 space-y-6">
        {!entry && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-start gap-3 bg-white/40 backdrop-blur-sm rounded-2xl p-4 border border-white/60 zen-card-shadow"
          >
            <div className="w-8 h-8 rounded-full bg-[#6B8F71]/10 flex items-center justify-center shrink-0">
              <Sparkles size={16} className="text-[#6B8F71]" />
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-wider text-[#6B8F71] font-bold">Inspiration</p>
              <p className="text-xs text-[#2C2A26]/70 italic leading-relaxed">{prompt}</p>
            </div>
          </motion.div>
        )}

        <div className="space-y-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full text-2xl font-semibold text-[#2C2A26] placeholder:text-[#2C2A26]/20 bg-transparent outline-none tracking-tight"
          />

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind today?"
            className="w-full flex-1 min-h-[350px] text-base text-[#2C2A26]/80 placeholder:text-[#2C2A26]/20 bg-transparent outline-none resize-none leading-relaxed"
          />
        </div>

        <div className="pt-6 border-t border-white/40">
          <p className="text-xs font-bold uppercase tracking-widest text-[#2C2A26]/30 mb-4">Current Mood</p>
          <div className="flex justify-between items-center max-w-xs">
            {MOODS.map((m) => (
              <button
                key={m}
                onClick={() => setMood(mood === m ? null : m)}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl transition-all ${
                  mood === m 
                    ? 'bg-white shadow-lg scale-110 border border-white' 
                    : 'opacity-40 grayscale-[40%] hover:scale-110 hover:opacity-100 hover:grayscale-0'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
