import React, { useMemo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, CheckCircle2, BookOpen, Wind, Brain, Flower2, Moon, MessageCircle as MsgIcon, Shield, Target, Heart, Lock } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { supabase } from '../../../lib/supabaseClient';
import {
  useMindCoachStore,
  type TaskType,
  UNLOCK_MAP,
  firstPhaseWhereFeatureUnlocks,
  type TabId,
} from '../../../store/mindCoachStore';
import { PlanProposalModal } from '../PlanProposalModal';

const QUOTES = [
  '"The wound is the place where the Light enters you." — Rumi',
  '"You don\'t have to control your thoughts. You just have to stop letting them control you." — Dan Millman',
  '"Almost everything will work again if you unplug it for a few minutes, including you." — Anne Lamott',
  '"What lies behind us and what lies before us are tiny matters compared to what lies within us." — Ralph Waldo Emerson',
  '"You are allowed to be both a masterpiece and a work in progress simultaneously." — Sophia Bush',
  '"Healing is not linear." — Unknown',
];

const MOOD_EMOJIS = [
  { score: 1, emoji: '😢', label: 'Awful' },
  { score: 2, emoji: '😕', label: 'Bad' },
  { score: 3, emoji: '😐', label: 'Okay' },
  { score: 4, emoji: '🙂', label: 'Good' },
  { score: 5, emoji: '😊', label: 'Great' },
];

