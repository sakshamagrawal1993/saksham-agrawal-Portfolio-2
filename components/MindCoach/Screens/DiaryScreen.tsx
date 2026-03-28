import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, MessageCircle, Calendar } from 'lucide-react';
import { useMindCoachStore } from '../../../store/mindCoachStore';
import { supabase } from '../../../lib/supabaseClient';

interface DiaryEntry {
  id: string;
  type: 'session' | 'journal';
  title: string;
  preview: string;
  date: string;
  mood?: string | null;
  hasSummary?: boolean;
}

function normalizeServerSessionSummary(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const value = raw.trim();
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

export const DiaryScreen: React.FC = () => {
  const sessions = useMindCoachStore((s) => s.sessions);
  const journalEntries = useMindCoachStore((s) => s.journalEntries);
  const profile = useMindCoachStore((s) => s.profile);
  const setSessions = useMindCoachStore((s) => s.setSessions);
  const [generatingSummaryFor, setGeneratingSummaryFor] = useState<string | null>(null);
  const [summaryErrorBySession, setSummaryErrorBySession] = useState<Record<string, string>>({});

  const entries = useMemo(() => {
    const sEntries: DiaryEntry[] = sessions
      .filter((s) => s.session_state === 'completed')
      .map((s) => {
        const data = (s.summary_data ?? null) as Record<string, unknown> | null;
        const title =
          (typeof data?.title === 'string' && data.title) ||
          s.dynamic_theme ||
          'Session';
        const preview =
          (typeof data?.opening_reflection === 'string' && data.opening_reflection) ||
          (s.ended_at ? 'Session completed — summary will appear when available.' : 'Session completed');
        return {
          id: s.id,
          type: 'session' as const,
          title,
          preview,
          date: s.ended_at || s.started_at,
          hasSummary: !!data,
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

  const handleSessionClick = async (entry: DiaryEntry) => {
    if (entry.type !== 'session') return;
    if (entry.hasSummary) return;
    if (generatingSummaryFor === entry.id) return;
    if (!profile?.id) return;

    const session = sessions.find((s) => s.id === entry.id);
    if (!session) return;

    setGeneratingSummaryFor(entry.id);
    setSummaryErrorBySession((prev) => ({ ...prev, [entry.id]: '' }));

    try {
      const { data, error } = await supabase.functions.invoke('mind-coach-session-end', {
        body: {
          session_id: session.id,
          profile_id: profile.id,
        },
      });
      if (error) throw error;

      const payload =
        Array.isArray(data) && data[0] && typeof data[0] === 'object'
          ? (data[0] as Record<string, unknown>)
          : (data as Record<string, unknown> | null);
      const inner =
        payload?.output && typeof payload.output === 'object' && !Array.isArray(payload.output)
          ? (payload.output as Record<string, unknown>)
          : null;
      const sessionSummary = normalizeServerSessionSummary(payload?.session_summary ?? inner?.session_summary);
      const caseNotes =
        payload?.case_notes && typeof payload.case_notes === 'object'
          ? payload.case_notes
          : null;

      if (!sessionSummary) {
        throw new Error('Summary generation returned an empty payload.');
      }

      const patch: Record<string, unknown> = { summary_data: sessionSummary };
      if (caseNotes) patch.case_notes = caseNotes;

      await supabase
        .from('mind_coach_sessions')
        .update(patch)
        .eq('id', session.id);

      setSessions(
        sessions.map((s) =>
          s.id === session.id
            ? {
                ...s,
                summary_data: sessionSummary,
                case_notes: caseNotes ? (caseNotes as any) : s.case_notes,
              }
            : s,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not generate summary right now.';
      setSummaryErrorBySession((prev) => ({ ...prev, [entry.id]: message }));
    } finally {
      setGeneratingSummaryFor(null);
    }
  };

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
                className="bg-white rounded-2xl border border-[#E8E4DE] shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (entry.type === 'session') {
                      void handleSessionClick(entry);
                    }
                  }}
                  className={`w-full text-left p-4 ${entry.type === 'session' ? 'hover:bg-[#FAF7F3] transition-colors' : ''}`}
                  disabled={entry.type === 'session' && generatingSummaryFor === entry.id}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      entry.type === 'session'
                        ? 'bg-[#F5F0EB]'
                        : 'bg-[#6B8F71]/10'
                    }`}>
                      {entry.type === 'session' ? (
                        <MessageCircle size={16} className="text-[#2C2A26]/40" />
                      ) : (
                        <BookOpen size={16} className="text-[#6B8F71]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[11px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                          entry.type === 'session'
                            ? 'bg-[#F5F0EB] text-[#2C2A26]/50'
                            : 'bg-[#6B8F71]/10 text-[#6B8F71]'
                        }`}>
                          {entry.type === 'session' ? 'Session' : 'Journal'}
                        </span>
                        <span className="text-[11px] text-[#2C2A26]/30">
                          {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        {entry.mood && (
                          <span className="text-[11px] text-[#D4A574] font-medium">· {entry.mood}</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-[#2C2A26] truncate">{entry.title}</p>
                      <p className="text-xs text-[#2C2A26]/50 mt-0.5 line-clamp-2">
                        {entry.type === 'session' && !entry.hasSummary
                          ? generatingSummaryFor === entry.id
                            ? 'Generating summary...'
                            : 'No summary yet. Tap to generate now.'
                          : entry.preview}
                      </p>
                      {entry.type === 'session' && summaryErrorBySession[entry.id] && (
                        <p className="text-[11px] text-[#A0493A] mt-1">{summaryErrorBySession[entry.id]}</p>
                      )}
                    </div>
                  </div>
                </button>
              </motion.div>
            ))}
          </div>
        ))
      )}
    </div>
  );
};
