import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { questionsNearDuplicate } from '../supabase/functions/libertymd-care-proxy/lib/diagnostic-clarification.ts'

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required')

const clinicalText = {
  en: {
    initial: 'For 3 days I have had a fever of 38.5 C, dry cough, sore throat, runny nose, body aches and fatigue. Severity is 5/10. I have no shortness of breath, chest pain, confusion, stiff neck, rash or dehydration.',
    details: 'It began gradually 3 days ago and has stayed moderate. The highest temperature was 38.5 C and the severity is 5/10. I can drink and urinate normally. No breathing difficulty, chest pain, fainting, blue lips, confusion, stiff neck, severe headache, rash or persistent vomiting. I have no chronic conditions, regular medicines or allergies. Rest and fluids help a little.',
    ack: 'The summary is correct. Please create my report now.',
  },
  es: {
    initial: 'Desde hace 3 días tengo fiebre de 38.5 C, tos seca, dolor de garganta, secreción nasal, dolores corporales y cansancio. La intensidad es 5/10. No tengo dificultad para respirar, dolor en el pecho, confusión, rigidez de cuello, sarpullido ni deshidratación.',
    details: 'Comenzó gradualmente hace 3 días y sigue siendo moderado. La temperatura máxima fue 38.5 C y la intensidad es 5/10. Puedo beber y orinar con normalidad. No tengo dificultad para respirar, dolor en el pecho, desmayo, labios azules, confusión, rigidez de cuello, dolor de cabeza intenso, sarpullido ni vómitos persistentes. No tengo enfermedades crónicas, medicamentos habituales ni alergias. El descanso y los líquidos ayudan un poco.',
    ack: 'El resumen es correcto. Cree mi informe ahora, por favor.',
  },
  pt: {
    initial: 'Há 3 dias tenho febre de 38.5 C, tosse seca, dor de garganta, corrimento nasal, dores no corpo e cansaço. A intensidade é 5/10. Não tenho dificuldade para respirar, dor no peito, confusão, rigidez no pescoço, erupção cutânea nem desidratação.',
    details: 'Começou gradualmente há 3 dias e continua moderado. A temperatura máxima foi 38.5 C e a intensidade é 5/10. Consigo beber e urinar normalmente. Não tenho dificuldade para respirar, dor no peito, desmaio, lábios azuis, confusão, rigidez no pescoço, dor de cabeça intensa, erupção cutânea nem vómitos persistentes. Não tenho doenças crónicas, medicamentos regulares nem alergias. Repouso e líquidos ajudam um pouco.',
    ack: 'O resumo está correto. Crie agora o meu relatório, por favor.',
  },
  hi: {
    initial: 'मुझे 3 दिनों से 38.5 C बुखार, सूखी खाँसी, गले में दर्द, नाक बहना, शरीर में दर्द और थकान है। तीव्रता 5/10 है। साँस लेने में कठिनाई, सीने में दर्द, भ्रम, गर्दन अकड़ना, चकत्ते या पानी की कमी नहीं है।',
    details: 'यह 3 दिन पहले धीरे-धीरे शुरू हुआ और अभी मध्यम है। सबसे अधिक तापमान 38.5 C था और तीव्रता 5/10 है। मैं सामान्य रूप से पानी पी और पेशाब कर पा रहा/रही हूँ। साँस की तकलीफ, सीने में दर्द, बेहोशी, नीले होंठ, भ्रम, गर्दन अकड़ना, तेज सिरदर्द, चकत्ते या लगातार उल्टी नहीं है। कोई पुरानी बीमारी, नियमित दवा या एलर्जी नहीं है। आराम और तरल से थोड़ी मदद मिलती है।',
    ack: 'सारांश सही है। कृपया अब मेरी रिपोर्ट बनाएँ।',
  },
  'hi-Latn': {
    initial: 'Mujhe 3 din se 38.5 C bukhar, sukhi khansi, gale mein dard, naak behna, badan dard aur thakan hai. Severity 5/10 hai. Saans lene mein dikkat, chest pain, confusion, gardan akadna, rash ya dehydration nahi hai.',
    details: 'Yeh 3 din pehle dheere-dheere shuru hua aur abhi moderate hai. Sabse zyada temperature 38.5 C tha aur severity 5/10 hai. Main normally paani pee aur urine kar pa raha/rahi hoon. Saans ki dikkat, chest pain, behoshi, neele hont, confusion, gardan akadna, severe headache, rash ya lagataar vomiting nahi hai. Koi chronic condition, regular medicine ya allergy nahi hai. Aaram aur fluids se thodi madad milti hai.',
    ack: 'Summary sahi hai. Kripya ab meri report banayein.',
  },
  fr: {
    initial: 'Depuis 3 jours, j’ai une fièvre à 38.5 C, une toux sèche, un mal de gorge, le nez qui coule, des courbatures et de la fatigue. L’intensité est de 5/10. Je n’ai ni difficulté à respirer, ni douleur thoracique, ni confusion, ni raideur de nuque, ni éruption cutanée, ni déshydratation.',
    details: 'Les symptômes ont commencé progressivement il y a 3 jours et restent modérés. La température maximale était de 38.5 C et l’intensité est de 5/10. Je peux boire et uriner normalement. Je n’ai ni difficulté à respirer, ni douleur thoracique, ni évanouissement, ni lèvres bleues, ni confusion, ni raideur de nuque, ni mal de tête intense, ni éruption cutanée, ni vomissements persistants. Je n’ai aucune maladie chronique, aucun traitement régulier et aucune allergie. Le repos et les liquides aident un peu.',
    ack: 'Le résumé est correct. Veuillez créer mon rapport maintenant.',
  },
  de: {
    initial: 'Seit 3 Tagen habe ich 38.5 C Fieber, trockenen Husten, Halsschmerzen, eine laufende Nase, Gliederschmerzen und Müdigkeit. Die Stärke beträgt 5/10. Ich habe keine Atemnot, Brustschmerzen, Verwirrtheit, Nackensteife, keinen Ausschlag und keine Austrocknung.',
    details: 'Die Beschwerden begannen vor 3 Tagen allmählich und sind weiterhin mäßig. Die höchste Temperatur betrug 38.5 C und die Stärke ist 5/10. Ich kann normal trinken und Wasser lassen. Keine Atemnot, Brustschmerzen, Ohnmacht, blauen Lippen, Verwirrtheit, Nackensteife, starken Kopfschmerzen, kein Ausschlag und kein anhaltendes Erbrechen. Ich habe keine chronischen Erkrankungen, regelmäßigen Medikamente oder Allergien. Ruhe und Flüssigkeit helfen etwas.',
    ack: 'Die Zusammenfassung ist korrekt. Bitte erstellen Sie jetzt meinen Bericht.',
  },
}

