/**
 * Canonical deterministic emergency patterns for LibertyMD.
 *
 * REQUIRES EXPERT REVIEW: the pattern set and all patient-facing emergency
 * copy are engineering safety fixtures pending clinician approval.
 *
 * Pattern-set version bump procedure: any edit to `EMERGENCY_PATTERNS` (matcher,
 * id, crisis type, care setting, or copy) requires bumping
 * `EMERGENCY_PATTERN_SET_VERSION` in the same commit. The version is persisted
 * on every `edge_deterministic` `libertymd_safety_events.raw_result.match`.
 *
 * P0-17: `message` is a thin read-through of canonical `detail` from
 * `lib/emergency-copy.ts` so n8n sync still emits one message string.
 */
import { emergencyCopyDetail } from './lib/emergency-copy.ts'

export const EMERGENCY_PATTERN_SET_VERSION = '1.3.0'

export type EmergencyCareSetting = 'call_911' | 'crisis_line'

export interface EmergencyPattern {
  id: string
  crisisType: string
  careSetting: EmergencyCareSetting
  message: string
  matcher: RegExp
  clinicianReview: {
    status: 'pending'
    note: string
  }
}

const PENDING_REVIEW = {
  status: 'pending',
  note: 'REQUIRES EXPERT REVIEW before clinical release.',
} as const

