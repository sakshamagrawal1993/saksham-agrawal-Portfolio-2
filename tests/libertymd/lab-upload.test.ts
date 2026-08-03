/**
 * P4-07 · Lab report upload contracts (no live Storage / OAuth).
 *
 * Covers: login gate, path kind=lab, MIME/size, attribution/identifier ban,
 * redact fail-closed / stub zero-egress, taxonomy stub, no consult rebind,
 * technical non-block, FE clinical-writer ban, HT separability, CARE honesty.
 */
import {
  LIBERTYMD_CARE_BUCKET,
  buildLibertyMdCarePath,
  parseLibertyMdCarePath,
} from '../../supabase/functions/_shared/libertymd-care-path.ts'
import {
  assertModelBoundTextRedacted,
  dropIdentifierTokens,
  gateLabModelEgress,
  redactLabForModel,
} from '../../supabase/functions/libertymd-care-proxy/lib/lab-redact.ts'
import {
  LAB_ALLOWED_MIME,
  LAB_IDENTIFIER_BAN_KEYS,
  LAB_MAX_BYTES,
  LAB_SIGNED_URL_TTL_SECONDS,
  LAB_TAXONOMY_STUB_MAP,
  LAB_UPLOAD_CODES,
  LAB_UPLOAD_SAFE_COPY,
  assertLabSignedUrlTtl,
  decodeLabBase64,
  encodeLabBase64,
  labAnalysisStub,
  mapLabAnalytesStub,
  normalizeLabMime,
  normalizeLabAnalysis,
  resolveLabBase64Payload,
  structuredResultsHaveBannedKeys,
  validateLabBytes,
} from '../../supabase/functions/libertymd-care-proxy/lib/lab-upload.ts'

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
const OBJECT = 'e0000000-0000-4000-8000-000000000002'
const PATIENT = 'b0000000-0000-4000-8000-000000000001'

/**
 * Resolve a migration by its descriptive suffix rather than its timestamp.
 * Migrations get renumbered when ordering changes; a hardcoded timestamp turns
 * that routine reshuffle into a test failure that looks like a product break.
 */
async function readMigrationBySuffix(suffix: string): Promise<string> {
  const dir = new URL('../../supabase/migrations/', import.meta.url)
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && entry.name.endsWith(suffix)) {
      return await Deno.readTextFile(new URL(entry.name, dir))
    }
  }
  throw new Error(`no migration ending in ${suffix}`)
}

Deno.test('P4-07 path · lab kind builds {consultation_id}/lab/{uuid}', () => {
  const path = buildLibertyMdCarePath(CONSULT, 'lab', OBJECT)
  assertEquals(path, `${CONSULT}/lab/${OBJECT}`)
  const parsed = parseLibertyMdCarePath(path)
  assertTrue(parsed !== null)
  assertEquals(parsed?.kind, 'lab')
  assertEquals(parsed?.consultationId, CONSULT)
  assertEquals(parsed?.objectUuid, OBJECT)
  assertEquals(LIBERTYMD_CARE_BUCKET, 'libertymd-care')
})

Deno.test('P4-07 path · never encodes patient_id / name in path', () => {
  const path = buildLibertyMdCarePath(CONSULT, 'lab', OBJECT)
  assertFalse(path.includes(PATIENT))
  assertFalse(/lab\/.*name/i.test(path))
  assertEquals(parseLibertyMdCarePath(`${CONSULT}/lab/report.pdf`), null)
})

Deno.test('P4-07 MIME · allow pdf + jpeg/png/webp; reject heic/exe', () => {
  assertEquals(normalizeLabMime('application/pdf'), 'application/pdf')
  assertEquals(normalizeLabMime('image/jpeg'), 'image/jpeg')
  assertEquals(normalizeLabMime('image/png'), 'image/png')
  assertEquals(normalizeLabMime('image/webp'), 'image/webp')
  assertEquals(normalizeLabMime('image/heic'), null)
  assertEquals(normalizeLabMime('application/x-msdownload'), null)
  assertEquals(LAB_ALLOWED_MIME.includes('application/pdf'), true)
})

Deno.test('P4-07 size · reject over 10 MiB', () => {
  const over = new Uint8Array(LAB_MAX_BYTES + 1)
  const result = validateLabBytes(over, 'application/pdf')
  assertEquals(result.ok, false)
  if (!result.ok) assertEquals(result.code, LAB_UPLOAD_CODES.too_large)
})

