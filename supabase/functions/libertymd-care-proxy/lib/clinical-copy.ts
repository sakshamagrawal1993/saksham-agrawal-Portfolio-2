/** Short deterministic journey copy used when no model-authored text is available. */
import { asClinicalLanguage, type ClinicalLanguage } from './journey-locale.ts'

type JourneyCopy = {
  acknowledgement: string
  namedAcknowledgement: (name: string) => string
  caution: string
  fallbackEntryQuestion: string
  comprehensionBridge: string
  continueFallback: string
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
    continueFallback: 'Could you tell me what has changed since the symptom began?',
    reportReadyAnonymous: 'Your LibertyMD report is ready. Link Google to save it and revisit this consult, or continue without saving.',
    reportReadySaved: 'Your LibertyMD report is ready and has been saved to your history.',
  },
  es: {
    acknowledgement: 'Gracias por comunicarse con nosotros sobre sus síntomas.',
    namedAcknowledgement: (name) => `${name}, gracias por comunicarse con nosotros sobre sus síntomas.`,
    caution: ' Continuaré monitoreando signos de alerta urgentes.',
    fallbackEntryQuestion: '¿Cuándo comenzó este síntoma?',
    comprehensionBridge: 'He resumido lo que me ha compartido hasta ahora. Por favor revise el resumen.',
    continueFallback: '¿Qué ha cambiado desde que comenzó el síntoma?',
    reportReadyAnonymous: 'Su informe de LibertyMD está listo. Vincule su cuenta de Google para guardarlo y volver a consultar esta consulta, o continúe sin guardar.',
    reportReadySaved: 'Su informe de LibertyMD está listo y ha sido guardado en su historial.',
  },
  de: {
    acknowledgement: 'Vielen Dank, dass Sie uns Ihre Symptome geschildert haben.',
    namedAcknowledgement: (name) => `${name}, vielen Dank, dass Sie uns Ihre Symptome geschildert haben.`,
    caution: ' Ich werde weiterhin auf dringende Warnzeichen achten.',
    fallbackEntryQuestion: 'Wann hat dieses Symptom begonnen?',
    comprehensionBridge: 'Ich habe Ihre bisherigen Angaben zusammengefasst. Bitte prüfen Sie die Zusammenfassung.',
    continueFallback: 'Was hat sich seit Beginn der Symptome verändert?',
    reportReadyAnonymous: 'Ihr LibertyMD-Bericht ist fertig. Verknüpfen Sie Ihr Google-Konto, um ihn zu speichern und diese Konsultation später wieder aufzurufen, oder fahren Sie ohne Speichern fort.',
    reportReadySaved: 'Ihr LibertyMD-Bericht ist fertig und wurde in Ihrem Verlauf gespeichert.',
  },
  fr: {
    acknowledgement: 'Merci de nous avoir décrit vos symptômes.',
    namedAcknowledgement: (name) => `${name}, merci de nous avoir décrit vos symptômes.`,
    caution: ' Je continuerai à surveiller les signes d’alerte urgents.',
    fallbackEntryQuestion: 'Quand ce symptôme a-t-il commencé ?',
    comprehensionBridge: 'J’ai résumé ce que vous avez partagé jusqu’ici. Veuillez vérifier ce résumé.',
    continueFallback: 'Qu’est-ce qui a changé depuis le début des symptômes ?',
    reportReadyAnonymous: 'Votre rapport LibertyMD est prêt. Associez votre compte Google pour le conserver et retrouver cette consultation, ou continuez sans l’enregistrer.',
    reportReadySaved: 'Votre rapport LibertyMD est prêt et a été enregistré dans votre historique.',
  },
  pt: {
    acknowledgement: 'Obrigado por compartilhar seus sintomas conosco.',
    namedAcknowledgement: (name) => `${name}, obrigado por compartilhar seus sintomas conosco.`,
    caution: ' Continuarei verificando sinais de alerta urgentes.',
    fallbackEntryQuestion: 'Quando esse sintoma começou?',
    comprehensionBridge: 'Resumi o que você compartilhou até agora. Confira o resumo.',
    continueFallback: 'O que mudou desde o início dos sintomas?',
    reportReadyAnonymous: 'Seu relatório LibertyMD está pronto. Vincule sua conta do Google para salvá-lo e rever esta consulta, ou continue sem salvar.',
    reportReadySaved: 'Seu relatório LibertyMD está pronto e foi salvo no seu histórico.',
  },
  hi: {
    acknowledgement: 'अपने लक्षण साझा करने के लिए धन्यवाद।',
    namedAcknowledgement: (name) => `${name}, अपने लक्षण साझा करने के लिए धन्यवाद।`,
    caution: ' मैं गंभीर चेतावनी संकेतों की जाँच जारी रखूँगा।',
    fallbackEntryQuestion: 'यह लक्षण कब शुरू हुआ?',
    comprehensionBridge: 'मैंने अब तक आपकी दी हुई जानकारी का सारांश बनाया है। कृपया इसे जाँच लें।',
    continueFallback: 'लक्षण शुरू होने के बाद से क्या बदला है?',
    reportReadyAnonymous: 'आपकी LibertyMD रिपोर्ट तैयार है। इसे सहेजने और इस परामर्श को दोबारा देखने के लिए Google खाता जोड़ें, या बिना सहेजे आगे बढ़ें।',
    reportReadySaved: 'आपकी LibertyMD रिपोर्ट तैयार है और आपके इतिहास में सहेज दी गई है।',
  },
  'hi-Latn': {
    acknowledgement: 'Apne symptoms share karne ke liye dhanyavaad.',
    namedAcknowledgement: (name) => `${name}, apne symptoms share karne ke liye dhanyavaad.`,
    caution: ' Main urgent warning signs check karta rahunga.',
    fallbackEntryQuestion: 'Yeh symptom kab shuru hua?',
    comprehensionBridge: 'Maine ab tak aapki di hui jaankari ka summary banaya hai. Kripya ise check karein.',
    continueFallback: 'Symptom shuru hone ke baad se kya badla hai?',
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
  return COPY[asClinicalLanguage(language)].continueFallback
}

export function reportGateMessage(language: unknown, isAnonymous: boolean): string {
  const copy = COPY[asClinicalLanguage(language)]
  return isAnonymous ? copy.reportReadyAnonymous : copy.reportReadySaved
}
