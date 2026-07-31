/**
 * P3-03 · Trust chrome allow-list (permissioned likenesses + rating metadata).
 *
 * Empty inventory is a valid DoD state: ship zero named likenesses until a
 * documented permission pack exists. See tickets/P3-03/permissions.md.
 */

export type LibertyMdTrustPermission = {
  id: string
  displayName: string
  likenessKind: 'doctor' | 'patient' | 'other'
  /** Must be true before any clinical/diagnostic-accuracy endorsement copy ships. */
  accuracyEndorsementConsent: boolean
  notes?: string
}

/** Closed allow-list of permissioned named likenesses. Default: empty. */
export const LIBERTYMD_TRUST_PERMISSIONS: readonly LibertyMdTrustPermission[] = []

/** Traceable star ratings only — empty until a real source + visible count exist. */
export const LIBERTYMD_TRUST_STAR_RATINGS: readonly {
  id: string
  score: number
  reviewCount: number
  sourceLabel: string
  sourceUrl: string
}[] = []

export function isLibertyMdTrustPermissionId(id: string): boolean {
  return LIBERTYMD_TRUST_PERMISSIONS.some((entry) => entry.id === id)
}
