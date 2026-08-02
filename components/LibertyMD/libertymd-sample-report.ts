/**
 * P3-02 — Landing sample-report catalog (synthetic only).
 *
 * Provenance: mirrors `tests/libertymd/fixtures/report-data.ts` →
 * `MUNDANE_FULL_REPORT_DATA` (viral URI / sore-throat-adjacent) into a product
 * module for landing OverlaySheet mounts. Full P2-03 sections present.
 *
 * HARD RULES:
 * - Synthetic patient only — never fetch `libertymd_reports` / consult rows.
 * - No live consult identifiers or PHI in this module.
 * - Do not conflate `condition_cluster_id` with P3-05 chip ids.
 */

/** Allow-listed sample cluster ids for Mixpanel `sample_report_viewed`. */
export const LIBERTYMD_SAMPLE_CLUSTER_IDS = ['uri_mundane'] as const

export type LibertyMdSampleClusterId = (typeof LIBERTYMD_SAMPLE_CLUSTER_IDS)[number]

/**
 * Synthetic report_data for `uri_mundane`.
 * Structural twin of test fixture `MUNDANE_FULL_REPORT_DATA` — not a live export.
 */
export const URI_MUNDANE_SAMPLE_REPORT_DATA = {
  headline: 'Likely a viral upper respiratory infection',
  patient_summary:
    'You described several days of mild sore throat and congestion without red-flag symptoms.',
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
    {
      rank: 3,
      full_name: 'Acute bacterial sinusitis',
      common_name: 'Sinus infection',
      confidence: 18,
      reason: 'This can cause congestion, but the short duration and lack of persistent fever or focal facial pain make it less likely.',
      supporting_evidence: ['congestion'],
      conflicting_evidence: ['short duration', 'no persistent fever reported'],
    },
  ],
  assessment_and_plan: {
    assessment: 'Mild viral URI without emergency features.',
    plan: ['Supportive care for 3–5 days', 'Follow up if symptoms worsen'],
    self_care: ['Rest', 'Oral fluids', 'Saline rinses'],
    when_to_seek_care:
      'Seek care sooner if you develop trouble breathing, chest pain, or confusion.',
    red_flags_to_watch: ['Trouble breathing', 'Chest pain', 'Confusion', 'Fainting'],
  },
  soap_note: {
    subjective: 'Several days of sore throat and congestion. Denies chest pain or SOB.',
    objective: 'No vitals measured in this consult.',
    assessment: 'Likely viral URI.',
    plan: 'Supportive care; return precautions discussed.',
  },
} as const

/** Plain-language complaint for sample CTA → `beginConsultation` (freetext, not chip). */
export const URI_MUNDANE_SAMPLE_COMPLAINT = 'Sore throat'

const SAMPLE_CATALOG: Record<LibertyMdSampleClusterId, typeof URI_MUNDANE_SAMPLE_REPORT_DATA> = {
  uri_mundane: URI_MUNDANE_SAMPLE_REPORT_DATA,
}

export function isLibertyMdSampleClusterId(value: unknown): value is LibertyMdSampleClusterId {
  return (
    typeof value === 'string' &&
    (LIBERTYMD_SAMPLE_CLUSTER_IDS as readonly string[]).includes(value)
  )
}

/** Resolve allow-listed cluster → synthetic report_data. Never hits clinical tables. */
export function getSampleReportData(clusterId: LibertyMdSampleClusterId) {
  return SAMPLE_CATALOG[clusterId]
}
