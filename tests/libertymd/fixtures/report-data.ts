/**
 * P2-02 DoD+ fixtures — synthetic report_data only (no live n8n).
 * Clinical strings are fixture-owned; production UI must never invent them.
 */

/** Deliberately mangled / partial — must render without throw or "undefined" text. */
export const MANGLED_REPORT_DATA = {
  headline: null,
  patient_summary: '',
  triage: { care_setting: 42 },
  differential_diagnosis: [
    { confidence: 87 },
    { full_name: '  ', reason: 'empty name omitted' },
    { name: 'Tension-type headache', reason: 'Most consistent with presentation' },
  ],
  assessment_and_plan: {
    assessment: null,
    plan: [],
    self_care: [null, '', 'Rest and hydrate'],
    when_to_seek_care: undefined,
    red_flags_to_watch: null,
  },
  soap_note: null,
  red_flags: null,
  diagnoses: 'wrong-type',
}

/** Mundane full composer-shaped report_data. */
export const MUNDANE_FULL_REPORT_DATA = {
  headline: 'Likely a viral upper respiratory infection',
  patient_summary: 'You described several days of mild sore throat and congestion without red-flag symptoms.',
  triage: { care_setting: 'home', risk_level: 'low' },
  differential_diagnosis: [
    {
      rank: 1,
      full_name: 'Viral upper respiratory infection',
      common_name: 'Common cold',
      confidence: 78,
      reason: 'Acute mild URI symptoms without focal bacterial signs.',
      description: 'Self-limited viral illness is most likely.',
      supporting_evidence: ['sore throat', 'congestion'],
      conflicting_evidence: [],
    },
    {
      rank: 2,
      full_name: 'Allergic rhinitis',
      common_name: 'Hay fever',
      confidence: 42,
      reason: 'Congestion can overlap; itch/sneezing less prominent here.',
      supporting_evidence: [],
      conflicting_evidence: [],
    },
  ],
  assessment_and_plan: {
    assessment: 'Mild viral URI without emergency features.',
    plan: ['Supportive care for 3–5 days', 'Follow up if symptoms worsen'],
    self_care: ['Rest', 'Oral fluids', 'Saline rinses'],
    when_to_seek_care: 'Seek care sooner if you develop trouble breathing, chest pain, or confusion.',
    red_flags_to_watch: ['Trouble breathing', 'Chest pain', 'Confusion', 'Fainting'],
  },
  soap_note: {
    subjective: 'Several days of sore throat and congestion. Denies chest pain or SOB.',
    objective: 'No vitals measured in this consult.',
    assessment: 'Likely viral URI.',
    plan: 'Supportive care; return precautions discussed.',
  },
}

/** One payload per triage display tier + crisis + unknown (+ emergency expand rule). */
export const TRIAGE_MATRIX_FIXTURES: Array<{ care_setting: string | null; label: string }> = [
  { care_setting: 'home', label: 'home' },
  { care_setting: 'telehealth', label: 'telehealth' },
  { care_setting: 'urgent_care', label: 'urgent_care' },
  { care_setting: 'emergency_department', label: 'emergency_department' },
  { care_setting: 'call_911', label: 'call_911' },
  { care_setting: 'crisis_line', label: 'crisis_line' },
  { care_setting: 'totally_unknown_tier', label: 'unknown' },
  { care_setting: null, label: 'unknown' },
]

export function triageMatrixReport(careSetting: string | null) {
  return {
    headline: 'Triage matrix fixture',
    patient_summary: 'Synthetic summary for triage badge matrix.',
    triage: careSetting == null ? {} : { care_setting: careSetting },
    differential_diagnosis: [
      { full_name: 'Fixture consideration', reason: 'Synthetic differential for expand defaults.' },
    ],
    assessment_and_plan: {
      when_to_seek_care: 'Follow the triage guidance shown above.',
      plan: ['Synthetic plan item'],
      self_care: [],
      red_flags_to_watch: ['Synthetic red flag'],
    },
    soap_note: {
      subjective: 'Synthetic SOAP subjective for 320px layout checks.',
      objective: 'Synthetic objective.',
      assessment: 'Synthetic assessment.',
      plan: 'Synthetic plan.',
    },
  }
}

