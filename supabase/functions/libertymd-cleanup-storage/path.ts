/**
 * P1-24 path ownership contract — re-exports shared builders (P4-06).
 * Shape: {consultation_id}/{kind}/{object_uuid}
 * kind ∈ {photo, lab}
 * Cleanup keys off first segment only — never read object bytes/EXIF.
 * Predicate / orphan logic stays in index.ts; this file is shared export only.
 */
export {
  ALLOWED_KINDS,
  LIBERTYMD_ASSETS_BUCKET,
  LIBERTYMD_CARE_BUCKET,
  assertCleanupBucket,
  buildLibertyMdCarePath,
  consultationIdFromCarePath,
  isAllowedKind,
  isUuid,
  parseLibertyMdCarePath,
  type LibertyMdCareKind,
  type ParsedCarePath,
} from '../_shared/libertymd-care-path.ts'
