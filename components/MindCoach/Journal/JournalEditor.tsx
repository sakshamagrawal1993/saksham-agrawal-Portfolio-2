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
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8E4DE]">
        <button onClick={onBack} className="text-[#2C2A26]/60 hover:text-[#2C2A26]">
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-sm font-semibold text-[#2C2A26] flex-1">
          {entry ? 'Edit Entry' : 'New Entry'}
        </h3>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="px-4 py-1.5 text-xs font-medium rounded-full bg-[#6B8F71] text-white disabled:opacity-40 transition-opacity"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!entry && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 bg-[#B4A7D6]/10 rounded-xl p-3"
          >
            <Sparkles size={14} className="text-[#B4A7D6] mt-0.5 shrink-0" />
            <p className="text-xs text-[#2C2A26]/60 italic">{prompt}</p>
          </motion.div>
        )}

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          className="w-full text-lg font-semibold text-[#2C2A26] placeholder:text-[#2C2A26]/25 bg-transparent outline-none"
        />

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your thoughts…"
          className="w-full flex-1 min-h-[200px] text-sm text-[#2C2A26] placeholder:text-[#2C2A26]/30 bg-transparent outline-none resize-none leading-relaxed"
        />

        <div>
          <p className="text-xs text-[#2C2A26]/40 mb-2">How are you feeling?</p>
          <div className="flex gap-3">
            {MOODS.map((m) => (
              <button
                key={m}
                onClick={() => setMood(mood === m ? null : m)}
                className={`text-2xl transition-transform ${
                  mood === m ? 'scale-125' : 'opacity-50 hover:opacity-80'
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
