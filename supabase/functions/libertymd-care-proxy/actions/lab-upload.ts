/**
 * P4-07 — `upload_lab`
 *
 * Linked-only lab ingest for a JWT-owned consult:
 *   login gate → owned+active patient_id → validate MIME/size →
 *   service_role put to libertymd-care path `{consultation_id}/lab/{object_uuid}` →
 *   insert libertymd_lab_uploads attribution → redact gate (fail-closed model path) →
 *   taxonomy stub → short-TTL (900s) signed read URL.
 *
 * Never rebind consult patient_id / patient_snapshot (Q2A).
 * Never invoke HT process-lab-report / unredacted model egress.
 * Never log filenames / paths / OCR text / analyte values in telemetry.
 */
import {
  LIBERTYMD_CARE_BUCKET,
  buildLibertyMdCarePath,
} from '../../_shared/libertymd-care-path.ts'
import { getOwnedConsultation } from '../lib/consultations.ts'
import { SignInRequiredError, isSignInRequiredError, jsonResponse } from '../lib/errors.ts'
import { gateLabModelEgress, redactLabForModel } from '../lib/lab-redact.ts'
import {
  LAB_SIGNED_URL_TTL_SECONDS,
  LAB_UPLOAD_CODES,
  LAB_UPLOAD_SAFE_COPY,
  assertLabSignedUrlTtl,
  decodeLabBase64,
  extensionForLabMime,
  labAnalysisStub,
  mapLabAnalytesStub,
  resolveLabBase64Payload,
  structuredResultsHaveBannedKeys,
  validateLabBytes,
} from '../lib/lab-upload.ts'
import { getOwnedActivePatient, getOwnedPatient } from '../lib/profiles.ts'
import type { ProxyContext } from '../lib/context.ts'
import type { RequestPayload } from '../lib/types.ts'

const LAB_SIGN_IN_COPY =
  'Sign in to upload a lab report. Lab reports are linked to a saved profile.'

function labReject(code: keyof typeof LAB_UPLOAD_SAFE_COPY, status = 400) {
  return jsonResponse(
    {
      error: LAB_UPLOAD_SAFE_COPY[code],
      code,
      severity: 'technical' as const,
      consult_continues: true,
    },
    status,
  )
}

