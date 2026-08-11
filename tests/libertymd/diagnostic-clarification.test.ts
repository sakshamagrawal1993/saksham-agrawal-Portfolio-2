import {
  diagnosticClarificationContext,
  isAdministrativeClosingQuestion,
  questionsNearDuplicate,
  readDiagnosticClarificationState,
  selectDiagnosticClarificationCandidate,
  selectDifferentialClarificationCandidate,
  selectNonDuplicateFallbackCandidate,
  selectNonDuplicateInterviewCandidate,
  shouldAskDiagnosticClarification,
  withDiagnosticClarificationCompleted,
  withDiagnosticClarificationQuestion,
} from '../../supabase/functions/libertymd-care-proxy/lib/diagnostic-clarification.ts'
import type { InterviewResult, JsonObject } from '../../supabase/functions/libertymd-care-proxy/lib/types.ts'

function assertEquals(actual: unknown, expected: unknown, message = 'values differ') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function interview(overrides: Partial<InterviewResult> = {}): InterviewResult {
  return {
    next_question: 'Does twisting or changing direction worsen the pain?',
    options: ['Yes, clearly', 'A little', 'No', 'Not sure'],
    ready_for_report: false,
    target_slot: 'diagnostic_clarification',
    slot_updates: {},
    missing_slots: [],
    input_relevance: 'clinical',
    input_relevance_reason: '',
    diagnostic_clarification: true,
    clarification_exhausted: false,
    question_purpose: 'whether twisting provokes knee pain',
    backup_question: 'Did you recently increase your running distance?',
    backup_options: ['Yes', 'No', 'Not sure', 'I changed footwear'],
    backup_question_purpose: 'recent change in running load',
    working_differential: [],
    diagnostic_confidence: 45,
    stop_reason: null,
    source: 'n8n',
    ...overrides,
  }
}

Deno.test('diagnostic clarification recognizes exact and near duplicate questions', () => {
  assertEquals(questionsNearDuplicate(
    'Does twisting or changing direction worsen the pain?',
    'Does changing direction or twisting worsen the pain?',
  ), true)
  assertEquals(questionsNearDuplicate(
    'Does twisting worsen the pain?',
    'Did you recently change your running distance?',
  ), false)
})

Deno.test('diagnostic clarification chooses the primary when it is new', () => {
  const state = readDiagnosticClarificationState({})
  const selected = selectDiagnosticClarificationCandidate(interview(), [], state)
  assertEquals(selected?.question, 'Does twisting or changing direction worsen the pain?')
  assertEquals(selected?.usedBackup, false)
})

Deno.test('diagnostic clarification chooses backup without another model call when primary repeats', () => {
  const state = readDiagnosticClarificationState({
    diagnostic_clarification: {
      asked_count: 1,
      asked_questions: ['Does changing direction or twisting worsen the pain?'],
      asked_purposes: ['whether twisting provokes knee pain'],
    },
  })
  const selected = selectDiagnosticClarificationCandidate(interview(), [], state)
  assertEquals(selected?.question, 'Did you recently increase your running distance?')
  assertEquals(selected?.usedBackup, true)
})

Deno.test('diagnostic clarification refuses both candidates when transcript already answered them', () => {
  const history = [
    { role: 'assistant', content: 'Does changing direction or twisting worsen the pain?' },
    { role: 'assistant', content: 'Did you recently increase your running distance?' },
  ]
  assertEquals(selectDiagnosticClarificationCandidate(
    interview(),
    history,
    readDiagnosticClarificationState({}),
  ), null)
})

Deno.test('diagnostic clarification rejects administrative report-closing prompts', () => {
  const selected = selectDiagnosticClarificationCandidate(interview({
    next_question: 'The report is ready. Would you like to finish now?',
    question_purpose: 'Finalize the consultation and prepare the report.',
    backup_question: 'Would you like me to close the consultation?',
    backup_question_purpose: 'Conclude the interview.',
  }), [], readDiagnosticClarificationState({}))
  assertEquals(selected, null)
})

Deno.test('administrative closing detector catches summary prose that is not a patient question', () => {
  const leakedClosings = [
    [
      'I have gathered all the necessary information for now. I will summarize your symptoms so you can share this with your healthcare provider.',
      'Closing the interview as diagnostic clarification is exhausted and clinical history is complete.',
    ],
    [
      'Thank you. I have enough information now to provide a summary of your situation. Are you ready for me to generate that report?',
      'Signal that history taking is complete and transition to the summary/report generation.',
    ],
    [
      'I have enough information. Please review the summary below for your doctor.',
      'Transition to final report summary.',
    ],
  ]
  for (const [question, purpose] of leakedClosings) {
    assertEquals(isAdministrativeClosingQuestion(question, purpose), true, question)
  }
  assertEquals(
    isAdministrativeClosingQuestion(
      'How are the symptoms affecting sleep, eating, walking, work, or your usual activities?',
      'functional impact of the symptoms',
    ),
    false,
  )
})

