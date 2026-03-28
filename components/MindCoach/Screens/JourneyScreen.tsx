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
  const currentPhase = useMindCoachStore((s) => s.currentPhaseNumber());

  const phases = journey?.phases ?? [];
  const plannedSessions = phases.reduce((sum, phase) => sum + Math.max(1, phase.sessions?.length ?? 1), 0);
  const completedSessions = sessions.filter((s) => s.session_state === 'completed');
  const overallProgressPercent =
    plannedSessions > 0 ? Math.min(100, Math.round((completedSessions.length / plannedSessions) * 100)) : 0;

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
      <p className="text-sm text-[#2C2A26]/60">{journey.title}</p>
      {journey.description && (
        <p className="text-xs text-[#2C2A26]/45 mt-1 mb-4 leading-relaxed">{journey.description}</p>
      )}
      <div className="mb-6 p-4 rounded-2xl border border-[#E8E4DE] bg-white">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-2">Overall progress</p>
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-[#2C2A26]/70">
            {completedSessions.length}/{plannedSessions} sessions completed
          </span>
          <span className="font-semibold text-[#2C2A26]">{overallProgressPercent}%</span>
        </div>
        <div className="h-1.5 w-full bg-[#E8E4DE] rounded-full overflow-hidden">
          <div className="h-full bg-[#6B8F71] rounded-full" style={{ width: `${overallProgressPercent}%` }} />
        </div>
      </div>
      {journey.phase_transition_result && journey.phase_transition_result.progression_enabled !== false && (
        <div className="mb-4 p-3 rounded-xl border border-[#E8E4DE] bg-white text-xs text-[#2C2A26]/65">
          {journey.phase_transition_result.advanced
            ? `Nice work. You moved to Phase ${journey.phase_transition_result.new_phase_index + 1}.`
            : `Keep going in this phase. ${journey.phase_transition_result.completed_in_phase}/${journey.phase_transition_result.min_sessions_required} sessions completed.`}
        </div>
      )}

      <div className="relative">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-3">Four phases</p>
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
      <div className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-3">Session history</p>
        {completedSessions.length === 0 ? (
          <div className="rounded-2xl border border-[#E8E4DE] bg-white p-4">
            <p className="text-sm text-[#2C2A26]/55">No completed sessions yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {completedSessions.slice().sort((a, b) => {
              const ta = new Date(a.ended_at || a.started_at).getTime();
              const tb = new Date(b.ended_at || b.started_at).getTime();
              return tb - ta;
            }).map((session) => {
              const summary = session.summary_data as Record<string, unknown> | null;
              const opening =
                summary && typeof summary.opening_reflection === 'string'
                  ? summary.opening_reflection
                  : null;
              return (
                <div key={session.id} className="rounded-2xl border border-[#E8E4DE] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[#2C2A26]">
                      {session.dynamic_theme || `Session ${session.session_number}`}
                    </p>
                    <p className="text-[11px] text-[#2C2A26]/40">
                      {new Date(session.ended_at || session.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <p className="text-xs text-[#2C2A26]/45 mt-0.5">Phase {session.phase_number}</p>
                  {opening && (
                    <p className="text-xs text-[#2C2A26]/60 mt-2 line-clamp-2">{opening}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
