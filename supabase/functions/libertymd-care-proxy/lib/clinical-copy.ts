/** Short deterministic journey copy used when no model-authored text is available. */
import { asClinicalLanguage, type ClinicalLanguage } from './journey-locale.ts'
import type { ClinicalSlot } from './slots.ts'

export interface ClinicalFallbackQuestion {
  question: string
  targetSlot: ClinicalSlot
}

const CONTINUE_FALLBACK_TARGETS: ClinicalSlot[] = [
  'functional_impact',
  'severity',
  'character',
  'associated_symptoms',
  'relevant_history',
]

type JourneyCopy = {
  acknowledgement: string
  namedAcknowledgement: (name: string) => string
  caution: string
  fallbackEntryQuestion: string
  comprehensionBridge: string
  continueFallbacks: string[]
  reportReadyAnonymous: string
  reportReadySaved: string
}

const COPY: Record<ClinicalLanguage, JourneyCopy> = {
  en: {
    acknowledgement: 'Thank you for reaching out about your symptoms.',
    namedAcknowledgement: (name) => `${name}, thank you for reaching out about your symptoms.`,
    caution: ' I will keep checking for urgent warning signs.',
    fallbackEntryQuestion: 'When did this symptom begin?',
    comprehensionBridge: 'I have summarised what you have shared so far. Please check the summary.',
    continueFallbacks: [
      'How are the symptoms affecting sleep, eating, walking, work, or your usual activities?',
      'How severe is the main symptom now, from 0 to 10?',
      'What makes the symptom better or worse?',
      'Are there any other symptoms you have not mentioned yet?',
      'Do you have any important medical conditions, medicines, or allergies?',
    ],
    reportReadyAnonymous: 'Your LibertyMD report is ready. Link Google to save it and revisit this consult, or continue without saving.',
    reportReadySaved: 'Your LibertyMD report is ready and has been saved to your history.',
  },
  es: {
    acknowledgement: 'Gracias por comunicarse con nosotros sobre sus síntomas.',
    namedAcknowledgement: (name) => `${name}, gracias por comunicarse con nosotros sobre sus síntomas.`,
    caution: ' Continuaré monitoreando signos de alerta urgentes.',
    fallbackEntryQuestion: '¿Cuándo comenzó este síntoma?',
    comprehensionBridge: 'He resumido lo que me ha compartido hasta ahora. Por favor revise el resumen.',
    continueFallbacks: [
      '¿Cómo afectan los síntomas al sueño, la alimentación, caminar, el trabajo o sus actividades habituales?',
      '¿Qué intensidad tiene ahora el síntoma principal, de 0 a 10?',
      '¿Qué mejora o empeora el síntoma?',
      '¿Hay algún otro síntoma que aún no haya mencionado?',
      '¿Tiene alguna enfermedad importante, medicamento habitual o alergia?',
    ],
    reportReadyAnonymous: 'Su informe de LibertyMD está listo. Vincule su cuenta de Google para guardarlo y volver a consultar esta consulta, o continúe sin guardar.',
    reportReadySaved: 'Su informe de LibertyMD está listo y ha sido guardado en su historial.',
  },
  de: {
    acknowledgement: 'Vielen Dank, dass Sie uns Ihre Symptome geschildert haben.',
    namedAcknowledgement: (name) => `${name}, vielen Dank, dass Sie uns Ihre Symptome geschildert haben.`,
    caution: ' Ich werde weiterhin auf dringende Warnzeichen achten.',
    fallbackEntryQuestion: 'Wann hat dieses Symptom begonnen?',
    comprehensionBridge: 'Ich habe Ihre bisherigen Angaben zusammengefasst. Bitte prüfen Sie die Zusammenfassung.',
    continueFallbacks: [
      'Wie beeinträchtigen die Symptome Schlaf, Essen, Gehen, Arbeit oder Ihre üblichen Aktivitäten?',
      'Wie stark ist das Hauptsymptom jetzt auf einer Skala von 0 bis 10?',
      'Was verbessert oder verschlimmert das Symptom?',
      'Gibt es weitere Symptome, die Sie noch nicht erwähnt haben?',
      'Haben Sie wichtige Vorerkrankungen, regelmäßige Medikamente oder Allergien?',
    ],
    reportReadyAnonymous: 'Ihr LibertyMD-Bericht ist fertig. Verknüpfen Sie Ihr Google-Konto, um ihn zu speichern und diese Konsultation später wieder aufzurufen, oder fahren Sie ohne Speichern fort.',
    reportReadySaved: 'Ihr LibertyMD-Bericht ist fertig und wurde in Ihrem Verlauf gespeichert.',
  },
  fr: {
    acknowledgement: 'Merci de nous avoir décrit vos symptômes.',
    namedAcknowledgement: (name) => `${name}, merci de nous avoir décrit vos symptômes.`,
    caution: ' Je continuerai à surveiller les signes d’alerte urgents.',
    fallbackEntryQuestion: 'Quand ce symptôme a-t-il commencé ?',
    comprehensionBridge: 'J’ai résumé ce que vous avez partagé jusqu’ici. Veuillez vérifier ce résumé.',
    continueFallbacks: [
      'Comment les symptômes affectent-ils le sommeil, les repas, la marche, le travail ou vos activités habituelles ?',
      'Quelle est maintenant l’intensité du symptôme principal, de 0 à 10 ?',
      'Qu’est-ce qui améliore ou aggrave le symptôme ?',
      'Y a-t-il d’autres symptômes que vous n’avez pas encore mentionnés ?',
      'Avez-vous des maladies importantes, des médicaments réguliers ou des allergies ?',
    ],
    reportReadyAnonymous: 'Votre rapport LibertyMD est prêt. Associez votre compte Google pour le conserver et retrouver cette consultation, ou continuez sans l’enregistrer.',
    reportReadySaved: 'Votre rapport LibertyMD est prêt et a été enregistré dans votre historique.',
  },
  pt: {
    acknowledgement: 'Obrigado por compartilhar seus sintomas conosco.',
    namedAcknowledgement: (name) => `${name}, obrigado por compartilhar seus sintomas conosco.`,
    caution: ' Continuarei verificando sinais de alerta urgentes.',
    fallbackEntryQuestion: 'Quando esse sintoma começou?',
    comprehensionBridge: 'Resumi o que você compartilhou até agora. Confira o resumo.',
    continueFallbacks: [
      'Como os sintomas afetam o sono, a alimentação, caminhar, o trabalho ou suas atividades habituais?',
      'Qual é a intensidade do principal sintoma agora, de 0 a 10?',
      'O que melhora ou piora o sintoma?',
      'Há algum outro sintoma que você ainda não mencionou?',
      'Você tem alguma doença importante, usa medicamentos regularmente ou tem alergias?',
    ],
    reportReadyAnonymous: 'Seu relatório LibertyMD está pronto. Vincule sua conta do Google para salvá-lo e rever esta consulta, ou continue sem salvar.',
    reportReadySaved: 'Seu relatório LibertyMD está pronto e foi salvo no seu histórico.',
  },
  hi: {
    acknowledgement: 'अपने लक्षण साझा करने के लिए धन्यवाद।',
    namedAcknowledgement: (name) => `${name}, अपने लक्षण साझा करने के लिए धन्यवाद।`,
    caution: ' मैं गंभीर चेतावनी संकेतों की जाँच जारी रखूँगा।',
    fallbackEntryQuestion: 'यह लक्षण कब शुरू हुआ?',
    comprehensionBridge: 'मैंने अब तक आपकी दी हुई जानकारी का सारांश बनाया है। कृपया इसे जाँच लें।',
    continueFallbacks: [
      'लक्षण आपकी नींद, खाने, चलने, काम या रोज़मर्रा की गतिविधियों को कैसे प्रभावित कर रहे हैं?',
      'मुख्य लक्षण अभी 0 से 10 में कितना गंभीर है?',
      'किस चीज़ से लक्षण बेहतर या बदतर होता है?',
      'क्या कोई और लक्षण है जिसका आपने अभी तक उल्लेख नहीं किया?',
      'क्या आपको कोई महत्वपूर्ण बीमारी, नियमित दवा या एलर्जी है?',
    ],
    reportReadyAnonymous: 'आपकी LibertyMD रिपोर्ट तैयार है। इसे सहेजने और इस परामर्श को दोबारा देखने के लिए Google खाता जोड़ें, या बिना सहेजे आगे बढ़ें।',
    reportReadySaved: 'आपकी LibertyMD रिपोर्ट तैयार है और आपके इतिहास में सहेज दी गई है।',
  },
  'hi-Latn': {
    acknowledgement: 'Apne symptoms share karne ke liye dhanyavaad.',
    namedAcknowledgement: (name) => `${name}, apne symptoms share karne ke liye dhanyavaad.`,
    caution: ' Main urgent warning signs check karta rahunga.',
    fallbackEntryQuestion: 'Yeh symptom kab shuru hua?',
    comprehensionBridge: 'Maine ab tak aapki di hui jaankari ka summary banaya hai. Kripya ise check karein.',
    continueFallbacks: [
      'Symptoms aapki neend, khane, chalne, kaam ya daily activities ko kaise affect kar rahe hain?',
      'Main symptom abhi 0 se 10 mein kitna severe hai?',
      'Kis cheez se symptom better ya worse hota hai?',
      'Kya koi aur symptom hai jo aapne abhi tak nahi bataya?',
      'Kya aapko koi important medical condition, regular medicine, ya allergy hai?',
    ],
    reportReadyAnonymous: 'Aapki LibertyMD report tayyar hai. Ise save karne aur consultation dobara dekhne ke liye Google account link karein, ya bina save kiye aage badhein.',
    reportReadySaved: 'Aapki LibertyMD report tayyar hai aur aapki history mein save ho gayi hai.',
  },
}