const locales = String(process.env.LIBERTYMD_REPORT_LANGUAGES || 'en,es,es-ES,pt,hi,hi-Latn,fr,de')
  .split(',').map((value) => value.trim()).filter(Boolean)
const outputDir = path.resolve(process.env.LIBERTYMD_REPORT_ARTIFACTS_DIR || 'artifacts/libertymd/report-locale-matrix')
fs.mkdirSync(outputDir, { recursive: true })

const clientForTest = () => createClient(url, anonKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
})

async function createAnonymousSession() {
  const client = clientForTest()
  const { data, error } = await client.auth.signInAnonymously()
  if (error || !data.session) throw error || new Error('Anonymous session was not created')
  return data.session
}

async function invoke(session, locale, body, attempt = 0) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90_000)
  try {
    const response = await fetch(`${url}/functions/v1/libertymd-care-proxy`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ region: 'EU', locale, device_class: 'desktop', ...body }),
      signal: controller.signal,
    })
    const data = await response.json().catch(() => ({}))
    if ((response.status === 429 || response.status === 503) && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(750, Number(data?.retry_after_ms || 0))))
      return invoke(session, locale, body, attempt + 1)
    }
    if (!response.ok) throw new Error(`${body.action}: HTTP ${response.status} ${JSON.stringify(data).slice(0, 600)}`)
    return data
  } finally {
    clearTimeout(timer)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function strings(value, out = []) {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => strings(item, out))
  return out
}

function completeReport(report) {
  const plan = report?.assessment_and_plan
  const soap = report?.soap_note
  return Boolean(report?.headline && report?.patient_summary
    && Array.isArray(report?.differential_diagnosis) && report.differential_diagnosis.length === 3
    && plan?.assessment && Array.isArray(plan?.plan) && plan.plan.length
    && Array.isArray(plan?.red_flags_to_watch) && plan.red_flags_to_watch.length
    && soap?.subjective && soap?.objective && soap?.assessment && soap?.plan)
}

const languageSignals = {
  es: /\b(el|la|los|las|para|con|sin|dolor|síntomas|informe|tratamiento)\b/i,
  pt: /\b(o|a|os|as|para|com|sem|dor|sintomas|relatório|tratamento)\b/i,
  hi: /[ऀ-ॿ]/,
  'hi-Latn': /\b(hai|hain|mein|nahi|liye|dard|lakshan|ilaaj|report)\b/i,
  fr: /\b(le|la|les|pour|avec|sans|douleur|symptômes|rapport|traitement)\b/i,
  de: /\b(der|die|das|und|mit|ohne|Schmerzen|Symptome|Bericht|Behandlung)\b/i,
}