Deno.test('backend clarification phase may use a new unflagged Interview question', () => {
  const selected = selectDiagnosticClarificationCandidate(interview({
    diagnostic_clarification: false,
    target_slot: 'location',
  }), [], readDiagnosticClarificationState({}), true)
  assertEquals(selected?.question, 'Does twisting or changing direction worsen the pain?')
})

Deno.test('fresh mini differential supplies a new discriminator when Interview does not', () => {
  const entries: JsonObject[] = [
    { condition: 'Pes anserinus bursitis', discriminator: 'Is there focal tenderness below the inner knee joint?' },
    { condition: 'MCL strain', discriminator: 'Does sideways stress reproduce the inner-knee pain?' },
    { condition: 'Meniscal injury', discriminator: 'Does twisting under weight reproduce the pain?' },
  ]
  const first = selectDifferentialClarificationCandidate(entries, [], readDiagnosticClarificationState({}))
  assertEquals(first?.question, 'Is there focal tenderness below the inner knee joint?')
  if (!first) throw new Error('expected first differential candidate')
  const workflow = withDiagnosticClarificationQuestion({}, readDiagnosticClarificationState({}), first, 6)
  const second = selectDifferentialClarificationCandidate(entries, [
    { role: 'assistant', content: first.question },
  ], readDiagnosticClarificationState(workflow))
  assertEquals(second?.question, 'Does sideways stress reproduce the inner-knee pain?')
})

Deno.test('ordinary interview uses same-response backup when primary repeats', () => {
  const ordinary = interview({ diagnostic_clarification: false, target_slot: 'severity' })
  const history = [
    { role: 'assistant', content: 'Does changing direction or twisting worsen the pain?' },
  ]
  const selected = selectNonDuplicateInterviewCandidate(
    ordinary,
    history,
    'Could you share one new detail about what has changed?',
  )
  assertEquals(selected?.question, 'Did you recently increase your running distance?')
  assertEquals(selected?.usedBackup, true)
})

Deno.test('diagnostic-labelled question is still deduplicated before clarification eligibility', () => {
  const diagnostic = interview({
    diagnostic_clarification: true,
    next_question: 'Haben Sie geschwollene Lymphknoten im Bereich des Halses bemerkt?',
    backup_question: 'Haben Sie Schuettelfrost bemerkt?',
    backup_question_purpose: 'differentiate viral infection from influenza',
  })
  const selected = selectNonDuplicateInterviewCandidate(diagnostic, [
    { role: 'assistant', content: 'Haben Sie geschwollene Lymphknoten im Bereich des Halses bemerkt?' },
  ])
  assertEquals(selected?.question, 'Haben Sie Schuettelfrost bemerkt?')
  assertEquals(selected?.usedBackup, true)
})

Deno.test('ordinary interview refuses administrative report-closing prompts', () => {
  const closing = interview({
    diagnostic_clarification: false,
    next_question: 'Vielen Dank. Soll ich den Bericht nun abschliessen?',
    question_purpose: 'Finalize the report.',
    backup_question: 'Haben Sie noch weitere Fragen, bevor wir abschliessen?',
    backup_question_purpose: 'Conclude the interview.',
  })
  assertEquals(selectNonDuplicateInterviewCandidate(closing, [], ''), null)
})

Deno.test('ordinary interview still deduplicates a question returned with advisory ready', () => {
  const ordinary = interview({
    diagnostic_clarification: false,
    ready_for_report: true,
    next_question: 'Is the physician-review report ready to finish?',
    backup_question: 'Is there one new symptom detail you have not mentioned?',
  })
  const selected = selectNonDuplicateInterviewCandidate(ordinary, [
    { role: 'assistant', content: 'Is the physician-review report ready to finish?' },
  ])
  assertEquals(selected?.question, 'Is there one new symptom detail you have not mentioned?')
})

Deno.test('ordinary interview falls back locally when both model candidates repeat', () => {
  const ordinary = interview({ diagnostic_clarification: false, target_slot: 'severity' })
  const history = [
    { role: 'assistant', content: 'Does changing direction or twisting worsen the pain?' },
    { role: 'assistant', content: 'Did you recently increase your running distance?' },
  ]
  const selected = selectNonDuplicateInterviewCandidate(
    ordinary,
    history,
    'Could you share one new detail about what has changed?',
  )
  assertEquals(selected?.question, 'Could you share one new detail about what has changed?')
  assertEquals(selected?.options, [])
})

