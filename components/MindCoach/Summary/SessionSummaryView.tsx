import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import Analytics from '../../../services/analytics';
import {
  MindCoachSession,
  MindCoachJourney,
  MindCoachProfile,
  TherapistPersona,
} from '../../../store/mindCoachStore';
import { PATHWAY_LABELS } from '../shared/pathwayLabels';
import '../Atmosphere/MindCoachZen.css';

// ── Helpers ────────────────────────────────────────────────────────────────

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeLabel(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

const NEXT_FOCUS_STORAGE_KEY_PREFIX = 'mind_coach_next_focus_intent';

function getNextFocusStorageKey(profileId: string) {
  return `${NEXT_FOCUS_STORAGE_KEY_PREFIX}:${profileId}`;
}

// ── Component ──────────────────────────────────────────────────────────────

interface SessionSummaryViewProps {
  summaryData: Record<string, any>;
  activeSession: MindCoachSession | null;
  journey: MindCoachJourney | null;
  profile: MindCoachProfile | null;
  persona: TherapistPersona;
  onClose: () => void;
  onViewProposal?: () => void;
  onJournal?: (text: string) => void;
  title?: string; // Optional override for the header title
}

export const SessionSummaryView: React.FC<SessionSummaryViewProps> = ({
  summaryData,
  activeSession,
  journey,
  profile,
  persona,
  onClose,
  onViewProposal,
  onJournal,
  title = 'Session Complete',
}) => {
  const [showTier2, setShowTier2] = useState(true);
  const [showTier3, setShowTier3] = useState(true);
  const [completedTaskKeys, setCompletedTaskKeys] = useState<Record<string, boolean>>({});
  const [showPathwayPhases, setShowPathwayPhases] = useState(false);
  const [activePathwayPhase, setActivePathwayPhase] = useState(0);
  const [selectedNextFocus, setSelectedNextFocus] = useState<string | null>(() => {
    if (profile?.id) {
      return localStorage.getItem(getNextFocusStorageKey(profile.id));
    }
    return null;
  });

  const summaryView = (summaryData || {}) as Record<string, any>;
  const caseNotes = (summaryView.case_notes ?? activeSession?.case_notes ?? null) as Record<
    string,
    any
  > | null;
  const phaseTransitionResult = (summaryView.phase_transition_result ?? null) as {
    advanced?: boolean;
    new_phase_index?: number;
    completed_in_phase?: number;
    min_sessions_required?: number;
  } | null;

  const tasks: Record<string, any>[] = Array.isArray(summaryView.extracted_tasks)
    ? (summaryView.extracted_tasks as Record<string, any>[])
    : summaryView.takeaway_task
      ? [
          {
            dynamic_title: 'Your Takeaway',
            dynamic_description: summaryView.takeaway_task,
            task_type: 'general',
          },
        ]
      : [];

  const tasksWithUi: (Record<string, any> & { _ui_key: string })[] = tasks.map((task, index) => {
    const key = `${task.id ?? task.dynamic_title ?? task.task_name ?? task.task_type ?? 'task'}:${index}`;
    return { ...task, _ui_key: key };
  });

  const takeaways = Array.isArray(summaryView.session_takeaways)
    ? (summaryView.session_takeaways as string[]).filter(Boolean).slice(0, 3)
    : [
        summaryView.opening_reflection ? 'What you noticed today' : null,
        caseNotes?.dynamic_theme ? `Theme surfaced: ${caseNotes.dynamic_theme}` : null,
        tasks[0]?.dynamic_title ? `One thing to practice: ${tasks[0].dynamic_title}` : null,
      ].filter(Boolean) as string[];

  const nextFocusOptions = Array.isArray(summaryView.next_focus_options)
    ? (summaryView.next_focus_options as string[]).filter(Boolean).slice(0, 3)
    : [
        caseNotes?.dynamic_theme ? `Work on ${String(caseNotes.dynamic_theme).toLowerCase()}` : null,
        'Build a wind-down ritual',
        'Strengthen self-talk before stress moments',
      ].filter(Boolean) as string[];

  const completedInPhase = safeNumber(phaseTransitionResult?.completed_in_phase);
  const minInPhase = safeNumber(phaseTransitionResult?.min_sessions_required);
  const phaseProgressPercent =
    completedInPhase != null && minInPhase && minInPhase > 0
      ? Math.min(100, Math.round((completedInPhase / minInPhase) * 100))
      : null;

  const riskLevel = String(caseNotes?.risk_level ?? '').toLowerCase();
  const isRiskVariant =
    riskLevel === 'high' ||
    caseNotes?.requires_escalation === true ||
    caseNotes?.crisis_detected === true;

  const therapistSupportLine =
    persona === 'maya'
      ? 'Gentle reflection first, then one step forward.'
      : persona === 'alex'
        ? 'Practical, structured steps to help you stay on track.' // Alex persona from constants is solution-focused but direct
        : persona === 'sage'
          ? 'Grounded progress: reinforce what worked, repeat it this week.'
          : 'You made progress today. Let us convert it into a repeatable step.';

  const suggestedPathway = summaryView.suggested_pathway || activeSession?.pathway;
  const isNewPathway =
    suggestedPathway && suggestedPathway !== 'engagement_rapport_and_assessment';
  const pathwayDetailsRaw =
    summaryView.pathway_details && typeof summaryView.pathway_details === 'object'
      ? (summaryView.pathway_details as Record<string, any>)
      : null;
  const pathwayPhases = Array.isArray(pathwayDetailsRaw?.phases)
    ? (pathwayDetailsRaw?.phases as Record<string, any>[]).slice(0, 4)
    : [];

  const pathwayPreview = pathwayDetailsRaw
    ? {
        title:
          String(pathwayDetailsRaw.pathway_title || '').trim() ||
          (typeof suggestedPathway === 'string'
            ? (PATHWAY_LABELS[suggestedPathway as keyof typeof PATHWAY_LABELS] ??
              suggestedPathway.replace(/_/g, ' '))
            : 'Your Recommended Pathway'),
        description:
          String(pathwayDetailsRaw.pathway_description || '').trim() ||
          'A structured four-phase pathway to guide your next sessions.',
        imageUrl: String(pathwayDetailsRaw.image_url || '').trim() || null,
      }
    : null;

  const isPathwayUnselected =
    (activeSession?.pathway == null || activeSession?.pathway === 'engagement_rapport_and_assessment') &&
    (journey?.pathway == null || journey?.pathway === 'engagement_rapport_and_assessment');

  const shouldShowPathwayPreview =
    isPathwayUnselected && isNewPathway && pathwayPreview && pathwayPhases.length > 0;

  const followPathwayFromSummary = (source: 'pathway_card' | 'phase_modal') => {
    Analytics.track('pathway_follow_clicked', {
      source,
      session_id: activeSession?.id || null,
      profile_id: profile?.id || null,
      suggested_pathway: suggestedPathway || null,
    });
    setShowPathwayPhases(false);
    if (onViewProposal) {
      onViewProposal();
    }
  };

  const hasTier2Content = true; // Always show tiers for better visibility as requested
  const hasTier3Content = true; 

  return (
    <div className="flex flex-col h-full bg-[#fdfaf7] relative overflow-hidden">
      {/* Zen Atmospheric Aura */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.4] z-0">
        <div className="absolute top-[-10%] right-[-10%] w-[120%] h-[40%] bg-gradient-to-b from-[#E8F3E9] to-transparent blur-[80px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[100%] h-[40%] bg-gradient-to-t from-[#F0F4F8] to-transparent blur-[80px]" />
      </div>

      <div className="zen-glass sticky top-0 z-30 flex items-center gap-3 px-5 py-3 border-b border-white/40 backdrop-blur-md shrink-0">
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#2C2A26] uppercase tracking-wider opacity-60">{title}</p>
        </div>
        <button
          onClick={onClose}
          className="text-[#2C2A26]/60 hover:text-[#2C2A26] text-sm font-medium px-3 py-1.5 rounded-full hover:bg-white/40 transition-colors"
        >
          {title === 'Session Summary' ? 'Back' : 'Done'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6 relative z-10">
        {/* ── TIER 1: Warm reflection + takeaway + next step ── */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="zen-glass-heavy rounded-2xl p-6 border border-white/60 zen-card-shadow animate-zen-float"
        >
          <h3 className="text-base font-semibold text-[#2C2A26] mb-2">
            {summaryView.title || 'Session Summary'}
          </h3>
          <p className="text-xs text-[#2C2A26]/60 mb-3">{therapistSupportLine}</p>
          {summaryView.opening_reflection && (
            <p className="text-sm text-[#2C2A26]/80 leading-relaxed mb-3">
              {summaryView.opening_reflection}
            </p>
          )}
          {summaryView.quote_of_the_day && (
            <p className="text-xs italic text-[#2C2A26]/50 border-l-2 border-[#E8E4DE] pl-3 mb-3">
              "{summaryView.quote_of_the_day}"
            </p>
          )}
          {takeaways.length > 0 && (
            <div className="space-y-1.5">
              {takeaways.map((item, index) => (
                <p key={index} className="text-xs text-[#2C2A26]/75 flex items-start gap-2">
                  <span className="mt-0.5 text-[#6B8F71]">•</span>
                  <span>{item}</span>
                </p>
              ))}
            </div>
          )}
        </motion.div>

        {/* Primary task — simplified */}
        {tasksWithUi.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="zen-glass rounded-2xl p-6 border border-white/50 zen-card-shadow"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-3">
              Try this week
            </p>
            {tasksWithUi.slice(0, 2).map((task, i) => {
              const taskTitle =
                task.dynamic_title ||
                task.task_name ||
                normalizeLabel(task.task_type || `Task ${i + 1}`);
              const taskDesc =
                task.dynamic_description ||
                task.task_description ||
                'Practice this between sessions.';
              const taskKey = task._ui_key as string;
              const done = completedTaskKeys[taskKey] === true;
              return (
                <div
                  key={taskKey}
                  className={`flex items-start gap-3 ${i > 0 ? 'mt-3 pt-3 border-t border-[#F0EDEA]' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      const next = !done;
                      setCompletedTaskKeys((prev) => ({ ...prev, [taskKey]: next }));
                      if (next && task.id && profile?.id) {
                        void supabase
                          .from('mind_coach_user_tasks')
                          .update({ status: 'completed', completed_at: new Date().toISOString() })
                          .eq('id', task.id)
                          .eq('profile_id', profile.id);
                      }
                    }}
                    className="mt-0.5 shrink-0"
                  >
                    <CheckCircle2 size={18} className={done ? 'text-[#6B8F71]' : 'text-[#E8E4DE]'} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${done ? 'text-[#6B8F71] line-through' : 'text-[#2C2A26]'}`}
                    >
                      {taskTitle}
                    </p>
                    <p className="text-xs text-[#2C2A26]/50 mt-0.5 line-clamp-1">{taskDesc}</p>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-full py-4 rounded-2xl bg-[#6B8F71] text-white text-sm font-semibold hover:bg-[#5A7D60] active:scale-[0.98] transition-all shadow-lg shadow-[#6B8F71]/20"
          >
            {title === 'Session Summary' ? 'Back to Diary' : 'Done'}
          </button>
          {onJournal && (
            <button
              type="button"
              onClick={() => onJournal("I want to quickly journal what I learned in today's session.")}
              className="w-full mt-2 py-2 text-xs font-medium text-[#2C2A26]/50 hover:text-[#2C2A26] transition-colors"
            >
              Or journal for 2 minutes
            </button>
          )}
        </motion.div>

        {/* ── TIER 2: Expandable — progress, pathway, next focus ── */}
        {hasTier2Content && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="zen-glass rounded-2xl border border-white/50 overflow-hidden zen-card-shadow"
          >
            <button
              type="button"
              onClick={() => setShowTier2((s) => !s)}
              className="w-full px-5 py-4 flex items-center justify-between text-left"
            >
              <p className="text-sm font-medium text-[#2C2A26]">See more</p>
              {showTier2 ? (
                <ChevronUp size={16} className="text-[#2C2A26]/40" />
              ) : (
                <ChevronDown size={16} className="text-[#2C2A26]/40" />
              )}
            </button>
            {showTier2 && (
              <div className="px-5 pb-5 space-y-4 border-t border-[#F0EDEA]">
                {/* Your progress */}
                {phaseTransitionResult && (
                  <div className="pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-2">
                      Your progress
                    </p>
                    <p className="text-sm text-[#2C2A26]/75 mb-2">
                      {phaseTransitionResult.advanced
                        ? `You unlocked Phase ${(phaseTransitionResult.new_phase_index ?? 0) + 1}. Keep momentum with one small action tonight.`
                        : `You're progressing in this phase (${phaseTransitionResult.completed_in_phase ?? 0}/${phaseTransitionResult.min_sessions_required ?? 0} sessions).`}
                    </p>
                    {phaseProgressPercent != null && (
                      <div className="h-1.5 w-full bg-[#E8E4DE] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#6B8F71] rounded-full"
                          style={{ width: `${phaseProgressPercent}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Pathway suggestion */}
                {shouldShowPathwayPreview && (
                  <div className="pt-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-2">
                      Recommended pathway
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        Analytics.track('pathway_preview_opened', {
                          source: 'pathway_card',
                          session_id: activeSession?.id || null,
                          profile_id: profile?.id || null,
                          suggested_pathway: suggestedPathway || null,
                        });
                        setShowPathwayPhases(true);
                        setActivePathwayPhase(0);
                      }}
                      className="w-full text-left rounded-xl border border-[#E8E4DE] bg-[#FAF7F3] overflow-hidden hover:bg-[#F6F1EA] transition-colors"
                    >
                      {pathwayPreview?.imageUrl && (
                        <img
                          src={pathwayPreview.imageUrl}
                          alt=""
                          className="w-full h-24 object-cover border-b border-[#E8E4DE]"
                        />
                      )}
                      <div className="p-3">
                        <p className="text-sm font-semibold text-[#2C2A26]">{pathwayPreview?.title}</p>
                        <p className="text-xs text-[#2C2A26]/60 mt-1 leading-relaxed">
                          {pathwayPreview?.description}
                        </p>
                        <p className="text-xs text-[#6B8F71] font-medium mt-2">
                          Tap to preview all 4 phases
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => followPathwayFromSummary('pathway_card')}
                      className="w-full mt-2 py-2.5 rounded-xl bg-[#6B8F71] text-white text-sm font-semibold hover:bg-[#5A7D60] transition-colors"
                    >
                      Follow this pathway
                    </button>
                  </div>
                )}

                {isNewPathway && !shouldShowPathwayPreview && (
                  <div className="pt-2">
                    <p className="text-xs text-[#2C2A26]/60">
                      Recommended pathway:{' '}
                      {PATHWAY_LABELS[suggestedPathway as keyof typeof PATHWAY_LABELS] ??
                        String(suggestedPathway).replace(/_/g, ' ')}
                    </p>
                  </div>
                )}

                {/* Next focus chooser */}
                {nextFocusOptions.length > 0 && (
                  <div className="pt-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-1">
                      Next focus
                    </p>
                    <p className="text-xs text-[#2C2A26]/55 mb-2">Choose one intention for next time.</p>
                    <div className="flex flex-wrap gap-2">
                      {nextFocusOptions.map((option, idx) => {
                        const selected = selectedNextFocus === option;
                        return (
                          <button
                            key={`${option}-${idx}`}
                            type="button"
                            onClick={() => {
                              setSelectedNextFocus(option);
                              if (profile?.id) {
                                localStorage.setItem(getNextFocusStorageKey(profile.id), option);
                              }
                            }}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                              selected
                                ? 'bg-[#2C2A26] text-white border-[#2C2A26]'
                                : 'bg-[#F5F0EB] text-[#2C2A26]/70 border-[#E8E4DE] hover:bg-[#E8E4DE]'
                            }`}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                    {selectedNextFocus && (
                      <p className="text-[11px] text-[#2C2A26]/50 mt-2">
                        Saved. Next time, we will start with: "{selectedNextFocus}".
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ── TIER 3: Expandable — detailed insights, full tasks, notes ── */}
        {hasTier3Content && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="zen-glass rounded-2xl border border-white/40 overflow-hidden zen-card-shadow"
          >
            <button
              type="button"
              onClick={() => setShowTier3((s) => !s)}
              className="w-full px-5 py-4 flex items-center justify-between text-left"
            >
              <div>
                <p className="text-sm font-medium text-[#2C2A26]">Detailed view</p>
                <p className="text-xs text-[#2C2A26]/45 mt-0.5">For the curious — metrics and notes</p>
              </div>
              {showTier3 ? (
                <ChevronUp size={16} className="text-[#2C2A26]/40" />
              ) : (
                <ChevronDown size={16} className="text-[#2C2A26]/40" />
              )}
            </button>
            {showTier3 && (
              <div className="px-5 pb-5 space-y-4 border-t border-[#F0EDEA]">
                {/* What stood out */}
                {(caseNotes?.presenting_concern ||
                  caseNotes?.dynamic_theme ||
                  caseNotes?.phase_progress) && (
                  <div
                    className={`pt-4 rounded-xl p-4 -mx-1 ${isRiskVariant ? 'bg-[#FFF9F8] border border-[#F3D0CB]' : ''}`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-2">
                      What stood out
                    </p>
                    <div className="space-y-1.5 text-sm text-[#2C2A26]/75">
                      {caseNotes?.presenting_concern && (
                        <p>
                          <span className="font-medium text-[#2C2A26]">What we explored:</span>{' '}
                          {caseNotes.presenting_concern}
                        </p>
                      )}
                      {caseNotes?.dynamic_theme && (
                        <p>
                          <span className="font-medium text-[#2C2A26]">What resonated:</span>{' '}
                          {caseNotes.dynamic_theme}
                        </p>
                      )}
                      {caseNotes?.phase_progress && (
                        <p>
                          <span className="font-medium text-[#2C2A26]">Still on your mind:</span>{' '}
                          {caseNotes.phase_progress}
                        </p>
                      )}
                    </div>
                    {isRiskVariant && (
                      <p className="text-xs text-[#A0493A] mt-2">
                        We noticed elevated distress. Grounding and support come first.
                      </p>
                    )}
                  </div>
                )}

                {/* Full task list */}
                {tasksWithUi.length > 2 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-2">
                      All tasks
                    </p>
                    {tasksWithUi.slice(2).map((task, i) => {
                      const taskTitle =
                        task.dynamic_title ||
                        task.task_name ||
                        normalizeLabel(task.task_type || `Task ${i + 3}`);
                      const taskDesc = task.dynamic_description || task.task_description || '';
                      const taskKey = task._ui_key as string;
                      const done = completedTaskKeys[taskKey] === true;
                      return (
                        <div
                          key={taskKey}
                          className={`flex items-start gap-3 ${i > 0 ? 'mt-2.5 pt-2.5 border-t border-[#F0EDEA]' : ''}`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              const next = !done;
                              setCompletedTaskKeys((prev) => ({ ...prev, [taskKey]: next }));
                              if (next && task.id && profile?.id) {
                                void supabase
                                  .from('mind_coach_user_tasks')
                                  .update({ status: 'completed', completed_at: new Date().toISOString() })
                                  .eq('id', task.id)
                                  .eq('profile_id', profile.id);
                              }
                            }}
                            className="mt-0.5 shrink-0"
                          >
                            <CheckCircle2
                              size={16}
                              className={done ? 'text-[#6B8F71]' : 'text-[#E8E4DE]'}
                            />
                          </button>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm font-medium ${done ? 'text-[#6B8F71] line-through' : 'text-[#2C2A26]'}`}
                            >
                              {taskTitle}
                            </p>
                            {taskDesc && (
                              <p className="text-xs text-[#2C2A26]/50 mt-0.5 line-clamp-1">
                                {taskDesc}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Energy shift */}
                {summaryView.energy_shift && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-1">
                      Energy shift
                    </p>
                    <p className="text-xs text-[#2C2A26]/65">
                      From {String(summaryView.energy_shift.start)} to{' '}
                      {String(summaryView.energy_shift.end)}
                    </p>
                  </div>
                )}

                {/* Flexibility — trends, not scores */}
                {summaryView.psychological_flexibility && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-2">
                      Flexibility snapshot
                    </p>
                    <div className="space-y-2">
                      {[
                        {
                          label: 'Self-Awareness',
                          value: summaryView.psychological_flexibility.self_awareness,
                        },
                        {
                          label: 'Observation',
                          value: summaryView.psychological_flexibility.observation,
                        },
                        {
                          label: 'Physical Awareness',
                          value: summaryView.psychological_flexibility.physical_awareness,
                        },
                        {
                          label: 'Values',
                          value: summaryView.psychological_flexibility.core_values,
                        },
                        {
                          label: 'Relationships',
                          value: summaryView.psychological_flexibility.relationships,
                        },
                      ]
                        .filter((s) => s.value !== undefined)
                        .map((stat, i) => (
                          <div key={i}>
                            <div className="flex justify-between text-[11px] mb-1">
                              <span className="text-[#2C2A26]/60">{stat.label}</span>
                              <span className="text-[#2C2A26]/60">{String(stat.value)}%</span>
                            </div>
                            <div className="h-1 w-full bg-[#E8E4DE] rounded-full overflow-hidden">
                              <motion.div
                                className="h-full bg-[#D4A574] rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${stat.value}%` }}
                                transition={{ delay: 0.2 + i * 0.06, duration: 0.5, ease: 'easeOut' }}
                              />
                            </div>
                          </div>
                        ))}
                    </div>
                    <p className="text-[11px] text-[#2C2A26]/40 mt-2">Treat these as trends, not grades.</p>
                  </div>
                )}

                {summaryView.self_compassion_score !== undefined && (
                  <div className="rounded-xl bg-[#FAF9F7] p-3 border border-[#E8E4DE]">
                    <p className="text-base font-semibold text-[#2C2A26]/70">
                      {String(summaryView.self_compassion_score)}
                    </p>
                    <p className="text-[11px] text-[#2C2A26]/45">Self-compassion — a trend, not a grade.</p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Pathway Phases Modal overlap */}
      {showPathwayPhases && shouldShowPathwayPreview && (
        <div className="absolute inset-0 z-20 bg-[#2C2A26]/40 backdrop-blur-[2px] flex items-end sm:items-center sm:justify-center p-2 sm:p-4">
          <div className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-[#FBF8F4] border border-[#E8E4DE] shadow-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-[#2C2A26]">{pathwayPreview?.title}</p>
              <button
                type="button"
                onClick={() => setShowPathwayPhases(false)}
                className="text-[#2C2A26]/50 hover:text-[#2C2A26] text-sm"
              >
                Close
              </button>
            </div>
            <div className="flex items-center justify-center gap-2 mb-4">
              {pathwayPhases.map((_, index) => {
                const isDone = index < activePathwayPhase;
                const isCurrent = index === activePathwayPhase;
                return (
                  <React.Fragment key={index}>
                    <button
                      type="button"
                      onClick={() => setActivePathwayPhase(index)}
                      className={`w-7 h-7 rounded-full text-[11px] font-semibold border ${
                        isCurrent
                          ? 'bg-[#6B8F71] text-white border-[#6B8F71]'
                          : isDone
                            ? 'bg-[#6B8F71]/15 text-[#44614A] border-[#6B8F71]/30'
                            : 'bg-white text-[#2C2A26]/60 border-[#D9D3CB]'
                      }`}
                    >
                      {isDone ? '✓' : index + 1}
                    </button>
                    {index < pathwayPhases.length - 1 && <div className="w-8 h-[2px] bg-[#D9D3CB]" />}
                  </React.Fragment>
                );
              })}
            </div>
            {pathwayPhases[activePathwayPhase] && (
              <div className="bg-white rounded-2xl border border-[#E8E4DE] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#2C2A26]/45 mb-1">
                  Step {activePathwayPhase + 1} of {pathwayPhases.length}
                </p>
                <h4 className="text-lg font-semibold text-[#2C2A26] mb-2">
                  {String(pathwayPhases[activePathwayPhase].phase_name || 'Phase')}
                </h4>
                <p className="text-sm text-[#2C2A26]/75 leading-relaxed mb-3">
                  {String(pathwayPhases[activePathwayPhase].phase_description || '')}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#2C2A26]/45 mb-2">
                  What we will explore together
                </p>
                <div className="space-y-1.5">
                  {pathwayPhases.map((phase, idx) => (
                    <p key={idx} className="text-xs text-[#2C2A26]/70 flex items-start gap-1.5">
                      <span className="mt-0.5 text-[#6B8F71]">•</span>
                      <span>{String(phase.phase_name || `Phase ${idx + 1}`)}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={activePathwayPhase === 0}
                onClick={() => setActivePathwayPhase((p) => Math.max(0, p - 1))}
                className="py-2.5 rounded-xl border border-[#E8E4DE] text-sm text-[#2C2A26]/70 disabled:opacity-40"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activePathwayPhase >= pathwayPhases.length - 1) {
                    setShowPathwayPhases(false);
                    return;
                  }
                  setActivePathwayPhase((p) => Math.min(pathwayPhases.length - 1, p + 1));
                }}
                className="py-2.5 rounded-xl bg-[#2C2A26] text-white text-sm font-semibold"
              >
                {activePathwayPhase >= pathwayPhases.length - 1 ? 'Done' : 'Next'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => followPathwayFromSummary('phase_modal')}
              className="w-full mt-2 py-2.5 rounded-xl bg-[#6B8F71] text-white text-sm font-semibold hover:bg-[#5A7D60] transition-colors"
            >
              Follow this pathway
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
