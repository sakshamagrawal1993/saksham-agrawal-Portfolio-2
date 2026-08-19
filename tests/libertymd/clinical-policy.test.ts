/// <reference lib="deno.ns" />

// P0-16 / P0-14f — registers the severity-boundary tests into this gate.
// `deno test` collects every Deno.test reached through the module graph, and
// `package.json` is outside that ticket's file manifest, so the severity suite
// rides along here rather than adding a script. See the header of the imported
// file for the clean follow-up if a named gate is preferred.
import './severity-mapping.test.ts'
import './emergency-patterns.test.ts'
import './emergency-copy.test.ts'
import './i18n-substrate.test.ts'
import './journey-locale.test.ts'

import {
  assessClinicalEvidence,
  classifyResponseRelevance,
  decideReportOutcome,
  detectDeterministicEmergency,
} from '../../supabase/functions/libertymd-care-proxy/clinical-policy.ts'
import { EMERGENCY_PATTERN_SET_VERSION } from '../../supabase/functions/libertymd-care-proxy/emergency-patterns.ts'
import { enforceCardioRespiratoryEmergencySpecificity } from '../../supabase/functions/libertymd-care-proxy/lib/emergency-specificity.ts'
import { calculateMissingSlots, mergeClinicalSlotUpdates } from '../../supabase/functions/libertymd-care-proxy/lib/slots.ts'
import { LIBERTYMD_VALIDATION_CASES } from '../../scripts/libertymd-validation-cases.ts'
import I18N_CASES from './clinical-scenarios.i18n.v0.1.json' with { type: 'json' }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`)
}

Deno.test('normal interview turns preserve established onset and duration', () => {
  const result = mergeClinicalSlotUpdates(
    { onset: '3-5 days ago', duration: '3-5 days', severity: 'mild' },
    { onset: 'comes and goes', duration: 'a few hours', severity: 'moderate' },
  )

  assertEquals(result.slots.onset, '3-5 days ago', 'Established onset must survive')
  assertEquals(result.slots.duration, '3-5 days', 'Established duration must survive')
  assertEquals(result.slots.severity, 'moderate', 'Non-timing updates still apply')
  assert(!('onset' in result.appliedUpdates), 'Rejected onset must not be persisted as an applied update')
  assert(!('duration' in result.appliedUpdates), 'Rejected duration must not be persisted as an applied update')
})

Deno.test('acute illness may store identical onset and duration values', () => {
  const result = mergeClinicalSlotUpdates(
    { chief_complaint: 'fever' },
    { onset: 'four days ago', duration: 'four days ago' },
  )

  assertEquals(result.slots.onset, 'four days ago', 'Onset is filled')
  assertEquals(result.slots.duration, 'four days ago', 'Identical duration is valid')
})

Deno.test('frequency-only answers do not count as timeline completeness', () => {
  const evidence = assessClinicalEvidence({
    chief_complaint: 'fever',
    onset: 'comes and goes throughout the day',
    severity: 'moderate',
    associated_symptoms: ['body aches'],
    red_flag_negatives: ['no chest pain'],
    relevant_history: 'none',
  })

  assert(!evidence.present.includes('onset'), 'Pattern-only onset must be rejected')
  assert(!evidence.sufficient, 'Pattern-only timing cannot make history sufficient')
})

Deno.test('positive associated symptoms misfiled as red-flag negatives do not count as safety coverage', () => {
  const evidence = assessClinicalEvidence({
    chief_complaint: 'fever',
    onset: 'four days ago',
    severity: 'moderate',
    associated_symptoms: ['body aches'],
    red_flag_negatives: ['sore throat', 'cough'],
    relevant_history: 'diabetes',
  })

  assert(!evidence.present.includes('red_flag_negatives'), 'Positive symptoms are not safety negatives')
  assert(!evidence.sufficient, 'Unanswered safety coverage cannot be sufficient')
})

Deno.test('interview negative labels are canonicalized before evidence and missing-slot checks', () => {
  const result = mergeClinicalSlotUpdates({
    chief_complaint: 'fever and body aches',
    onset: 'four days ago',
    severity: 'moderate',
    associated_symptoms: ['cough'],
    relevant_history: 'none',
  }, {
    red_flag_negatives: ['shortness of breath', 'difficulty breathing'],
  }, {
    sourceText: 'No shortness of breath or difficulty breathing.',
  })

  assertEquals(
    JSON.stringify(result.slots.red_flag_negatives),
    JSON.stringify(['no shortness of breath', 'no difficulty breathing']),
    'Denied warning signs keep explicit negative semantics',
  )
  assert(assessClinicalEvidence(result.slots).sufficient, 'Canonicalized safety negatives satisfy the evidence gate')
  assert(!calculateMissingSlots(result.slots).includes('red_flag_negatives'), 'Missing-slot logic matches evidence semantics')
})

Deno.test('bare positive symptoms misfiled as negatives remain fail-cautious during merge', () => {
  const result = mergeClinicalSlotUpdates({}, {
    red_flag_negatives: ['sore throat', 'cough'],
  }, {
    sourceText: 'I also have a sore throat and cough.',
  })
  assert(
    !assessClinicalEvidence(result.slots).present.includes('red_flag_negatives'),
    'Positive source text must not be rewritten as a denied warning sign',
  )
})

Deno.test('LLM cannot force-end a closed wrist injury without immediate limb-threat evidence', () => {
  const result = enforceCardioRespiratoryEmergencySpecificity({
    status: 'force_end',
    force_end: true,
    is_emergency: true,
    crisis_type: 'other_emergency',
  }, 'I fell on my outstretched hand and my wrist looks deformed, with tingling in my fingers.', [])
  assertEquals(result.status, 'high_risk_continue', 'Closed extremity injury should continue with urgent guidance')
  assertEquals(result.force_end, false, 'Closed extremity injury should not terminally force-end')
  assertEquals(result.care_setting, 'urgent_care', 'Closed extremity injury should retain urgent in-person routing')
})

Deno.test('LLM cannot force-end translated closed wrist injuries and keeps guidance localized', () => {
  const englishFallback = 'This injury needs prompt in-person assessment. I can continue gathering details to help you decide the safest next step.'
  for (const locale of ['es', 'pt', 'hi', 'hi-Latn', 'fr', 'de'] as const) {
    const message = I18N_CASES.locales[locale].messages.wrist_deformity_tingling
    const result = enforceCardioRespiratoryEmergencySpecificity({
      status: 'force_end',
      force_end: true,
      is_emergency: true,
      crisis_type: 'other_emergency',
    }, message, [], locale)
    assertEquals(result.status, 'high_risk_continue', `${locale}: closed extremity injury should continue`)
    assertEquals(result.force_end, false, `${locale}: closed extremity injury should not force-end`)
    assert(String(result.message || '') !== englishFallback, `${locale}: downgraded guidance must not fall back to English`)
  }
})

Deno.test('translated immediate limb threats remain force-end', () => {
  const threats: Record<string, string> = {
    es: 'Tengo una fractura abierta en la muñeca y sangrado incontrolable.',
    pt: 'Tenho uma fratura exposta no punho e sangramento incontrolável.',
    hi: 'मेरी कलाई में खुला फ्रैक्चर है और अनियंत्रित खून बह रहा है।',
    'hi-Latn': 'Meri wrist mein khula fracture hai aur khoon band nahi ho raha.',
    fr: 'J’ai une fracture ouverte du poignet et un saignement incontrôlable.',
    de: 'Ich habe eine offene Fraktur am Handgelenk und eine unkontrollierte Blutung.',
  }
  for (const [locale, message] of Object.entries(threats)) {
    const result = enforceCardioRespiratoryEmergencySpecificity({
      status: 'force_end',
      force_end: true,
      is_emergency: true,
      crisis_type: 'other_emergency',
    }, message, [], locale)
    assertEquals(result.force_end, true, `${locale}: immediate limb threat must retain force-end`)
  }
})

Deno.test('post-flight calf swelling continues urgently in every language unless PE signs are present', () => {
  const messages: Record<string, string> = {
    en: 'My left calf has been swollen and tender since I got off a long flight yesterday.',
    ...Object.fromEntries((['es', 'pt', 'hi', 'hi-Latn', 'fr', 'de'] as const).map((locale) => [
      locale,
      I18N_CASES.locales[locale].messages.dvt_calf_post_flight,
    ])),
  }
  for (const [locale, message] of Object.entries(messages)) {
    const result = enforceCardioRespiratoryEmergencySpecificity({
      status: 'force_end', force_end: true, is_emergency: true, crisis_type: 'other_emergency',
    }, message, [], locale)
    assertEquals(result.status, 'high_risk_continue', `${locale}: isolated suspected DVT should continue urgently`)
    assertEquals(result.force_end, false, `${locale}: isolated suspected DVT should not force-end`)
  }

  for (const [locale, message] of Object.entries({
    en: `${messages.en} I also have chest pain and shortness of breath.`,
    de: `${messages.de} Zusätzlich habe ich Brustschmerzen und Atemnot.`,
  })) {
    const result = enforceCardioRespiratoryEmergencySpecificity({
      status: 'force_end', force_end: true, is_emergency: true, crisis_type: 'other_emergency',
    }, message, [], locale)
    assertEquals(result.force_end, true, `${locale}: suspected PE signs must retain force-end`)
  }
})

Deno.test('LLM force-end remains intact for an open fracture with uncontrolled bleeding', () => {
  const result = enforceCardioRespiratoryEmergencySpecificity({
    status: 'force_end',
    force_end: true,
    is_emergency: true,
    crisis_type: 'other_emergency',
  }, 'I injured my wrist, bone is sticking out and the bleeding will not stop.', [])
  assertEquals(result.force_end, true, 'Immediate limb-threat evidence must retain force-end')
})

Deno.test('a missing timing field may be filled without replacing its established peer', () => {
  const result = mergeClinicalSlotUpdates(
    { onset: 'four days ago' },
    { onset: 'comes and goes', duration: 'four days ago' },
  )

  assertEquals(result.slots.onset, 'four days ago', 'Existing onset remains')
  assertEquals(result.slots.duration, 'four days ago', 'Empty duration may be filled identically')
})

Deno.test('frequency-only timing updates are discarded even when the timing field is empty', () => {
  const result = mergeClinicalSlotUpdates(
    { chief_complaint: 'fever' },
    { onset: 'comes and goes throughout the day', duration: 'intermittently' },
  )

  assert(!('onset' in result.slots), 'Pattern must not become onset')
  assert(!('duration' in result.slots), 'Pattern must not become duration')
})

Deno.test('pattern plus explicit elapsed time remains valid duration evidence', () => {
  const result = mergeClinicalSlotUpdates(
    { chief_complaint: 'fever' },
    { duration: 'constant for four days' },
  )

  assertEquals(result.slots.duration, 'constant for four days', 'Elapsed duration must survive pattern wording')
})

Deno.test('explicit comprehension correction may replace timing values', () => {
  const result = mergeClinicalSlotUpdates(
    { onset: 'last week', duration: 'one week' },
    { onset: 'yesterday', duration: 'one day' },
    { allowTimingOverwrite: true },
  )

  assertEquals(result.slots.onset, 'yesterday', 'Explicit correction replaces onset')
  assertEquals(result.slots.duration, 'one day', 'Explicit correction replaces duration')
})

Deno.test('Heart Attack fixture force-ends before model inference', () => {
  const result = detectDeterministicEmergency(LIBERTYMD_VALIDATION_CASES.heartAttack.message)
  assert(result, 'Expected deterministic emergency result')
  assertEquals(result.crisisType, 'acs_chest_pain', 'Expected ACS crisis type')
})

Deno.test('negated emergency terms do not false-positive', () => {
  const result = detectDeterministicEmergency('Mild sore throat with no chest pain and no trouble breathing.')
  assertEquals(result, null, 'Negated emergency terms should continue')
})

Deno.test('long multilingual negated warning-sign lists do not force-end', () => {
  const messages = [
    'No breathing difficulty, chest pain, fainting, blue lips, confusion, stiff neck, severe headache, rash or persistent vomiting.',
    'No tengo dificultad para respirar, dolor en el pecho, desmayo, labios azules, confusión, rigidez de cuello, dolor de cabeza intenso, sarpullido ni vómitos persistentes.',
    'Não tenho dificuldade para respirar, dor no peito, desmaio, lábios azuis, confusão, rigidez no pescoço, dor de cabeça intensa, erupção cutânea nem vómitos persistentes.',
    'साँस की तकलीफ, सीने में दर्द, बेहोशी, नीले होंठ, भ्रम, गर्दन अकड़ना, तेज सिरदर्द, चकत्ते या लगातार उल्टी नहीं है।',
    'Saans ki dikkat, chest pain, behoshi, neele hont, confusion, gardan akadna, severe headache, rash ya lagataar vomiting nahi hai.',
    'Je n’ai ni difficulté à respirer, ni douleur thoracique, ni évanouissement, ni lèvres bleues, ni confusion, ni raideur de nuque, ni mal de tête intense, ni éruption cutanée, ni vomissements persistants.',
    'Keine Atemnot, Brustschmerzen, Ohnmacht, blauen Lippen, Verwirrtheit, Nackensteife, starken Kopfschmerzen, kein Ausschlag und kein anhaltendes Erbrechen.',
  ]
  for (const message of messages) {
    assertEquals(detectDeterministicEmergency(message), null, `Negated list should remain non-emergency: ${message}`)
  }
})

Deno.test('jaw pain with sweating or nausea force-ends', () => {
  const result = detectDeterministicEmergency('I have jaw pain with sweating and nausea and feel suddenly very unwell.')
  assertEquals(result?.crisisType, 'acs_chest_pain', 'Jaw-pain ACS crisis type')
})

Deno.test('sudden severe abdominal pain force-ends', () => {
  const result = detectDeterministicEmergency('I have sudden severe abdominal pain with vomiting.')
  assertEquals(result?.crisisType, 'surgical_abdomen', 'Surgical abdomen crisis type')
})

Deno.test('severe right-lower abdominal pain force-ends', () => {
  const result = detectDeterministicEmergency('I have severe right lower abdominal pain and the pain is so bad I cannot walk.')
  assertEquals(result?.crisisType, 'surgical_abdomen', 'Right-lower abdominal crisis type')
})

Deno.test('low oxygen saturation force-ends', () => {
  const result = detectDeterministicEmergency('My oxygen saturation is 89 and I am gasping for air.')
  assertEquals(result?.crisisType, 'respiratory_distress', 'Low-oxygen crisis type')
})

Deno.test('low fever has sufficient explicit evidence', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  assertEquals(evidence.score, 100, 'Low Fever evidence score')
  assert(evidence.sufficient, 'Low Fever should have sufficient evidence')
})

Deno.test('uncertain placeholders do not count as evidence', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.noHighConfidence.filledSlots)
  assertEquals(evidence.score, 35, 'Ambiguous evidence score')
  assert(!evidence.sufficient, 'Ambiguous evidence must be insufficient')
})

Deno.test('all non-medical fixtures classify off topic', () => {
  for (const message of LIBERTYMD_VALIDATION_CASES.nonMedical.messages) {
    assertEquals(classifyResponseRelevance(message), 'off_topic', `Expected off-topic: ${message}`)
  }
})

Deno.test('short clinical answers remain accepted', () => {
  for (const message of ['yes', 'no', 'yesterday', '3/10', 'not sure', '101-102 F (38-39 C)', '101.5 F', '38-39 C', '120/80', '98%']) {
    assertEquals(classifyResponseRelevance(message), 'clinical', `Expected clinical: ${message}`)
  }
})

Deno.test('multilingual short and full clinical answers remain accepted (Spanish, Hindi, Hinglish, etc.)', () => {
  const multilingualClinical = [
    'Sí',
    'si',
    'No',
    'Tengo fiebre y dolor de cabeza',
    'Dolor de estómago desde ayer',
    'Me duele mucho la garganta',
    'हाँ',
    'नहीं',
    'मुझे सिर दर्द है',
    'कल से बुखार है',
    'haan',
    'nahi',
    'Mujhe fever aur head pain hai',
    'Sir dard kal se hai',
    'oui',
    'non',
    'ja',
    'nein',
    'sim',
    'não',
  ]
  for (const message of multilingualClinical) {
    assertEquals(classifyResponseRelevance(message), 'clinical', `Expected clinical for multilingual input: ${message}`)
  }
})

Deno.test('mid-consult, sufficient evidence and workflow-ready releases moderate-confidence report', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: true,
    confidence: 60,
    turnCount: 8,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 0,
  })
  assertEquals(decision.outcome, 'complete', 'moderate confidence must not suppress the report')
  assertEquals(decision.reason, 'workflow_ready', 'workflow-ready closes a sufficiently informed consult')
})

Deno.test('mid-consult, confidence 80 completes', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: true,
    confidence: 80,
    turnCount: 8,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 0,
  })
  assertEquals(decision.outcome, 'complete', 'confidence 80 releases the report')
  assertEquals(decision.reason, 'high_confidence', 'via the high-confidence door')
})

Deno.test('at the turn cap, a moderately confident physician-review report releases', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: true,
    confidence: 65,
    turnCount: 15,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 0,
  })
  assertEquals(decision.outcome, 'complete', 'cap path unchanged')
  assertEquals(decision.reason, 'turn_limit_report', 'confidence-neutral cap reason')
})

Deno.test('workflow-ready low-confidence report is released', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: true,
    confidence: 59,
    turnCount: 8,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 0,
  })
  assertEquals(decision.outcome, 'complete', 'Low confidence must not suppress a ready report')
  assertEquals(decision.reason, 'workflow_ready', 'Confidence-neutral ready reason')
})

Deno.test('invalid three-item diagnosis stays recoverable instead of showing incomplete', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: false,
    confidence: 99,
    turnCount: 15,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 0,
  })
  assertEquals(decision.outcome, 'continue', 'Invalid diagnosis is a retryable generation state')
  assertEquals(decision.reason, 'retry_report_generation', 'Technical/schema failure reason')
})

Deno.test('turn 15 releases low-information report when the user discussed health', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.noHighConfidence.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: true,
    confidence: 95,
    turnCount: 15,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 0,
  })
  assertEquals(decision.outcome, 'complete', 'Sparse health information still receives report')
  assertEquals(decision.reason, 'turn_limit_report', 'Confidence-neutral cap reason')
})

Deno.test('off-topic answers do not erase health information already shared', () => {
  const evidence = assessClinicalEvidence(LIBERTYMD_VALIDATION_CASES.lowFever.filledSlots)
  const decision = decideReportOutcome({
    diagnosisValid: true,
    confidence: 90,
    turnCount: 15,
    readyForReport: true,
    evidence,
    nonClinicalResponseCount: 5,
  })
  assertEquals(decision.outcome, 'complete', 'Existing health information still receives report')
  assertEquals(decision.reason, 'turn_limit_report', 'Cap report remains confidence-neutral')
})

Deno.test('only a consultation with no health information is incomplete', () => {
  const decision = decideReportOutcome({
    diagnosisValid: false,
    confidence: 0,
    turnCount: 15,
    readyForReport: false,
    evidence: assessClinicalEvidence({}),
    nonClinicalResponseCount: 5,
  })
  assertEquals(decision.outcome, 'review', 'No-health consultation is the sole incomplete case')
  assertEquals(decision.reason, 'no_health_information', 'Explicit no-health reason')
})

// ---------------------------------------------------------------- P0-14c AC1–AC5
// Single Deno.test keeps tsc Deno-name noise to +1 (repo pattern); bodies cover AC1–AC5.

Deno.test('P0-14c AC1–AC5 · span provenance, audit keys, verbatim slices, bound', () => {
  // AC1 / AC3
  const acs = 'I have crushing chest pain and pain radiating to my left arm.'
  const result = detectDeterministicEmergency(acs)
  assert(result, 'Expected ACS deterministic match')
  assertEquals(result.patternId, 'acs_chest_pain', 'patternId / rule_id source')
  assertEquals(result.matchedSpan, 'crushing chest', 'canonical ACS span')
  assertEquals(result.spanStart, 7, 'ACS span_start')
  assertEquals(result.spanEnd, 21, 'ACS span_end')
  assertEquals(result.patternSetVersion, EMERGENCY_PATTERN_SET_VERSION, 'pattern set version on detector')
  assert(EMERGENCY_PATTERN_SET_VERSION.length > 0, 'EMERGENCY_PATTERN_SET_VERSION must be non-empty')

  // AC2
  const match = {
    rule_id: result.patternId,
    span: result.matchedSpan,
    span_start: result.spanStart,
    span_end: result.spanEnd,
    pattern_set_version: result.patternSetVersion,
    lane: 'edge' as const,
  }
  assertEquals(
    JSON.stringify(Object.keys(match).sort()),
    JSON.stringify(['lane', 'pattern_set_version', 'rule_id', 'span', 'span_end', 'span_start'].sort()),
    'audit match key set',
  )

  // AC4
  const samples: Array<{ crisis: string; message: string }> = [
    { crisis: 'acs_chest_pain', message: 'I have Crushing Chest pain tonight.' },
    { crisis: 'thunderclap_headache', message: 'My headache came on Suddenly and hit me out of nowhere.' },
    { crisis: 'anaphylaxis', message: 'I started Wheezing after a bee sting.' },
    { crisis: 'respiratory_distress', message: 'I am Gasping for air and cannot breathe.' },
    { crisis: 'surgical_abdomen', message: 'I have Severe lower right abdominal pain.' },
    { crisis: 'stroke_fast', message: 'My Face is drooping and my arm is weak.' },
    { crisis: 'suicidal_ideation', message: 'I want to Kill myself.' },
  ]
  assertEquals(samples.length, 7, 'one sample per live presentation')
  for (const sample of samples) {
    const hit = detectDeterministicEmergency(sample.message)
    assert(hit, `Expected match for ${sample.crisis}`)
    assertEquals(hit.crisisType, sample.crisis, `${sample.crisis} crisis type`)
    assertEquals(
      sample.message.slice(hit.spanStart, hit.spanEnd),
      hit.matchedSpan,
      `${sample.crisis} verbatim slice`,
    )
  }

  // AC5
  const phrase = 'crushing chest'
  const longMessage = `${'x'.repeat(2000)}${phrase}${'y'.repeat(2000 - phrase.length)}`
  assertEquals(longMessage.length, 4000, 'fixture length')
  const longHit = detectDeterministicEmergency(longMessage)
  assert(longHit, 'Expected match inside long message')
  assert(longHit.matchedSpan.length <= 120, 'persist-bound span length')
  assert(longHit.spanEnd - longHit.spanStart <= 120, 'persist-bound span window')
  assert(longHit.matchedSpan.length <= 64, 'detector guard still ≤64')
})
