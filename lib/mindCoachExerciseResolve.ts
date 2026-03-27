import type { Exercise } from '../store/mindCoachStore';

/** Stable key for matching LLM / n8n slugs to DB exercises (hyphens vs spaces vs underscores). */
export function exercisePayloadKey(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_');
}

const SENSES_KEY = exercisePayloadKey('5-4-3-2-1 Senses');

/** Optional explicit aliases when normalization is not enough. */
const PAYLOAD_ALIASES: Record<string, string> = {
  senses_54321: SENSES_KEY,
  '54321_senses': SENSES_KEY,
};

function canonicalPayloadKey(payload: string): string {
  const k = exercisePayloadKey(payload);
  return PAYLOAD_ALIASES[k] ?? k;
}

export function findExerciseByPayload(exercises: Exercise[], payload: string): Exercise | undefined {
  const p = payload.trim();
  if (!p) return undefined;

  const byId = exercises.find((e) => e.id === p);
  if (byId) return byId;

  const want = canonicalPayloadKey(p);
  return exercises.find((e) => canonicalPayloadKey(e.title) === want);
}
