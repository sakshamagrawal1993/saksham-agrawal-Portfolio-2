import React, { useEffect, useMemo, useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { MindCoachJourney, MindCoachSession, normalizeJourneyPhaseState } from '../../../store/mindCoachStore';
import { supabase } from '../../../lib/supabaseClient';

interface PhaseProgressStepperProps {
  journey: MindCoachJourney;
  sessions: MindCoachSession[];
  currentObjectiveProgress?: number;
}

export const PhaseProgressStepper: React.FC<PhaseProgressStepperProps> = ({ journey, sessions, currentObjectiveProgress }) => {
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
        .select('phase_number,session_order,status,attempt_count,topic,description')
        .eq('journey_id', journey.id)
        .eq('phase_number', currentPhase)
        .in('status', ['planned', 'in_progress', 'completed', 'revisit', 'blocked'])
        .order('session_order', { ascending: true });
      if (!cancelled) setJourneySessionRows(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [journey?.id, currentPhase]);

  const currentCompleted = sessions.filter(
    (s) => s.session_state === 'completed' && s.phase_number === currentPhase,
  ).length;
  const latestByOrder = new Map<number, any>();
  for (const row of journeySessionRows) {
    const order = Number(row?.session_order);
    if (!Number.isFinite(order) || order < 1) continue;
    const prev = latestByOrder.get(order);
    if (!prev || Number(row?.attempt_count ?? 1) > Number(prev?.attempt_count ?? 1)) {
      latestByOrder.set(order, row);
    }
  }
  const latestRows = [...latestByOrder.values()];
  const runtimeSessionOrders = new Set(
    latestRows
      .map((r) => (Number.isFinite(r.session_order) ? Number(r.session_order) : null))
      .filter((v): v is number => v != null),
  );
  const runtimeCompletedOrders = new Set(
    latestRows
      .filter((r) => r.status === 'completed')
      .map((r) => (Number.isFinite(r.session_order) ? Number(r.session_order) : null))
      .filter((v): v is number => v != null),
  );
  const currentTarget = Math.max(
    1,
    runtimeSessionOrders.size > 0 ? runtimeSessionOrders.size : (currentPhaseData?.sessions?.length ?? 3),
  );
  const currentCompletedResolved = runtimeCompletedOrders.size > 0 ? runtimeCompletedOrders.size : currentCompleted;

  const currentSessionRow = latestRows.find(
    (r) => r.status === 'in_progress' || r.status === 'revisit' || r.status === 'planned'
  ) || latestRows[0];
  const sessionGoalTopic = currentSessionRow?.topic || currentPhaseData?.sessions?.[0]?.topic || 'Exploration';

  return (
    <div className="shrink-0 px-4 pt-2.5 pb-2 border-b border-[#E8E4DE] bg-[#FAFAF7]">
      <div className="flex items-center gap-1.5">
        {phases.map((phase, idx) => {
          const phaseNumber = phase.phase_number || idx + 1;
          const isCompleted = phaseNumber < currentPhase;
          const isCurrent = phaseNumber === currentPhase;
          const isFuture = phaseNumber > currentPhase;
          const isLast = idx === phases.length - 1;
          return (
            <React.Fragment key={phaseNumber}>
              <div
                className={`w-6 h-6 rounded-full border flex items-center justify-center ${
                  isCompleted
                    ? 'bg-[#6B8F71] border-[#6B8F71] text-white'
                    : isCurrent
                      ? 'bg-white border-[#6B8F71] text-[#6B8F71]'
                      : 'bg-[#F5F0EB] border-[#E8E4DE] text-[#2C2A26]/30'
                }`}
                title={phase.title}
              >
                {isCompleted ? (
                  <Check size={12} strokeWidth={2.8} />
                ) : isFuture ? (
                  <Lock size={10} />
                ) : (
                  <span className="text-[10px] font-bold">{phaseNumber}</span>
                )}
              </div>
              {!isLast && (
                <div
                  className={`flex-1 h-[2px] rounded-full ${
                    isCompleted ? 'bg-[#6B8F71]' : 'bg-[#E8E4DE]'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#2C2A26]/50">
          Phase {currentPhase}: {currentPhaseData?.title ?? 'Current phase'}
        </p>
        <p className="text-[10px] text-[#2C2A26]/45">
          {currentCompletedResolved}/{currentTarget} sessions
        </p>
      </div>
      <div className="mt-1 flex gap-1">
        {Array.from({ length: currentTarget }, (_, idx) => (
          <span
            key={idx}
            className={`h-1.5 flex-1 rounded-full ${
              idx < currentCompletedResolved ? 'bg-[#6B8F71]' : 'bg-[#E8E4DE]'
            }`}
          />
        ))}
      </div>
      <div className="mt-2.5 p-2 bg-white rounded-lg border border-[#E8E4DE]">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] font-medium text-[#2C2A26]">
            Session Goal: {sessionGoalTopic}
          </p>
          {currentObjectiveProgress !== undefined && (
            <p className="text-[10px] text-[#2C2A26]/45 font-medium">
              {currentObjectiveProgress}%
            </p>
          )}
        </div>
        {currentObjectiveProgress !== undefined && (
          <div className="w-full h-1.5 bg-[#F5F0EB] rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#D4A574] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${currentObjectiveProgress}%` }}
            />
          </div>
        )}
      </div>
      {journey.phase_transition_result?.phase_gate_reason && (
        <p className="mt-2 text-[10px] text-[#2C2A26]/40">
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