Deno.test('P4-07 size · accept under 10 MiB pdf bytes', () => {
  const ok = validateLabBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46]), 'application/pdf')
  assertEquals(ok.ok, true)
})

Deno.test('P4-07 TTL · signed URL constant ≤ 900', () => {
  assertTrue(LAB_SIGNED_URL_TTL_SECONDS <= 900)
  assertEquals(LAB_SIGNED_URL_TTL_SECONDS, 900)
  assertLabSignedUrlTtl(LAB_SIGNED_URL_TTL_SECONDS)
})

Deno.test('P4-07 transport · file_base64 preferred; image_base64 alias', () => {
  assertEquals(resolveLabBase64Payload({ file_base64: 'AAA', image_base64: 'BBB' }), 'AAA')
  assertEquals(resolveLabBase64Payload({ image_base64: 'BBB' }), 'BBB')
})

Deno.test('P4-07 decode · base64 round-trip', () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0)
  const decoded = decodeLabBase64(btoa(binary))
  assertTrue(decoded !== null)
  assertEquals(decoded!.length, bytes.length)
  assertEquals(decoded![0], 0x25)
})

Deno.test('P4-07 live analysis · validates canonical ids and preserves unmapped rows', () => {
  assertTrue(encodeLabBase64(new Uint8Array([0x25, 0x50, 0x44, 0x46])).length > 0)
  const normalized = normalizeLabAnalysis(
    {
      usable: true,
      panel_name: 'CBC',
      report_date: '',
      results: [
        {
          raw_name: 'Hemoglobin (Hb)', parameter_id: '718-7', parameter_name: 'wrong',
          value: '12.5', numeric_value: 12.5, raw_unit: 'g/dL', standardized_unit: 'wrong',
          reference_range: '13.0 - 17.0', printed_flag: 'Low', classification: 'below_range',
          analysis: 'Below the printed range.',
        },
        {
          raw_name: 'Unknown X', parameter_id: 'invented', parameter_name: 'Invented',
          value: '1', numeric_value: 1, raw_unit: 'x', standardized_unit: 'x',
          reference_range: '', printed_flag: '', classification: 'within_range', analysis: '',
        },
      ],
      analysis_summary: { headline: 'One printed low result.', highlights: [], limitations: [] },
    },
    [{ id: '718-7', name: 'Hemoglobin Hb', unit: 'g/dL' }],
  )
  assertTrue(normalized !== null)
  assertEquals(normalized?.extracted_count, 2)
  assertEquals(normalized?.standardized_count, 1)
  assertEquals(normalized?.unmapped_count, 1)
  assertEquals(normalized?.results[0]?.parameter_name, 'Hemoglobin Hb')
  assertEquals(normalized?.results[1]?.parameter_id, null)
  assertEquals(normalized?.raw_retained, false)
})

Deno.test('P4-07 redact · OCR-and-drop name/DOB ≠ raw; fail-closed on error', () => {
  const raw =
    'Patient Name: Jane Synthetic\nDOB: 01/02/1990\nMRN: ABC-12345\nHemoglobin 13.2 g/dL'
  const { text, dropped } = dropIdentifierTokens(raw)
  assertTrue(dropped)
  assertTrue(assertModelBoundTextRedacted(raw, text, true))
  assertFalse(/Jane Synthetic/.test(text))
  assertFalse(/01\/02\/1990/.test(text))
  assertFalse(/ABC-12345/.test(text))

  const ok = redactLabForModel({ bytes: new Uint8Array([1]), mime: 'application/pdf', ocrText: raw })
  assertEquals(ok.ok, true)
  if (ok.ok) {
    assertTrue(ok.identifiersDropped)
    assertTrue(assertModelBoundTextRedacted(raw, ok.redactedText, true))
  }

  const fail = redactLabForModel({
    bytes: new Uint8Array([1]),
    mime: 'application/pdf',
    forceError: true,
  })
  assertEquals(fail.ok, false)
  const gateFail = gateLabModelEgress(fail)
  assertEquals(gateFail.model_egress, false)

  const unavailable = redactLabForModel({
    bytes: new Uint8Array([1]),
    mime: 'application/pdf',
    requireOcr: true,
  })
  assertEquals(unavailable.ok, false)
  const gateStub = gateLabModelEgress(unavailable)
  assertEquals(gateStub.model_egress, false)
  assertEquals(gateStub.analysis_status, 'pending_redaction')
})

