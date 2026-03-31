import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  BookOpen,
  Wind,
  Brain,
  Flower2,
  Moon,
  MessageCircle as MsgIcon,
  Shield,
  Target,
  Heart,
  Sparkles,
  Settings,
  X,
  UserCircle,
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, YAxis, CartesianGrid } from 'recharts';
import { supabase } from '../../../lib/supabaseClient';
import {
  useMindCoachStore,
  type TaskType,
} from '../../../store/mindCoachStore';
import { PlanProposalModal } from '../PlanProposalModal';
import { PATHWAY_LABELS } from '../shared/pathwayLabels';
import { openOrCreateInProgressSession } from '../shared/sessionLifecycle';
import '../Atmosphere/MindCoachZen.css';

const MOOD_EMOJIS = [
  { score: 1, emoji: '😢', label: 'Awful' },
  { score: 2, emoji: '😕', label: 'Bad' },
  { score: 3, emoji: '😐', label: 'Okay' },
  { score: 4, emoji: '🙂', label: 'Good' },
  { score: 5, emoji: '😊', label: 'Great' },
];

const HERO_AURA_URL =
  'https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/mind%20coach/hero_aura_zen_1774777549788.png';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getTimeAwareSubheadline(): string {
  const h = new Date().getHours();
  if (h < 12) return 'A calm morning to begin your day.';
  if (h < 17) return 'A calm afternoon to steady your day.';
  return 'A calm evening to close your day.';
}

