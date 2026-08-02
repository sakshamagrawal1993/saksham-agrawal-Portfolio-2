/**
 * P4-06 · Private photo upload and retry contracts (no live Storage calls).
 *
 * Covers path kind photo, MIME/size reject, EXIF strip fixture, signed-URL TTL ≤ 900,
 * analysis stub honesty, technical failure non-block, no public URL helpers,
 * FE clinical-writer ban (source grep), cleanup path still keyable.
 */
import {
  LIBERTYMD_CARE_BUCKET,
  buildLibertyMdCarePath,
  parseLibertyMdCarePath,
} from '../../supabase/functions/_shared/libertymd-care-path.ts'
import {
  hasLocationExif,
  stripImageExif,
  stripJpegExif,
} from '../../supabase/functions/libertymd-care-proxy/lib/exif-strip.ts'
import {
  PHOTO_ALLOWED_MIME,
  PHOTO_MAX_BYTES,
  PHOTO_SIGNED_URL_TTL_SECONDS,
  PHOTO_UPLOAD_CODES,
  PHOTO_UPLOAD_SAFE_COPY,
  assertPhotoSignedUrlTtl,
  decodePhotoBase64,
  encodePhotoBase64,
  normalizePhotoMime,
  normalizePhotoAnalysis,
  photoAnalysisStub,
  validatePhotoBytes,
} from '../../supabase/functions/libertymd-care-proxy/lib/photo-upload.ts'

declare const Deno: {
  test: (name: string, fn: () => unknown | Promise<unknown>) => void
  readTextFile: (path: URL | string) => Promise<string>
}

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function assertTrue(value: unknown, message?: string) {
  if (!value) throw new Error(message || 'Expected truthy')
}

function assertFalse(value: unknown, message?: string) {
  if (value) throw new Error(message || 'Expected falsy')
}

const CONSULT = 'a0000000-0000-4000-8000-000000000004'
const OBJECT = 'e0000000-0000-4000-8000-000000000001'

/** Minimal JPEG SOI + APP1 Exif w/ GPS IFD tag bytes + EOI. */
function jpegWithGpsExif(): Uint8Array {
  const soi = [0xff, 0xd8]
  const exifAscii = [
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x4d, 0x4d, 0x00, 0x2a,
    0x00, 0x00, 0x00, 0x08,
    0x00, 0x01,
    0x88, 0x25,
    0x00, 0x04,
    0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00,
  ]
  const len = 2 + exifAscii.length
  const app1 = [0xff, 0xe1, (len >> 8) & 0xff, len & 0xff, ...exifAscii]
  const eoi = [0xff, 0xd9]
  return new Uint8Array([...soi, ...app1, ...eoi])
}

function minimalJpeg(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
}

Deno.test('P4-06 path · photo kind builds {consultation_id}/photo/{uuid}', () => {
  const path = buildLibertyMdCarePath(CONSULT, 'photo', OBJECT)
  assertEquals(path, `${CONSULT}/photo/${OBJECT}`)
  const parsed = parseLibertyMdCarePath(path)
  assertTrue(parsed !== null)
  assertEquals(parsed?.kind, 'photo')
  assertEquals(parsed?.consultationId, CONSULT)
  assertEquals(parsed?.objectUuid, OBJECT)
  assertEquals(LIBERTYMD_CARE_BUCKET, 'libertymd-care')
})

Deno.test('P4-06 path · rejects free-text filename as object segment', () => {
  assertEquals(parseLibertyMdCarePath(`${CONSULT}/photo/wound.jpg`), null)
  assertEquals(parseLibertyMdCarePath(`${CONSULT}/xray/${OBJECT}`), null)
})

Deno.test('P4-06 MIME · allow jpeg/png/webp only; reject pdf/heic', () => {
  assertEquals(normalizePhotoMime('image/jpeg'), 'image/jpeg')
  assertEquals(normalizePhotoMime('image/png'), 'image/png')
  assertEquals(normalizePhotoMime('image/webp'), 'image/webp')
  assertEquals(normalizePhotoMime('application/pdf'), null)
  assertEquals(normalizePhotoMime('image/heic'), null)
  assertEquals(PHOTO_ALLOWED_MIME.includes('image/jpeg'), true)
})

Deno.test('P4-06 size · reject over 5 MiB', () => {
  const over = new Uint8Array(PHOTO_MAX_BYTES + 1)
  const result = validatePhotoBytes(over, 'image/jpeg')
  assertEquals(result.ok, false)
  if (!result.ok) assertEquals(result.code, PHOTO_UPLOAD_CODES.too_large)
})

Deno.test('P4-06 size · accept under 5 MiB jpeg', () => {
  const ok = validatePhotoBytes(minimalJpeg(), 'image/jpeg')
  assertEquals(ok.ok, true)
})

Deno.test('P4-06 EXIF · GPS fixture stripped on ingest', () => {
  const withGps = jpegWithGpsExif()
  assertTrue(hasLocationExif(withGps), 'fixture must contain location EXIF')
  const stripped = stripJpegExif(withGps)
  assertFalse(hasLocationExif(stripped), 'stored bytes must not retain GPS EXIF')
  assertEquals(stripImageExif(withGps, 'image/jpeg').length, stripped.length)
})

