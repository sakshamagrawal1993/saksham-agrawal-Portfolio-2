export interface SessionGoalItem {
  session_number: number;
  title: string;
  objective: string;
  success_signal: string;
}

export interface SessionGoalContext {
  phase_title: string | null;
  phase_goal: string | null;
  session_number_in_phase: number;
  total_sessions_in_phase: number;
  session_title: string | null;
  session_objective: string | null;
  session_success_signal: string | null;
}

export interface JourneySessionGoalRow {
  session_order: number;
  status: string;
  attempt_count?: number;
  generated_title?: string | null;
  generated_goal?: string | null;
  generated_description?: string | null;
}

function safeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizePhaseSessions(
  phase: Record<string, unknown> | null,
  fallbackMinSessions = 3,
): SessionGoalItem[] {
  const sessionsRaw = phase?.sessions;
  if (Array.isArray(sessionsRaw) && sessionsRaw.length > 0) {
    return sessionsRaw.map((raw: any, idx) => {
      const num = Number.isFinite(raw?.session_number) ? raw.session_number : idx + 1;
      const title =
        safeString(raw?.title) ??
        safeString(raw?.topic) ??
        `Session ${num}`;
      const objective =
        safeString(raw?.objective) ??
        safeString(raw?.description) ??
        safeString(phase?.goal) ??
        'Support steady progress toward the current phase goal.';
      const successSignal =
        safeString(raw?.success_signal) ??
        `Client demonstrates measurable progress on session ${num} objective.`;
      return {
        session_number: num,
        title,
        objective,
        success_signal: successSignal,
      };
    });
  }

  const count =
    Number.isFinite(sessionsRaw as number) && Number(sessionsRaw) > 0
      ? Number(sessionsRaw)
      : fallbackMinSessions;
  const phaseGoal =
    safeString(phase?.goal) ??
    'Support steady progress toward the current phase goal.';
  const normalized: SessionGoalItem[] = [];
  for (let i = 1; i <= count; i += 1) {
    normalized.push({
      session_number: i,
      title: `Session ${i}`,
      objective: phaseGoal,
      success_signal: `Client demonstrates measurable progress on phase goal by session ${i}.`,
    });
  }
  return normalized;
}

export function normalizeJourneyPhases(
  phases: unknown,
  fallbackMinSessions = 3,
): Record<string, unknown>[] {
  if (!Array.isArray(phases)) return [];
  return phases.map((phase: any, idx) => {
    const title = safeString(phase?.title) ?? safeString(phase?.name) ?? `Phase ${idx + 1}`;
    const goal = safeString(phase?.goal) ?? 'Support emotional regulation and forward progress.';
    const phaseNumber = Number.isFinite(phase?.phase_number) ? Number(phase.phase_number) : idx + 1;
    return {
      ...phase,
      title,
      name: safeString(phase?.name) ?? title,
      goal,
      phase_number: phaseNumber,
      sessions: normalizePhaseSessions({ ...phase, title, goal }, fallbackMinSessions),
    };
  });
}

export function resolveSessionGoalContext(
  phase: Record<string, unknown> | null,
  completedInCurrentPhase: number,
  fallbackMinSessions = 3,
): SessionGoalContext | null {
  if (!phase) return null;
  const sessions = normalizePhaseSessions(phase, fallbackMinSessions);
  if (sessions.length === 0) return null;

  const totalSessions = sessions.length;
  const sessionNumberInPhase = Math.min(totalSessions, Math.max(1, completedInCurrentPhase + 1));
  const idx = Math.max(0, sessionNumberInPhase - 1);
  const session = sessions[idx];
  return {
    phase_title: safeString(phase.title) ?? safeString(phase.name),
    phase_goal: safeString(phase.goal),
    session_number_in_phase: sessionNumberInPhase,
    total_sessions_in_phase: totalSessions,
    session_title: session.title,
    session_objective: session.objective,
    session_success_signal: session.success_signal,
  };
}

export function resolveSessionGoalContextFromJourneySessions(
  phase: Record<string, unknown> | null,
  sessionRows: JourneySessionGoalRow[],
  completedInCurrentPhase: number,
  fallbackMinSessions = 3,
): SessionGoalContext | null {
  if (!phase) return null;
  if (!Array.isArray(sessionRows) || sessionRows.length === 0) {
    return resolveSessionGoalContext(phase, completedInCurrentPhase, fallbackMinSessions);
  }

  const byOrder = new Map<number, JourneySessionGoalRow[]>();
  for (const row of sessionRows) {
    const order = Number.isFinite(row.session_order) ? Number(row.session_order) : null;
    if (!order || order < 1) continue;
    const existing = byOrder.get(order) ?? [];
    existing.push(row);
    byOrder.set(order, existing);
  }

  const sortedOrders = [...byOrder.keys()].sort((a, b) => a - b);
  if (sortedOrders.length === 0) {
    return resolveSessionGoalContext(phase, completedInCurrentPhase, fallbackMinSessions);
  }

  const latestRowsByOrder = sortedOrders.map((order) => {
    const rowsForOrder = byOrder.get(order) ?? [];
    const bestRow = [...rowsForOrder].sort((a, b) => (b.attempt_count ?? 1) - (a.attempt_count ?? 1))[0] ?? null;
    return { order, row: bestRow };
  });

  const totalSessions = latestRowsByOrder.length;
  const nextIncompleteIndex = latestRowsByOrder.findIndex((entry) => entry.row?.status !== 'completed');
  const activeIndex = nextIncompleteIndex >= 0
    ? nextIncompleteIndex
    : Math.min(totalSessions - 1, Math.max(0, completedInCurrentPhase - 1));
  const activeOrder = latestRowsByOrder[activeIndex]?.order ?? sortedOrders[0];
  const bestRow = latestRowsByOrder[activeIndex]?.row ?? null;

  const title =
    safeString(bestRow?.generated_title) ??
    `Session ${activeOrder}`;
  const objective =
    safeString(bestRow?.generated_goal) ??
    safeString(bestRow?.generated_description) ??
    safeString(phase.goal) ??
    'Support steady progress toward the current phase goal.';
  const successSignal = `Client demonstrates measurable progress on session ${activeOrder} objective.`;

  return {
    phase_title: safeString(phase.title) ?? safeString(phase.name),
    phase_goal: safeString(phase.goal),
    // Keep numbering contiguous for prompts even if session_order is non-contiguous.
    session_number_in_phase: activeIndex + 1,
    total_sessions_in_phase: totalSessions,
    session_title: title,
    session_objective: objective,
    session_success_signal: successSignal,
  };
}