Deno.test('P4-07 analysis · stub honesty + zero model egress', () => {
  const stub = labAnalysisStub()
  assertEquals(stub.status, 'stub')
  assertEquals(stub.analyzed, false)
  assertEquals(stub.model_egress, false)
  assertEquals(stub.runtime_dependency, null)
  assertEquals(stub.review_state, 'unreviewed')

  const pending = labAnalysisStub({ status: 'pending_redaction' })
  assertEquals(pending.status, 'pending_redaction')
  assertEquals(pending.model_egress, false)
})

Deno.test('P4-07 taxonomy · stub map reuses definition ids; unreviewed; no identifier keys', () => {
  assertTrue(typeof LAB_TAXONOMY_STUB_MAP.hba1c === 'string')
  const mapped = mapLabAnalytesStub(
    [
      { label: 'HbA1c', value: 5.2, unit: '%' },
      { label: 'UnknownAnalyteX', value: 1, unit: 'x' },
    ],
    { age: 42, sex_at_birth: 'female' },
  )
  assertEquals(mapped.review_state, 'unreviewed')
  assertEquals(mapped.demography_source, 'attributed_profile')
  assertEquals(mapped.analytes[0]?.mapped, true)
  assertEquals(mapped.analytes[0]?.parameter_id, LAB_TAXONOMY_STUB_MAP.hba1c)
  assertEquals(mapped.analytes[1]?.unmapped, true)
  assertFalse(structuredResultsHaveBannedKeys(mapped))
  for (const key of LAB_IDENTIFIER_BAN_KEYS) {
    assertFalse(Object.prototype.hasOwnProperty.call(mapped, key))
  }
  assertTrue(
    structuredResultsHaveBannedKeys({ patient_name: 'x', analytes: [] }),
    'ban list must catch patient_name',
  )
})

Deno.test('P4-07 failure · technical copy + consult continues codes', () => {
  for (const code of Object.values(LAB_UPLOAD_CODES)) {
    const copy = LAB_UPLOAD_SAFE_COPY[code]
    assertTrue(typeof copy === 'string' && copy.length > 0)
    assertFalse(/emergency|911|seek care|chest pain|critically low/i.test(copy), `clinical clothing in ${code}`)
  }
})