const PATHWAY_LABELS: Record<string, string> = {
  anxiety_and_stress_management: 'Anxiety & Stress Management',
  depression_and_behavioral_activation: 'Depression & Motivation',
  sleep_and_insomnia: 'Sleep & Insomnia',
  trauma_processing_and_ptsd: 'Trauma Processing',
  grief_and_loss_processing: 'Grief & Loss',
  relationship_conflict_and_interpersonal: 'Relationship Conflict',
  self_worth_and_self_esteem: 'Self-Worth & Esteem',
  social_anxiety_and_isolation: 'Social Anxiety',
  panic_and_physical_anxiety_symptoms: 'Panic & Physical Anxiety',
  emotion_regulation_and_distress_tolerance: 'Emotion Regulation',
  overthinking_rumination_and_cognitive_restructuring: 'Overthinking & Rumination',
  family_conflict_and_dynamics: 'Family Conflict',
  anger_management: 'Anger Management',
  boundary_setting_and_assertiveness: 'Boundary Setting',
  life_transition_and_adjustment: 'Life Transitions',
  identity_and_self_concept: 'Identity & Self-Concept',
  abuse_and_safety: 'Abuse & Safety',
  health_anxiety_and_somatic_symptoms: 'Health Anxiety',
  crisis_intervention_and_suicide_prevention: 'Crisis Support',
  engagement_rapport_and_assessment: 'Continued Exploration',
};

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
  const resetStore = useMindCoachStore((s) => s.reset);
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showProposal, setShowProposal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);

  const unlockedTabs =
    UNLOCK_MAP[Math.min(Math.max(currentPhase, 1), 4)] ?? UNLOCK_MAP[1];
  const toolkitShortcutItems = useMemo(
    () =>
      [
        { feature: 'journal', label: 'Journal', tab: 'journal' as const },
        { feature: 'assessments', label: 'Assessments', tab: 'assessments' as const },
        { feature: 'exercises', label: 'Exercises', tab: 'exercises' as const },
      ] as const,
    [],
  );
  const phases = journey?.phases ?? [];
  const currentPhaseData = phases[currentPhase - 1];
  const phaseProgress = useMemo(
    () =>
      phases.map((phase, idx) => {
        const phaseNumber = phase.phase_number || idx + 1;
        const completed = sessions.filter(
          (s) => s.session_state === 'completed' && s.phase_number === phaseNumber,
        ).length;
        const total = Math.max(1, phase.sessions?.length ?? 3);
        return { phaseNumber, phase, completed, total };
      }),
    [phases, sessions],
  );
  const completedInPhase = sessions.filter(
    (s) => s.session_state === 'completed' && s.phase_number === currentPhase
  ).length;
  const totalInPhase = currentPhaseData?.sessions?.length ?? 3;
  const progressPct = Math.round((completedInPhase / totalInPhase) * 100);
  const proposedPathway = useMemo(() => {
    const candidate = journey?.discovery_state?.suggested_pathway;
    if (!candidate || candidate === 'engagement_rapport_and_assessment') return null;
    const inEngagement = !journey?.pathway || journey.pathway === 'engagement_rapport_and_assessment';
    return inEngagement ? candidate : null;
  }, [journey?.discovery_state?.suggested_pathway, journey?.pathway]);

  const nextSessionTopic = currentPhaseData?.sessions?.[completedInPhase];
  const nextPhasePreviews = phaseProgress.filter((p) => p.phaseNumber > currentPhase).slice(0, 2);

  const moodChartData = useMemo(() => {
    const last7 = [...moodEntries].reverse().slice(-7);
    return last7.map((m) => ({ score: m.score, date: m.created_at }));
  }, [moodEntries]);

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

    await supabase.from('mind_coach_mood_entries').insert({
      profile_id: profile.id,
      score,
    });
  };

  const firstName = profile?.name?.split(' ')[0] ?? 'there';

  const THERAPIST_COLORS: Record<string, string> = {
    maya: '#B4A7D6',
    alex: '#D4A574',
    sage: '#6B8F71',
  };
  const THERAPIST_NAMES: Record<string, string> = {
    maya: 'Maya',
    alex: 'Alex',
    sage: 'Sage',
  };
  const therapistColor = THERAPIST_COLORS[profile?.therapist_persona ?? 'maya'];
  const therapistName = THERAPIST_NAMES[profile?.therapist_persona ?? 'maya'];

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

  const handleMarkTaskDone = useCallback(async (taskId: string) => {
    setActiveTasks(activeTasks.filter((t) => t.id !== taskId));
    await supabase
      .from('mind_coach_user_tasks')
      .update({ status: 'completed' })
      .eq('id', taskId);
  }, [activeTasks, setActiveTasks]);

  const handleForgetMe = async () => {
    if (!profile) return;
    setIsDeleting(true);
    try {
      // Deleting the profile will cascade delete journeys, sessions, messages, etc.
      const { error } = await supabase
        .from('mind_coach_profiles')
        .delete()
        .eq('user_id', profile.user_id);
      
      if (error) throw error;

      // Reset store and redirect
      resetStore();
      navigate('/project/mind-coach', { replace: true });
    } catch (err) {
      console.error('Error deleting profile:', err);
      setIsDeleting(false);
      alert('Failed to delete profile. Please try again.');
    }
  };

  return (
    <div className="p-5 pb-20 space-y-6">
      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-2xl font-semibold text-[#2C2A26]">
          {getGreeting()}, {firstName}
        </h2>
        <p className="text-[#2C2A26]/40 text-sm italic mt-1.5 leading-relaxed">{quote}</p>
      </motion.div>

      {proposedPathway && (
        <motion.button
          type="button"
          onClick={() => setShowProposal(true)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="w-full bg-white rounded-2xl p-4 shadow-sm border border-[#6B8F71]/20 text-left hover:border-[#6B8F71]/35 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold tracking-[0.1em] text-[#6B8F71] uppercase">
                Suggested Pathway
              </p>
              <h3 className="text-base font-semibold text-[#2C2A26] mt-1">
                {PATHWAY_LABELS[proposedPathway] || proposedPathway.replace(/_/g, ' ')}
              </h3>
              <p className="text-xs text-[#2C2A26]/50 mt-1.5">
                You are still in emotional support and rapport. Tap to view the 4-phase plan and choose this pathway when ready.
              </p>
            </div>
            <span className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-[#6B8F71] text-white">
              Review
            </span>
          </div>
        </motion.button>
      )}

      {/* Mood Check-in */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E4DE]"
      >
        <p className="text-sm font-medium text-[#2C2A26] mb-3">How are you feeling right now?</p>
        <div className="flex justify-between px-2">
          {MOOD_EMOJIS.map(({ score, emoji, label }) => (
            <button
              key={score}
              onClick={() => handleMoodTap(score)}
              className="flex flex-col items-center gap-1 group"
            >
              <span className="text-2xl group-hover:scale-110 transition-transform">{emoji}</span>
              <span className="text-[10px] text-[#2C2A26]/40">{label}</span>
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="flex flex-wrap gap-2"
      >
        <button
          type="button"
          onClick={() => setActiveTab('toolkit')}
          className="px-3.5 py-2 rounded-full text-xs font-medium bg-[#6B8F71]/8 border border-[#6B8F71]/25 text-[#5a7a5f] hover:border-[#6B8F71]/40 hover:text-[#2C2A26] transition-colors"
        >
          Toolkit
        </button>
        {toolkitShortcutItems.map(({ feature, label, tab }) => {
          const isOpen = unlockedTabs.includes(feature);
          const needPhase = firstPhaseWhereFeatureUnlocks(feature);
          return (
            <button
              key={tab}
              type="button"
              disabled={!isOpen}
              onClick={() => setActiveTab(tab)}
              aria-label={
                isOpen ? label : `${label}, unlocks in phase ${needPhase}. Complete sessions in your current phase.`
              }
              className={`relative overflow-hidden px-3.5 py-2 rounded-full text-xs font-medium border transition-colors disabled:opacity-100 ${
                isOpen
                  ? 'bg-white border-[#E8E4DE] text-[#2C2A26]/70 hover:border-[#6B8F71]/35 hover:text-[#2C2A26] enabled:cursor-pointer'
                  : 'bg-white border-[#E8E4DE]/90 text-[#2C2A26]/45 cursor-default'
              }`}
            >
              <span className={isOpen ? '' : 'opacity-45'}>{label}</span>
              {!isOpen && (
                <span
                  className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-full bg-white/72 backdrop-blur-[2px] border border-[#E8E4DE]/60"
                  aria-hidden
                >
                  <Lock size={11} className="text-[#6B8F71]" strokeWidth={2.5} />
                  <span className="text-[8px] font-bold uppercase tracking-wide text-[#2C2A26]/50">
                    Phase {needPhase}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </motion.div>

      {/* Hero Journey Widget */}
      {journey && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="relative overflow-hidden bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#F0EDEA]"
        >
          {/* Decorative background element */}
          <div 
            className="absolute -right-12 -top-12 w-48 h-48 rounded-full opacity-[0.03] pointer-events-none"
            style={{ backgroundColor: therapistColor }}
          />

          <div className="relative space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-2 h-2 rounded-full animate-pulse" 
                  style={{ backgroundColor: therapistColor }}
                />
                <span className="text-[10px] font-bold tracking-[0.1em] text-[#2C2A26]/40 uppercase">
                  Active Journey
                </span>
              </div>
              <span className="text-[11px] font-medium text-[#6B8F71] bg-[#6B8F71]/5 px-2.5 py-1 rounded-full">
                Phase {currentPhase} of {phases.length || 4}
              </span>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-2xl font-serif text-[#2C2A26] leading-tight">
                {currentPhaseData?.title || 'Engagement & Rapport'}
              </h3>
              <p className="text-sm text-[#2C2A26]/50 leading-relaxed max-w-[240px]">
                {currentPhaseData?.goal || 'Establishing trust and baseline emotional state.'}
              </p>
              {journey.phase_transition_result && journey.phase_transition_result.progression_enabled !== false && (
                <p className="text-[11px] text-[#6B8F71] font-medium">
                  {journey.phase_transition_result.advanced
                    ? `Phase ${journey.phase_transition_result.new_phase_index + 1} unlocked`
                    : `${journey.phase_transition_result.completed_in_phase}/${journey.phase_transition_result.min_sessions_required} sessions completed in this phase`}
                </p>
              )}
            </div>

            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-1.5">
                {phaseProgress.map((p, idx) => {
                  const isCompleted = p.phaseNumber < currentPhase;
                  const isCurrent = p.phaseNumber === currentPhase;
                  const isLast = idx === phaseProgress.length - 1;
                  return (
                    <React.Fragment key={p.phaseNumber}>
                      <span
                        className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                          isCompleted
                            ? 'bg-[#6B8F71] border-[#6B8F71] text-white'
                            : isCurrent
                              ? 'bg-white border-[#6B8F71] text-[#6B8F71]'
                              : 'bg-[#F5F0EB] border-[#E8E4DE] text-[#2C2A26]/35'
                        }`}
                      >
                        {p.phaseNumber}
                      </span>
                      {!isLast && (
                        <span
                          className={`flex-1 h-[2px] rounded-full ${
                            isCompleted ? 'bg-[#6B8F71]' : 'bg-[#E8E4DE]'
                          }`}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-[11px] font-medium">
                <span className="text-[#2C2A26]/40">Sessions in this phase</span>
                <span className="text-[#2C2A26]">
                  {completedInPhase}/{totalInPhase}
                </span>
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
              <div className="flex items-center justify-between text-[11px] font-medium">
                <span className="text-[#2C2A26]/40">Overall progress</span>
                <span className="text-[#2C2A26]">{progressPct}%</span>
              </div>
              {nextPhasePreviews.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] uppercase tracking-wide text-[#2C2A26]/40 mb-1.5">
                    Journey ahead
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {nextPhasePreviews.map((next) => (
                      <span
                        key={next.phaseNumber}
                        className="text-[10px] px-2 py-1 rounded-full bg-[#F5F0EB] border border-[#E8E4DE] text-[#2C2A26]/60"
                      >
                        Phase {next.phaseNumber}: {next.phase.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="pt-1">
                <p className="text-[10px] uppercase tracking-wide text-[#2C2A26]/40 mb-1.5">
                  Sessions by phase
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {phaseProgress.map((p) => (
                    <span
                      key={p.phaseNumber}
                      className={`text-[10px] px-2 py-1 rounded-lg border ${
                        p.phaseNumber === currentPhase
                          ? 'bg-[#6B8F71]/10 border-[#6B8F71]/20 text-[#6B8F71]'
                          : p.phaseNumber < currentPhase
                            ? 'bg-white border-[#E8E4DE] text-[#2C2A26]/60'
                            : 'bg-[#F5F0EB] border-[#E8E4DE] text-[#2C2A26]/45'
                      }`}
                    >
                      P{p.phaseNumber}: {Math.min(p.completed, p.total)}/{p.total}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('sessions')}
              className="w-full py-3.5 rounded-2xl bg-[#6B8F71] text-white font-semibold text-sm hover:bg-[#5A7D60] active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#6B8F71]/20"
            >
              Continue My Journey
              <ArrowRight size={16} />
            </button>
          </div>
        </motion.div>
      )}

      {/* Next Session */}
      {nextSessionTopic && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          onClick={() => setActiveTab('sessions')}
          className="w-full bg-white rounded-2xl p-4 shadow-sm border border-[#E8E4DE] text-left hover:border-[#6B8F71]/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
              style={{ backgroundColor: therapistColor }}
            >
              {therapistName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#2C2A26]/50 mb-0.5">Up next with {therapistName}</p>
              <p className="text-sm font-medium text-[#2C2A26] truncate">
                {nextSessionTopic.topic}
              </p>
            </div>
            <ArrowRight size={16} className="text-[#2C2A26]/30 shrink-0" />
          </div>
        </motion.button>
      )}

      {/* Mood Trend */}
      {moodChartData.length >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E4DE]"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={14} className="text-[#B4A7D6]" />
            <p className="text-xs font-medium text-[#2C2A26]/50 uppercase tracking-wide">
              Mood Trend
            </p>
          </div>
          <ResponsiveContainer width="100%" height={100}>
            <AreaChart data={moodChartData}>
              <defs>
                <linearGradient id="moodGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6B8F71" stopOpacity={0.3} />
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

      {/* Homework Tasks */}
      {activeTasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-1.5">
            <Target size={14} className="text-[#D4A574]" />
            <p className="text-xs font-medium text-[#2C2A26]/50 uppercase tracking-wide">
              Today's Homework
            </p>
          </div>
          {activeTasks.map((task, i) => {
            const Icon = TASK_ICONS[task.task_type as TaskType] || Sparkles;
            const dueDate = new Date(task.task_end_date);
            const isOverdue = dueDate < new Date();
            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.05 }}
                className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E4DE]"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#6B8F71]/10 flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-[#6B8F71]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#2C2A26]">
                      {task.dynamic_title || task.task_name}
                    </p>
                    <p className="text-xs text-[#2C2A26]/50 mt-0.5 line-clamp-2">
                      {task.dynamic_description || task.task_description}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        isOverdue
                          ? 'bg-red-50 text-red-500'
                          : 'bg-[#6B8F71]/10 text-[#6B8F71]'
                      }`}>
                        {task.task_frequency} · Due {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleMarkTaskDone(task.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#6B8F71]/10 transition-colors shrink-0"
                    title="Mark as done"
                  >
                    <CheckCircle2 size={20} className="text-[#6B8F71]/40 hover:text-[#6B8F71]" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Settings / Privacy - Made more prominent and removed delay */}
      <div className="pt-12 pb-8 flex flex-col items-center gap-4 border-t border-[#E8E4DE]/50 mt-4">
        <button
          onClick={() => setShowConfirm(true)}
          className="px-6 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-full transition-all uppercase tracking-widest border border-red-200"
        >
          Forget Me
        </button>
        <p className="text-[10px] text-[#2C2A26]/30 text-center max-w-[240px] px-4">
          Deleting your profile will permanently remove all chat history, journal entries, and progress.
        </p>
      </div>

      {/* Confirmation Modal */}
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
              className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-6"
            >
              <div className="space-y-2 text-center">
                <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield size={24} className="text-red-500" />
                </div>
                <h3 className="text-xl font-semibold text-[#2C2A26]">Are you absolutely sure?</h3>
                <p className="text-sm text-[#2C2A26]/60 leading-relaxed">
                  This will permanently delete your Mind Coach profile and all your data. This action cannot be undone.
                </p>
              </div>
              <div className="space-y-3">
                <button
                  disabled={isDeleting}
                  onClick={handleForgetMe}
                  className="w-full py-3.5 rounded-2xl bg-red-500 text-white font-medium hover:bg-red-600 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Yes, Delete Everything'}
                </button>
                <button
                  disabled={isDeleting}
                  onClick={() => setShowConfirm(false)}
                  className="w-full py-3.5 rounded-2xl bg-[#F5F0EB] text-[#2C2A26] font-medium hover:bg-[#E8E4DE] active:scale-[0.98] transition-all"
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
