import { normalizeObject } from './n8n-client.ts'
import { cleanMessage } from './utils.ts'
import type { ProxyContext } from './context.ts'
import type { ConsultationRow, JsonObject } from './types.ts'

export const MAX_MEDIA_FOLLOWUPS_PER_EVIDENCE = 2
export const MAX_MEDIA_EXTENSION_TURNS = 4
export const MAX_TOTAL_TURNS = 15 + MAX_MEDIA_EXTENSION_TURNS
export const MEDIA_PROCESSING_STALE_MS = 3 * 60 * 1000

export type MediaEvidenceKind = 'photo' | 'lab'
export type MediaEvidenceStatus = 'processing' | 'processed' | 'unusable' | 'failed'

export type MediaFollowup = {
  id: string
  evidence_kind: MediaEvidenceKind
  evidence_object_uuid: string
  question_order: number
  question_text: string
  status: 'pending' | 'asked' | 'answered' | 'waived'
  answer_text: string | null
  asked_turn: number | null
  answered_turn: number | null
}

export type MediaEvidencePacket = {
  evidence_id: string
  kind: MediaEvidenceKind
  patient_id: string
  content_type: string
  status: MediaEvidenceStatus
  summary: string
  clinical_facts: JsonObject
  limitations: string[]
  review_state: string
  considered_in_consultation: boolean
  followups: MediaFollowup[]
  created_at: string | null
  updated_at: string | null
}

const boundedStrings = (value: unknown, maxItems: number, maxLength: number): string[] =>
  (Array.isArray(value) ? value : [])
    .map((item) => cleanMessage(item).slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)

function processingIsStale(updatedAt: unknown): boolean {
  const timestamp = typeof updatedAt === 'string' ? Date.parse(updatedAt) : Number.NaN
  return Number.isFinite(timestamp) && Date.now() - timestamp >= MEDIA_PROCESSING_STALE_MS
}

function photoStatus(value: unknown, updatedAt?: unknown): MediaEvidenceStatus {
  if (value === 'analyzed') return 'processed'
  if (value === 'unusable') return 'unusable'
  if (value === 'failed') return 'failed'
  if (processingIsStale(updatedAt)) return 'failed'
  return 'processing'
}

function labStatus(value: unknown, updatedAt?: unknown): MediaEvidenceStatus {
  if (value === 'mapped') return 'processed'
  if (value === 'failed') return 'failed'
  if (processingIsStale(updatedAt)) return 'failed'
  return 'processing'
}

function photoPacket(row: Record<string, unknown>, patientId: string): MediaEvidencePacket {
  const analysis = normalizeObject(row.analysis_data)
  const observations = (Array.isArray(analysis.observations) ? analysis.observations : [])
    .map((item) => {
      const source = normalizeObject(item)
      return {
        feature: cleanMessage(source.feature).slice(0, 60),
        description: cleanMessage(source.description).slice(0, 300),
      }
    })
    .filter((item) => item.feature && item.description)
    .slice(0, 10)
  const bodyRegion = cleanMessage(analysis.body_region).slice(0, 80)
  const explicitSummary = cleanMessage(analysis.summary).slice(0, 500)
  const derivedSummary = observations.slice(0, 3).map((item) => `${item.feature}: ${item.description}`).join('; ')
  return {
    evidence_id: String(row.object_uuid || ''),
    kind: 'photo',
    patient_id: String(row.patient_id || ''),
    content_type: String(row.content_type || ''),
    status: photoStatus(row.analysis_status, row.updated_at),
    summary: explicitSummary || derivedSummary || (bodyRegion ? `Photo of ${bodyRegion} processed.` : 'Photo processed.'),
    clinical_facts: {
      modality: cleanMessage(analysis.modality).slice(0, 40),
      image_quality: cleanMessage(analysis.image_quality).slice(0, 20),
      body_region: bodyRegion,
      observations,
      analysis_kind: 'observation_only',
    },
    limitations: boundedStrings(analysis.limitations, 6, 240),
    review_state: 'ai_generated_unreviewed',
    considered_in_consultation: String(row.patient_id || '') === patientId,
    followups: [],
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
  }
}

