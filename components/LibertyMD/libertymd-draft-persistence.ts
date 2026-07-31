/**
 * P1-12 — consult-scoped client persistence for intake draft, pending outbound,
 * and scroll. Coordinates with P0-12 offline queue (single outbound PHI writer).
 *
 * Never log store contents (PHI). Frontend never writes clinical tables.
 * Intake `input` only — unified-entry `clinicalAnswer` is out of scope (S1).
 */
import {
  clearOfflineQueue,
  enqueueOfflineMessage,
  OFFLINE_QUEUE_TTL_MS,
  offlineQueueKey,
  readOfflineQueue,
  type OfflineQueueEntry,
  type OfflineStorage,
} from './libertymd-failure-taxonomy';
import {
  clearReportSections,
  reportSectionsKey,
} from './libertymd-report';

export const DRAFT_PREFIX = 'libertymd:draft:';
export const SCROLL_PREFIX = 'libertymd:scroll:';
export const CLIENT_PERSISTENCE_TTL_MS = OFFLINE_QUEUE_TTL_MS;

export type DraftStorage = OfflineStorage;

export interface DraftRecord {
  v: 1;
  consultationId: string;
  text: string;
  updatedAt: number;
}

export interface ScrollRecord {
  v: 1;
  consultationId: string;
  scrollTop: number;
  wasNearBottom: boolean;
  updatedAt: number;
}

/** Pending outbound reuses the P0-12 offline-queue payload (Q1C / S2). */
export type PendingOutbound = OfflineQueueEntry;

export function draftKey(consultationId: string): string {
  return `${DRAFT_PREFIX}${consultationId}`;
}

export function scrollKey(consultationId: string): string {
  return `${SCROLL_PREFIX}${consultationId}`;
}

/** Inventory of consult-scoped LibertyMD client keys (AC4 / P2-05). */
export function libertyMdConsultClientKeys(consultationId: string): string[] {
  if (!consultationId) return [];
  return [
    draftKey(consultationId),
    scrollKey(consultationId),
    offlineQueueKey(consultationId),
    reportSectionsKey(consultationId),
  ];
}

/**
 * PHI-bearing keys only (draft / scroll / offline). Used on terminal report phases
 * so P2-05 section expansion can survive reload of the same report (AC4).
 */
export function clearLibertyMdConsultClientPhi(
  consultationId: string,
  storage: DraftStorage,
): void {
  if (!consultationId) return;
  clearDraft(consultationId, storage);
  clearScroll(consultationId, storage);
  clearOfflineQueue(consultationId, storage);
}

export function writeDraft(
  consultationId: string,
  text: string,
  storage: DraftStorage,
  nowMs: number = Date.now(),
): DraftRecord | null {
  if (!consultationId) return null;
  const trimmed = String(text ?? '');
  if (!trimmed.trim()) {
    storage.removeItem(draftKey(consultationId));
    return null;
  }
  const payload: DraftRecord = {
    v: 1,
    consultationId,
    text: trimmed,
    updatedAt: nowMs,
  };
  storage.setItem(draftKey(consultationId), JSON.stringify(payload));
  return payload;
}