Deno.test('ordinary interview advances through a fallback pool without repeating', () => {
  const ordinary = interview({ diagnostic_clarification: false, target_slot: 'severity' })
  const history = [
    { role: 'assistant', content: 'Does changing direction or twisting worsen the pain?' },
    { role: 'assistant', content: 'Did you recently increase your running distance?' },
    { role: 'assistant', content: 'What has changed since the symptom began?' },
  ]
  const selected = selectNonDuplicateInterviewCandidate(
    ordinary,
    history,
    [
      'What has changed since the symptom began?',
      'How severe is the main symptom now, from 0 to 10?',
    ],
  )
  assertEquals(selected?.question, 'How severe is the main symptom now, from 0 to 10?')
})

Deno.test('post-clarification fallback also advances past transcript repeats', () => {
  const selected = selectNonDuplicateFallbackCandidate([
    'Was hat sich seit Beginn der Symptome verändert?',
    'Wie stark ist das Hauptsymptom jetzt auf einer Skala von 0 bis 10?',
  ], [
    { role: 'assistant', content: 'Was hat sich seit Beginn der Symptome verändert?' },
  ])
  assertEquals(selected?.question, 'Wie stark ist das Hauptsymptom jetzt auf einer Skala von 0 bis 10?')
})

Deno.test('diagnostic clarification state is bounded and preserves unrelated workflow versions', () => {
  const initial: JsonObject = { guardrail: 'v1', comprehension: { completed: false } }
  const state = readDiagnosticClarificationState(initial)
  const selected = selectDiagnosticClarificationCandidate(interview(), [], state)
  if (!selected) throw new Error('expected candidate')
  const updated = withDiagnosticClarificationQuestion(initial, state, selected, 6)
  const readBack = readDiagnosticClarificationState(updated)
  assertEquals(readBack.askedCount, 1)
  assertEquals(readBack.lastTurn, 6)
  assertEquals(updated.guardrail, 'v1')
  const completed = withDiagnosticClarificationCompleted(updated, readBack, 'question_budget_exhausted')
  assertEquals(readDiagnosticClarificationState(completed).completed, true)
  assertEquals(readDiagnosticClarificationState(completed).completionReason, 'question_budget_exhausted')
})

Deno.test('diagnostic clarification context is small and fail-open', () => {
  assertEquals(diagnosticClarificationContext({}, true, 3), {
    enabled: true,
    asked_count: 0,
    max_questions: 3,
    asked_questions: [],
    asked_purposes: [],
    completed: false,
  })
})

Deno.test('diagnostic clarification remains eligible when mini diagnosis is unavailable', () => {
  assertEquals(shouldAskDiagnosticClarification({
    enabled: true,
    turnCount: 6,
    maxTurns: 15,
    evidenceSufficient: true,
    mediaBlocksCompletion: false,
    redFlagsOutstanding: [],
    topConfidence: null,
    stopConfidence: 80,
    state: readDiagnosticClarificationState({}),
    maxQuestions: 3,
    interviewRequestedClarification: true,
  }), true)
})

Deno.test('outstanding differential discriminators remain eligible for clarification', () => {
  assertEquals(shouldAskDiagnosticClarification({
    enabled: true,
    turnCount: 6,
    maxTurns: 15,
    evidenceSufficient: true,
    mediaBlocksCompletion: false,
    redFlagsOutstanding: ['Kopfschmerzen', 'Muskelschmerzen'],
    topConfidence: 75,
    stopConfidence: 80,
    state: readDiagnosticClarificationState({}),
    maxQuestions: 3,
    interviewRequestedClarification: true,
  }), true)
})

Deno.test('high-confidence mini differential permits two Interview-requested validation questions', () => {
  const base = {
    enabled: true,
    turnCount: 6,
    maxTurns: 15,
    evidenceSufficient: true,
    mediaBlocksCompletion: false,
    redFlagsOutstanding: [] as string[],
    stopConfidence: 80,
    maxQuestions: 3,
    interviewRequestedClarification: true,
  }
  assertEquals(shouldAskDiagnosticClarification({
    ...base,
    topConfidence: 80,
    state: readDiagnosticClarificationState({}),
  }), true)
  assertEquals(shouldAskDiagnosticClarification({
    ...base,
    topConfidence: 90,
    state: readDiagnosticClarificationState({
      diagnostic_clarification: { asked_count: 2 },
    }),
  }), false)
  assertEquals(shouldAskDiagnosticClarification({
    ...base,
    interviewRequestedClarification: false,
    topConfidence: 90,
    state: readDiagnosticClarificationState({}),
  }), false)
  assertEquals(shouldAskDiagnosticClarification({
    ...base,
    topConfidence: 45,
    state: readDiagnosticClarificationState({
      diagnostic_clarification: { asked_count: 3 },
    }),
  }), false)
})
