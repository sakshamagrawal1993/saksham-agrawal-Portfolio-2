import {
  MAX_TOTAL_TURNS,
  mediaCompletionState,
  mediaContextForAgents,
  suggestedMediaFollowupQuestions,
  type MediaEvidencePacket,
} from '../../supabase/functions/libertymd-care-proxy/lib/media-evidence.ts'

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

const packet = (overrides: Partial<MediaEvidencePacket> = {}): MediaEvidencePacket => ({
  evidence_id: 'evidence-1',
  kind: 'photo',
  patient_id: 'patient-1',
  content_type: 'image/jpeg',
  status: 'processed',
  summary: 'Red raised area on forearm.',
  clinical_facts: { body_region: 'forearm' },
  limitations: ['Lighting may affect color.'],
  review_state: 'ai_generated_unreviewed',
  considered_in_consultation: true,
  followups: [{
    id: 'followup-1',
    evidence_kind: 'photo',
    evidence_object_uuid: 'evidence-1',
    question_order: 1,
    question_text: 'When did it appear?',
    status: 'answered',
    answer_text: 'Two days ago.',
    asked_turn: 14,
    answered_turn: 15,
  }],
  created_at: null,
  updated_at: null,
  ...overrides,
})

Deno.test('media evidence · creates no more than two dedicated questions per file', () => {
  const photo = suggestedMediaFollowupQuestions('photo', { body_region: 'forearm' })
  const lab = suggestedMediaFollowupQuestions('lab', { panel_name: 'CBC' })
  assert(photo.length === 2, 'photo should receive two questions')
  assert(lab.length === 2, 'lab should receive two questions')
  assert(photo[0]?.includes('forearm'), 'photo question should use its evidence context')
  assert(lab[0]?.includes('CBC'), 'lab question should use its panel context')
  assert(MAX_TOTAL_TURNS === 19, 'media extension must remain bounded')
})

Deno.test('media evidence · only processed same-patient evidence reaches agents', () => {
  const context = mediaContextForAgents([
    packet(),
    packet({ evidence_id: 'processing', status: 'processing' }),
    packet({ evidence_id: 'other-patient', considered_in_consultation: false }),
  ])
  assert(context.length === 1, 'processing or other-patient evidence must be excluded')
  assert(Array.isArray(context[0]?.followup_answers), 'answered file questions must travel with the evidence')
})

Deno.test('media evidence · processing and unanswered questions gate completion', () => {
  const processing = mediaCompletionState([packet({ status: 'processing', followups: [] })])
  assert(processing.processing, 'same-patient processing file should block completion')
  const pending = mediaCompletionState([packet({ followups: [{
    ...packet().followups[0]!,
    status: 'pending',
    answer_text: null,
  }] })])
  assert(pending.pendingFollowups.length === 1, 'pending file question should block completion')
  const irrelevant = mediaCompletionState([packet({ considered_in_consultation: false, status: 'processing', followups: [] })])
  assert(!irrelevant.processing, 'another patient file must not block this consultation')
})

Deno.test('media evidence · workflow, UI, and database contracts stay connected', async () => {
  const root = new URL('../../', import.meta.url)
  const send = await Deno.readTextFile(new URL('supabase/functions/libertymd-care-proxy/actions/send-message.ts', root))
  const chat = await Deno.readTextFile(new URL('components/LibertyMD/LibertyMDChat.tsx', root))
  const cards = await Deno.readTextFile(new URL('components/LibertyMD/LibertyMDAttachControls.tsx', root))
  const migration = await Deno.readTextFile(new URL('supabase/migrations/20260802170000_libertymd_media_followups.sql', root))
  assert(send.includes("source: 'media_followup'"), 'dedicated question must be transcript metadata')
  assert(send.includes('mediaContext'), 'message loop must pass the shared evidence packet')
  assert(chat.includes('mediaQuestionPhoto') && chat.includes('applyMediaEvidence'), 'chat must label and restore evidence')
  assert(cards.includes("analysis_status === 'processing'") && cards.includes("analysis_status === 'processed'"), 'cards need both states')
  assert(/enable row level security/i.test(migration), 'follow-up table must use RLS')

  const definitions = [
    '../../../n8n-workflows/definitions/libertymd-interview-workflow__hqT6SFsmdRy1kWKa.json',
    '../../../n8n-workflows/definitions/libertymd-mini-differential-workflow__HfRcohhBalqrGll8.json',
    '../../../n8n-workflows/definitions/libertymd-diagnosis-workflow__vljapWQv5ug7pFA9.json',
  ]
  for (const relative of definitions) {
    const source = await Deno.readTextFile(new URL(relative, import.meta.url))
    assert(source.includes('media_context'), `${relative} must receive media_context`)
  }
})