Deno.test('P4-06 TTL · signed URL constant ≤ 900', () => {
  assertTrue(PHOTO_SIGNED_URL_TTL_SECONDS <= 900)
  assertEquals(PHOTO_SIGNED_URL_TTL_SECONDS, 900)
  assertPhotoSignedUrlTtl(PHOTO_SIGNED_URL_TTL_SECONDS)
})

Deno.test('P4-06 analysis · stub honesty (not live HT)', () => {
  const stub = photoAnalysisStub()
  assertEquals(stub.status, 'stub')
  assertEquals(stub.analyzed, false)
  assertEquals(stub.runtime_dependency, null)
})

Deno.test('P4-06 failure · technical copy + consult continues codes', () => {
  for (const code of Object.values(PHOTO_UPLOAD_CODES)) {
    const copy = PHOTO_UPLOAD_SAFE_COPY[code]
    assertTrue(typeof copy === 'string' && copy.length > 0)
    assertFalse(/emergency|911|seek care|chest pain/i.test(copy), `clinical clothing in ${code}`)
  }
})

Deno.test('P4-06 decode · base64 round-trip', () => {
  const bytes = minimalJpeg()
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0)
  const b64 = btoa(binary)
  const decoded = decodePhotoBase64(b64)
  assertTrue(decoded !== null)
  assertEquals(decoded!.length, bytes.length)
  assertEquals(decoded![0], 0xff)
})

Deno.test('P4-06 live analysis · canonical observation-only response', () => {
  const encoded = encodePhotoBase64(minimalJpeg())
  assertTrue(encoded.length > 0)
  const result = normalizePhotoAnalysis({
    usable: true,
    modality: 'clinical_photo',
    image_quality: 'good',
    body_region: 'foot',
    observations: [
      { feature: 'surface', description: 'Fine scale and a shallow fissure are visible.' },
      { feature: 'diagnosis', description: 'Tinea infection' },
    ],
    limitations: ['Depth cannot be assessed from a photograph.'],
  })
  assertTrue(result !== null)
  assertEquals(result?.observations.length, 1, 'diagnostic leakage must be removed')
  assertEquals(result?.analysis_kind, 'observation_only')
})

Deno.test('P4-06 source · private sanitized object supports an authorized retry', async () => {
  const action = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-care-proxy/actions/photo-upload.ts', import.meta.url),
  )
  assertFalse(/\bgetPublicUrl\s*\(/.test(action), 'photo-upload must never call getPublicUrl')
  assertFalse(
    /process-lab-report|from ['"].*process-lab-report/.test(action)
      && /import|invoke|fetch/.test(action),
    'must not import/invoke HT process-lab-report',
  )
  // Explicit ban on runtime wiring strings that are not documentary CARE text.
  assertFalse(/functions\/process-lab-report/.test(action))
  assertFalse(/N8N_HEALTH_TWIN_LAB/.test(action))
  assertTrue(/\.storage\s*\n?\s*\.from\(LIBERTYMD_CARE_BUCKET\)/.test(action), 'proxy uses private care bucket')
  assertTrue(/\.upload\(path, stripped/.test(action), 'only EXIF-stripped bytes are stored')
  assertTrue(/\.createSignedUrl\(path, PHOTO_SIGNED_URL_TTL_SECONDS\)/.test(action), 'short signed URL')
  assertTrue(/\.download\(row\.path\)/.test(action), 'retry reloads the server-owned object')
  assertTrue(/handleRetryPhotoAnalysis/.test(action), 'retry handler exists')
  assertTrue(/\.eq\('user_id', ctx\.user\.id\)/.test(action), 'retry is scoped to JWT owner')
  assertTrue(/analysis_attempts\s*>?=\s*20/.test(action), 'retry attempts are bounded')
  assertTrue(/PHOTO_ANALYSIS_WEBHOOK/.test(action), 'must call LibertyMD photo agent')
  assertTrue(/libertymd_photo_analyses/.test(action), 'must persist analysis attribution')
  assertTrue(/user_id:\s*ctx\.user\.id/.test(action), 'must derive user_id from JWT')
  assertTrue(/raw_retained:\s*true/.test(action))

  const attach = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDAttachControls.tsx', import.meta.url),
  )
  assertTrue(/data-libertymd-attach-photo/.test(attach))
  assertTrue(/data-libertymd-attach-lab/.test(attach))
  assertTrue(/labLinked/.test(attach), 'Lab linked gate present (P4-07)')
  assertFalse(/storage\.from\(\s*['"]libertymd-care['"]\)/.test(attach))
  assertTrue(/data-libertymd-attach-photo-input/.test(attach))

  const chat = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDChat.tsx', import.meta.url),
  )
  assertFalse(/\.from\(\s*['"]libertymd_/.test(chat), 'Chat must not write clinical tables')
  assertTrue(/LibertyMDAttachControls/.test(chat))
  assertTrue(/uploadPhotoBody/.test(chat))
  assertTrue(/retryPhotoAnalysisBody/.test(chat))
  assertTrue(/analysis_status:\s*'processed'/.test(chat))

  const care = await Deno.readTextFile(
    new URL('../../docs/libertymd/CARE-ARCHITECTURE.md', import.meta.url),
  )
  assertTrue(/private.*libertymd-care/i.test(care))
  assertTrue(/retry_photo_analysis/.test(care))
  assertTrue(/900-second signed URL/.test(care))
  assertTrue(/libertymd_photo_analyses/.test(care))
  assertTrue(/P4-07/.test(care))
})