export function startAcknowledgement(
  language: unknown,
  name: string | null | undefined,
  caution: boolean,
  symptom = '',
): string {
  const clinicalLanguage = asClinicalLanguage(language)
  const copy = COPY[clinicalLanguage]
  if (clinicalLanguage === 'en') {
    const condition = /\bfever\b/i.test(symptom) ? 'your fever' : 'your symptoms'
    const base = name
      ? `${name}, thank you for reaching out about ${condition}.`
      : `Thank you for reaching out about ${condition}.`
    return `${base}${caution ? copy.caution : ''}`
  }
  if (clinicalLanguage === 'es') {
    const condition = /\bfiebre\b/i.test(symptom) ? 'su fiebre' : 'sus síntomas'
    const base = name
      ? `${name}, gracias por comunicarse con nosotros sobre ${condition}.`
      : `Gracias por comunicarse con nosotros sobre ${condition}.`
    return `${base}${caution ? copy.caution : ''}`
  }
  return `${name ? copy.namedAcknowledgement(name) : copy.acknowledgement}${caution ? copy.caution : ''}`
}

export function fallbackEntryQuestion(language: unknown): string {
  return COPY[asClinicalLanguage(language)].fallbackEntryQuestion
}

export function comprehensionBridgeMessage(language: unknown): string {
  return COPY[asClinicalLanguage(language)].comprehensionBridge
}

export function continueFallbackQuestion(language: unknown): string {
  return COPY[asClinicalLanguage(language)].continueFallbacks[0]
}

export function continueFallbackQuestions(language: unknown): string[] {
  return [...COPY[asClinicalLanguage(language)].continueFallbacks]
}

export function continueFallbackCandidates(language: unknown): ClinicalFallbackQuestion[] {
  return COPY[asClinicalLanguage(language)].continueFallbacks.map((question, index) => ({
    question,
    targetSlot: CONTINUE_FALLBACK_TARGETS[index] || 'associated_symptoms',
  }))
}

export function reportGateMessage(language: unknown, isAnonymous: boolean): string {
  const copy = COPY[asClinicalLanguage(language)]
  return isAnonymous ? copy.reportReadyAnonymous : copy.reportReadySaved
}
