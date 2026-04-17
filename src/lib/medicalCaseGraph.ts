import {
  isWikilinkRelationshipKey,
  type WikilinkRelationshipKey,
  WIKILINK_RELATIONSHIP_KEYS,
} from './wikilinkRelationshipTypes';

export interface MedicalCaseLinkRef {
  id: string;
  title: string;
}

/** Same shape as Obsidian Graph Link Types: field name → list of target ids. */
export type MedicalCaseLinks = Partial<Record<WikilinkRelationshipKey, string[]>>;

export interface MedicalCase {
  id: string;
  title: string;
  case_text: string;
  ground_truth: string;
  links?: MedicalCaseLinks;
}

export type BacklinksByRelation = Partial<Record<WikilinkRelationshipKey, MedicalCaseLinkRef[]>>;

function emptyBacklinks(): BacklinksByRelation {
  return {};
}

/** Drop unknown keys and targets that are not valid case ids. */
export function normalizeMedicalCaseLinks(
  raw: Record<string, unknown> | undefined,
  validIds: ReadonlySet<string>
): MedicalCaseLinks | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: MedicalCaseLinks = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!isWikilinkRelationshipKey(key)) continue;
    if (!Array.isArray(val)) continue;
    const ids = val.filter((v): v is string => typeof v === 'string' && validIds.has(v));
    if (ids.length) out[key] = ids;
  }
  return Object.keys(out).length ? out : undefined;
}

export function normalizeMedicalCases(raw: readonly MedicalCase[]): MedicalCase[] {
  const validIds = new Set(raw.map((c) => c.id));
  return raw.map((c) => ({
    ...c,
    links: normalizeMedicalCaseLinks(c.links as Record<string, unknown> | undefined, validIds),
  }));
}

/**
 * For each case id, incoming edges grouped by relationship type (who points here, with which field).
 */
export function buildBacklinksByRelation(cases: readonly MedicalCase[]): Map<string, BacklinksByRelation> {
  const result = new Map<string, BacklinksByRelation>();

  const touch = (targetId: string): BacklinksByRelation => {
    let b = result.get(targetId);
    if (!b) {
      b = emptyBacklinks();
      result.set(targetId, b);
    }
    return b;
  };

  for (const c of cases) {
    if (!c.links) continue;
    for (const rel of WIKILINK_RELATIONSHIP_KEYS) {
      const targets = c.links[rel];
      if (!targets?.length) continue;
      for (const tid of targets) {
        const bucket = touch(tid);
        const list = bucket[rel] ?? (bucket[rel] = []);
        list.push({ id: c.id, title: c.title });
      }
    }
  }

  return result;
}

export function relationKeysWithEdges(links: MedicalCaseLinks | undefined): WikilinkRelationshipKey[] {
  if (!links) return [];
  return WIKILINK_RELATIONSHIP_KEYS.filter((k) => (links[k]?.length ?? 0) > 0);
}

export function relationKeysWithBacklinks(bl: BacklinksByRelation | undefined): WikilinkRelationshipKey[] {
  if (!bl) return [];
  return WIKILINK_RELATIONSHIP_KEYS.filter((k) => (bl[k]?.length ?? 0) > 0);
}
