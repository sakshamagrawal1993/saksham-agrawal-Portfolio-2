import type { JsonObject } from './types.ts'

const CARDIO_RESPIRATORY_SYMPTOM = /\b(chest (?:only )?(?:pain|discomfort|tightness|hurts?|aches?)|short(?:ness)? of breath|short of breath|breathless|difficulty breathing|brustschmerz|brustdruck|atemnot|kurzatmig)\b/i

const HIGH_SPECIFICITY_ACS = /\b(?:crushing|squeezing|heavy) (?:chest|pressure)\b|\bchest (?:pressure|squeezing|heaviness)\b|\bchest (?:pain|discomfort).{0,80}(?:radiat(?:es|ing)?|spread(?:s|ing)?).{0,35}(?:arm|jaw|back|neck)\b|\bchest (?:pain|discomfort).{0,80}(?:cold sweat|sweating|lightheaded|faint(?:ed|ing)?)\b|\b(?:cold sweat|sweating|lightheaded|faint(?:ed|ing)?).{0,80}chest (?:pain|discomfort)\b|\bchest (?:pain|discomfort).{0,60}(?:persistent|keeps returning|comes back|lasting (?:more than )?(?:a few|[5-9]|[1-9]\d) minutes?)\b|drückend(?:e|er|en)? schmerz.{0,45}brust.{0,90}(?:arm|kiefer|rücken|nacken).{0,30}(?:ausstrahl|zieh)|brust(?:schmerz|druck).{0,80}(?:strahlt|zieht).{0,35}(?:arm|kiefer|rücken|nacken)|brust(?:schmerz|druck).{0,80}(?:kalter schweiß|schwitze|schwitzen|ohnmacht|benommen)/gi

const HIGH_SPECIFICITY_BREATHING = /\b(?:cannot|can't|unable to) breathe\b|\bgasping(?: for air)?\b|\bchoking\b|\b(?:cannot|can't|unable to) (?:speak|talk|get words out)\b|\b(?:blue|grey|gray) (?:lips|skin|face)\b|\bnew confusion\b|\b(?:collapsed|passed out|unconscious)\b|\boxygen (?:sat|saturation)?[^.]{0,12}(?:[0-8]\d|9[0-2])\b|\bsevere (?:shortness of breath|difficulty breathing)\b|\b(?:shortness of breath|difficulty breathing).{0,30}(?:at rest|while resting|sitting still)\b|(?:kann|können) (?:kaum|nicht) atmen|ring(?:e|t|en)? nach luft|(?:kann|können) keinen ganzen satz sprechen|blaue lippen|sauerstoffsättigung.{0,18}(?:[0-8]\d|9[0-2])\b/gi