function labPacket(row: Record<string, unknown>, patientId: string): MediaEvidencePacket {
  const structured = normalizeObject(row.structured_results)
  const summary = normalizeObject(row.analysis_summary)
  const results = (Array.isArray(structured.results) ? structured.results : [])
    .map((item) => {
      const source = normalizeObject(item)
      return {
        parameter_name: cleanMessage(source.parameter_name || source.raw_name).slice(0, 160),
        value: cleanMessage(source.value).slice(0, 60),
        unit: cleanMessage(source.standardized_unit || source.raw_unit).slice(0, 40),
        reference_range: cleanMessage(source.reference_range).slice(0, 80),
        classification: cleanMessage(source.classification).slice(0, 30),
        analysis: cleanMessage(source.analysis).slice(0, 280),
      }
    })
    .filter((item) => item.parameter_name)
  const prioritized = [
    ...results.filter((item) => item.classification && !['within_range', 'unclassified'].includes(item.classification)),
    ...results.filter((item) => ['within_range', 'unclassified', ''].includes(item.classification)),
  ].slice(0, 24)
  const headline = cleanMessage(summary.headline).slice(0, 500)
  const highlights = boundedStrings(summary.highlights, 8, 240)
  return {
    evidence_id: String(row.object_uuid || ''),
    kind: 'lab',
    patient_id: String(row.patient_id || ''),
    content_type: String(row.content_type || ''),
    status: labStatus(row.analysis_status, row.updated_at),
    summary: [headline, ...highlights].filter(Boolean).join(' ').slice(0, 1200) || 'Lab report processed.',
    clinical_facts: {
      panel_name: cleanMessage(structured.panel_name).slice(0, 100),
      report_date: cleanMessage(structured.report_date).slice(0, 40),
      extracted_count: Number(structured.extracted_count || 0),
      standardized_count: Number(structured.standardized_count || 0),
      unmapped_count: Number(structured.unmapped_count || 0),
      results: prioritized,
      analysis_kind: 'standardized_bounded_analysis',
    },
    limitations: boundedStrings(summary.limitations, 8, 240),
    review_state: cleanMessage(structured.review_state).slice(0, 50) || 'ai_generated_unreviewed',
    considered_in_consultation: String(row.patient_id || '') === patientId,
    followups: [],
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
  }
}

export async function listMediaEvidence(
  ctx: ProxyContext,
  consultation: ConsultationRow,
): Promise<MediaEvidencePacket[]> {
  const [photosResult, labsResult, followupsResult] = await Promise.all([
    ctx.db
      .from('libertymd_photo_analyses')
      .select('object_uuid,patient_id,content_type,analysis_status,analysis_data,created_at,updated_at')
      .eq('user_id', ctx.user.id)
      .eq('consultation_id', consultation.id)
      .order('created_at', { ascending: true }),
    ctx.db
      .from('libertymd_lab_uploads')
      .select('object_uuid,patient_id,content_type,analysis_status,structured_results,analysis_summary,created_at,updated_at')
      .eq('user_id', ctx.user.id)
      .eq('consultation_id', consultation.id)
      .order('created_at', { ascending: true }),
    ctx.db
      .from('libertymd_media_followups')
      .select('id,evidence_kind,evidence_object_uuid,question_order,question_text,status,answer_text,asked_turn,answered_turn')
      .eq('user_id', ctx.user.id)
      .eq('consultation_id', consultation.id)
      .order('created_at', { ascending: true })
      .order('question_order', { ascending: true }),
  ])
  if (photosResult.error) throw photosResult.error
  if (labsResult.error) throw labsResult.error
  if (followupsResult.error) throw followupsResult.error

  const packets = [
    ...(photosResult.data || []).map((row) => photoPacket(row as Record<string, unknown>, consultation.patient_id)),
    ...(labsResult.data || []).map((row) => labPacket(row as Record<string, unknown>, consultation.patient_id)),
  ].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
  const followups = (followupsResult.data || []) as MediaFollowup[]
  return packets.map((packet) => ({
    ...packet,
    followups: followups.filter((row) => row.evidence_kind === packet.kind && row.evidence_object_uuid === packet.evidence_id),
  }))
}

export function mediaContextForAgents(packets: MediaEvidencePacket[]): JsonObject[] {
  return packets
    .filter((packet) => packet.considered_in_consultation && packet.status === 'processed')
    .map((packet) => ({
      evidence_id: packet.evidence_id,
      kind: packet.kind,
      summary: packet.summary,
      clinical_facts: packet.clinical_facts,
      limitations: packet.limitations,
      review_state: packet.review_state,
      followup_answers: packet.followups
        .filter((followup) => followup.status === 'answered' && followup.answer_text)
        .map((followup) => ({ question: followup.question_text, answer: followup.answer_text })),
    }))
}

export function mediaCompletionState(packets: MediaEvidencePacket[]) {
  const relevant = packets.filter((packet) => packet.considered_in_consultation)
  return {
    processing: relevant.some((packet) => packet.status === 'processing'),
    pendingFollowups: relevant.flatMap((packet) => packet.followups).filter((row) => row.status === 'pending' || row.status === 'asked'),
  }
}

