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

function hasUsableSessionSummary(raw: unknown): boolean {
  const summary = normalizeServerSessionSummary(raw);
  if (!summary) return false;
  const title = typeof summary.title === 'string' ? summary.title.trim() : '';
  const openingReflection =
    typeof summary.opening_reflection === 'string' ? summary.opening_reflection.trim() : '';
  const isKnownPlaceholder =
    title.toLowerCase() === 'session wrap-up' &&
    openingReflection.toLowerCase().includes('placeholder summary');
  if (isKnownPlaceholder) return false;
  const takeaways = Array.isArray((summary as Record<string, unknown>).session_takeaways)
    ? (summary as Record<string, unknown>).session_takeaways
    : [];
  const tasks = Array.isArray((summary as Record<string, unknown>).extracted_tasks)
    ? (summary as Record<string, unknown>).extracted_tasks
    : [];
  return !!(title || openingReflection || takeaways.length > 0 || tasks.length > 0);
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
  const [showSummaryScreen, setShowSummaryScreen] = useState(false);
  const [summaryScreenLoading, setSummaryScreenLoading] = useState(false);
  const [summaryScreenError, setSummaryScreenError] = useState<string | null>(null);
  const [selectedSessionTitle, setSelectedSessionTitle] = useState<string>('Session Summary');
  const [selectedSessionSummary, setSelectedSessionSummary] = useState<Record<string, unknown> | null>(null);

  const entries = useMemo(() => {
    const sEntries: DiaryEntry[] = sessions
      .filter((s) => s.session_state === 'completed')
      .map((s) => {
        const data = normalizeServerSessionSummary(s.summary_data);
        const hasSummary = hasUsableSessionSummary(s.summary_data);
        const title =
          (typeof data?.title === 'string' && data.title) ||
          s.dynamic_theme ||
          'Session';
        const preview =
          (hasSummary && typeof data?.opening_reflection === 'string' && data.opening_reflection) ||
          (s.ended_at ? 'Session completed — summary will appear when available.' : 'Session completed');
        return {
          id: s.id,
          type: 'session' as const,
          title,
          preview,
          date: s.ended_at || s.started_at,
          hasSummary,
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
    const session = sessions.find((s) => s.id === entry.id);
    if (!session) return;
    if (generatingSummaryFor === entry.id) return;

    const existingSummary = normalizeServerSessionSummary(session.summary_data);
    const existingIsUsable = hasUsableSessionSummary(session.summary_data);
    if (existingIsUsable && existingSummary) {
      setSelectedSessionTitle(session.dynamic_theme || 'Session Summary');
      setSelectedSessionSummary(existingSummary);
      setSummaryScreenError(null);
      setSummaryScreenLoading(false);
      setShowSummaryScreen(true);
      return;
    }

    const profileId = profile?.id || session.profile_id;
    if (!profileId) return;

    setGeneratingSummaryFor(entry.id);
    setSelectedSessionTitle(session.dynamic_theme || 'Session Summary');
    setSelectedSessionSummary(null);
    setSummaryScreenError(null);
    setSummaryScreenLoading(true);
    setShowSummaryScreen(true);
    setSummaryErrorBySession((prev) => ({ ...prev, [entry.id]: '' }));

    try {
      const { data: messageRows } = await supabase
        .from('mind_coach_messages')
        .select('role,content,created_at')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true });
      const messagesPayload = (messageRows ?? []).map((m: any) => ({
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      }));
      const transcript = messagesPayload
        .map((m: any) => `${m.role === 'user' ? 'Client' : 'Therapist'}: ${m.content ?? ''}`)
        .join('\n');

      const { data, error } = await supabase.functions.invoke('mind-coach-session-end', {
        body: {
          session_id: session.id,
          profile_id: profileId,
          messages: messagesPayload,
          transcript,
          profile: profile
            ? {
                id: profile.id,
                name: profile.name,
                age: profile.age,
                gender: profile.gender,
                concerns: profile.concerns,
                therapist_persona: profile.therapist_persona,
              }
            : null,
          session: {
            pathway: session.pathway,
            dynamic_theme: session.dynamic_theme,
            session_number: session.session_number,
          },
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

      setSelectedSessionSummary(sessionSummary);
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
      setSummaryScreenError(message);
    } finally {
      setSummaryScreenLoading(false);
      setGeneratingSummaryFor(null);
    }
  };

  if (showSummaryScreen) {
    const openingReflection =
      selectedSessionSummary && typeof selectedSessionSummary.opening_reflection === 'string'
        ? selectedSessionSummary.opening_reflection
        : '';
    const takeaways = selectedSessionSummary && Array.isArray((selectedSessionSummary as Record<string, unknown>).session_takeaways)
      ? ((selectedSessionSummary as Record<string, unknown>).session_takeaways as unknown[]).map((s) => String(s)).filter(Boolean)
      : [];
    const tasks = selectedSessionSummary && Array.isArray((selectedSessionSummary as Record<string, unknown>).extracted_tasks)
      ? ((selectedSessionSummary as Record<string, unknown>).extracted_tasks as Record<string, unknown>[])
      : [];

    return (
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#2C2A26]">Session Summary</h2>
            <p className="text-xs text-[#2C2A26]/40 mt-1">{selectedSessionTitle}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowSummaryScreen(false);
              setSummaryScreenLoading(false);
              setSummaryScreenError(null);
            }}
            className="text-sm text-[#2C2A26]/60 hover:text-[#2C2A26]"
          >
            Back
          </button>
        </div>

        {summaryScreenLoading ? (
          <div className="min-h-[45vh] flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-[#6B8F71] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[#2C2A26]/60">Generating your session summary...</p>
          </div>
        ) : summaryScreenError ? (
          <div className="rounded-2xl border border-[#F3D0CB] bg-[#FFF9F8] p-4">
            <p className="text-sm font-medium text-[#A0493A]">Could not load summary</p>
            <p className="text-xs text-[#A0493A]/80 mt-1">{summaryScreenError}</p>
          </div>
        ) : selectedSessionSummary ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-[#E8E4DE] bg-white p-4">
              <p className="text-sm font-semibold text-[#2C2A26]">
                {typeof selectedSessionSummary.title === 'string' ? selectedSessionSummary.title : 'Session Summary'}
              </p>
              {openingReflection && (
                <p className="text-sm text-[#2C2A26]/75 mt-2 leading-relaxed">{openingReflection}</p>
              )}
            </div>
            {takeaways.length > 0 && (
              <div className="rounded-2xl border border-[#E8E4DE] bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-2">Takeaways</p>
                <div className="space-y-1.5">
                  {takeaways.slice(0, 5).map((item, idx) => (
                    <p key={`${item}-${idx}`} className="text-xs text-[#2C2A26]/75">• {item}</p>
                  ))}
                </div>
              </div>
            )}
            {tasks.length > 0 && (
              <div className="rounded-2xl border border-[#E8E4DE] bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-2">Try this week</p>
                <div className="space-y-2">
                  {tasks.slice(0, 3).map((task, idx) => (
                    <div key={idx}>
                      <p className="text-sm text-[#2C2A26] font-medium">
                        {String(task.dynamic_title || task.task_name || `Task ${idx + 1}`)}
                      </p>
                      <p className="text-xs text-[#2C2A26]/60 mt-0.5">
                        {String(task.dynamic_description || task.task_description || '')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-[#E8E4DE] bg-white p-4">
            <p className="text-sm text-[#2C2A26]/60">No summary found for this session yet.</p>
          </div>
        )}
      </div>
    );
  }

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
                  className={`w-full text-left p-4 ${entry.type === 'session' ? 'hover:bg-[#FAF7F3] transition-colors cursor-pointer' : ''}`}
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