/** P2-03 AC4 · partial omit matrix — no invented clinical prose. */

/** Full four-pack minus next step (no when_to_seek_care / empty plan). */
export const PARTIAL_NO_NEXT_STEP_REPORT_DATA = {
  headline: 'Partial — no next step',
  patient_summary: 'Synthetic summary without a primary next-step string.',
  triage: { care_setting: 'home', risk_level: 'low' },
  differential_diagnosis: [
    { full_name: 'Viral upper respiratory infection', reason: 'Synthetic differential.' },
  ],
  assessment_and_plan: {
    assessment: 'Mild viral URI.',
    plan: [],
    self_care: [],
    // deliberately omit when_to_seek_care so pickNextStep yields nothing
    red_flags_to_watch: ['Trouble breathing'],
  },
  soap_note: {
    subjective: 'Synthetic SOAP subjective.',
    objective: 'Synthetic objective.',
    assessment: 'Synthetic assessment.',
    plan: 'Synthetic plan.',
  },
}

/** Full four-pack minus differential list. */
export const PARTIAL_NO_DIFFERENTIAL_REPORT_DATA = {
  headline: 'Partial — no differential',
  patient_summary: 'Synthetic summary without differentials.',
  triage: { care_setting: 'telehealth', risk_level: 'moderate' },
  differential_diagnosis: [],
  assessment_and_plan: {
    assessment: 'Needs clinician review.',
    plan: ['Book telehealth'],
    self_care: [],
    when_to_seek_care: 'Seek care sooner if symptoms worsen.',
    red_flags_to_watch: [],
  },
  soap_note: {
    subjective: 'Synthetic SOAP subjective.',
    objective: 'Synthetic objective.',
    assessment: 'Synthetic assessment.',
    plan: 'Synthetic plan.',
  },
}

/** Four-pack minus SOAP note. */
export const PARTIAL_NO_SOAP_REPORT_DATA = {
  headline: 'Partial — no SOAP',
  patient_summary: 'Synthetic summary without SOAP.',
  triage: { care_setting: 'urgent_care', risk_level: 'moderate' },
  differential_diagnosis: [
    { full_name: 'Acute sinusitis', reason: 'Synthetic differential.' },
  ],
  assessment_and_plan: {
    assessment: 'Possible sinusitis.',
    plan: ['Urgent care evaluation'],
    self_care: [],
    when_to_seek_care: 'Go to urgent care today if facial pain worsens.',
    red_flags_to_watch: ['High fever'],
  },
  soap_note: null,
}

/** Triage-only — no next step, differential, A&P clinical body, or SOAP. */
export const PARTIAL_TRIAGE_ONLY_REPORT_DATA = {
  headline: 'Partial — triage only',
  patient_summary: '',
  triage: { care_setting: 'home', risk_level: 'low' },
  differential_diagnosis: [],
  assessment_and_plan: null,
  soap_note: null,
  red_flags: null,
}

// ─── P2-04 · Per-diagnosis detail card fixtures ───────────────────────────────

/** Full card fields + serious-but-less-likely (rank 4, emergency high). */
export const CARD_FULL_SERIOUS_REPORT_DATA = {
  headline: 'Card full + serious fixture',
  patient_summary: 'Synthetic summary for full diagnosis cards.',
  triage: { care_setting: 'urgent_care', risk_level: 'moderate' },
  differential_diagnosis: [
    {
      rank: 1,
      full_name: 'Viral upper respiratory infection',
      common_name: 'Common cold',
      confidence: 78,
      reason: 'Acute mild URI symptoms without focal bacterial signs.',
      further_investigations: ['None routinely required'],
      symptomatic_treatment: ['Saline rinses', 'Rest'],
      supportive_treatment: ['Oral fluids'],
      emergency: 'low',
    },
    {
      rank: 4,
      full_name: 'Acute bacterial sinusitis',
      common_name: 'Sinus infection',
      confidence: 28,
      reason: 'Less likely without prolonged fever or focal facial pain.',
      further_investigations: ['Consider clinical exam if worsening'],
      symptomatic_treatment: ['Saline rinses'],
      supportive_treatment: ['Hydration'],
      emergency: 'high',
    },
  ],
  assessment_and_plan: {
    assessment: 'Mostly self-limited URI.',
    plan: ['Supportive care'],
    self_care: ['Rest'],
    when_to_seek_care: 'Seek care if symptoms worsen.',
    red_flags_to_watch: ['Trouble breathing'],
  },
  soap_note: {
    subjective: 'Synthetic SOAP subjective.',
    objective: 'Synthetic objective.',
    assessment: 'Synthetic assessment with clinician note.',
    plan: 'Synthetic plan.',
  },
}