export function readDraft(
  consultationId: string,
  storage: DraftStorage,
  nowMs: number = Date.now(),
): DraftRecord | null {
  if (!consultationId) return null;
  const raw = storage.getItem(draftKey(consultationId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DraftRecord>;
    if (
      parsed?.v !== 1
      || parsed.consultationId !== consultationId
      || typeof parsed.text !== 'string'
      || typeof parsed.updatedAt !== 'number'
    ) {
      storage.removeItem(draftKey(consultationId));
      return null;
    }
    if (nowMs - parsed.updatedAt > CLIENT_PERSISTENCE_TTL_MS) {
      storage.removeItem(draftKey(consultationId));
      return null;
    }
    return parsed as DraftRecord;
  } catch {
    storage.removeItem(draftKey(consultationId));
    return null;
  }
}

export function clearDraft(consultationId: string, storage: DraftStorage): void {
  if (!consultationId) return;
  storage.removeItem(draftKey(consultationId));
}

export function writeScroll(
  consultationId: string,
  scrollTop: number,
  wasNearBottom: boolean,
  storage: DraftStorage,
  nowMs: number = Date.now(),
): ScrollRecord | null {
  if (!consultationId) return null;
  const top = Number(scrollTop);
  if (!Number.isFinite(top) || top < 0) return null;
  const payload: ScrollRecord = {
    v: 1,
    consultationId,
    scrollTop: top,
    wasNearBottom: Boolean(wasNearBottom),
    updatedAt: nowMs,
  };
  storage.setItem(scrollKey(consultationId), JSON.stringify(payload));
  return payload;
}

export function readScroll(
  consultationId: string,
  storage: DraftStorage,
  nowMs: number = Date.now(),
): ScrollRecord | null {
  if (!consultationId) return null;
  const raw = storage.getItem(scrollKey(consultationId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ScrollRecord>;
    if (
      parsed?.v !== 1
      || parsed.consultationId !== consultationId
      || typeof parsed.scrollTop !== 'number'
      || typeof parsed.wasNearBottom !== 'boolean'
      || typeof parsed.updatedAt !== 'number'
    ) {
      storage.removeItem(scrollKey(consultationId));
      return null;
    }
    if (nowMs - parsed.updatedAt > CLIENT_PERSISTENCE_TTL_MS) {
      storage.removeItem(scrollKey(consultationId));
      return null;
    }
    return parsed as ScrollRecord;
  } catch {
    storage.removeItem(scrollKey(consultationId));
    return null;
  }
}

export function clearScroll(consultationId: string, storage: DraftStorage): void {
  if (!consultationId) return;
  storage.removeItem(scrollKey(consultationId));
}

/**
 * Persist pending outbound at optimistic append (S2). Writes the P0-12 offline
 * queue entry so outbound PHI has a single writer (Q1C).
 */
export function persistPendingOutbound(
  entry: { consultationId: string; message: string; clientMessageId: string; enqueuedAt?: number },
  storage: DraftStorage,
  nowMs: number = Date.now(),
): PendingOutbound {
  return enqueueOfflineMessage(entry, storage, nowMs);
}

export function readPendingOutbound(
  consultationId: string,
  storage: DraftStorage,
  nowMs: number = Date.now(),
): PendingOutbound | null {
  return readOfflineQueue(consultationId, storage, nowMs);
}

export function clearPendingOutbound(consultationId: string, storage: DraftStorage): void {
  clearOfflineQueue(consultationId, storage);
}

/**
 * Shared clear of all consult-scoped LibertyMD client keys (Q4A / P2-05).
 * Never logs contents. Use on abandon / new-chat (not report_ready PHI-only).
 */
export function clearLibertyMdConsultClientState(
  consultationId: string,
  storage: DraftStorage,
): void {
  if (!consultationId) return;
  clearLibertyMdConsultClientPhi(consultationId, storage);
  clearReportSections(consultationId, storage);
}

export function serverHasClientMessageId(
  serverRows: Array<{ client_message_id?: unknown; clientMessageId?: unknown; id?: unknown }>,
  clientMessageId: string,
): boolean {
  if (!clientMessageId) return false;
  return serverRows.some((row) => {
    const a = typeof row.client_message_id === 'string' ? row.client_message_id : '';
    const b = typeof row.clientMessageId === 'string' ? row.clientMessageId : '';
    const id = typeof row.id === 'string' ? row.id : '';
    return a === clientMessageId || b === clientMessageId || id === clientMessageId;
  });
}

/**
 * Drop pending when server history already has the client_message_id (AC2 / Q6A).
 * Returns remaining pending (retryable) or null when reconciled / absent.
 */
export function reconcilePendingWithServer(
  consultationId: string,
  serverRows: Array<{ client_message_id?: unknown; clientMessageId?: unknown; id?: unknown }>,
  storage: DraftStorage,
  nowMs: number = Date.now(),
): PendingOutbound | null {
  const pending = readPendingOutbound(consultationId, storage, nowMs);
  if (!pending) return null;
  if (serverHasClientMessageId(serverRows, pending.clientMessageId)) {
    clearPendingOutbound(consultationId, storage);
    return null;
  }
  return pending;
}

export interface HydrateMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  options?: string[];
  kind?: string;
  clientMessageId?: string;
  revealFullText?: string;
}

/** Merge unconfirmed pending into transcript when server lacks that id (Q2C). */
export function mergePendingIntoMessages<T extends HydrateMessage>(
  messages: T[],
  pending: PendingOutbound | null,
): T[] {
  if (!pending) return messages;
  const already = messages.some(
    (m) => m.clientMessageId === pending.clientMessageId || m.id === pending.clientMessageId,
  );
  if (already) return messages;
  const bubble = {
    id: `pending:${pending.clientMessageId}`,
    sender: 'user' as const,
    text: pending.message,
    clientMessageId: pending.clientMessageId,
  };
  return [...messages, bubble as T];
}

/**
 * Composer after pending remount (Q2C): do not put sent text back when draft is
 * empty or equals the pending message — leave composer free for a new mid-wait draft.
 * Distinct mid-wait draft is preserved.
 */
export function nextComposerInputAfterPendingHydrate(
  storedDraft: string,
  pendingMessage: string | null | undefined,
): string {
  const draft = String(storedDraft ?? '');
  const pending = String(pendingMessage ?? '');
  if (!pending.trim()) return draft;
  if (!draft.trim() || draft === pending) return '';
  return draft;
}

/** Terminal interview-leave phases that clear client PHI (Q4A). Soft-leave excluded. */
export const CLIENT_PHI_CLEAR_PHASES = [
  'report_ready',
  'report_gate',
  'emergency_end',
  'clinical_review_needed',
] as const;

export type ClientPhiClearPhase = (typeof CLIENT_PHI_CLEAR_PHASES)[number];

export function shouldClearClientPhiForPhase(phase: string): boolean {
  return (CLIENT_PHI_CLEAR_PHASES as readonly string[]).includes(phase);
}