export const HomeScreen: React.FC = () => {
  const profile = useMindCoachStore((s) => s.profile);
  const journey = useMindCoachStore((s) => s.journey);
  const sessions = useMindCoachStore((s) => s.sessions);
  const currentPhase = useMindCoachStore((s) => s.currentPhaseNumber());
  const moodEntries = useMindCoachStore((s) => s.moodEntries);
  const setMoodEntries = useMindCoachStore((s) => s.setMoodEntries);
  const setActiveTab = useMindCoachStore((s) => s.setActiveTab);
  const activeTasks = useMindCoachStore((s) => s.activeTasks);
  const setActiveTasks = useMindCoachStore((s) => s.setActiveTasks);
  const setActiveSession = useMindCoachStore((s) => s.setActiveSession);
  const setSessions = useMindCoachStore((s) => s.setSessions);
  const setMessages = useMindCoachStore((s) => s.setMessages);
  const resetStore = useMindCoachStore((s) => s.reset);
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showProposal, setShowProposal] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isContinuingSession, setIsContinuingSession] = useState(false);

  const phases = journey?.phases ?? [];
  const currentPhaseData = phases[currentPhase - 1];
  const completedInPhaseRaw = sessions.filter(
    (s) =>
      s.session_state === 'completed' &&
      s.phase_number === currentPhase &&
      s.journey_id === (journey?.id ?? null),
  ).length;
  const totalInPhase = Math.max(1, currentPhaseData?.sessions?.length ?? 3);
  const completedInPhase = Math.min(totalInPhase, completedInPhaseRaw);

  const hasChosenPathway = journey?.pathway != null && journey.pathway !== 'engagement_rapport_and_assessment';
  const displayCurrentPhase = hasChosenPathway ? currentPhase + 1 : currentPhase;

  const proposedPathway = useMemo(() => {
    const candidate = journey?.discovery_state?.suggested_pathway;
    if (!candidate || candidate === 'engagement_rapport_and_assessment') return null;
    const inEngagement = !journey?.pathway || journey.pathway === 'engagement_rapport_and_assessment';
    return inEngagement ? candidate : null;
  }, [journey?.discovery_state?.suggested_pathway, journey?.pathway]);

  const moodChartData = useMemo(() => {
    const last7 = [...moodEntries].reverse().slice(-7);
    return last7.map((m) => ({ score: m.score, date: m.created_at }));
  }, [moodEntries]);
  const latestMoodScore = moodEntries[0]?.score ?? null;

  const THERAPIST_NAMES: Record<string, string> = {
    maya: 'Maya', alex: 'Alex', sage: 'Sage',
  };
  const therapistName = THERAPIST_NAMES[profile?.therapist_persona ?? 'maya'];
  const firstName = profile?.name?.split(' ')[0] ?? 'there';

  useEffect(() => {
    if (!showSettingsDrawer) return;
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setAuthEmail(data.user?.email ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [showSettingsDrawer]);

  useEffect(() => {
    if (!showSettingsDrawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSettingsDrawer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSettingsDrawer]);

  const pathwayLabel = useMemo(() => {
    const p = journey?.pathway;
    if (!p || p === 'engagement_rapport_and_assessment') return null;
    return PATHWAY_LABELS[p as keyof typeof PATHWAY_LABELS] ?? p.replace(/_/g, ' ');
  }, [journey?.pathway]);

  const journeyStateLabel = useMemo(() => {
    const s = journey?.journey_state;
    if (!s) return 'Active';
    if (s === 'completed') return 'Completed';
    if (s === 'archived') return 'Archived';
    return s.replace(/_/g, ' ');
  }, [journey?.journey_state]);

  const TASK_ICONS: Record<TaskType, React.ElementType> = {
    journaling: BookOpen,
    grounding: Wind,
    behavioral_activation: Target,
    cognitive_restructuring: Brain,
    sleep_hygiene: Moon,
    mindfulness: Flower2,
    communication: MsgIcon,
    boundary_setting: Shield,
    exposure: Target,
    self_compassion: Heart,
    general: Sparkles,
  };

  const handleMoodTap = async (score: number) => {
    if (!profile) return;
    const entry = {
      id: crypto.randomUUID(),
      profile_id: profile.id,
      score,
      notes: null,
      created_at: new Date().toISOString(),
    };
    setMoodEntries([entry, ...moodEntries]);
    await supabase.from('mind_coach_mood_entries').insert({ profile_id: profile.id, score });
  };

  const handleMarkTaskDone = useCallback(async (taskId: string) => {
    setActiveTasks(activeTasks.filter((t) => t.id !== taskId));
    await supabase.from('mind_coach_user_tasks').update({ status: 'completed' }).eq('id', taskId);
  }, [activeTasks, setActiveTasks]);

  const handleForgetMe = async () => {
    if (!profile) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('mind_coach_profiles').delete().eq('user_id', profile.user_id);
      if (error) throw error;
      resetStore();
      navigate('/project/mind-coach', { replace: true });
    } catch (err) {
      console.error('Error deleting profile:', err);
      setIsDeleting(false);
      alert('Failed to delete profile. Please try again.');
    }
  };

  const handleContinueWithTherapist = useCallback(async () => {
    if (!profile || isContinuingSession) return;
    setIsContinuingSession(true);
    try {
      const { session, initialMessages, reusedExisting } = await openOrCreateInProgressSession({
        profile,
        journey,
        sessions,
      });
      setActiveSession(session);
      setSessions(reusedExisting ? [session, ...sessions.filter((s) => s.id !== session.id)] : [session, ...sessions]);
      setMessages(initialMessages);
      setActiveTab('sessions');
    } catch (err) {
      console.error('Failed to continue with therapist:', err);
      const code = err instanceof Error ? err.message : '';
      if (code === 'journey_completed') {
        alert('You have completed this journey cycle. Review your summary in History.');
      } else if (code === 'no_active_journey') {
        alert('No active journey is available to continue right now.');
      } else {
        alert('Could not open your next session. Please try again.');
      }
    } finally {
      setIsContinuingSession(false);
    }
  }, [
    profile,
    isContinuingSession,
    sessions,
    journey,
    setActiveSession,
    setSessions,
    setMessages,
    setActiveTab,
  ]);

  const fivePhaseJourney = useMemo(() => {
    if (!hasChosenPathway || phases.length === 0) return null;
    const engagementCompletedSessions = sessions.filter(
      (s) => s.pathway === 'engagement_rapport_and_assessment' && s.session_state === 'completed',
    ).length;
    const engagementTotalSessions = Math.max(
      1,
      sessions.filter((s) => s.pathway === 'engagement_rapport_and_assessment').length,
    );
    const pathwayPhases = phases.map((phase, idx) => {
      const phaseNumber = phase.phase_number || idx + 1;
      const displayPhaseNumber = phaseNumber + 1;
      const completed = sessions.filter(
        (s) =>
          s.session_state === 'completed' &&
          s.phase_number === phaseNumber &&
          s.journey_id === (journey?.id ?? null),
      ).length;
      const total = Math.max(1, phase.sessions?.length ?? 3);
      return {
        phaseNumber: displayPhaseNumber,
        title: phase.title || `Phase ${phaseNumber}`,
        goal: phase.goal || '',
        completed,
        total,
        isCompleted: displayPhaseNumber < displayCurrentPhase,
        isCurrent: displayPhaseNumber === displayCurrentPhase,
      };
    });

    return [
      {
        phaseNumber: 1,
        title: 'Engagement & Rapport',
        goal: 'Establish trust, safety, and understanding before pathway work begins.',
        completed: engagementCompletedSessions,
        total: engagementTotalSessions,
        isCompleted: true,
        isCurrent: false,
      },
      ...pathwayPhases,
    ];
  }, [hasChosenPathway, phases, sessions, displayCurrentPhase]);

  return (
    <div className="relative px-6 pt-8 pb-24 overflow-x-hidden bg-gradient-to-b from-[#FBF8F4] via-[#F9F5EF] to-transparent">
      {/* Subtle top-half aura background */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[42%] overflow-hidden">
        <img
          src={HERO_AURA_URL}
          alt=""
          className="h-full w-full object-cover opacity-22 scale-[1.08]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-[#F9F5EF]/40 to-[#F9F5EF]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#F9F5EF]/45 via-transparent to-[#F9F5EF]/45" />
      </div>

      <div className="relative z-10 space-y-7">
        {/* Greeting — centered + premium */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative pt-1">
          <button
            type="button"
            onClick={() => setShowSettingsDrawer(true)}
            className="absolute right-0 top-0 w-8 h-8 rounded-full flex items-center justify-center text-[#2C2A26]/30 hover:text-[#2C2A26]/60 hover:bg-[#F5F0EB] transition-colors"
            aria-label="Open settings"
          >
            <Settings size={18} />
          </button>
          <div className="text-center">
            <h2 className="text-[30px] leading-[1.1] font-semibold zen-title">
              {getGreeting()}, {firstName}
            </h2>
            <p className="mt-2 text-xs text-[#2C2A26]/45">
              {getTimeAwareSubheadline()}
            </p>
          </div>
        </motion.div>

        {/* ── STATE B: Pathway chosen — 5-phase journey stepper ── */}
        {fivePhaseJourney && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DE] cursor-pointer hover:border-[#6B8F71]/35 transition-colors"
          role="button"
          tabIndex={0}
          onClick={() => setActiveTab('journey')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveTab('journey');
            }
          }}
        >
          {/* Horizontal 5-phase stepper */}
          <div className="flex items-center gap-1 mb-5">
            {fivePhaseJourney.map((phase, idx) => {
              const isLast = idx === fivePhaseJourney.length - 1;
              return (
                <React.Fragment key={phase.phaseNumber}>
                  <div className="flex flex-col items-center" style={{ minWidth: 0, flex: phase.isCurrent ? '1.2' : '1' }}>
                    <span
                      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[11px] font-semibold transition-all duration-500 ${
                        phase.isCompleted
                          ? 'bg-[#6B8F71] border-[#6B8F71] text-white'
                          : phase.isCurrent
                            ? 'bg-white border-[#6B8F71] text-[#6B8F71] zen-step-glow scale-110'
                            : 'bg-[#F5F0EB]/50 border-[#E8E4DE] text-[#2C2A26]/30'
                      }`}
                    >
                      {phase.isCompleted ? '✓' : phase.phaseNumber}
                    </span>
                    <span className={`text-[11px] mt-1.5 text-center leading-tight truncate w-full ${
                      phase.isCurrent
                        ? 'font-semibold text-[#2C2A26]'
                        : phase.isCompleted
                          ? 'font-medium text-[#2C2A26]/60'
                          : 'text-[#2C2A26]/30'
                    }`}>
                      {phase.title}
                    </span>
                  </div>
                  {!isLast && (
                    <span className={`h-[2px] flex-1 rounded-full -mt-5 transition-all duration-700 ${
                      phase.isCompleted ? 'bg-[#6B8F71]' : 'bg-[#E8E4DE]/60'
                    }`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Current phase detail */}
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40">
                Phase {displayCurrentPhase}
              </p>
              <h3 className="text-base font-semibold text-[#2C2A26] mt-0.5">
                {currentPhaseData?.title || 'Engagement & Rapport'}
              </h3>
              {currentPhaseData?.goal && (
                <p className="text-xs text-[#2C2A26]/50 mt-1 leading-relaxed">
                  {currentPhaseData.goal}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-medium">
                <span className="text-[#2C2A26]/40">Session progress</span>
                <span className="text-[#2C2A26]">{completedInPhase}/{totalInPhase}</span>
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: totalInPhase }, (_, idx) => (
                  <span
                    key={idx}
                    className={`h-1.5 flex-1 rounded-full ${
                      idx < completedInPhase ? 'bg-[#6B8F71]' : 'bg-[#E8E4DE]'
                    }`}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleContinueWithTherapist();
              }}
              disabled={isContinuingSession}
              className="w-full py-3 rounded-xl bg-[#6B8F71] text-white font-semibold text-sm hover:bg-[#5A7D60] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {isContinuingSession ? 'Opening session...' : `Continue with ${therapistName}`}
              <ArrowRight size={16} />
            </button>
          </div>
        </motion.div>
        )}

        {/* ── STATE A: No pathway — simplified hero ── */}
        {!hasChosenPathway && journey && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 }}
          className="zen-glass rounded-2xl p-5 zen-card-shadow cursor-pointer hover:border-[#6B8F71]/35 transition-all duration-500"
          role="button"
          tabIndex={0}
          onClick={() => setActiveTab('journey')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveTab('journey');
            }
          }}
        >
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#2C2A26]/45">
                Journey roadmap
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                {Array.from({ length: 5 }, (_, idx) => {
                  const phaseNum = idx + 1;
                  const active = phaseNum === 1;
                  return (
                    <React.Fragment key={phaseNum}>
                      <span
                        className={`h-6 min-w-6 px-1 rounded-full border text-[10px] font-semibold flex items-center justify-center ${
                          active
                            ? 'bg-[#6B8F71] border-[#6B8F71] text-white shadow-sm'
                            : 'bg-[#F5F0EB]/45 border-[#E8E4DE]/80 text-[#2C2A26]/35'
                        }`}
                      >
                        {phaseNum}
                      </span>
                      {phaseNum < 5 && (
                        <span className="h-[2px] flex-1 rounded-full bg-[#E8E4DE]/70" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-[#2C2A26]/50 leading-relaxed">
                Phases 2-5 reveal after pathway selection.
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40">
                Current focus
              </p>
              <h3 className="text-base font-semibold text-[#2C2A26] mt-0.5">
                {currentPhaseData?.title || 'Engagement & Rapport'}
              </h3>
              <p className="text-xs text-[#2C2A26]/50 mt-1 leading-relaxed">
                {currentPhaseData?.goal || 'Establishing trust and understanding your world.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-medium">
                <span className="text-[#2C2A26]/40">Session progress</span>
                <span className="text-[#2C2A26]">{completedInPhase}/{totalInPhase}</span>
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: totalInPhase }, (_, idx) => (
                  <span
                    key={idx}
                    className={`h-1.5 flex-1 rounded-full ${
                      idx < completedInPhase ? 'bg-[#6B8F71]' : 'bg-[#E8E4DE]'
                    }`}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleContinueWithTherapist();
              }}
              disabled={isContinuingSession}
              className="w-full py-3 rounded-xl bg-[#6B8F71] text-white font-semibold text-sm hover:bg-[#5A7D60] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {isContinuingSession ? 'Opening session...' : `Continue with ${therapistName}`}
              <ArrowRight size={16} />
            </button>
          </div>
        </motion.div>
        )}

        {/* Suggested Pathway — only if proposal exists and no pathway chosen */}
        {proposedPathway && (
        <motion.button
          type="button"
          onClick={() => setShowProposal(true)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="w-full zen-glass-heavy rounded-2xl p-5 zen-card-shadow text-left hover:border-[#6B8F71]/30 transition-all duration-500"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B8F71]">
                Suggested Pathway
              </p>
              <h3 className="text-base font-semibold text-[#2C2A26] mt-1">
                {PATHWAY_LABELS[proposedPathway] || proposedPathway.replace(/_/g, ' ')}
              </h3>
              <p className="text-xs text-[#2C2A26]/50 mt-1.5 leading-relaxed">
                Tap to view the 4-phase plan and choose this pathway when you feel ready.
              </p>
            </div>
            <span className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#6B8F71] text-white">
              Review
            </span>
          </div>
        </motion.button>
        )}

        {/* ── Below the fold: Homework, Mood, Trend ── */}

        {/* Homework Tasks */}
        {activeTasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="space-y-3"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40">
            Between sessions
          </p>
          {activeTasks.map((task, i) => {
            const Icon = TASK_ICONS[task.task_type as TaskType] || Sparkles;
            const dueDate = new Date(task.task_end_date);
            const isOverdue = dueDate < new Date();
            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.04 }}
                className="zen-glass rounded-2xl p-5 zen-card-shadow border border-[#E8E4DE]/50"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#F5F0EB] flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-[#2C2A26]/50" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#2C2A26]">
                      {task.dynamic_title || task.task_name}
                    </p>
                    <p className="text-xs text-[#2C2A26]/50 mt-0.5 line-clamp-2">
                      {task.dynamic_description || task.task_description}
                    </p>
                    <span className={`inline-block mt-2 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      isOverdue ? 'bg-red-50 text-red-500' : 'bg-[#F5F0EB] text-[#2C2A26]/50'
                    }`}>
                      {task.task_frequency} · Due {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <button
                    onClick={() => handleMarkTaskDone(task.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F5F0EB] transition-colors shrink-0"
                    title="Mark as done"
                  >
                    <CheckCircle2 size={20} className="text-[#E8E4DE] hover:text-[#6B8F71]" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
        )}

        {/* Mood Check-in */}
        <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="relative overflow-hidden rounded-2xl border border-[#E8E4DE] bg-gradient-to-br from-white via-[#FCFAF8] to-[#F5F0EB]/65 p-5 shadow-sm"
      >
        <div className="absolute -top-14 -right-10 h-28 w-28 rounded-full bg-[#6B8F71]/8 blur-2xl pointer-events-none" />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40">
            Mood check-in
          </p>
          <p className="text-sm text-[#2C2A26]/75 mt-1">
            How are you feeling right now?
          </p>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {MOOD_EMOJIS.map(({ score, emoji, label }) => {
              const isLatest = latestMoodScore === score;
              return (
                <button
                  key={score}
                  onClick={() => handleMoodTap(score)}
                  className={`group rounded-xl px-2 py-2 border transition-all ${
                    isLatest
                      ? 'border-[#6B8F71]/40 bg-[#6B8F71]/8'
                      : 'border-[#E8E4DE] bg-white/70 hover:bg-white hover:border-[#6B8F71]/20'
                  }`}
                  aria-label={`Set mood ${label}`}
                >
                  <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-[#F5F0EB] text-xl group-hover:scale-105 transition-transform">
                    {emoji}
                  </span>
                  <span className="mt-1 block text-[10px] font-medium text-[#2C2A26]/55">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
        </motion.div>

        {/* Mood Trend — only if enough data */}
        {moodChartData.length >= 3 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="rounded-2xl p-5 shadow-sm border border-[#E8E4DE] bg-gradient-to-br from-white via-[#FCFAF8] to-[#F4F8F4]"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40">
              Mood trend
            </p>
            <span className="text-[10px] text-[#2C2A26]/45 bg-white/80 border border-[#E8E4DE] rounded-full px-2 py-0.5">
              Last {Math.min(7, moodChartData.length)} check-ins
            </span>
          </div>
          <p className="mb-2 text-[10px] text-[#2C2A26]/45">
            😢 · 😕 · 😐 · 🙂 · 😊
          </p>
          <ResponsiveContainer width="100%" height={90}>
            <AreaChart data={moodChartData}>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="#DCD5CB"
                strokeOpacity={0.7}
              />
              <YAxis
                type="number"
                domain={[1, 5]}
                ticks={[1, 2, 3, 4, 5]}
                width={28}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 14, fill: '#2C2A26' }}
                tickFormatter={(value) => {
                  if (Number(value) === 1) return '😢';
                  if (Number(value) === 2) return '😕';
                  if (Number(value) === 3) return '😐';
                  if (Number(value) === 4) return '🙂';
                  if (Number(value) === 5) return '😊';
                  return '';
                }}
              />
              <defs>
                <linearGradient id="moodGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6B8F71" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#6B8F71" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="score"
                stroke="#6B8F71"
                strokeWidth={2}
                fill="url(#moodGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
        )}

      </div>

      {/* Final Overlay Screens */}
      <AnimatePresence>
        {showProposal && (
          <PlanProposalModal
            onClose={() => setShowProposal(false)}
            onAccept={() => {
              setShowProposal(false);
              setActiveTab('sessions');
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSettingsDrawer && (
          <div className="fixed inset-0 z-[45] flex justify-end">
            <motion.button
              type="button"
              aria-label="Close settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-[#2C2A26]/35 backdrop-blur-[2px]"
              onClick={() => setShowSettingsDrawer(false)}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-labelledby="mind-coach-settings-title"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="relative z-[46] flex h-full w-[min(100%,22rem)] flex-col border-l border-[#E8E4DE] bg-[#FBF8F4] shadow-[-8px_0_32px_rgba(44,42,38,0.08)]"
            >
              <div className="zen-glass flex shrink-0 items-center justify-between gap-3 border-b border-white/50 px-4 py-3 backdrop-blur-md">
                <div className="min-w-0">
                  <p id="mind-coach-settings-title" className="text-sm font-semibold text-[#2C2A26]">
                    Settings
                  </p>
                  <p className="text-[11px] text-[#2C2A26]/45 truncate">Account & privacy</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettingsDrawer(false)}
                  className="shrink-0 rounded-full p-2 text-[#2C2A26]/45 hover:bg-white/60 hover:text-[#2C2A26]"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                <section className="zen-glass rounded-2xl border border-white/60 p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <UserCircle size={18} className="text-[#6B8F71]" />
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/45">
                      Account
                    </p>
                  </div>
                  <dl className="space-y-2.5 text-sm">
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-[#2C2A26]/40">Name</dt>
                      <dd className="text-[#2C2A26] font-medium">{profile?.name ?? '—'}</dd>
                    </div>
                    {authEmail && (
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-[#2C2A26]/40">Email</dt>
                        <dd className="text-[#2C2A26]/80 break-all">{authEmail}</dd>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-[#2C2A26]/40">Age</dt>
                        <dd className="text-[#2C2A26]/80">{profile?.age != null ? String(profile.age) : '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-[#2C2A26]/40">Gender</dt>
                        <dd className="text-[#2C2A26]/80">{profile?.gender?.trim() ? profile.gender : '—'}</dd>
                      </div>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-[#2C2A26]/40">Therapist</dt>
                      <dd className="text-[#2C2A26]/80">{therapistName}</dd>
                    </div>
                    {pathwayLabel && (
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-[#2C2A26]/40">Pathway</dt>
                        <dd className="text-[#2C2A26]/80">{pathwayLabel}</dd>
                      </div>
                    )}
                    {journey && (
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-[#2C2A26]/40">Journey</dt>
                        <dd className="text-[#2C2A26]/80">
                          {journey.title || 'Your journey'} · {journeyStateLabel}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-[#2C2A26]/40 mb-1">Focus areas</dt>
                      <dd>
                        {profile?.concerns?.length ? (
                          <ul className="flex flex-wrap gap-1.5">
                            {profile.concerns.map((c) => (
                              <li
                                key={c}
                                className="rounded-full bg-[#F5F0EB] px-2.5 py-0.5 text-[11px] text-[#2C2A26]/75"
                              >
                                {c}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-[#2C2A26]/50">—</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </section>

                <section className="zen-glass rounded-2xl border border-white/60 p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield size={18} className="text-[#6B8F71]" />
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/45">
                      Privacy & data
                    </p>
                  </div>
                  <p className="text-xs text-[#2C2A26]/60 leading-relaxed mb-4">
                    Your conversations and journal stay tied to this Mind Coach profile. You can remove everything at any time.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSettingsDrawer(false);
                      setShowConfirm(true);
                    }}
                    className="w-full rounded-xl border border-red-200 bg-white/80 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete my profile
                  </button>
                  <p className="mt-2 text-[10px] text-[#2C2A26]/40 text-center leading-relaxed">
                    Permanently removes chat history, journal, mood data, and progress.
                  </p>
                </section>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#2C2A26]/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-5"
            >
              <div className="space-y-2 text-center">
                <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Shield size={24} className="text-red-500" />
                </div>
                <h3 className="text-xl font-semibold text-[#2C2A26]">Are you sure?</h3>
                <p className="text-sm text-[#2C2A26]/60 leading-relaxed">
                  This will permanently delete your Mind Coach profile and all your data.
                </p>
              </div>
              <div className="space-y-2.5">
                <button
                  disabled={isDeleting}
                  onClick={handleForgetMe}
                  className="w-full py-3 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Yes, Delete Everything'}
                </button>
                <button
                  disabled={isDeleting}
                  onClick={() => setShowConfirm(false)}
                  className="w-full py-3 rounded-xl bg-[#F5F0EB] text-[#2C2A26] font-medium hover:bg-[#E8E4DE] active:scale-[0.98] transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