const NEGATION = /\b(no|not|without|denies|denied|never|don'?t have|doesn'?t have|kein(?:e|en|er|es)?|nicht|ohne|verneint)\b/i
const THIRD_PARTY_HISTORY = /\b(my|his|her|their)\s+\w*\s*(father|mother|dad|mum|mom|brother|sister|friend|husband|wife|son|daughter|uncle|aunt)\s+(had|has had|used to have)\b|\b(family history|history of|hx of)\b/i
const EXTREMITY = /(?:wrist|hand|finger|thumb|elbow|shoulder|ankle|foot|toe|knee|leg|arm|muñeca|mano|dedos?|pulgar|codo|hombro|tobillo|pie|rodilla|pierna|brazo|punho|mão|polegar|cotovelo|ombro|tornozelo|pé|joelho|perna|braço|कलाई|हाथ|उँगली|उंगली|अंगूठा|कोहनी|कंधा|टखना|पैर|घुटना|टांग|बांह|poignet|main|doigts?|pouce|coude|épaule|cheville|pied|orteil|genou|jambe|bras|handgelenk|hand|finger|daumen|ellbogen|schulter|knöchel|fuß|zeh|knie|bein|arm)/i
const EXTREMITY_INJURY = /(?:fell|fall|injur|twist|sprain|deform|swollen|swelling|tingl|numb|pain|sore|caí|caida|caída|lesion|torcí|esguince|hinch|hormigue|entumec|dolor|queda|lesão|torci|entorse|inchad|formig|dormên|dor|गिर|चोट|मुड़|मोच|टेढ़|सूज|झनझन|सुन्न|दर्द|tomb|bless|tors|entorse|déform|gonfl|picot|engourdi|douleur|fiel|gefallen|verletz|verdreh|verstauch|verform|geschwollen|schwell|kribbel|taub|schmerz)/i
const LOCALIZED_EXTREMITY_INJURY = new RegExp(
  `${EXTREMITY.source}.{0,100}${EXTREMITY_INJURY.source}|${EXTREMITY_INJURY.source}.{0,100}${EXTREMITY.source}`,
  'i',
)
const IMMEDIATE_LIMB_THREAT = /\b(uncontrolled|spurting|won'?t stop) bleeding\b|\bbone (?:is )?(?:sticking|coming) (?:out|through)\b|\bopen fracture\b|\b(?:hand|foot|arm|leg|finger|toe) (?:is )?(?:blue|grey|gray|cold and pale)\b|\bno pulse\b|sangrado (?:incontrolable|a chorros|que no (?:para|se detiene))|hueso (?:sobresale|sale|atraviesa)|fractura abierta|sin pulso|sangramento (?:incontrolável|jorrando|que não para)|osso (?:saindo|exposto|atravessando)|fratura (?:aberta|exposta)|sem pulso|अनियंत्रित (?:रक्तस्राव|खून)|खून (?:बंद नहीं|नहीं रुक)|हड्डी बाहर|खुला फ्रैक्चर|नाड़ी नहीं|khoon (?:band nahi|nahi ruk)|haddi bahar|khula fracture|pulse nahi|saignement (?:incontrôlable|qui gicle|qui ne s’arrête pas)|os (?:dépasse|sort)|fracture ouverte|absence de pouls|unkontrollierte blutung|blutung (?:spritzt|hört nicht auf)|knochen (?:ragt heraus|steht heraus)|offene fraktur|kein puls/i
const DVT_CALF = /\bcalf\b|pantorrilla|panturrilha|पिंडली|\bmollet\b|\bwade\b/i
const DVT_SWELLING = /swollen|tender|hinchad|sensible|inchad|dolorid|सूज|दर्द|gonfl|druckempfind|geschwollen/i
const DVT_TRIGGER = /\bflight\b|vuelo|\bvoo\b|उड़ान|\bvol\b|\bflug/i
const PULMONARY_EMBOLISM_THREAT = /chest pain|short(?:ness)? of breath|difficulty breathing|cough(?:ing)? (?:up )?blood|faint|blue lips|oxygen (?:sat|saturation)?[^.]{0,12}(?:[0-8]\d|9[0-2])|dolor (?:en el )?pecho|falta de aire|dificultad para respirar|tos(?:er)? sangre|desmayo|labios azules|dor (?:no )?peito|falta de ar|dificuldade para respirar|toss(?:e|ir) sangue|desmaio|lábios azuis|सीने में दर्द|साँस (?:की )?(?:तकलीफ|कठिनाई)|खून (?:वाली )?खाँसी|बेहोश|नीले होंठ|\bsaans (?:ki )?(?:dikkat|takleef)|\bkhoon (?:wali )?khansi|\bbehosh|\bblue lips|douleur thoracique|essoufflement|difficulté à respirer|cracher du sang|évanoui|lèvres bleues|brustschmerz|atemnot|blut husten|ohnmacht|blaue lippen/i

const BACKSTOP_MESSAGES: Record<string, { limb: string; dvt: string; cardio: string }> = {
  en: {
    limb: 'This injury needs prompt in-person assessment. I can continue gathering details to help you decide the safest next step.',
    dvt: 'This calf swelling after travel needs prompt in-person assessment today. I can continue gathering details while you arrange care.',
    cardio: 'I need a few more details to judge how urgent this is. Tell me whether it is severe, persistent or present at rest, and whether you can speak normally. If you become unable to breathe, faint, turn blue or grey, or develop heavy chest pressure that spreads, call emergency services now.',
  },
  es: {
    limb: 'Esta lesión necesita una evaluación presencial pronta. Puedo seguir recopilando detalles para ayudarle a decidir el siguiente paso más seguro.',
    dvt: 'Esta hinchazón de la pantorrilla después de viajar necesita una evaluación presencial hoy. Puedo seguir recopilando detalles mientras organiza la atención.',
    cardio: 'Necesito algunos detalles más para valorar la urgencia. Dígame si es intenso, persistente o aparece en reposo, y si puede hablar con normalidad. Si no puede respirar, se desmaya, se pone azul o gris, o presenta una presión fuerte en el pecho que se extiende, llame ahora a los servicios de emergencia.',
  },
  pt: {
    limb: 'Esta lesão precisa de avaliação presencial rápida. Posso continuar a recolher detalhes para ajudar a decidir o próximo passo mais seguro.',
    dvt: 'Este inchaço da panturrilha após a viagem precisa de avaliação presencial hoje. Posso continuar a recolher detalhes enquanto organiza os cuidados.',
    cardio: 'Preciso de mais alguns detalhes para avaliar a urgência. Diga-me se é grave, persistente ou ocorre em repouso, e se consegue falar normalmente. Se não conseguir respirar, desmaiar, ficar azul ou cinzento, ou tiver uma pressão forte no peito que se espalha, ligue agora para os serviços de emergência.',
  },
  hi: {
    limb: 'इस चोट की जल्द प्रत्यक्ष जाँच आवश्यक है। सबसे सुरक्षित अगला कदम तय करने में मदद के लिए मैं और जानकारी ले सकता/सकती हूँ।',
    dvt: 'यात्रा के बाद पिंडली की इस सूजन की आज ही प्रत्यक्ष जाँच आवश्यक है। देखभाल की व्यवस्था करते समय मैं और जानकारी ले सकता/सकती हूँ।',
    cardio: 'स्थिति की तात्कालिकता समझने के लिए मुझे कुछ और जानकारी चाहिए। बताइए कि यह गंभीर, लगातार या आराम के समय भी है, और क्या आप सामान्य रूप से बोल पा रहे हैं। यदि आप साँस न ले पाएँ, बेहोश हों, नीले या धूसर पड़ें, या सीने में फैलता हुआ भारी दबाव हो, तो अभी आपातकालीन सेवाओं को कॉल करें।',
  },
  'hi-Latn': {
    limb: 'Is chot ki jaldi in-person jaanch zaroori hai. Sabse safe agla step tay karne mein madad ke liye main aur details le sakta/sakti hoon.',
    dvt: 'Travel ke baad calf ki is swelling ki aaj hi in-person jaanch zaroori hai. Care arrange karte waqt main aur details le sakta/sakti hoon.',
    cardio: 'Urgency samajhne ke liye mujhe kuch aur details chahiye. Batayein ki yeh severe, lagataar ya rest ke waqt bhi hai, aur kya aap normally bol pa rahe hain. Agar aap saans na le paayein, behosh hon, neele ya grey pad jaayein, ya chest mein failta hua bhaari pressure ho, to abhi emergency services ko call karein.',
  },
  fr: {
    limb: 'Cette blessure nécessite une évaluation rapide en personne. Je peux continuer à recueillir des détails pour vous aider à choisir la prochaine étape la plus sûre.',
    dvt: 'Ce gonflement du mollet après un voyage nécessite une évaluation en personne aujourd’hui. Je peux continuer à recueillir des détails pendant que vous organisez les soins.',
    cardio: 'J’ai besoin de quelques détails supplémentaires pour évaluer l’urgence. Dites-moi si le problème est intense, persistant ou présent au repos, et si vous pouvez parler normalement. Si vous ne pouvez plus respirer, vous évanouissez, devenez bleu ou gris, ou ressentez une forte pression thoracique qui se propage, appelez immédiatement les services d’urgence.',
  },
  de: {
    limb: 'Diese Verletzung muss zeitnah persönlich untersucht werden. Ich kann weitere Angaben aufnehmen, um Ihnen beim sichersten nächsten Schritt zu helfen.',
    dvt: 'Diese Wadenschwellung nach einer Reise muss heute persönlich untersucht werden. Ich kann weitere Angaben aufnehmen, während Sie die Versorgung organisieren.',
    cardio: 'Ich brauche noch einige Angaben, um die Dringlichkeit einzuschätzen. Sagen Sie mir, ob es stark, anhaltend oder in Ruhe vorhanden ist und ob Sie normal sprechen können. Wenn Sie nicht atmen können, ohnmächtig werden, blau oder grau anlaufen oder einen starken ausstrahlenden Brustdruck entwickeln, rufen Sie jetzt den Rettungsdienst.',
  },
}

function backstopMessage(language: string | undefined, kind: 'limb' | 'dvt' | 'cardio'): string {
  const normalized = language === 'es-ES' ? 'es' : String(language || 'en')
  return (BACKSTOP_MESSAGES[normalized] || BACKSTOP_MESSAGES.en)[kind]
}

function historyText(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  const row = entry as Record<string, unknown>
  const role = String(row.role || row.sender || row.author || '').toLowerCase()
  if (role !== 'user' && role !== 'patient') return null
  const value = row.content ?? row.text ?? row.message
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function hasUnnegatedPatientMatch(statement: string, pattern: RegExp): boolean {
  const text = statement.toLowerCase()
  const matcher = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
  let match: RegExpExecArray | null
  while ((match = matcher.exec(text)) !== null) {
    const before = text.slice(Math.max(0, match.index - 60), match.index)
    const clause = before.split(/[;.!?]|\bbut\b|\bhowever\b|\balthough\b|\bthough\b|\baber\b|\bjedoch\b|\bobwohl\b/i).pop() || ''
    if (!NEGATION.test(clause) && !THIRD_PARTY_HISTORY.test(before)) return true
    if (match.index === matcher.lastIndex) matcher.lastIndex += 1
  }
  return false
}

function patientStatements(message: string, history: unknown[]): string[] {
  const statements = history.map(historyText).filter((value): value is string => Boolean(value))
  if (message.trim()) statements.push(message.trim())
  return statements
}

/**
 * A model may recognize a concerning cardio-respiratory symptom without having
 * enough patient-stated evidence to end the interview. This backstop makes the
 * terminal boundary deterministic: assistant questions, fever duration, bare
 * shortness of breath, and ambiguous yes/no answers cannot establish severe
 * respiratory distress or acute coronary syndrome.
 */
export function enforceCardioRespiratoryEmergencySpecificity(
  raw: JsonObject,
  message: string,
  history: unknown[],
  language = 'en',
): JsonObject {
  const requestedForceEnd = Boolean(raw.force_end || raw.is_emergency || raw.status === 'force_end')
  if (!requestedForceEnd) return raw

  const crisisType = String(raw.crisis_type || '').toLowerCase()
  const statements = patientStatements(message, history)
  const patientContext = statements.join(' ')

  // A closed or deformed extremity injury with tingling needs prompt in-person
  // assessment, but it is not by itself evidence for an immediate-emergency
  // force-end. Preserve terminal handling when the patient also reports an
  // open fracture, uncontrolled bleeding, loss of circulation, or another
  // deterministic emergency presentation.
  if (
    crisisType === 'other_emergency'
    && DVT_CALF.test(patientContext)
    && DVT_SWELLING.test(patientContext)
    && DVT_TRIGGER.test(patientContext)
    && !PULMONARY_EMBOLISM_THREAT.test(patientContext)
  ) {
    return {
      ...raw,
      status: 'high_risk_continue',
      risk_level: 'high',
      force_end: false,
      is_emergency: false,
      care_setting: 'urgent_care',
      message: backstopMessage(language, 'dvt'),
      source: 'llm_specificity_backstop',
    }
  }

  if (
    crisisType === 'other_emergency'
    && LOCALIZED_EXTREMITY_INJURY.test(patientContext)
    && !IMMEDIATE_LIMB_THREAT.test(patientContext)
  ) {
    return {
      ...raw,
      status: 'high_risk_continue',
      risk_level: 'high',
      force_end: false,
      is_emergency: false,
      care_setting: 'urgent_care',
      message: backstopMessage(language, 'limb'),
      source: 'llm_specificity_backstop',
    }
  }

  if (crisisType !== 'respiratory_distress' && crisisType !== 'acs_chest_pain') return raw

  const hasHighSpecificityEvidence = crisisType === 'respiratory_distress'
    ? statements.some((statement) => hasUnnegatedPatientMatch(statement, HIGH_SPECIFICITY_BREATHING))
    : statements.some((statement) => hasUnnegatedPatientMatch(statement, HIGH_SPECIFICITY_ACS))

  if (hasHighSpecificityEvidence) return raw

  const hasRelevantSymptom = CARDIO_RESPIRATORY_SYMPTOM.test(patientContext)
  return {
    ...raw,
    status: 'high_risk_continue',
    risk_level: hasRelevantSymptom ? 'high' : 'medium',
    force_end: false,
    is_emergency: false,
    care_setting: hasRelevantSymptom ? 'urgent_care' : 'telehealth',
    message: backstopMessage(language, 'cardio'),
    source: 'llm_specificity_backstop',
  }
}