export function suggestedMediaFollowupQuestions(
  kind: MediaEvidenceKind,
  analysis: JsonObject,
  language = 'en',
): string[] {
  const spanish = language.trim().toLowerCase() === 'es'
  if (kind === 'photo') {
    const obsList = (Array.isArray(analysis.observations) ? analysis.observations : [])
      .map((item: any) => cleanMessage(item?.description || item?.feature || ''))
      .filter(Boolean)
    const primaryObs = obsList[0] || ''
    const subject = primaryObs
      ? `the visual finding (${primaryObs.slice(0, 80).toLowerCase()})`
      : 'the visual features in this image'

    if (spanish) {
      return [
        `Con respecto a los hallazgos visuales observados en la imagen, ¿qué síntomas específicos (como dolor, picazón, ardor o molestias) estás experimentando?`,
        '¿Has notado alguna evolución o desencadenante particular relacionado con estas características visuales?',
      ]
    }

    return [
      `Regarding ${subject}, what specific clinical symptoms or sensations (such as pain, itching, warmth, or tenderness) are you experiencing?`,
      'How do these visual features correspond to your physical symptoms, and do any triggers make them worse or better?',
    ]
  }
  if (spanish) {
    return [
      '¿Qué síntomas o hallazgos clínicos específicos te llevaron a realizar este análisis?',
      '¿Los resultados de este laboratorio coinciden con cambios recientes en tus síntomas o estado de salud?',
    ]
  }
  const panel = cleanMessage(analysis.panel_name).slice(0, 100)
  return [
    `Regarding ${panel ? `the ${panel}` : 'the lab results'} shown, what specific clinical symptoms prompted this testing?`,
    'How do these laboratory findings compare with any changes or treatments you have experienced recently?',
  ]
}

export async function ensureMediaFollowups(
  ctx: ProxyContext,
  consultation: ConsultationRow,
  kind: MediaEvidenceKind,
  evidenceObjectUuid: string,
  questions: string[],
) {
  const rows = questions
    .map((question) => cleanMessage(question).slice(0, 300))
    .filter(Boolean)
    .slice(0, MAX_MEDIA_FOLLOWUPS_PER_EVIDENCE)
    .map((question_text, index) => ({
      consultation_id: consultation.id,
      user_id: ctx.user.id,
      patient_id: consultation.patient_id,
      evidence_kind: kind,
      evidence_object_uuid: evidenceObjectUuid,
      question_order: index + 1,
      question_text,
      status: 'pending',
    }))
  if (!rows.length) return
  const { error } = await ctx.db
    .from('libertymd_media_followups')
    .upsert(rows, { onConflict: 'consultation_id,evidence_kind,evidence_object_uuid,question_order', ignoreDuplicates: true })
  if (error) throw error
}

export async function answerAskedMediaFollowup(
  ctx: ProxyContext,
  consultation: ConsultationRow,
  answer: string,
  turnCount: number,
): Promise<MediaFollowup | null> {
  const { data, error } = await ctx.db
    .from('libertymd_media_followups')
    .select('id,evidence_kind,evidence_object_uuid,question_order,question_text,status,answer_text,asked_turn,answered_turn')
    .eq('user_id', ctx.user.id)
    .eq('consultation_id', consultation.id)
    .eq('status', 'asked')
    .order('asked_turn', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) return null
  const { error: updateError } = await ctx.db
    .from('libertymd_media_followups')
    .update({ status: 'answered', answer_text: answer.slice(0, 4000), answered_turn: turnCount, updated_at: new Date().toISOString() })
    .eq('id', data.id)
    .eq('user_id', ctx.user.id)
    .eq('status', 'asked')
  if (updateError) throw updateError
  return { ...(data as MediaFollowup), status: 'answered', answer_text: answer, answered_turn: turnCount }
}

export async function claimNextMediaFollowup(
  ctx: ProxyContext,
  consultation: ConsultationRow,
  turnCount: number,
): Promise<MediaFollowup | null> {
  const { data, error } = await ctx.db
    .from('libertymd_media_followups')
    .select('id,evidence_kind,evidence_object_uuid,question_order,question_text,status,answer_text,asked_turn,answered_turn')
    .eq('user_id', ctx.user.id)
    .eq('consultation_id', consultation.id)
    .eq('patient_id', consultation.patient_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .order('question_order', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) return null
  const { error: updateError } = await ctx.db
    .from('libertymd_media_followups')
    .update({ status: 'asked', asked_turn: turnCount, updated_at: new Date().toISOString() })
    .eq('id', data.id)
    .eq('user_id', ctx.user.id)
    .eq('status', 'pending')
  if (updateError) throw updateError
  return { ...(data as MediaFollowup), status: 'asked', asked_turn: turnCount }
}

/**
 * The media extension is deliberately bounded. If several files are attached,
 * unanswered extras are waived at the hard ceiling so a consultation cannot be
 * trapped forever. Their processed evidence still reaches the clinical agents.
 */
export async function waivePendingMediaFollowups(
  ctx: ProxyContext,
  consultation: ConsultationRow,
): Promise<void> {
  const { error } = await ctx.db
    .from('libertymd_media_followups')
    .update({ status: 'waived', updated_at: new Date().toISOString() })
    .eq('user_id', ctx.user.id)
    .eq('consultation_id', consultation.id)
    .eq('patient_id', consultation.patient_id)
    .eq('status', 'pending')
  if (error) throw error
}
