import React, { useEffect, useMemo, useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { MindCoachJourney, MindCoachSession, normalizeJourneyPhaseState } from '../../../store/mindCoachStore';
import { supabase } from '../../../lib/supabaseClient';
import {
  countLatticeCompletedSlots,
  latestBySessionOrder,
  phaseSessionSlotTotal,
} from '../shared/mindCoachJourneyProgress';

interface PhaseProgressStepperProps {
  journey: MindCoachJourney;
  sessions: MindCoachSession[];
  /** When set, prefer matching `mind_coach_journey_sessions.linked_session_id` for template goals. */
  activeSession?: MindCoachSession | null;
  currentObjectiveProgress?: number;
}

function safeText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function isGenericSessionLabel(text: string | null | undefined): boolean {
  if (!text) return true;
  return /^session\s*\d+$/i.test(text.trim());
}

export const PhaseProgressStepper: React.FC<PhaseProgressStepperProps> = ({
  journey,
  sessions,
  activeSession,
  currentObjectiveProgress,
}) => {
  const normalized = useMemo(() => normalizeJourneyPhaseState(journey), [journey]);
  const phases = normalized.phases ?? [];
  const currentPhase = normalized.current_phase;
  const currentPhaseData = phases[currentPhase - 1];
  const [journeySessionRows, setJourneySessionRows] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!journey?.id) {
        setJourneySessionRows([]);
        return;
      }
      const { data } = await supabase
        .from('mind_coach_journey_sessions')
        .select(
          'phase_number,session_order,status,attempt_count,linked_session_id,generated_title,generated_goal,generated_description',
        )
        .eq('journey_id', journey.id)
        .eq('phase_number', currentPhase)
        .in('status', ['planned', 'in_progress', 'completed', 'revisit', 'blocked'])
        .order('session_order', { ascending: true })
        .order('attempt_count', { ascending: false });
      if (!cancelled) setJourneySessionRows(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [journey?.id, currentPhase]);

  const currentCompleted = sessions.filter(
    (s) => s.session_state === 'completed' && s.phase_number === currentPhase,
  ).length;
  const latestByOrder = latestBySessionOrder(journeySessionRows);
  const latestRows = [...latestByOrder.values()].sort(
    (a, b) => Number(a.session_order) - Number(b.session_order),
  );
  const templateSessionCount = currentPhaseData?.sessions?.length ?? 3;
  const currentTarget = phaseSessionSlotTotal(templateSessionCount, latestByOrder);
  const latticeCompleted = countLatticeCompletedSlots(latestByOrder, currentTarget);
  const currentCompletedResolved =
    latestByOrder.size > 0 ? latticeCompleted : Math.min(currentTarget, currentCompleted);

  const focusRow =
    (activeSession?.id &&
      latestRows.find((r: { linked_session_id?: string | null }) => r.linked_session_id === activeSession.id)) ||
    latestRows.find((r) => r.status === 'in_progress') ||
    latestRows.find((r) => r.status === 'revisit') ||
    latestRows.find((r) => r.status === 'planned') ||
    latestRows[0];

  const sessionOrder = Number.isFinite(Number(focusRow?.session_order)) ? Number(focusRow.session_order) : 1;
  const templateSlot = currentPhaseData?.sessions?.find((s) => s.session_number === sessionOrder);
  const templateTopic = safeText(templateSlot?.topic);
  const templateTitle = safeText((templateSlot as { title?: string } | undefined)?.title);
  const templateDesc = safeText(templateSlot?.description);

  const generatedGoal = safeText(focusRow?.generated_goal);
  const generatedTitle = safeText(focusRow?.generated_title);
  const generatedDescription = safeText(focusRow?.generated_description);

  let sessionGoalHeadline =
    generatedGoal ||
    generatedDescription ||
    (!isGenericSessionLabel(generatedTitle) && generatedTitle) ||
    (!isGenericSessionLabel(templateTopic) && templateTopic) ||
    templateTitle ||
    templateDesc ||
    safeText(currentPhaseData?.goal) ||
    'Exploration';

  if (isGenericSessionLabel(sessionGoalHeadline) && templateDesc) {
    sessionGoalHeadline = templateDesc;
  }
  if (isGenericSessionLabel(sessionGoalHeadline) && safeText(currentPhaseData?.goal)) {
    sessionGoalHeadline = safeText(currentPhaseData?.goal) as string;
  }

  const sessionGoalEyebrowRaw =
    generatedGoal && generatedTitle && generatedTitle !== generatedGoal && !isGenericSessionLabel(generatedTitle)
      ? generatedTitle
      : null;
  const sessionGoalEyebrow =
    sessionGoalEyebrowRaw && sessionGoalEyebrowRaw.trim() !== sessionGoalHeadline.trim()
      ? sessionGoalEyebrowRaw
      : null;

  return (
    <div className="shrink-0 px-4 pt-2 pb-2.5 border-b border-[#E8E4DE]/70 bg-gradient-to-b from-[#FAFAF7] to-[#F7F5F1]/90">
      <div className="flex items-center gap-1">
        {phases.map((phase, idx) => {
          const phaseNumber = phase.phase_number || idx + 1;
          const isCompleted = phaseNumber < currentPhase;
          const isCurrent = phaseNumber === currentPhase;
          const isFuture = phaseNumber > currentPhase;
          const isLast = idx === phases.length - 1;
          return (
            <React.Fragment key={phaseNumber}>
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                  isCompleted
                    ? 'bg-[#6B8F71] border-[#6B8F71] text-white'
                    : isCurrent
                      ? 'bg-white border-[#6B8F71] text-[#6B8F71]'
                      : 'bg-[#F5F0EB] border-[#E8E4DE] text-[#2C2A26]/30'
                }`}
                title={phase.title}
              >
                {isCompleted ? (
                  <Check size={10} strokeWidth={2.8} />
                ) : isFuture ? (
                  <Lock size={9} />
                ) : (
                  <span className="text-[9px] font-bold">{phaseNumber}</span>
                )}
              </div>
              {!isLast && (
                <div
                  className={`flex-1 h-[1.5px] rounded-full min-w-[6px] ${
                    isCompleted ? 'bg-[#6B8F71]' : 'bg-[#E8E4DE]'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div className="flex items-start justify-between gap-2 mt-1.5">
        <p className="text-[11px] font-medium text-[#2C2A26]/85 leading-snug">
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#2C2A26]/40 block mb-0.5">
            Phase {currentPhase}
          </span>
          {currentPhaseData?.title ?? 'Current phase'}
        </p>
        <p className="text-[10px] text-[#2C2A26]/45 tabular-nums shrink-0 pt-0.5">
          {currentCompletedResolved}/{currentTarget} in phase
        </p>
      </div>
      <div className="mt-1.5 flex gap-0.5">
        {Array.from({ length: currentTarget }, (_, idx) => (
          <span
            key={idx}
            className={`h-1 flex-1 rounded-full ${
              idx < currentCompletedResolved ? 'bg-[#6B8F71]/90' : 'bg-[#E8E4DE]/90'
            }`}
          />
        ))}
      </div>

      <div className="mt-3 pt-2.5 border-t border-[#E8E4DE]/50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#2C2A26]/38">
                Session focus
              </p>
              {currentObjectiveProgress !== undefined && (
                <p className="text-[11px] text-[#6B8F71] font-semibold tabular-nums shrink-0">
                  {currentObjectiveProgress}%
                </p>
              )}
            </div>
            {sessionGoalEyebrow && (
              <p className="text-[11px] font-semibold text-[#2C2A26]/72 mb-0.5 leading-snug">{sessionGoalEyebrow}</p>
            )}
            <p className="text-[12px] sm:text-[13px] text-[#2C2A26] leading-snug font-normal">
              {sessionGoalHeadline}
            </p>
          </div>
        </div>
        {currentObjectiveProgress !== undefined && (
          <div className="mt-2 w-full h-0.5 bg-[#E8E4DE]/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#C9A227]/85 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, currentObjectiveProgress))}%` }}
            />
          </div>
        )}
      </div>
      {journey.phase_transition_result?.phase_gate_reason && (
        <p className="mt-2 text-[10px] text-[#2C2A26]/40 leading-snug">
          {journey.phase_transition_result.phase_gate_reason === 'blocked_by_risk'
            ? 'Risk hold active; stabilizing before progression.'
            : journey.phase_transition_result.phase_gate_reason === 'objective_not_met'
              ? 'Objective not met yet; revisit remains active.'
              : journey.phase_transition_result.phase_gate_reason === 'readiness_not_ready'
                ? 'Readiness still building before phase transition.'
                : ''}
        </p>
      )}
    </div>
  );
};
