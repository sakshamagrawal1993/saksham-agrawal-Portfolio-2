import React, { useMemo } from 'react';
import { Check, Lock } from 'lucide-react';
import { MindCoachJourney, MindCoachSession, normalizeJourneyPhaseState } from '../../../store/mindCoachStore';

interface PhaseProgressStepperProps {
  journey: MindCoachJourney;
  sessions: MindCoachSession[];
}

export const PhaseProgressStepper: React.FC<PhaseProgressStepperProps> = ({ journey, sessions }) => {
  const normalized = useMemo(() => normalizeJourneyPhaseState(journey), [journey]);
  const phases = normalized.phases ?? [];
  const currentPhase = normalized.current_phase;
  const currentPhaseData = phases[currentPhase - 1];
  const currentCompleted = sessions.filter(
    (s) => s.session_state === 'completed' && s.phase_number === currentPhase,
  ).length;
  const currentTarget = Math.max(1, currentPhaseData?.sessions?.length ?? 3);

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
          {currentCompleted}/{currentTarget} sessions
        </p>
      </div>
      <div className="mt-1.5 flex gap-1">
        {Array.from({ length: currentTarget }, (_, idx) => (
          <span
            key={idx}
            className={`h-1.5 flex-1 rounded-full ${
              idx < currentCompleted ? 'bg-[#6B8F71]' : 'bg-[#E8E4DE]'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
