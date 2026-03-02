import React from 'react';
import { motion } from 'framer-motion';
import { Check, Lock, Sparkles } from 'lucide-react';
import { useMindCoachStore, UNLOCK_MAP } from '../../../store/mindCoachStore';

const FEATURE_BADGES: Record<number, string> = {
  2: '📓 Journaling unlocks here',
  3: '🧘 Exercises unlock here',
  4: '🧠 Meditation unlocks here',
};

export const JourneyScreen: React.FC = () => {
  const journey = useMindCoachStore((s) => s.journey);
  const sessions = useMindCoachStore((s) => s.sessions);
  const setActiveTab = useMindCoachStore((s) => s.setActiveTab);

  const currentPhase = journey?.current_phase ?? 1;
  const phases = journey?.phases ?? [];

  if (!journey || phases.length === 0) {
    return (
      <div className="p-5 text-center py-16">
        <div className="w-14 h-14 rounded-full bg-[#F5F0EB] flex items-center justify-center mx-auto mb-3">
          <Sparkles size={24} className="text-[#2C2A26]/25" />
        </div>
        <p className="text-sm text-[#2C2A26]/50">Your journey will appear here</p>
        <p className="text-xs text-[#2C2A26]/30 mt-1">Complete your first session to get started</p>
      </div>
    );
  }

  return (
    <div className="p-5 pb-4">
      <h2 className="text-xl font-semibold text-[#2C2A26] mb-1">Your Journey</h2>
      <p className="text-sm text-[#2C2A26]/40 mb-6">{journey.title}</p>

      <div className="relative">
        {phases.map((phase, idx) => {
          const phaseNum = phase.phase_number;
          const isCompleted = phaseNum < currentPhase;
          const isCurrent = phaseNum === currentPhase;
          const isFuture = phaseNum > currentPhase;

          const completedInPhase = sessions.filter(
            (s) => s.session_state === 'completed' && s.phase_number === phaseNum
          ).length;
          const totalInPhase = phase.sessions?.length ?? 3;

          const isLast = idx === phases.length - 1;
          const badge = FEATURE_BADGES[phaseNum];
          const newFeatures = UNLOCK_MAP[phaseNum]?.filter(
            (f) => !UNLOCK_MAP[phaseNum - 1]?.includes(f)
          );

          return (
            <motion.div
              key={phaseNum}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.06 }}
              className="relative flex gap-4"
            >
              {/* Timeline rail */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 ${
                    isCompleted
                      ? 'bg-[#6B8F71] border-[#6B8F71] text-white'
                      : isCurrent
                        ? 'bg-white border-[#6B8F71] text-[#6B8F71]'
                        : 'bg-[#F5F0EB] border-[#E8E4DE] text-[#2C2A26]/25'
                  }`}
                >
                  {isCompleted ? (
                    <Check size={14} strokeWidth={2.5} />
                  ) : isFuture ? (
                    <Lock size={12} />
                  ) : (
                    <span className="text-xs font-bold">{phaseNum}</span>
                  )}
                </div>
                {!isLast && (
                  <div
                    className={`w-0.5 flex-1 min-h-[24px] ${
                      isCompleted ? 'bg-[#6B8F71]' : 'bg-[#E8E4DE]'
                    }`}
                  />
                )}
              </div>

              {/* Content */}
              <div className={`pb-6 flex-1 min-w-0 ${isFuture ? 'opacity-50' : ''}`}>
                <p
                  className={`text-sm font-semibold ${
                    isCurrent ? 'text-[#6B8F71]' : 'text-[#2C2A26]'
                  }`}
                >
                  {phase.title}
                </p>
                <p className="text-xs text-[#2C2A26]/40 mt-0.5 leading-relaxed">
                  {phase.goal}
                </p>
                <p className="text-xs text-[#2C2A26]/50 mt-1">
                  {completedInPhase}/{totalInPhase} sessions
                </p>

                {/* Expanded session cards for current phase */}
                {isCurrent && phase.sessions && (
                  <div className="mt-3 space-y-2">
                    {phase.sessions.map((s, sIdx) => {
                      const isDone = sIdx < completedInPhase;
                      const isNext = sIdx === completedInPhase;
                      return (
                        <button
                          key={sIdx}
                          onClick={isNext ? () => setActiveTab('sessions') : undefined}
                          className={`w-full text-left rounded-xl p-3 border transition-colors ${
                            isDone
                              ? 'bg-[#6B8F71]/5 border-[#6B8F71]/15'
                              : isNext
                                ? 'bg-white border-[#6B8F71]/25 hover:border-[#6B8F71]/50 cursor-pointer'
                                : 'bg-[#F5F0EB]/50 border-[#E8E4DE] opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isDone && (
                              <Check
                                size={12}
                                className="text-[#6B8F71] shrink-0"
                                strokeWidth={2.5}
                              />
                            )}
                            <span
                              className={`text-xs font-medium ${
                                isDone ? 'text-[#6B8F71]' : 'text-[#2C2A26]'
                              }`}
                            >
                              {s.topic}
                            </span>
                          </div>
                          {isNext && (
                            <p className="text-[10px] text-[#2C2A26]/40 mt-1 ml-0">
                              {s.description}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Feature unlock badge */}
                {badge && newFeatures && newFeatures.length > 0 && (
                  <div className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-[#B4A7D6]/10 rounded-lg w-fit">
                    <span className="text-xs text-[#B4A7D6] font-medium">{badge}</span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
