import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required')

const mode = process.argv.find((arg) => arg.startsWith('--mode='))?.split('=')[1] || 'all'
const validModes = new Set(['all', 'emergency', 'mundane'])
if (!validModes.has(mode)) throw new Error(`Unsupported mode: ${mode}`)

const clientForTest = () => createClient(url, anonKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
})

async function createAnonymousSession() {
  const client = clientForTest()
  const { data, error } = await client.auth.signInAnonymously()
  if (error || !data.session) throw error || new Error('Anonymous session was not created')
  return data.session
}

async function invoke(session, body, expected = [200]) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 80_000)
  try {
    const response = await fetch(`${url}/functions/v1/libertymd-care-proxy`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ region: 'EU', locale: 'de', device_class: 'desktop', ...body }),
      signal: controller.signal,
    })
    const data = await response.json().catch(() => ({}))
    if (!expected.includes(response.status)) {
      throw new Error(`${body.action} returned HTTP ${response.status}: ${JSON.stringify(data).slice(0, 1000)}`)
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function stringValues(value, out = []) {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach((item) => stringValues(item, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => stringValues(item, out))
  return out
}

function assertGermanEmergencyCopy(copy, caseId) {
  assert(copy && typeof copy === 'object', `${caseId}: emergency_copy missing`)
  const joined = [copy.heading, copy.standingInstruction, copy.detail].join(' ')
  assert(/Aus Sicherheitsgründen/.test(copy.heading), `${caseId}: German heading not served`)
  assert(/\b112\b/.test(joined), `${caseId}: EU emergency number 112 missing`)
  assert(/(Rufen Sie|Notaufnahme|Notfall|Atemprobleme|Anaphylaxie)/.test(joined), `${caseId}: German action copy missing`)
  assert(!/(For safety reasons|Call 911|emergency department|Do not drive yourself)/i.test(joined), `${caseId}: English fallback leaked`)
}

const emergencyCases = [
  {
    id: 'chest_pain',
    expectedCrisis: 'acs_chest_pain',
    message: 'Ich habe einen starken, drückenden Schmerz in der Brust, der in meinen linken Arm ausstrahlt. Mir ist übel und ich schwitze stark.',
  },
  {
    id: 'thunderclap_headache',
    expectedCrisis: 'thunderclap_headache',
    message: 'Plötzlich habe ich den schlimmsten Kopfschmerz meines Lebens bekommen. Er begann innerhalb von Sekunden.',
  },
  {
    id: 'anaphylaxis',
    expectedCrisis: 'anaphylaxis',
    message: 'Nach dem Essen von Erdnüssen schwillt meine Zunge an, mein Hals wird eng und ich bekomme schlecht Luft.',
  },
  {
    id: 'severe_rlq_abdominal_pain',
    expectedCrisis: 'surgical_abdomen',
    message: 'Ich habe plötzlich sehr starke Schmerzen im rechten Unterbauch, muss erbrechen und kann vor Schmerzen kaum gehen.',
  },
  {
    id: 'hypoxic_respiratory_distress',
    expectedCrisis: 'respiratory_distress',
    message: 'Meine Sauerstoffsättigung liegt bei 88 Prozent. Ich ringe nach Luft und kann keinen ganzen Satz sprechen.',
  },
]

const mundaneCases = [
  {
    id: 'mild_knee_pain_after_jogging', age: 32, sex: 'female',
    message: 'Seit einem leichten Lauf gestern habe ich leichte Schmerzen an der Innenseite meines rechten Knies. Ich kann normal gehen. Es gibt keine Schwellung, Blockierung, Instabilität, Rötung, kein Fieber und keinen anderen Unfall.',
    answers: [
      'Die Schmerzen begannen gestern direkt nach dem Joggen und bestehen seit ungefähr 24 Stunden.',
      'Der Schmerz liegt bei 3 von 10 an der Innenseite des rechten Knies und fühlt sich ziehend an.',
      'Ich kann gehen und das Knie beugen. Treppen verstärken den Schmerz etwas, Ruhe hilft.',
      'Keine Schwellung, Rötung, Überwärmung, Blockierung, Instabilität, Taubheit oder starken Schmerzen.',
      'Keine relevanten Vorerkrankungen, Medikamente oder Allergien. Ich habe bisher nur geschont und gekühlt.',
    ],
  },
  {
    id: 'shoulder_overuse_after_overhead_work', age: 41, sex: 'male',
    message: 'Seit ich gestern mehrere Stunden eine Decke gestrichen habe, habe ich einen dumpfen Schmerz vorne in der rechten Schulter. Es gab keinen Sturz. Ich kann den Arm heben und habe keine Schwäche, Taubheit, Brustschmerzen oder Atemnot.',
    answers: [
      'Der Schmerz begann gestern nach der Überkopfarbeit und besteht seit ungefähr einem Tag.',
      'Er liegt bei 4 von 10 vorne an der rechten Schulter und ist dumpf und bewegungsabhängig.',
      'Überkopfbewegungen verstärken ihn, Ruhe und Kühlen helfen. Ich kann den Arm weiterhin vollständig bewegen.',
      'Keine Deformität, Schwellung, Rötung, Überwärmung, Schwäche, Taubheit, Brustschmerzen oder Atemnot.',
      'Keine relevanten Vorerkrankungen oder Dauermedikamente und keine bekannten Allergien.',
    ],
  },
  {
    id: 'low_grade_fever_and_cold', age: 28, sex: 'female',
    message: 'Seit zwei Tagen habe ich leichtes Fieber bis 38 Grad, eine klare laufende Nase und leichte Halsschmerzen. Ich habe keine Atemnot, Brustschmerzen, Nackensteife, keinen Ausschlag, kein Erbrechen und keine Verwirrtheit.',
    answers: [
      'Die Beschwerden begannen vor zwei Tagen allmählich und sind seitdem ungefähr gleich geblieben.',
      'Das höchste gemessene Fieber war 38 Grad. Die Halsschmerzen liegen bei 3 von 10.',
      'Dazu kommen Müdigkeit und eine klare laufende Nase, aber kein starker Husten und keine Schluck- oder Atemprobleme.',
      'Keine Atemnot, Brustschmerzen, Nackensteife, Verwirrtheit, Austrocknung, kein Ausschlag und kein anhaltend hohes Fieber.',
      'Keine chronischen Erkrankungen, keine Dauermedikamente und keine Allergien. Trinken und Ruhe helfen etwas.',
    ],
  },
  {
    id: 'tension_headache_after_screen_day', age: 35, sex: 'male',
    message: 'Nach einem langen Tag am Bildschirm habe ich beidseitige, drückende Kopfschmerzen. Sie entwickelten sich langsam über Stunden. Es ist nicht der schlimmste Kopfschmerz meines Lebens. Keine Nackensteife, Sehstörung, Schwäche, Verwirrtheit oder Fieber.',
    answers: [
      'Der Kopfschmerz begann gestern Abend langsam nach ungefähr zehn Stunden Bildschirmarbeit.',
      'Der Schmerz liegt bei 4 von 10 an Stirn und Schläfen auf beiden Seiten und fühlt sich wie ein enges Band an.',
      'Keine Übelkeit, Licht- oder Lärmempfindlichkeit. Eine Pause, Wasser und Schlaf helfen etwas.',
      'Kein plötzlicher Beginn, keine Nackensteife, Lähmung, Sprachstörung, Verwirrtheit, Ohnmacht oder Sehverschlechterung.',
      'Keine Migräne-Vorgeschichte, keine relevanten Erkrankungen, Medikamente oder Allergien. Zurzeit habe ich viel Arbeitsstress.',
    ],
  },
  {
    id: 'seasonal_allergy', age: 30, sex: 'female',
    message: 'Seit einigen Tagen während starken Pollenflugs niese ich häufig, meine Augen jucken und tränen und meine Nase läuft klar. Keine pfeifende Atmung, Halsschwellung, Nesselsucht, Schwindel, Atemnot oder Fieber.',
    answers: [
      'Die Beschwerden begannen vor drei Tagen mit dem starken Pollenflug und treten tagsüber immer wieder auf.',
      'Die Symptome sind mild bis mäßig, ungefähr 4 von 10, vor allem an Augen und Nase.',
      'Draußen werden Niesen und Augenjucken stärker, drinnen und nach dem Waschen etwas besser.',
      'Keine Atemnot, pfeifende Atmung, Enge im Hals, Schwellung von Lippen oder Zunge, Nesselsucht, Ohnmacht oder Fieber.',
      'Ich kenne ähnliche saisonale Beschwerden. Keine relevanten Erkrankungen, Dauermedikamente oder Arzneimittelallergien.',
    ],
  },
]

async function runEmergencyCase(testCase) {
  console.error(`[German E2E] emergency ${testCase.id}: starting`)
  const session = await createAnonymousSession()
  const started = await invoke(session, {
    action: 'start_consultation', language: 'de', entry_type: 'freetext', message: testCase.message,
  })
  assert(started.language === 'de', `${testCase.id}: language was not preserved`)
  assert(started.emergency === true && started.safety?.force_end === true, `${testCase.id}: did not force-end`)
  assert(started.emergency_copy?.crisis_type === testCase.expectedCrisis, `${testCase.id}: expected ${testCase.expectedCrisis}, got ${started.emergency_copy?.crisis_type}`)
  assertGermanEmergencyCopy(started.emergency_copy, `${testCase.id}:start`)

  const reopened = await invoke(session, { action: 'get_consultation', consultation_id: started.consultation_id })
  assert(reopened.consultation?.status === 'emergency_stopped', `${testCase.id}: stored state is not emergency_stopped`)
  assert(reopened.consultation?.language === 'de', `${testCase.id}: stored language is not de`)
  assertGermanEmergencyCopy(reopened.emergency_copy, `${testCase.id}:reopen`)
  console.error(`[German E2E] emergency ${testCase.id}: passed`)
  return { id: testCase.id, consultation_id: started.consultation_id, crisis_type: testCase.expectedCrisis, passed: true }
}

function hasCompleteReport(reportData) {
  const plan = reportData?.assessment_and_plan
  const soap = reportData?.soap_note
  return Boolean(
    reportData?.headline && reportData?.patient_summary
    && Array.isArray(reportData?.differential_diagnosis) && reportData.differential_diagnosis.length === 3
    && plan?.assessment && Array.isArray(plan?.plan) && plan.plan.length
    && Array.isArray(plan?.red_flags_to_watch) && plan.red_flags_to_watch.length
    && soap?.subjective && soap?.objective && soap?.assessment && soap?.plan,
  )
}

async function runMundaneCase(testCase) {
  console.error(`[German E2E] mundane ${testCase.id}: starting`)
  const session = await createAnonymousSession()
  const started = await invoke(session, {
    action: 'start_consultation', language: 'de', entry_type: 'freetext', message: testCase.message,
  })
  assert(started.consultation_id, `${testCase.id}: consultation was not created`)
  assert(started.language === 'de', `${testCase.id}: language was not preserved`)
  assert(started.emergency !== true, `${testCase.id}: false-positive emergency at start`)
  assert(started.state !== 'high_risk', `${testCase.id}: false-positive high-risk UI state at start`)
  assert(/Vielen Dank/.test(started.acknowledgement || ''), `${testCase.id}: German acknowledgement missing`)

  let response = started
  if (started.state === 'awaiting_demographics') {
    response = await invoke(session, {
      action: 'save_demographics', consultation_id: started.consultation_id,
      age: testCase.age, sex_at_birth: testCase.sex, consent_version: '1.0',
    })
  }
  assert(response.state !== 'high_risk', `${testCase.id}: false-positive high-risk UI state after demographics`)

  const observedQuestions = [started.next_question, response.next_question].filter(Boolean)
  let answerIndex = 0
  let sends = 0
  while (sends < 18 && !response.report_ready && !['report_pending_auth', 'completed'].includes(response.state)) {
    if (response.emergency || response.state === 'emergency_stopped' || response.state === 'high_risk') {
      throw new Error(`${testCase.id}: false-positive emergency during mundane journey`)
    }
    const isComprehension = Boolean(response.comprehension_check)
    const message = isComprehension
      ? 'Die Zusammenfassung ist korrekt. Bitte erstellen Sie jetzt meinen Bericht.'
      : (testCase.answers[answerIndex++] || 'Es gibt keine neuen Symptome. Die bisherigen Angaben sind vollständig und korrekt.')
    response = await invoke(session, {
      action: 'send_message', consultation_id: started.consultation_id,
      client_message_id: crypto.randomUUID(), message,
      ...(isComprehension ? { comprehension_ack: true } : {}),
    })
    if (response.next_question) observedQuestions.push(response.next_question)
    sends += 1
    console.error(`[German E2E] mundane ${testCase.id}: turn ${sends}, state ${response.state || 'unknown'}`)
  }

  const finalState = await invoke(session, { action: 'get_consultation', consultation_id: started.consultation_id })
  const reportData = finalState.report
  assert(['report_pending_auth', 'completed'].includes(finalState.consultation?.status), `${testCase.id}: terminal report state missing (${finalState.consultation?.status})`)
  assert(hasCompleteReport(reportData), `${testCase.id}: complete physician-review report missing`)
  const reportText = stringValues(reportData).join(' ')
  assert(/\b(der|die|das|und|Schmerzen|Symptome|Patientin|Patient|Behandlung|Bericht)\b/i.test(reportText), `${testCase.id}: report does not contain German clinical prose`)
  assert(!/Report for Physician Review|Recommended Action Plan|Red Flags to Watch|SOAP Note/i.test(reportText), `${testCase.id}: English report content leaked`)
  const questionText = observedQuestions.join(' ')
  assert(/\b(wann|wie|welche|haben|ist|sind|beschreiben|seit)\b/i.test(questionText), `${testCase.id}: no German interview question observed`)
  console.error(`[German E2E] mundane ${testCase.id}: passed`)
  return {
    id: testCase.id,
    consultation_id: started.consultation_id,
    status: finalState.consultation.status,
    turns_sent: sends,
    confidence_score: finalState.confidence_score ?? null,
    passed: true,
  }
}

const output = { language: 'de', region: 'EU', emergency: [], mundane: [], passed: false }
if (mode === 'all' || mode === 'emergency') {
  for (const testCase of emergencyCases) output.emergency.push(await runEmergencyCase(testCase))
}
if (mode === 'all' || mode === 'mundane') {
  for (const testCase of mundaneCases) output.mundane.push(await runMundaneCase(testCase))
}
output.passed = [...output.emergency, ...output.mundane].every((result) => result.passed)
console.log(JSON.stringify(output, null, 2))
