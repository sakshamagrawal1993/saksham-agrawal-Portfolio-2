/**
 * Shared journey progress helpers — keep Home, Journey screen, and totals consistent
 * with mind_coach_journey_sessions (runtime lattice).
 */

export type JourneySessionRowLite = {
  phase_number: number;
  session_order: number;
  status: string;
  attempt_count?: number;
};

/** Latest attempt per (phase_number, session_order), sorted by phase then order. */
export function dedupeJourneySessionRows<T extends JourneySessionRowLite>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const pn = Number(row.phase_number);
    const so = Number(row.session_order);
    if (!Number.isFinite(pn) || !Number.isFinite(so) || so < 1) continue;
    const key = `${pn}:${so}`;
    const prev = byKey.get(key);
    if (!prev || Number(row.attempt_count ?? 1) > Number(prev.attempt_count ?? 1)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()].sort(
    (a, b) => Number(a.phase_number) - Number(b.phase_number) || Number(a.session_order) - Number(b.session_order),
  );
}

export function latestJourneySessionRowsForPhase<T extends JourneySessionRowLite>(
  allRows: T[],
  phaseNumber: number,
): T[] {
  const inPhase = allRows.filter((r) => Number(r.phase_number) === phaseNumber);
  const byOrder = new Map<number, T>();
  for (const row of inPhase) {
    const order = Number(row.session_order);
    if (!Number.isFinite(order) || order < 1) continue;
    const prev = byOrder.get(order);
    if (!prev || Number(row.attempt_count ?? 1) > Number(prev.attempt_count ?? 1)) {
      byOrder.set(order, row);
    }
  }
  return [...byOrder.values()].sort((a, b) => Number(a.session_order) - Number(b.session_order));
}

export function pathwayTemplateSlotCount(phases: { sessions?: unknown[] | null }[]): number {
  return phases.reduce((sum, phase) => sum + Math.max(1, phase.sessions?.length ?? 1), 0);
}

/** After pathway selection: one engagement milestone + pathway slots (runtime vs template). */
export function plannedSessionsAfterPathwayChosen(dedupedSlots: unknown[], templateSlots: number): number {
  return 1 + Math.max(dedupedSlots.length, templateSlots);
}

/** Latest row per session_order within a phase (highest attempt_count wins). */
export function latestBySessionOrder<T extends JourneySessionRowLite>(rows: T[]): Map<number, T> {
  const m = new Map<number, T>();
  for (const row of rows) {
    const o = Number(row.session_order);
    if (!Number.isFinite(o) || o < 1) continue;
    const prev = m.get(o);
    if (!prev || Number(row.attempt_count ?? 1) > Number(prev.attempt_count ?? 1)) {
      m.set(o, row);
    }
  }
  return m;
}

/**
 * Session slots in a phase: at least template count, and at least the highest session_order
 * seen in the lattice (so gaps still render as “Session 3” when 1–2 exist).
 */
export function phaseSessionSlotTotal(
  templateSessionsLength: number,
  latestByOrder: Map<number, unknown>,
): number {
  const templateTotal = Math.max(1, templateSessionsLength);
  let maxOrder = 0;
  for (const o of latestByOrder.keys()) {
    if (o > maxOrder) maxOrder = o;
  }
  return Math.max(templateTotal, maxOrder);
}

/** How many slots 1..totalSlots are marked completed on the latest lattice row per order. */
export function countLatticeCompletedSlots(
  latestByOrder: Map<number, { status: string }>,
  totalSlots: number,
): number {
  let c = 0;
  for (let o = 1; o <= totalSlots; o += 1) {
    if (latestByOrder.get(o)?.status === 'completed') c += 1;
  }
  return c;
}
