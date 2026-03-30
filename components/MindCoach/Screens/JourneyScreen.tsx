import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Lock, Sparkles, Footprints } from 'lucide-react';
import { useMindCoachStore, UNLOCK_MAP } from '../../../store/mindCoachStore';
import { supabase } from '../../../lib/supabaseClient';
import '../Atmosphere/MindCoachZen.css';

const FEATURE_BADGES: Record<number, string> = {
  2: '📓 Journaling unlocks here',
  3: '🧘 Exercises unlock here',
  4: '🧠 Meditation unlocks here',
};

const PHASE_IMAGES: Record<number, string> = {
  1: 'https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/mind%20coach/phase_1_rapport_zen_1774777577976.png',
  2: 'https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/mind%20coach/phase_2_exploration_zen_1774777608656.png',
  3: 'https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/mind%20coach/phase_3_deep_work_zen_1774777638728.png',
  4: 'https://ralhkmpbslsdkwnqzqen.supabase.co/storage/v1/object/public/mind%20coach/phase_4_integration_zen_1774777670009.png',
};

function transitionReasonLabel(reason?: string): string {
  switch (reason) {
    case 'blocked_by_risk':
      return 'Paused due to elevated risk. Stabilization comes first.';
    case 'objective_not_met':
      return 'Current objective needs one more attempt before phase advancement.';
    case 'readiness_not_ready':
      return 'Objective met, but readiness is still building for next phase.';
    case 'phase_requirements_not_met':
      return 'Complete required sessions in this phase before advancing.';
    case 'final_phase':
      return 'You are in the final phase of this journey.';
    default:
      return 'Transition decision applied with current objective, readiness, and risk signals.';
  }
}

function nextActionLine(action?: string): string {
  switch (action) {
    case 'advance':
      return 'Move to the next phase with one small reinforcing action today.';
    case 'revisit':
      return 'Repeat this session objective with an adjusted approach next time.';
    case 'stabilize':
      return 'Focus on stabilization and grounding before progressing.';
    case 'escalate':
      return 'Increase support and use higher-care resources as needed.';
    default:
      return 'Keep momentum with one concrete next step this week.';
  }
}