/** Reason-only differential — ordinal from rank; no treatment slots. */
export const CARD_REASON_ONLY_REPORT_DATA = {
  headline: 'Reason-only card fixture',
  patient_summary: 'Synthetic reason-only differential.',
  triage: { care_setting: 'home' },
  differential_diagnosis: [
    {
      rank: 2,
      common_name: 'Tension headache',
      reason: 'Most consistent with presentation.',
    },
  ],
  assessment_and_plan: {
    when_to_seek_care: 'Rest and reassess.',
    plan: [],
    self_care: [],
  },
}

/** Name-only — both rank and confidence missing → omit ordinal chrome. */
export const CARD_NAME_ONLY_REPORT_DATA = {
  headline: 'Name-only card fixture',
  patient_summary: 'Synthetic name-only differential.',
  triage: { care_setting: 'home' },
  differential_diagnosis: [
    { name: 'Unspecified consideration' },
  ],
  assessment_and_plan: {
    when_to_seek_care: 'Follow local guidance.',
    plan: [],
    self_care: [],
  },
}

/** Single-entry length fixture. */
export const CARD_LENGTH_ONE_REPORT_DATA = {
  headline: 'Length-1 card fixture',
  patient_summary: 'One differential entry.',
  triage: { care_setting: 'telehealth' },
  differential_diagnosis: [
    {
      rank: 1,
      common_name: 'Migraine',
      confidence: 80,
      reason: 'Classic migraine features in history.',
    },
  ],
  assessment_and_plan: {
    when_to_seek_care: 'Seek care if aura or neurological deficits appear.',
    plan: ['Telehealth follow-up'],
    self_care: [],
  },
}

/** Five entries (+ 6th dropped by normalize ≤5). */
export const CARD_LENGTH_FIVE_REPORT_DATA = {
  headline: 'Length-5 card fixture',
  patient_summary: 'Five differentials; sixth must drop.',
  triage: { care_setting: 'home' },
  differential_diagnosis: [
    { rank: 1, common_name: 'Cause one', confidence: 75, reason: 'Top consideration.' },
    { rank: 2, common_name: 'Cause two', confidence: 55, reason: 'Possible overlap.' },
    { rank: 3, common_name: 'Cause three', confidence: 45, reason: 'Also possible.' },
    { rank: 4, common_name: 'Cause four', confidence: 30, reason: 'Less likely.' },
    { rank: 5, common_name: 'Cause five', confidence: 20, reason: 'Least likely.' },
    { rank: 6, common_name: 'Cause six dropped', confidence: 10, reason: 'Must not render.' },
  ],
  assessment_and_plan: {
    when_to_seek_care: 'Monitor symptoms.',
    plan: [],
    self_care: [],
  },
}

/** Treatment slot includes explicit dosing — must be omitted from patient output. */
export const CARD_DOSING_REPORT_DATA = {
  headline: 'Dosing omit fixture',
  patient_summary: 'Synthetic dosing line must not reach patient treatment slots.',
  triage: { care_setting: 'home' },
  differential_diagnosis: [
    {
      rank: 1,
      common_name: 'Common cold',
      confidence: 72,
      reason: 'Viral pattern.',
      symptomatic_treatment: [
        'Acetaminophen 500 mg every 6 hours',
        'Saline rinses as needed',
      ],
      supportive_treatment: ['Rest and fluids'],
    },
  ],
  assessment_and_plan: {
    when_to_seek_care: 'Seek care if worsening.',
    plan: [],
    self_care: [],
  },
}