export const EMERGENCY_PATTERNS: readonly EmergencyPattern[] = [
  {
    id: 'acs_chest_pain',
    crisisType: 'acs_chest_pain',
    careSetting: 'call_911',
    message: emergencyCopyDetail('acs_chest_pain'),
    // Bare "chest pain" is deliberately not terminal. Pain only while
    // coughing, taking a deep breath, moving, or pressing the area is common
    // in respiratory and musculoskeletal presentations. Those cases still go
    // through the n8n guardrail as high_risk_continue so the interview can ask
    // persistence, severity, rest/exertion, radiation, and associated signs.
    // Force-end is reserved for pressure/squeezing/crushing/heaviness or chest
    // pain paired with a high-specificity ACS warning feature.
    matcher: /(?:crushing|squeezing|heavy) (?:chest|pressure)|chest (?:pressure|squeezing|heaviness)|elephant (?:on|sitting)|(?:chest (?:pain|discomfort).{0,80}(?:radiat(?:es|ing)?|spread(?:s|ing)?).{0,35}(?:arm|jaw|back|neck))|(?:chest (?:pain|discomfort).{0,80}(?:cold sweat|sweating|lightheaded|faint(?:ed|ing)?))|(?:(?:cold sweat|sweating|lightheaded|faint(?:ed|ing)?).{0,80}chest (?:pain|discomfort))|(?:chest (?:pain|discomfort).{0,60}(?:persistent|keeps returning|comes back|lasting (?:more than )?(?:a few|[5-9]|[1-9]\d) minutes?))|(?:jaw pain.{0,30}(?:cold sweat|sweat|sweating|nausea|lightheaded|faint(?:ed|ing)?))|(?:presi[oó]n (?:opresiva|aplastante).{0,20}pecho)|(?:dolor (?:de|en la) mand[ií]bula.{0,35}(?:sudor|n[aá]usea))|(?:press[aã]o esmagadora.{0,20}peito)|(?:dor na mand[ií]bula.{0,35}(?:suor|n[aá]usea))|(?:सीने में.{0,25}(?:कुचलने जैसा )?दबाव)|(?:जबड़े में दर्द.{0,35}(?:पसीना|मतली))|(?:chest mein crushing pressure)|(?:jaw (?:mein )?pain.{0,35}(?:sweating|nausea))|(?:pression [eé]crasante.{0,25}poitrine)|(?:mal [aà] la m[aâ]choire.{0,35}(?:sueur|naus[eé]e))|(?:drückend(?:e|er|en)? (?:brustschmerz|schmerz.{0,45}brust))|(?:kieferschmerz.{0,35}(?:schwitz|[uü]belkeit))|(?:brust(?:schmerz|druck).{0,80}(?:strahlt|zieht).{0,35}(?:arm|kiefer|rücken|nacken))|(?:brust(?:schmerz|druck).{0,80}(?:arm|kiefer|rücken|nacken).{0,25}(?:ausstrahl|zieh))|(?:brust(?:schmerz|druck).{0,80}(?:kalter schweiß|schwitze|schwitzen|ohnmacht|benommen))/i,
    clinicianReview: PENDING_REVIEW,
  },
  {
    id: 'thunderclap_headache',
    crisisType: 'thunderclap_headache',
    careSetting: 'call_911',
    message: emergencyCopyDetail('thunderclap_headache'),
    matcher: /worst headache of (my|his|her) life|thunderclap|sudden(ly)? (severe|worst|excruciating|blinding|intense) headache|headache.{0,25}(came on|hit me|started).{0,15}(suddenly|instantly|out of nowhere)|headache with (neck stiffness|confusion|weakness|vision loss)|peor dolor de cabeza de mi vida|pior dor de cabe[cç]a da minha vida|ज़िंदगी का सबसे तेज़ सिरदर्द|life ka sabse tez headache|pire mal de t[eê]te de ma vie|schlimmste[nr]? kopfschmerz (?:meines|seines|ihres) lebens|plötzlich.{0,35}(?:extrem|sehr|unerträglich|schlimmste[nr]?).{0,20}kopfschmerz|kopfschmerz.{0,35}(?:plötzlich|innerhalb von sekunden)/i,
    clinicianReview: PENDING_REVIEW,
  },
  {
    id: 'anaphylaxis',
    crisisType: 'anaphylaxis',
    careSetting: 'call_911',
    message: emergencyCopyDetail('anaphylaxis'),
    matcher: /throat (is )?tight(?![^.!?]{0,30}\b(?:not|no|nahi)\b)|lip swelling|tongue swelling|anaphylaxis|cannot breathe after|wheezing after (a )?(peanut|shellfish|bee|sting)|lengua.{0,20}(?:hinchando|hinchada)|garganta.{0,20}(?:cerrada|apretada)|l[ií]ngua.{0,20}(?:inchando|inchada)|garganta.{0,20}apertada|जीभ(?![^.!?]{0,50}नहीं).{0,20}सूज|गला(?![^.!?]{0,30}नहीं).{0,20}कस|tongue(?![^.!?]{0,50}\bnahi\b).{0,20}swell|langue.{0,20}gonfl|gorge.{0,20}serr[eé]e|zunge(?![^.!?]{0,20}\b(?:nicht|kein(?:e|en|er|es)?)\b).{0,25}(?:schwillt|geschwollen)|hals(?![^.!?]{0,20}\b(?:nicht|kein(?:e|en|er|es)?)\b).{0,25}(?:eng|schwillt|zugeschwollen)|anaphylaxie/i,
    clinicianReview: PENDING_REVIEW,
  },
  {
    id: 'respiratory_distress',
    crisisType: 'respiratory_distress',
    careSetting: 'call_911',
    message: emergencyCopyDetail('respiratory_distress'),
    matcher: /cannot breathe|can't breathe|blue lips|gasping for air|oxygen (sat|saturation).{0,12}(8\d|9[0-2])\b|no puedo respirar|labios.{0,15}azules|saturaci[oó]n de ox[ií]geno.{0,18}(?:[0-8]\d|9[0-2])\b|jadeando.{0,20}respirar|n[aã]o consigo respirar|l[aá]bios.{0,15}azuis|satura[cç][aã]o de oxig[eê]nio.{0,18}(?:[0-8]\d|9[0-2])\b|ofegante|साँस नहीं ले|होंठ.{0,15}नीले|ऑक्सीजन सैचुरेशन.{0,18}(?:[0-8]\d|9[0-2])|हवा के लिए हाँफ|saans nahi le|lips blue|haanf|n.arrive pas [aà] respirer|l[eè]vres.{0,15}bleu|saturation en oxyg[eè]ne.{0,18}(?:[0-8]\d|9[0-2])\b|cherche mon souffle|(?:kann|können) (?:kaum|nicht) atmen|ring(?:e|t|en)? nach luft|(?:kann|können) keinen ganzen satz sprechen|blaue lippen|sauerstoffsättigung.{0,18}(?:[0-8]\d|9[0-2])\b/i,
    clinicianReview: PENDING_REVIEW,
  },
  {
    id: 'surgical_abdomen',
    crisisType: 'surgical_abdomen',
    careSetting: 'call_911',
    message: emergencyCopyDetail('surgical_abdomen'),
    matcher: /sudden severe (abdominal|belly|stomach) pain|severe (right lower|lower right|lower) (abdominal|belly|stomach) pain|rigid abdomen|pain (is )?so bad i (can't|cannot) walk|dolor abdominal intenso y repentino|dolor intenso.{0,30}(?:inferior derecha|derecha inferior).{0,25}abdomen|dor abdominal intensa e repentina|dor intensa.{0,30}(?:inferior direita|direita inferior).{0,25}abd[oô]men|पेट में अचानक बहुत तेज़ दर्द|पेट के दाएँ निचले हिस्से में बहुत तेज़ दर्द|pet mein achanak bahut tez pain|pet ke right lower side mein bahut tez pain|douleur abdominale intense et soudaine|douleur intense.{0,30}bas [aà] droite.{0,25}abdomen|plötzlich.{0,25}(?:sehr |extrem )?(?:starke|heftige) (?:bauchschmerzen|schmerzen.{0,35}(?:bauch|unterbauch))|(?:starke|heftige) schmerzen.{0,25}(?:(?:rechten|rechter|rechts).{0,15}unterbauch|rechts unten.{0,15}(?:im )?bauch)|schmerzen.{0,35}(?:kann|können).{0,20}(?:kaum|nicht) (?:gehen|laufen)/i,
    clinicianReview: PENDING_REVIEW,
  },
  {
    id: 'stroke_fast',
    crisisType: 'stroke_fast',
    careSetting: 'call_911',
    message: emergencyCopyDetail('stroke_fast'),
    matcher: /face (is )?(drooping|droopy)|one side of (my|the) (body|face).{0,30}(weak|numb)|arm (is )?(weak|numb).{0,30}(speech|speak)|speech (is )?(slurred|garbled)|cannot speak properly|can't speak properly|(?:cara.{0,20}(?:cae|ca[ií]da)|cae.{0,20}cara).{0,45}brazo.{0,20}d[eé]bil|lado del cuerpo.{0,20}entumecido.{0,35}no puedo hablar|rosto.{0,20}ca[ií]do.{0,45}bra[cç]o.{0,20}fraco|lado do corpo.{0,20}dormente.{0,35}n[aã]o consigo falar|चेहरा.{0,20}झुक.{0,45}हाथ.{0,20}कमजोर|शरीर का एक हिस्सा.{0,20}सुन्न.{0,35}बोल नहीं|face.{0,20}droop.{0,45}arm weak|body ka ek side numb.{0,35}bol nahi|visage.{0,20}affaisse.{0,45}bras.{0,20}faible|c[oô]t[eé] du corps.{0,20}engourdi.{0,35}parler|gesicht.{0,20}(?:h[aä]ngt|schief).{0,45}arm.{0,20}schwach|k[oö]rperseite.{0,20}taub.{0,35}nicht richtig sprechen/i,
    clinicianReview: PENDING_REVIEW,
  },
  {
    id: 'suicidal_ideation',
    crisisType: 'suicidal_ideation',
    careSetting: 'crisis_line',
    message: emergencyCopyDetail('suicidal_ideation'),
    matcher: /\b(i want to kill myself|i (am|'m) going to kill myself|i (want|plan) to end my life|i plan to kill myself|i (have|'ve) been thinking about (ending my life|killing myself|suicide)|i am thinking about suicide|i (am|'m) suicidal)\b|pensando en acabar con mi vida|pensado en acabar con mi vida|pens(?:ando|ado) em acabar com a minha vida|अपनी जान खत्म करने के बारे में सोच|life end karne ke baare mein soch|mettre fin [aà] mes jours|mein leben zu beenden/i,
    clinicianReview: {
      status: 'pending',
      note: 'REQUIRES EXPERT REVIEW: highest-uncertainty matcher and crisis-line copy.',
    },
  },
]
