/**
 * P2-06 — soft-gate dismiss-once (session-scoped).
 *
 * Stores only `consultationId → true` in sessionStorage. No PHI.
 * Chat + App share this helper so Close / Continue-as-guest suppress same-tab
 * re-nag and disable continuation “View report options” reopen.
 */

export const SOFT_GATE_PREFIX = 'libertymd:soft-gate:';

export type SoftGateStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

export function softGateKey(consultationId: string): string {
  return `${SOFT_GATE_PREFIX}${consultationId}`;
}

function defaultSessionStorage(): SoftGateStorage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

/** True when this consult’s soft gate was dismissed in the current tab session. */
export function isSoftGateDismissed(
  consultationId: string,
  storage?: SoftGateStorage | null,
): boolean {
  if (!consultationId) return false;
  const store = storage === undefined ? defaultSessionStorage() : storage;
  if (!store) return false;
  return store.getItem(softGateKey(consultationId)) === 'true';
}

/** Mark dismiss-once (Close or Continue-as-guest). Boolean only — no PHI. */
export function markSoftGateDismissed(
  consultationId: string,
  storage?: SoftGateStorage | null,
): void {
  if (!consultationId) return;
  const store = storage === undefined ? defaultSessionStorage() : storage;
  if (!store) return;
  store.setItem(softGateKey(consultationId), 'true');
}

/**
 * Whether the report-gate OverlaySheet should auto-open for this consult phase.
 * After dismiss-once, stays closed for the rest of the tab session.
 */
export function shouldOpenSoftGate(
  phaseIsReportGate: boolean,
  consultationId: string | null | undefined,
  storage?: SoftGateStorage | null,
): boolean {
  if (!phaseIsReportGate || !consultationId) return false;
  return !isSoftGateDismissed(consultationId, storage);
}