async function runLocale(locale) {
  const clinicalLocale = locale === 'es-ES' ? 'es' : locale
  const copy = clinicalText[clinicalLocale]
  assert(copy, `${locale}: no test copy`)
  const session = await createAnonymousSession()
  const startedAt = Date.now()
  const started = await invoke(session, locale, {
    action: 'start_consultation', language: locale, entry_type: 'freetext', message: copy.initial,
  })
  assert(started.consultation_id, `${locale}: consultation not created`)
  assert(started.emergency !== true, `${locale}: flu-like case false-positive emergency`)

  let response = started
  if (started.state === 'awaiting_demographics') {
    response = await invoke(session, locale, {
      action: 'save_demographics', consultation_id: started.consultation_id,
      age: 34, sex_at_birth: 'female', consent_version: '1.0',
    })
  }

  const questions = [response.next_question].filter(Boolean)
  let turns = 0
  while (turns < 19 && !response.report_ready && !['report_pending_auth', 'completed'].includes(response.state)) {
    assert(
      !response.emergency && response.state !== 'emergency_stopped',
      `${locale}: false-positive emergency during report journey `
        + `(${started.consultation_id}; state=${response.state}; crisis=${response.safety?.crisis_type}; source=${response.safety?.source})`,
    )
    const comprehension = Boolean(response.comprehension_check)
    response = await invoke(session, locale, {
      action: 'send_message', consultation_id: started.consultation_id,
      client_message_id: crypto.randomUUID(),
      message: comprehension ? copy.ack : copy.details,
      ...(comprehension ? { comprehension_ack: true } : {}),
    })
    if (response.next_question) questions.push(response.next_question)
    turns += 1
  }

  let final = await invoke(session, locale, { action: 'get_consultation', consultation_id: started.consultation_id })
  assert(['report_pending_auth', 'completed'].includes(final.consultation?.status), `${locale}: report state missing (${final.consultation?.status})`)
  assert(completeReport(final.report), `${locale}: complete report missing`)

  for (let poll = 0; poll < 12 && final.diagnosis_guidance_status === 'pending'; poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    final = await invoke(session, locale, { action: 'get_consultation', consultation_id: started.consultation_id })
  }

  const reportText = strings({
    headline: final.report.headline,
    patient_summary: final.report.patient_summary,
    assessment_and_plan: final.report.assessment_and_plan,
    soap_note: final.report.soap_note,
  }).join(' ')
  const signal = languageSignals[clinicalLocale]
  if (signal) assert(signal.test(reportText), `${locale}: target-language report signal missing`)
  if (locale !== 'en') {
    assert(!/Report for Physician Review|Recommended Action Plan|Red Flags to Watch|Why this may be serious/i.test(reportText), `${locale}: English report fallback leaked`)
  }

  const duplicateQuestions = []
  for (let index = 0; index < questions.length; index += 1) {
    for (let prior = 0; prior < index; prior += 1) {
      if (questionsNearDuplicate(questions[prior], questions[index])) duplicateQuestions.push([questions[prior], questions[index]])
    }
  }
  assert(duplicateQuestions.length === 0, `${locale}: repeated question ${JSON.stringify(duplicateQuestions)}`)

  const guidance = Array.isArray(final.diagnosis_guidance) ? final.diagnosis_guidance : []
  assert(final.diagnosis_guidance_status === 'ready', `${locale}: async guidance not ready (${final.diagnosis_guidance_status})`)
  assert(guidance.length === 3, `${locale}: expected 3 guidance blocks, got ${guidance.length}`)
  const investigations = guidance.map((item) => JSON.stringify(item.further_investigations || []))
  assert(new Set(investigations).size === 3, `${locale}: differential guidance is not distinct`)

  return {
    locale,
    clinical_locale: clinicalLocale,
    consultation_id: started.consultation_id,
    status: final.consultation.status,
    turns,
    questions: questions.length,
    report_complete: true,
    diagnosis_guidance_status: final.diagnosis_guidance_status,
    diagnosis_guidance_blocks: guidance.length,
    duration_ms: Date.now() - startedAt,
    passed: true,
  }
}

const results = []
for (const locale of locales) {
  process.stdout.write(`… ${locale} `)
  try {
    const result = await runLocale(locale)
    results.push(result)
    console.log(`PASS (${result.duration_ms}ms, ${result.turns} turns)`)
  } catch (error) {
    results.push({ locale, passed: false, error: error.message })
    console.log(`FAIL ${error.message}`)
  }
  fs.writeFileSync(path.join(outputDir, 'results.json'), JSON.stringify(results, null, 2))
}

const summary = {
  locales: locales.length,
  passed: results.filter((result) => result.passed).length,
  failed: results.filter((result) => !result.passed).length,
  results,
}
fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
if (summary.failed) process.exitCode = 1
