/** Synthetic localized report bodies used only by the public sample report. */
export const URI_SAMPLE_REPORT_BY_LANGUAGE: Record<string, Record<string, unknown>> = {
  es: {
    headline: 'Los síntomas son más compatibles con una infección respiratoria viral leve.',
    patient_summary: 'La paciente refiere tres días de tos seca leve, dolor de garganta y congestión nasal, sin dificultad para respirar, dolor de pecho, confusión ni desmayo. No se realizó exploración física ni se midieron signos vitales.',
    triage: { care_setting: 'home', risk_level: 'low' },
    differential_diagnosis: [
      {
        rank: 1, full_name: 'Viral upper respiratory infection', common_name: 'Infección respiratoria viral', confidence: 78,
        description: 'Una infección viral frecuente de la nariz y la garganta que suele mejorar por sí sola.',
        reason: 'La tos leve, el dolor de garganta y la congestión de corta duración encajan con esta posibilidad. La falta de exploración y pruebas limita la certeza.',
      },
      {
        rank: 2, full_name: 'Allergic rhinitis', common_name: 'Rinitis alérgica', confidence: 42,
        description: 'Inflamación de la nariz provocada por una reacción alérgica.',
        reason: 'La congestión puede aparecer con alergias, aunque no se comunicaron picor o estornudos prominentes. La duración corta también permite una causa viral.',
      },
      {
        rank: 3, full_name: 'Acute bacterial sinusitis', common_name: 'Sinusitis bacteriana aguda', confidence: 18,
        description: 'Una infección bacteriana de las cavidades sinusales.',
        reason: 'Puede causar congestión, pero la duración breve y la ausencia de fiebre persistente o dolor facial focal la hacen menos probable.',
      },
    ],
    assessment_and_plan: {
      assessment: 'El cuadro parece leve y es más compatible con una infección viral autolimitada, sin señales de emergencia comunicadas.',
      plan: ['Solicitar valoración si los síntomas empeoran', 'Considerar prueba de COVID-19 si procede'],
      self_care: ['Descansar lo suficiente', 'Mantener una buena hidratación', 'Usar lavados nasales con suero'],
      diagnostic_investigations: ['Exploración por atención primaria', 'Prueba de COVID-19 si está indicada'],
      red_flags_to_watch: ['Dificultad para respirar', 'Dolor de pecho persistente', 'Confusión nueva', 'Desmayo'],
      when_to_seek_care: 'Busque atención urgente si aparece alguna señal de alarma o el estado empeora rápidamente.',
    },
    soap_note: {
      subjective: 'Tres días de tos seca leve, dolor de garganta y congestión nasal. Niega dificultad respiratoria, dolor torácico, confusión y desmayo.',
      objective: 'Consulta remota sin exploración física, signos vitales ni pruebas diagnósticas.',
      assessment: 'Infección respiratoria viral leve como primera posibilidad; rinitis alérgica y sinusitis bacteriana son alternativas menos probables.',
      plan: 'Cuidados de apoyo, vigilancia de señales de alarma y valoración clínica si persiste o empeora.',
    },
  },
  hi: {
    headline: 'लक्षण हल्के वायरल श्वसन संक्रमण से सबसे अधिक मेल खाते हैं।',
    patient_summary: 'रोगी ने तीन दिनों से हल्की सूखी खांसी, गले में खराश और नाक बंद होने की बात बताई। सांस लेने में कठिनाई, सीने में दर्द, भ्रम या बेहोशी नहीं बताई गई। कोई शारीरिक जांच या जीवन-चिह्न माप नहीं हुआ।',
    triage: { care_setting: 'home', risk_level: 'low' },
    differential_diagnosis: [
      {
        rank: 1, full_name: 'Viral upper respiratory infection', common_name: 'वायरल ऊपरी श्वसन संक्रमण', confidence: 78,
        description: 'नाक और गले का एक सामान्य वायरल संक्रमण जो अक्सर अपने आप ठीक हो जाता है।',
        reason: 'हल्की खांसी, गले में खराश और कम अवधि की नाक बंद होना इससे मेल खाते हैं। जांच और परीक्षण न होने से निश्चितता सीमित है।',
      },
      {
        rank: 2, full_name: 'Allergic rhinitis', common_name: 'एलर्जिक राइनाइटिस', confidence: 42,
        description: 'एलर्जी के कारण नाक के अंदर होने वाली सूजन।',
        reason: 'नाक बंद होना एलर्जी में हो सकता है, लेकिन प्रमुख खुजली या छींक नहीं बताई गई। कम अवधि वायरल कारण का भी समर्थन करती है।',
      },
      {
        rank: 3, full_name: 'Acute bacterial sinusitis', common_name: 'तीव्र बैक्टीरियल साइनुसाइटिस', confidence: 18,
        description: 'साइनस गुहाओं में होने वाला बैक्टीरियल संक्रमण।',
        reason: 'यह नाक बंद कर सकता है, लेकिन कम अवधि और लगातार बुखार या चेहरे के खास हिस्से में दर्द न होना इसे कम संभावित बनाता है।',
      },
    ],
    assessment_and_plan: {
      assessment: 'स्थिति हल्की और अपने आप ठीक होने वाले वायरल संक्रमण से अधिक मेल खाती है; कोई आपात संकेत नहीं बताया गया।',
      plan: ['लक्षण बढ़ें तो चिकित्सकीय मूल्यांकन कराएं', 'ज़रूरत हो तो COVID-19 जांच कराएं'],
      self_care: ['पर्याप्त आराम करें', 'पर्याप्त तरल लें', 'सलाइन नाक धुलाई करें'],
      diagnostic_investigations: ['प्राथमिक देखभाल चिकित्सक की जांच', 'संकेत मिलने पर COVID-19 जांच'],
      red_flags_to_watch: ['सांस लेने में कठिनाई', 'लगातार सीने में दर्द', 'नया भ्रम', 'बेहोशी'],
      when_to_seek_care: 'कोई चेतावनी संकेत आए या हालत तेजी से बिगड़े तो तुरंत चिकित्सा सहायता लें।',
    },
    soap_note: {
      subjective: 'तीन दिनों से हल्की सूखी खांसी, गले में खराश और नाक बंद। सांस की तकलीफ, सीने में दर्द, भ्रम और बेहोशी से इनकार।',
      objective: 'दूरस्थ परामर्श; कोई शारीरिक जांच, जीवन-चिह्न या नैदानिक परीक्षण उपलब्ध नहीं।',
      assessment: 'हल्का वायरल श्वसन संक्रमण सबसे संभावित; एलर्जिक राइनाइटिस और बैक्टीरियल साइनुसाइटिस कम संभावित विकल्प।',
      plan: 'सहायक देखभाल, चेतावनी संकेतों की निगरानी और लक्षण बने रहने या बढ़ने पर चिकित्सकीय समीक्षा।',
    },
  },
  'hi-Latn': {
    headline: 'Symptoms mild viral respiratory infection se sabse zyada match karte hain.',
    patient_summary: 'Patient ne teen din se halki dry cough, sore throat aur blocked nose bataya. Saans lene mein dikkat, chest pain, confusion ya fainting nahi batayi gayi. Physical examination ya vital signs available nahi hain.',
    triage: { care_setting: 'home', risk_level: 'low' },
    differential_diagnosis: [
      {
        rank: 1, full_name: 'Viral upper respiratory infection', common_name: 'Viral respiratory infection', confidence: 78,
        description: 'Naak aur gale ka common viral infection jo aksar khud theek hota hai.',
        reason: 'Halki cough, sore throat aur short-duration congestion isse match karte hain. Examination aur tests na hone se certainty limited hai.',
      },
      {
        rank: 2, full_name: 'Allergic rhinitis', common_name: 'Allergic rhinitis', confidence: 42,
        description: 'Allergy ki wajah se naak ke andar hone wali inflammation.',
        reason: 'Blocked nose allergy mein ho sakta hai, lekin prominent itching ya sneezing report nahi hui. Short duration viral cause ko bhi support karti hai.',
      },
      {
        rank: 3, full_name: 'Acute bacterial sinusitis', common_name: 'Bacterial sinus infection', confidence: 18,
        description: 'Sinus cavities ka bacterial infection.',
        reason: 'Yeh congestion kar sakta hai, lekin short duration aur persistent fever ya focal facial pain na hona ise less likely banata hai.',
      },
    ],
    assessment_and_plan: {
      assessment: 'Condition mild lagti hai aur self-limited viral infection se zyada match karti hai; emergency signs report nahi hue.',
      plan: ['Symptoms badhein toh clinical evaluation karayein', 'Zarurat par COVID-19 test consider karein'],
      self_care: ['Achhi tarah rest karein', 'Fluids lete rahein', 'Saline nasal rinse use karein'],
      diagnostic_investigations: ['Primary-care doctor examination', 'Indication ho toh COVID-19 test'],
      red_flags_to_watch: ['Saans lene mein dikkat', 'Lagataar chest pain', 'Naya confusion', 'Fainting'],
      when_to_seek_care: 'Red flag aaye ya condition tezi se bigde toh urgent medical help lein.',
    },
    soap_note: {
      subjective: 'Teen din se halki dry cough, sore throat aur blocked nose. Breathlessness, chest pain, confusion aur fainting deny kiya.',
      objective: 'Remote consultation; physical examination, vital signs aur diagnostic tests available nahi.',
      assessment: 'Mild viral respiratory infection most likely; allergic rhinitis aur bacterial sinusitis less likely alternatives.',
      plan: 'Supportive care, red-flag monitoring, aur symptoms persist ya worsen hone par clinical review.',
    },
  },
}
