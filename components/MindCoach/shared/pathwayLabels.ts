export const PATHWAY_LABELS: Record<string, string> = {
  anxiety_and_stress_management: 'Anxiety & Stress Management',
  depression_and_behavioral_activation: 'Depression & Motivation',
  sleep_and_insomnia: 'Sleep & Insomnia',
  trauma_processing_and_ptsd: 'Trauma Processing',
  grief_and_loss_processing: 'Grief & Loss',
  relationship_conflict_and_interpersonal: 'Relationship Conflict',
  self_worth_and_self_esteem: 'Self-Worth & Esteem',
  social_anxiety_and_isolation: 'Social Anxiety',
  panic_and_physical_anxiety_symptoms: 'Panic & Physical Anxiety',
  emotion_regulation_and_distress_tolerance: 'Emotion Regulation',
  overthinking_rumination_and_cognitive_restructuring: 'Overthinking & Rumination',
  family_conflict_and_dynamics: 'Family Conflict',
  anger_management: 'Anger Management',
  boundary_setting_and_assertiveness: 'Boundary Setting',
  life_transition_and_adjustment: 'Life Transitions',
  identity_and_self_concept: 'Identity & Self-Concept',
  abuse_and_safety: 'Abuse & Safety',
  health_anxiety_and_somatic_symptoms: 'Health Anxiety',
  crisis_intervention_and_suicide_prevention: 'Crisis Support',
  engagement_rapport_and_assessment: 'Continued Exploration',
};

export function pathwayLabel(slug: string | null | undefined): string {
  if (!slug) return 'Your Pathway';
  return PATHWAY_LABELS[slug] ?? slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
