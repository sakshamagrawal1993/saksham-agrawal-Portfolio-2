import React, { useMemo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, CheckCircle2, BookOpen, Wind, Brain, Flower2, Moon, MessageCircle as MsgIcon, Shield, Target, Heart, Sparkles, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { supabase } from '../../../lib/supabaseClient';
import {
  useMindCoachStore,
  type TaskType,
} from '../../../store/mindCoachStore';
import { PlanProposalModal } from '../PlanProposalModal';
import { PATHWAY_LABELS } from '../shared/pathwayLabels';
import { openOrCreateInProgressSession } from '../shared/sessionLifecycle';

const MOOD_EMOJIS = [
  { score: 1, emoji: '😢', label: 'Awful' },
  { score: 2, emoji: '😕', label: 'Bad' },
  { score: 3, emoji: '😐', label: 'Okay' },
  { score: 4, emoji: '🙂', label: 'Good' },
  { score: 5, emoji: '😊', label: 'Great' },
];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
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
  const [showSettings, setShowSettings] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [moodExpanded, setMoodExpanded] = useState(false);
  const [isContinuingSession, setIsContinuingSession] = useState(false);

  const phases = journey?.phases ?? [];
  const currentPhaseData = phases[currentPhase - 1];
  const completedInPhase = sessions.filter(
    (s) => s.session_state === 'completed' && s.phase_number === currentPhase
  ).length;
  const totalInPhase = currentPhaseData?.sessions?.length ?? 3;

  const hasChosenPathway = journey?.pathway != null && journey.pathway !== 'engagement_rapport_and_assessment';

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

  const THERAPIST_NAMES: Record<string, string> = {
    maya: 'Maya', alex: 'Alex', sage: 'Sage',
  };
  const therapistName = THERAPIST_NAMES[profile?.therapist_persona ?? 'maya'];
  const firstName = profile?.name?.split(' ')[0] ?? 'there';

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
        currentPhase,
        sessions,
      });
      setActiveSession(session);
      setSessions(reusedExisting ? [session, ...sessions.filter((s) => s.id !== session.id)] : [session, ...sessions]);
      setMessages(initialMessages);
      setActiveTab('sessions');
    } catch (err) {
      console.error('Failed to continue with therapist:', err);
      alert('Could not open your next session. Please try again.');
    } finally {
      setIsContinuingSession(false);
    }
  }, [
    profile,
    isContinuingSession,
    sessions,
    currentPhase,
    journey,
    setActiveSession,
    setSessions,
    setMessages,
    setActiveTab,
  ]);

  const fivePhaseJourney = useMemo(() => {
    if (!hasChosenPathway || phases.length === 0) return null;
    return phases.map((phase, idx) => {
      const phaseNumber = phase.phase_number || idx + 1;
      const completed = sessions.filter(
        (s) => s.session_state === 'completed' && s.phase_number === phaseNumber,
      ).length;
      const total = Math.max(1, phase.sessions?.length ?? 3);
      return {
        phaseNumber,
        title: phase.title || `Phase ${phaseNumber}`,
        goal: phase.goal || '',
        completed,
        total,
        isCompleted: phaseNumber < currentPhase,
        isCurrent: phaseNumber === currentPhase,
      };
    });
  }, [hasChosenPathway, phases, sessions, currentPhase]);

  return (
    <div className="px-6 pt-8 pb-24 space-y-8">
      {/* Greeting — clean, no quote */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[#2C2A26]">
            {getGreeting()}, {firstName}
          </h2>
          <button
            type="button"
            onClick={() => setShowSettings((s) => !s)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#2C2A26]/30 hover:text-[#2C2A26]/60 hover:bg-[#F5F0EB] transition-colors"
            aria-label="Settings"
          >
            <Settings size={18} />
          </button>
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
                      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[11px] font-semibold transition-colors ${
                        phase.isCompleted
                          ? 'bg-[#6B8F71] border-[#6B8F71] text-white'
                          : phase.isCurrent
                            ? 'bg-white border-[#6B8F71] text-[#6B8F71]'
                            : 'bg-[#F5F0EB] border-[#E8E4DE] text-[#2C2A26]/30'
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
                    <span className={`h-[2px] flex-1 rounded-full -mt-5 ${
                      phase.isCompleted ? 'bg-[#6B8F71]' : 'bg-[#E8E4DE]'
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
                Phase {currentPhase}
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
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40">
                Phase {currentPhase}
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
          className="w-full bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DE] text-left hover:border-[#6B8F71]/30 transition-colors"
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
                className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DE]"
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

      {/* Mood Check-in — collapsed by default */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="bg-white rounded-2xl shadow-sm border border-[#E8E4DE] overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setMoodExpanded((s) => !s)}
          className="w-full px-5 py-4 flex items-center justify-between text-left"
        >
          <p className="text-sm font-medium text-[#2C2A26]">How are you feeling?</p>
          {moodExpanded
            ? <ChevronUp size={16} className="text-[#2C2A26]/30" />
            : <ChevronDown size={16} className="text-[#2C2A26]/30" />
          }
        </button>
        <AnimatePresence>
          {moodExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-4">
                <div className="flex justify-between">
                  {MOOD_EMOJIS.map(({ score, emoji, label }) => (
                    <button
                      key={score}
                      onClick={() => handleMoodTap(score)}
                      className="flex flex-col items-center gap-1 group"
                    >
                      <span className="text-2xl group-hover:scale-110 transition-transform">{emoji}</span>
                      <span className="text-[11px] text-[#2C2A26]/40">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Mood Trend — only if enough data */}
      {moodChartData.length >= 3 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DE]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-3">
            Mood trend
          </p>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={moodChartData}>
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

      {/* ── Settings section (collapsed) ── */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col items-center gap-3 py-4">
              <button
                onClick={() => setShowConfirm(true)}
                className="px-5 py-2 text-xs font-medium text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-red-200"
              >
                Delete my profile
              </button>
              <p className="text-[11px] text-[#2C2A26]/30 text-center max-w-[260px]">
                This permanently removes all chat history, journal entries, and progress.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
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
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#2C2A26]/20 backdrop-blur-sm">
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