export const JourneyScreen: React.FC = () => {
  const journey = useMindCoachStore((s) => s.journey);
  const sessions = useMindCoachStore((s) => s.sessions);
  const setActiveTab = useMindCoachStore((s) => s.setActiveTab);
  const currentPhase = useMindCoachStore((s) => s.currentPhaseNumber());

  const phases = journey?.phases ?? [];
  const hasChosenPathway =
    journey?.pathway != null && journey.pathway !== 'engagement_rapport_and_assessment';
  const displayCurrentPhase = hasChosenPathway ? currentPhase + 1 : currentPhase;
  const engagementSessions = sessions.filter(
    (s) => s.pathway === 'engagement_rapport_and_assessment',
  );
  const engagementCompletedCount = engagementSessions.filter(
    (s) => s.session_state === 'completed',
  ).length;
  const engagementTotalCount = Math.max(1, engagementSessions.length);
  const displayPhases = hasChosenPathway
    ? [
        {
          display_number: 1,
          source_phase_number: null as number | null,
          title: 'Engagement & Rapport',
          goal: 'Establish trust, safety, and understanding before pathway work begins.',
          sessions: [],
        },
        ...phases.map((phase) => ({
          display_number: Number(phase.phase_number ?? 1) + 1,
          source_phase_number: Number(phase.phase_number ?? 1),
          title: phase.title,
          goal: phase.goal,
          sessions: phase.sessions,
        })),
      ]
    : phases.map((phase) => ({
        display_number: Number(phase.phase_number ?? 1),
        source_phase_number: Number(phase.phase_number ?? 1),
        title: phase.title,
        goal: phase.goal,
        sessions: phase.sessions,
      }));
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
        .select('phase_number,session_order,status,attempt_count,generated_title,generated_description')
        .eq('journey_id', journey.id)
        .in('status', ['planned', 'in_progress', 'completed', 'revisit', 'blocked'])
        .order('phase_number', { ascending: true })
        .order('session_order', { ascending: true })
        .order('attempt_count', { ascending: false });
      if (!cancelled) {
        setJourneySessionRows(data ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [journey?.id]);

  const journeySessionsByPhase = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const row of journeySessionRows) {
      const key = Number(row.phase_number);
      const existing = map.get(key) ?? [];
      existing.push(row);
      map.set(key, existing);
    }
    return map;
  }, [journeySessionRows]);
  const plannedSessions = hasChosenPathway
    ? engagementTotalCount +
      phases.reduce((sum, phase) => sum + Math.max(1, phase.sessions?.length ?? 1), 0)
    : phases.reduce((sum, phase) => sum + Math.max(1, phase.sessions?.length ?? 1), 0);
  const completedSessions = sessions.filter((s) => {
    if (s.session_state !== 'completed') return false;
    if (s.journey_id === journey?.id) return true;
    return hasChosenPathway && s.pathway === 'engagement_rapport_and_assessment';
  });
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
    <div className="p-5 pb-24 relative overflow-x-hidden">
      <h2 className="text-xl font-semibold zen-title mb-1">Your Journey</h2>
      <p className="text-sm zen-muted">{journey.title}</p>
      {journey.description && (
        <p className="text-xs text-[#2C2A26]/45 mt-1 mb-4 leading-relaxed">{journey.description}</p>
      )}
      <p className="text-xs text-[#2C2A26]/45 mb-4 leading-relaxed">
        Progress can include repeat sessions when needed; revisit loops are expected and help strengthen outcomes.
      </p>
      {!hasChosenPathway && (
        <div className="mb-4 rounded-xl border border-[#E8E4DE] bg-white p-3">
          <p className="text-[10px] uppercase tracking-wide text-[#2C2A26]/45">Current status</p>
          <p className="mt-1 text-xs text-[#2C2A26]/75">
            You are in Phase 1 (Engagement & Rapport). Your personalized pathway is yet to be revealed.
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            {Array.from({ length: 5 }, (_, idx) => {
              const phaseNum = idx + 1;
              const active = phaseNum === 1;
              return (
                <React.Fragment key={`preview-${phaseNum}`}>
                  <span
                    className={`h-6 min-w-6 px-1 rounded-full border text-[10px] font-semibold flex items-center justify-center ${
                      active
                        ? 'bg-[#6B8F71] border-[#6B8F71] text-white'
                        : 'bg-[#F5F0EB]/70 border-[#E8E4DE] text-[#2C2A26]/35'
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
        </div>
      )}
      <div className="mb-6 p-5 rounded-2xl zen-glass zen-card-shadow border border-white/40">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/30 mb-2.5">Overall progress</p>
        <div className="flex items-center justify-between text-sm mb-2.5">
          <span className="text-[#2C2A26]/60 flex items-center gap-1.5">
            <Footprints size={14} className="text-[#6B8F71]" />
            {completedSessions.length}/{plannedSessions} sessions
          </span>
          <span className="font-semibold text-[#2C2A26] bg-[#6B8F71]/5 px-2 py-0.5 rounded-lg">{overallProgressPercent}%</span>
        </div>
        <div className="h-2 w-full bg-[#E8E4DE]/50 rounded-full overflow-hidden">
          <div className="h-full bg-[#6B8F71] rounded-full transition-all duration-1000 ease-out" style={{ width: `${overallProgressPercent}%` }} />
        </div>
      </div>
      {journey.phase_transition_result && journey.phase_transition_result.progression_enabled !== false && (
        <div className="mb-4 p-3 rounded-xl border border-[#E8E4DE] bg-white text-xs text-[#2C2A26]/65">
          <div className="space-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#2C2A26]/45">What happened this session</p>
              <p>
                {journey.phase_transition_result.advanced
                  ? `Nice work. You moved to Phase ${
                      journey.phase_transition_result.new_phase_index +
                      (hasChosenPathway ? 2 : 1)
                    }.`
                  : `Keep going in this phase. ${journey.phase_transition_result.completed_in_phase}/${journey.phase_transition_result.min_sessions_required} sessions completed.`}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#2C2A26]/45">Why phase stayed or advanced</p>
              <p className="text-[11px] text-[#2C2A26]/50">
                {transitionReasonLabel(journey.phase_transition_result.phase_gate_reason)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[#2C2A26]/45">What to do next</p>
              <p className="text-[11px] text-[#2C2A26]/50">
                {nextActionLine(journey.phase_transition_result.recommended_next_action)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2C2A26]/40 mb-3">
          {hasChosenPathway ? 'Five phases overall' : 'Current engagement phase'}
        </p>
        {displayPhases.map((phase, idx) => {
          const phaseNum = phase.display_number;
          const sourcePhaseNum = phase.source_phase_number;
          const isEngagementPhase = sourcePhaseNum == null;
          const isCompleted = phaseNum < displayCurrentPhase;
          const isCurrent = phaseNum === displayCurrentPhase;
          const isFuture = phaseNum > displayCurrentPhase;

          const completedInPhase = isEngagementPhase
            ? engagementCompletedCount
            : sessions.filter(
                (s) =>
                  s.session_state === 'completed' &&
                  s.phase_number === sourcePhaseNum &&
                  s.journey_id === journey?.id,
              ).length;
          const runtimeRows = sourcePhaseNum ? (journeySessionsByPhase.get(sourcePhaseNum) ?? []) : [];
          const latestByOrder = new Map<number, any>();
          for (const row of runtimeRows) {
            const order = Number(row?.session_order);
            if (!Number.isFinite(order) || order < 1) continue;
            const prev = latestByOrder.get(order);
            if (!prev || Number(row?.attempt_count ?? 1) > Number(prev?.attempt_count ?? 1)) {
              latestByOrder.set(order, row);
            }
          }
          const latestRows = [...latestByOrder.values()].sort(
            (a, b) => Number(a.session_order) - Number(b.session_order),
          );
          const totalInPhase = isEngagementPhase
            ? engagementTotalCount
            : latestRows.length > 0
              ? latestRows.length
              : (phase.sessions?.length ?? 3);
          const completedInPhaseResolved = latestRows.filter((r) => r.status === 'completed').length || completedInPhase;
          const activeRuntimeSession =
            latestRows.find((r) => r.status === 'in_progress' || r.status === 'revisit' || r.status === 'blocked') ??
            latestRows.find((r) => r.status === 'planned') ??
            null;

          const isLast = idx === displayPhases.length - 1;
          const unlockPhaseKey = Math.max(1, hasChosenPathway ? phaseNum - 1 : phaseNum);
          const badge = FEATURE_BADGES[unlockPhaseKey];
          const newFeatures = UNLOCK_MAP[unlockPhaseKey]?.filter(
            (f) => !UNLOCK_MAP[unlockPhaseKey - 1]?.includes(f)
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
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 transition-all duration-500 ${
                    isCompleted
                      ? 'bg-[#6B8F71] border-[#6B8F71] text-white shadow-lg shadow-[#6B8F71]/20'
                      : isCurrent
                        ? 'bg-white border-[#6B8F71] text-[#6B8F71] zen-step-glow scale-110'
                        : 'bg-[#F5F0EB]/50 border-[#E8E4DE] text-[#2C2A26]/20'
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
                    className={`w-0.5 flex-1 min-h-[40px] transition-colors duration-700 ${
                      isCompleted ? 'bg-[#6B8F71]' : 'bg-[#E8E4DE]/50'
                    }`}
                  />
                )}
              </div>

              {/* Content */}
              <div className={`pb-6 flex-1 min-w-0 ${isFuture ? 'opacity-50' : ''}`}>
                <div className={`mb-8 p-4 rounded-2xl transition-all duration-500 ${isCurrent ? 'zen-glass-heavy zen-card-shadow' : 'opacity-80'}`}>
                  {/* Phase Illustration */}
                  {(isCurrent || isCompleted) && sourcePhaseNum != null && PHASE_IMAGES[sourcePhaseNum] && (
                    <div className="w-full h-32 rounded-xl mb-3 overflow-hidden bg-[#F5F0EB]/30">
                      <img 
                        src={PHASE_IMAGES[sourcePhaseNum]} 
                        alt="" 
                        className="w-full h-full object-cover opacity-90 transition-transform duration-700 hover:scale-105"
                      />
                    </div>
                  )}
                  
                  <p
                    className={`text-sm font-semibold ${
                      isCurrent ? 'text-[#6B8F71]' : 'text-[#2C2A26]'
                    }`}
                  >
                    {phase.title || `Phase ${phaseNum}`}
                  </p>
                  <p className="text-xs text-[#2C2A26]/50 mt-1 leading-relaxed">
                    {phase.goal}
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B8F71]/60 mt-2">
                    Progression: {completedInPhaseResolved}/{totalInPhase} sessions
                  </p>
                  {isCurrent && activeRuntimeSession?.status && activeRuntimeSession.status !== 'planned' && (
                    <p className="mt-1 text-[10px] text-[#2C2A26]/50">
                      Status: {activeRuntimeSession.status === 'revisit'
                        ? 'Revisit requested'
                        : activeRuntimeSession.status === 'blocked'
                          ? 'Stabilization / risk hold'
                          : 'In progress'}
                    </p>
                  )}

                {/* Expanded session cards for current phase */}
                {isCurrent && phase.sessions && phase.sessions.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {phase.sessions.map((s, sIdx) => {
                      const isDone = sIdx < completedInPhaseResolved;
                      const isNext = sIdx === completedInPhaseResolved;
                      const nextSessionTitle =
                        isNext && activeRuntimeSession?.generated_title
                          ? activeRuntimeSession.generated_title
                          : s.topic;
                      const nextSessionDescription =
                        isNext && activeRuntimeSession?.generated_description
                          ? activeRuntimeSession.generated_description
                          : s.description;
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
                              {nextSessionTitle}
                            </span>
                          </div>
                          {isNext && (
                            <p className="text-[10px] text-[#2C2A26]/40 mt-1 ml-0">
                              {nextSessionDescription}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Feature unlock badge */}
                {badge && newFeatures && newFeatures.length > 0 && (
                  <div className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-[#B4A7D6]/10 rounded-lg w-fit border border-[#B4A7D6]/20">
                    <span className="text-[10px] text-[#B4A7D6] font-semibold uppercase tracking-wider">{badge}</span>
                  </div>
                )}
                </div>
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
                  <p className="text-xs text-[#2C2A26]/45 mt-0.5">
                    Phase{' '}
                    {hasChosenPathway && session.pathway !== 'engagement_rapport_and_assessment'
                      ? Number(session.phase_number ?? 1) + 1
                      : session.phase_number}
                  </p>
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