export async function handleUploadLab(ctx: ProxyContext, payload: RequestPayload) {
  assertLabSignedUrlTtl(LAB_SIGNED_URL_TTL_SECONDS)

  // S1 — anonymous → sign_in_required + zero Storage + zero attribution.
  if (ctx.isAnonymous) {
    return jsonResponse(
      {
        code: new SignInRequiredError().code,
        error: LAB_SIGN_IN_COPY,
        severity: 'technical' as const,
        consult_continues: true,
      },
      403,
    )
  }

  if (!payload.consultation_id) {
    return labReject(LAB_UPLOAD_CODES.missing_consultation)
  }

  const patientId = typeof payload.patient_id === 'string' ? payload.patient_id.trim() : ''
  if (!patientId) {
    return labReject(LAB_UPLOAD_CODES.missing_patient)
  }

  // JWT ownership — never trust client user id (CONTEXT §3).
  const consultation = await getOwnedConsultation(ctx, payload.consultation_id)
  // Snapshot Q2A pre-state — must remain unchanged after attribution insert.
  const consultPatientIdBefore = consultation.patient_id
  const consultSnapshotBefore = consultation.patient_snapshot

  let attributedPatient
  try {
    const owned = await getOwnedPatient(ctx, patientId)
    if (owned.is_active === false) {
      console.warn('LibertyMD lab ingest refused inactive patient', {
        outcome: 'reject',
        reject_reason: 'patient_inactive',
      })
      return labReject(LAB_UPLOAD_CODES.patient_inactive)
    }
    // Defense in depth: active-list membership (S3).
    const active = await getOwnedActivePatient(ctx, patientId)
    if (!active) {
      return labReject(LAB_UPLOAD_CODES.patient_inactive)
    }
    attributedPatient = active
  } catch {
    console.warn('LibertyMD lab ingest refused foreign patient', {
      outcome: 'reject',
      reject_reason: 'patient_not_owned',
    })
    return labReject(LAB_UPLOAD_CODES.patient_not_owned)
  }

  const bytes = decodeLabBase64(resolveLabBase64Payload(payload))
  if (!bytes) return labReject(LAB_UPLOAD_CODES.decode_failed)

  const validated = validateLabBytes(bytes, payload.content_type)
  if (!validated.ok) return labReject(validated.code)

  const objectUuid = crypto.randomUUID()
  const path = buildLibertyMdCarePath(consultation.id, 'lab', objectUuid)
  const contentType = validated.mime

  const { error: uploadError } = await ctx.db.storage
    .from(LIBERTYMD_CARE_BUCKET)
    .upload(path, bytes, {
      contentType,
      upsert: false,
      cacheControl: 'private, max-age=0',
    })

  if (uploadError) {
    console.warn('LibertyMD lab storage put failed', {
      outcome: 'storage_failed',
      reject_reason: 'storage_failed',
      size_bucket: bytes.byteLength > 1024 * 1024 ? 'gt_1mb' : 'lte_1mb',
    })
    return labReject(LAB_UPLOAD_CODES.storage_failed, 502)
  }

  // Redaction gate — fail-closed for model egress (Q3A / S4).
  // Live OCR unset → unavailable → pending_redaction + zero model calls.
  const redact = redactLabForModel({
    bytes,
    mime: contentType,
    requireOcr: true,
  })
  const egressGate = gateLabModelEgress(redact)

  // Taxonomy stub (no live extract this ship) — empty analytes + unreviewed.
  const structured = mapLabAnalytesStub([], {
    age: attributedPatient.age ?? null,
    sex_at_birth: attributedPatient.sex_at_birth ?? null,
  })
  if (structuredResultsHaveBannedKeys(structured)) {
    console.warn('LibertyMD lab structured results ban-list violated', {
      outcome: 'reject',
      reject_reason: 'identifier_ban',
    })
    return labReject(LAB_UPLOAD_CODES.attribution_failed, 500)
  }

  const analysisStatus =
    egressGate.analysis_status === 'pending_redaction'
      ? 'pending_redaction'
      : egressGate.analysis_status === 'redacted'
        ? 'redacted'
        : 'stub'

  const { error: attrError } = await ctx.db.from('libertymd_lab_uploads').insert({
    consultation_id: consultation.id,
    object_uuid: objectUuid,
    patient_id: attributedPatient.id,
    path,
    content_type: contentType,
    analysis_status: analysisStatus,
    structured_results: structured,
  })

  if (attrError) {
    console.warn('LibertyMD lab attribution insert failed', {
      outcome: 'attribution_failed',
      reject_reason: 'attribution_failed',
    })
    return labReject(LAB_UPLOAD_CODES.attribution_failed, 502)
  }

  // Q2A — never mutate consult patient_id / patient_snapshot. Re-read assert.
  const after = await getOwnedConsultation(ctx, consultation.id)
  if (
    after.patient_id !== consultPatientIdBefore
    || JSON.stringify(after.patient_snapshot) !== JSON.stringify(consultSnapshotBefore)
  ) {
    console.warn('LibertyMD lab upload unexpectedly altered consult bind', {
      outcome: 'reject',
      reject_reason: 'consult_rebind',
    })
    return labReject(LAB_UPLOAD_CODES.attribution_failed, 500)
  }

  const { data: signed, error: signError } = await ctx.db.storage
    .from(LIBERTYMD_CARE_BUCKET)
    .createSignedUrl(path, LAB_SIGNED_URL_TTL_SECONDS)

  if (signError || !signed?.signedUrl) {
    console.warn('LibertyMD lab signed URL failed', {
      outcome: 'sign_failed',
      reject_reason: 'sign_failed',
    })
    return labReject(LAB_UPLOAD_CODES.sign_failed, 502)
  }

  const analysis = labAnalysisStub({
    status: analysisStatus === 'pending_redaction' ? 'pending_redaction' : 'stub',
    model_egress: false,
  })

  return jsonResponse({
    ok: true,
    consultation_id: consultation.id,
    path,
    object_uuid: objectUuid,
    patient_id: attributedPatient.id,
    content_type: contentType,
    extension: extensionForLabMime(contentType),
    signed_url: signed.signedUrl,
    expires_in: LAB_SIGNED_URL_TTL_SECONDS,
    analysis,
    structured_results: structured,
    consult_patient_id: after.patient_id,
    consult_continues: true,
  })
}

/** Re-export for tests that import the action module surface. */
export { isSignInRequiredError }
