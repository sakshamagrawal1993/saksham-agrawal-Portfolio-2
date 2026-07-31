/**
 * P1-24 path contract unit tests (file-shape; no live Storage).
 */
import {
  LIBERTYMD_CARE_BUCKET,
  LIBERTYMD_ASSETS_BUCKET,
  assertCleanupBucket,
  buildLibertyMdCarePath,
  consultationIdFromCarePath,
  parseLibertyMdCarePath,
} from './path.ts'

declare const Deno: {
  test: (name: string, fn: () => unknown | Promise<unknown>) => void
}

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function assertTrue(value: unknown, message?: string) {
  if (!value) throw new Error(message || 'Expected truthy')
}

const CONSULT = 'a0000000-0000-4000-8000-000000000004'
const OBJECT = 'e0000000-0000-4000-8000-000000000001'

Deno.test('P1-24 path · build + parse {consultation_id}/{kind}/{object_uuid}', () => {
  const photo = buildLibertyMdCarePath(CONSULT, 'photo', OBJECT)
  assertEquals(photo, `${CONSULT}/photo/${OBJECT}`)
  const parsed = parseLibertyMdCarePath(photo)
  assertTrue(parsed !== null)
  assertEquals(parsed?.consultationId, CONSULT)
  assertEquals(parsed?.kind, 'photo')
  assertEquals(parsed?.objectUuid, OBJECT)

  const lab = buildLibertyMdCarePath(CONSULT, 'lab', OBJECT)
  assertEquals(parseLibertyMdCarePath(lab)?.kind, 'lab')
})

Deno.test('P1-24 path · rejects free-text filename / wrong kind / short path', () => {
  assertEquals(parseLibertyMdCarePath(`${CONSULT}/photo/report.pdf`), null)
  assertEquals(parseLibertyMdCarePath(`${CONSULT}/xray/${OBJECT}`), null)
  assertEquals(parseLibertyMdCarePath(`${CONSULT}/${OBJECT}`), null)
  assertEquals(parseLibertyMdCarePath('not-a-uuid/photo/' + OBJECT), null)
})

Deno.test('P1-24 path · retention keys off first segment only', () => {
  assertEquals(consultationIdFromCarePath(`${CONSULT}/photo/${OBJECT}`), CONSULT)
  assertEquals(consultationIdFromCarePath('bad/photo/' + OBJECT), null)
})

Deno.test('P1-24 path · bucket allow-list rejects libertymd-assets', () => {
  assertEquals(LIBERTYMD_CARE_BUCKET, 'libertymd-care')
  assertEquals(LIBERTYMD_ASSETS_BUCKET, 'libertymd-assets')
  assertCleanupBucket(LIBERTYMD_CARE_BUCKET)
  let rejected = false
  try {
    assertCleanupBucket(LIBERTYMD_ASSETS_BUCKET)
  } catch {
    rejected = true
  }
  assertTrue(rejected, 'libertymd-assets must be rejected')
})
