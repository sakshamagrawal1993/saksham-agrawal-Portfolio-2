import React, { useEffect, useMemo, useState } from 'react';
import { MindCoachJourney, MindCoachSession, normalizeJourneyPhaseState } from '../../../store/mindCoachStore';
import { supabase } from '../../../lib/supabaseClient';
import {
  latestBySessionOrder,
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
  activeSession,
  currentObjectiveProgress,
}) => {
  const [journeySessionRows, setJourneySessionRows] = useState<any[]>([]);

  const normalized = useMemo(() => normalizeJourneyPhaseState(journey), [journey]);
  const currentPhase = normalized.current_phase;
  const currentPhaseData = normalized.phases?.[currentPhase - 1];

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

  const latestByOrder = latestBySessionOrder(journeySessionRows);
  const latestRows = [...latestByOrder.values()].sort(
    (a, b) => Number(a.session_order) - Number(b.session_order),
  );

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
    <div className="shrink-0 px-4 py-3 border-b border-[#E8E4DE]/70 bg-gradient-to-b from-[#FAFAF7] to-[#F7F5F1]/90">
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

      {currentObjectiveProgress !== undefined && (
        <div className="mt-2 w-full h-0.5 bg-[#E8E4DE]/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#C9A227]/85 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, currentObjectiveProgress))}%` }}
          />
        </div>
      )}
    </div>
  );
};
