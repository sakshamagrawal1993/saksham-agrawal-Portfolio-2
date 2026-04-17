/**
 * Closed vocabulary aligned with the Obsidian vault Wikilink Types / Graph Link Types keys.
 * @see wiki/for-agents/TAGS_AND_LINKS.md (obsidian repo)
 */
export const WIKILINK_RELATIONSHIP_KEYS = [
  'supersedes',
  'updates',
  'evolution_of',
  'supports',
  'contradicts',
  'disputes',
  'parent_of',
  'child_of',
  'sibling_of',
  'composed_of',
  'part_of',
  'causes',
  'influenced_by',
  'prerequisite_for',
  'implements',
  'documents',
  'tests',
  'example_of',
  'responds_to',
  'references',
  'inspired_by',
  'follows',
  'precedes',
  'depends_on',
  'see_also',
  'builds_on',
  'same_theme_as',
  'derived_from',
  'superseded_by',
  'targets',
] as const;

export type WikilinkRelationshipKey = (typeof WIKILINK_RELATIONSHIP_KEYS)[number];

const KEY_SET = new Set<string>(WIKILINK_RELATIONSHIP_KEYS);

export function isWikilinkRelationshipKey(k: string): k is WikilinkRelationshipKey {
  return KEY_SET.has(k);
}

/** Short labels for UI (keys remain canonical for agents / Dataview-style fields). */
export const RELATIONSHIP_UI_LABEL: Record<WikilinkRelationshipKey, string> = {
  supersedes: 'Supersedes',
  updates: 'Updates',
  evolution_of: 'Evolution of',
  supports: 'Supports',
  contradicts: 'Contradicts',
  disputes: 'Disputes',
  parent_of: 'Parent of',
  child_of: 'Child of',
  sibling_of: 'Sibling of',
  composed_of: 'Composed of',
  part_of: 'Part of',
  causes: 'Causes',
  influenced_by: 'Influenced by',
  prerequisite_for: 'Prerequisite for',
  implements: 'Implements',
  documents: 'Documents',
  tests: 'Tests',
  example_of: 'Example of',
  responds_to: 'Responds to',
  references: 'References',
  inspired_by: 'Inspired by',
  follows: 'Follows',
  precedes: 'Precedes',
  depends_on: 'Depends on',
  see_also: 'See also',
  builds_on: 'Builds on',
  same_theme_as: 'Same theme as',
  derived_from: 'Derived from',
  superseded_by: 'Superseded by',
  targets: 'Targets',
};
