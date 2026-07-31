/**
 * P1-24 / P4-06 path ownership contract for libertymd-care.
 * Shape: {consultation_id}/{kind}/{object_uuid}
 * kind ∈ {photo, lab}
 * Cleanup keys off first segment only — never read object bytes/EXIF.
 *
 * Shared by libertymd-cleanup-storage and libertymd-care-proxy so builders agree.
 */

export const LIBERTYMD_CARE_BUCKET = 'libertymd-care' as const

/** Marketing bucket — never a cleanup / orphan / care-upload target. */
export const LIBERTYMD_ASSETS_BUCKET = 'libertymd-assets' as const

export const ALLOWED_KINDS = ['photo', 'lab'] as const
export type LibertyMdCareKind = (typeof ALLOWED_KINDS)[number]

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ParsedCarePath = {
  consultationId: string
  kind: LibertyMdCareKind
  objectUuid: string
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function isAllowedKind(value: string): value is LibertyMdCareKind {
  return (ALLOWED_KINDS as readonly string[]).includes(value)
}

/** Parse locked path; reject free-text filenames / wrong segment counts. */
export function parseLibertyMdCarePath(objectPath: string): ParsedCarePath | null {
  const parts = objectPath.split('/').filter(Boolean)
  if (parts.length !== 3) return null
  const [consultationId, kind, objectUuid] = parts
  if (!isUuid(consultationId) || !isUuid(objectUuid)) return null
  if (!isAllowedKind(kind)) return null
  return { consultationId, kind, objectUuid }
}

/** First segment only — retention / orphan key. */
export function consultationIdFromCarePath(objectPath: string): string | null {
  const first = objectPath.split('/').filter(Boolean)[0]
  if (!first || !isUuid(first)) return null
  return first
}

export function buildLibertyMdCarePath(
  consultationId: string,
  kind: LibertyMdCareKind,
  objectUuid: string,
): string {
  if (!isUuid(consultationId) || !isUuid(objectUuid)) {
    throw new Error('consultationId and objectUuid must be UUIDs')
  }
  if (!isAllowedKind(kind)) {
    throw new Error('kind must be photo or lab')
  }
  return `${consultationId}/${kind}/${objectUuid}`
}

export function assertCleanupBucket(bucketId: string): void {
  if (bucketId === LIBERTYMD_ASSETS_BUCKET) {
    throw new Error('libertymd-assets is marketing-only and out of cleanup scope')
  }
  if (bucketId !== LIBERTYMD_CARE_BUCKET) {
    throw new Error(`Cleanup allow-list rejects bucket: ${bucketId}`)
  }
}