Deno.test('P4-07 source · login gate + user-linked standardized rows + zero raw retention', async () => {
  const action = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-care-proxy/actions/lab-upload.ts', import.meta.url),
  )
  assertTrue(/isAnonymous/.test(action), 'anon login gate')
  assertTrue(/new SignInRequiredError\(\)\.code/.test(action))
  assertTrue(/libertymd_lab_uploads/.test(action), 'Q1A attribution insert')
  assertTrue(/libertymd_lab_results/.test(action), 'canonical result rows')
  assertTrue(/user_id:\s*ctx\.user\.id/.test(action), 'JWT user attribution')
  assertTrue(/LAB_ANALYSIS_WEBHOOK/.test(action), 'LibertyMD lab agent')
  assertTrue(/\.from\('libertymd_health_parameter_definitions'\)/.test(action), 'LibertyMD-owned taxonomy')
  assertFalse(/\.from\('health_parameter_definitions'\)/.test(action), 'no Health Twin taxonomy lookup')
  assertFalse(/\.storage\s*\./.test(action), 'raw report must not be persisted')
  assertFalse(/\bgetPublicUrl\s*\(/.test(action))
  assertFalse(/functions\/process-lab-report/.test(action))
  assertFalse(/N8N_HEALTH_TWIN_LAB/.test(action))
  assertFalse(/\.update\(\s*\{[^}]*patient_id/.test(action), 'must not rebind consult patient_id')
  assertTrue(/patient_snapshot/.test(action), 'Q2A snapshot unchanged assert present')
  assertTrue(/consult_continues:\s*true/.test(action))
  assertTrue(/raw_retained:\s*false/.test(action))

  const migration = await Deno.readTextFile(
    new URL('../../supabase/migrations/20260801000000_libertymd_lab_upload_p4_07.sql', import.meta.url),
  )
  assertTrue(/libertymd_lab_uploads/.test(migration))
  assertTrue(/enable row level security/i.test(migration))
  assertTrue(/revoke all on table public\.libertymd_lab_uploads/i.test(migration))
  for (const key of LAB_IDENTIFIER_BAN_KEYS) {
    assertFalse(new RegExp(`\\b${key}\\b\\s+(text|varchar|jsonb)`, 'i').test(migration), `column ${key} banned`)
  }
  assertFalse(/create table if not exists public\.health_parameter_/i.test(migration), 'no parallel taxonomy')
  assertTrue(/application\/pdf/.test(migration), 'bucket MIME includes PDF')

  const analysisMigration = await Deno.readTextFile(
    new URL('../../supabase/migrations/20260801120000_libertymd_media_analysis.sql', import.meta.url),
  )
  assertTrue(/libertymd_lab_results/.test(analysisMigration))
  assertTrue(/user_id uuid not null references auth\.users/.test(analysisMigration))
  assertTrue(/raw_deleted_at/.test(analysisMigration))

  const dictionaryMigration = await readMigrationBySuffix('_libertymd_parameter_definitions.sql')
  assertTrue(/create table if not exists public\.libertymd_health_parameter_definitions/.test(dictionaryMigration))
  assertEquals((dictionaryMigration.match(/^  \('/gm) || []).length, 192, 'portable dictionary row count')
  // The dictionary migration now runs BEFORE the one that creates
  // `libertymd_lab_results`, so the foreign key is declared inline at table
  // creation rather than retrofitted afterwards. Assert the constraint where it
  // actually lives; there is no longer a `drop constraint ... _fkey` retrofit
  // to find, and asserting on its absence-by-design would be asserting on a
  // migration ordering accident rather than on the schema contract.
  assertTrue(
    /references public\.libertymd_health_parameter_definitions\(id\)/.test(analysisMigration),
    'lab_results.parameter_id references the dictionary',
  )
  assertFalse(/(?:insert into|from|references) public\.health_parameter_definitions/i.test(dictionaryMigration), 'portable seed has no shared-table dependency')

  const dictionaryVerification = await readMigrationBySuffix('_libertymd_parameter_dictionary_verify.sql')
  assertTrue(/definition_count <> 192/.test(dictionaryVerification), 'replay verifies complete snapshot')
  assertTrue(/target_table\.relname = 'libertymd_health_parameter_definitions'/.test(dictionaryVerification))
  assertTrue(/still depends on the shared parameter dictionary/.test(dictionaryVerification))

  const types = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-care-proxy/lib/types.ts', import.meta.url),
  )
  assertTrue(/'upload_lab'/.test(types))

  const index = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-care-proxy/index.ts', import.meta.url),
  )
  assertTrue(/upload_lab/.test(index))
  assertTrue(/handleUploadLab/.test(index))

  const attach = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDAttachControls.tsx', import.meta.url),
  )
  assertTrue(/data-libertymd-attach-lab/.test(attach))
  assertTrue(/labLinked/.test(attach))
  assertFalse(/storage\.from\(\s*['"]libertymd-care['"]\)/.test(attach))
  assertFalse(/attachLabComingSoon/.test(attach) && /disabled\s*\n\s*aria-disabled="true"/.test(attach))

  const chat = await Deno.readTextFile(
    new URL('../../components/LibertyMD/LibertyMDChat.tsx', import.meta.url),
  )
  assertFalse(/\.from\(\s*['"]libertymd_/.test(chat), 'Chat must not write clinical tables')
  assertTrue(/uploadLabBody/.test(chat))
  assertTrue(/LibertyMDLabAttributionSheet/.test(chat))
  assertTrue(/labLinked=\{!isAnonymous\}/.test(chat))

  const photoAction = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-care-proxy/actions/photo-upload.ts', import.meta.url),
  )
  assertTrue(/handleUploadPhoto/.test(photoAction), 'Lane F photo handler intact')

  const care = await Deno.readTextFile(
    new URL('../../docs/libertymd/CARE-ARCHITECTURE.md', import.meta.url),
  )
  assertTrue(/Lab report upload and analysis \(P4-07\)/.test(care))
  assertTrue(/libertymd_lab_uploads/.test(care))
  assertTrue(/libertymd_lab_results/.test(care))
  assertTrue(/libertymd_health_parameter_definitions/.test(care))
  assertTrue(/raw (?:lab )?report.*never persisted/i.test(care))
  assertTrue(/ai_generated_unreviewed/.test(care))

  const telemetry = await Deno.readTextFile(
    new URL('../../supabase/functions/libertymd-care-proxy/lib/telemetry.ts', import.meta.url),
  )
  const namesMatch = telemetry.match(/export const PRODUCT_EVENT_NAMES = \[([\s\S]*?)\] as const/)
  const names = (namesMatch?.[1] || '').match(/'[^']+'/g) || []
  assertEquals(names.length, 18, 'PRODUCT_EVENT_NAMES stay closed at 18')
  assertFalse(/lab_/.test(namesMatch?.[1] || ''))
})
