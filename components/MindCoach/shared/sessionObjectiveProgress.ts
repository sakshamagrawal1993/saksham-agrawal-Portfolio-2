import type { ChatMessage } from '../../../store/mindCoachStore';

/** Raw 0–100 from latest assistant dynamic_content, else message-count fallback (capped at 85). */
export function computeSessionObjectiveProgressPercent(
  messages: Pick<ChatMessage, 'dynamic_content'>[],
  messageCountFallback: number,
): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const p = messages[i]?.dynamic_content?.current_objective_progress;
    if (typeof p === 'number' && Number.isFinite(p)) {
      return Math.max(0, Math.min(100, p));
    }
  }
  return Math.min(85, Math.round((Math.max(0, messageCountFallback) / 25) * 100));
}

/** While the chat session is still open, never show 100% on chrome so it matches “goal met = End session”. */
export function displaySessionProgressForOpenSession(
  rawPercent: number,
  sessionStillOpen: boolean,
): number {
  if (!sessionStillOpen) return Math.max(0, Math.min(100, rawPercent));
  return Math.min(99, Math.max(0, rawPercent));
}

export function messageCountHeuristicProgress(messageCount: number): number {
  return Math.min(85, Math.round((Math.max(0, messageCount) / 25) * 100));
}
