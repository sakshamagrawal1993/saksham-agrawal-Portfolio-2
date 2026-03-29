import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, MessageCircle, Calendar } from 'lucide-react';
import { useMindCoachStore, MindCoachSession } from '../../../store/mindCoachStore';
import { SessionSummaryView } from '../Summary/SessionSummaryView';
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
    ? ((summary as Record<string, unknown>).session_takeaways as any[])
    : [];
  const tasks = Array.isArray((summary as Record<string, unknown>).extracted_tasks)
    ? ((summary as Record<string, unknown>).extracted_tasks as any[])
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

function buildStoredSummaryPayload(
  payload: Record<string, unknown> | null,
  sessionSummary: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!sessionSummary && !payload) return null;
  const extractedTasks = Array.isArray(payload?.extracted_tasks) ? payload.extracted_tasks : [];
  const extractedMemories = Array.isArray(payload?.extracted_memories) ? payload.extracted_memories : [];
  const caseNotes =
    payload?.case_notes && typeof payload.case_notes === 'object'
      ? payload.case_notes
      : null;
  const agentMeta =
    payload?.agent_meta && typeof payload.agent_meta === 'object'
      ? payload.agent_meta
      : null;
  const suggestedPathway =
    typeof payload?.suggested_pathway === 'string' ? payload.suggested_pathway : null;
  const pathwayDetails =
    payload?.pathway_details && typeof payload.pathway_details === 'object'
      ? payload.pathway_details
      : null;

  return {
    ...(sessionSummary ?? {}),
    session_summary: sessionSummary,
    case_notes: caseNotes,
    extracted_tasks: extractedTasks,
    extracted_memories: extractedMemories,
    agent_meta: agentMeta,
    suggested_pathway: suggestedPathway,
    pathway_details: pathwayDetails,
  };
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
  const [selectedSessionSummary, setSelectedSessionSummary] = useState<Record<string, unknown> | null>(null);
  const [selectedSession, setSelectedSession] = useState<MindCoachSession | null>(null);

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
      setSelectedSessionSummary(existingSummary);
      setSelectedSession(session);
      setSummaryScreenError(null);
      setSummaryScreenLoading(false);
      setShowSummaryScreen(true);
      return;
    }

    const profileId = profile?.id || session.profile_id;
    if (!profileId) return;

    setGeneratingSummaryFor(entry.id);
    setSelectedSessionSummary(null);
    setSelectedSession(session);
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

      const storedSummaryPayload = buildStoredSummaryPayload(payload, sessionSummary);
      const patch: Record<string, unknown> = { summary_data: storedSummaryPayload ?? sessionSummary };
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
                summary_data: storedSummaryPayload ?? sessionSummary,
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
    const handleClose = () => {
      setShowSummaryScreen(false);
      setSummaryScreenLoading(false);
      setSummaryScreenError(null);
    };

    if (summaryScreenLoading) {
      return (
        <div className="flex flex-col h-full bg-[#F9F6F2] items-center justify-center p-8">
          <div className="w-10 h-10 border-2 border-[#6B8F71] border-t-transparent rounded-full animate-spin" />
          <p className="mt-5 text-sm font-medium text-[#2C2A26]/70 text-center">Reconstructing your session reflection…</p>
          <p className="mt-2 text-xs text-[#2C2A26]/45 text-center">This may take a few seconds.</p>
        </div>
      );
    }

    if (summaryScreenError) {
      return (
        <div className="flex flex-col h-full bg-[#F9F6F2] p-5">
           <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-[#2C2A26]">Session Summary</h2>
            <button onClick={handleClose} className="text-sm text-[#2C2A26]/60 hover:text-[#2C2A26]">Back</button>
          </div>
          <div className="rounded-2xl border border-[#F3D0CB] bg-[#FFF9F8] p-4 text-center">
            <p className="text-sm font-medium text-[#A0493A]">Could not load summary</p>
            <p className="text-xs text-[#A0493A]/80 mt-1">{summaryScreenError}</p>
          </div>
        </div>
      );
    }

    if (!selectedSessionSummary) {
      return (
        <div className="flex flex-col h-full bg-[#F9F6F2] p-5">
           <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-[#2C2A26]">Session Summary</h2>
            <button onClick={handleClose} className="text-sm text-[#2C2A26]/60 hover:text-[#2C2A26]">Back</button>
          </div>
          <div className="rounded-2xl border border-[#E8E4DE] bg-white p-4">
            <p className="text-sm text-[#2C2A26]/60">No summary found for this session yet.</p>
          </div>
        </div>
      );
    }

    return (
      <SessionSummaryView
        summaryData={selectedSessionSummary}
        activeSession={selectedSession}
        journey={null} // Diary view might not have the journey context easily, but the summary data has what it needs
        profile={profile}
        persona={profile?.therapist_persona || 'maya'}
        onClose={handleClose}
        title="Session Summary"
      />
    );
  }

  return (
    <div className="relative p-5 space-y-5 min-h-screen overflow-x-hidden">
      {/* Zen Atmospheric Aura */}
      <div className="zen-aura-container">
        <img 
          src="https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/mind%20coach/hero_aura_zen_1774777549788.png" 
          alt="" 
          className="zen-aura-img"
        />
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative z-10">
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
                className="zen-glass rounded-2xl zen-card-shadow border border-[#E8E4DE]/50 group"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (entry.type === 'session') {
                      void handleSessionClick(entry);
                    }
                  }}
                  className={`w-full text-left p-4 rounded-2xl ${entry.type === 'session' ? 'hover:bg-white/20 transition-all cursor-pointer' : ''}`}
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
