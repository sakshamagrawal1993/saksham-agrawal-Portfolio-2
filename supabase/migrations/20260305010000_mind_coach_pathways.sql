-- =============================================================================
-- Mind Coach 20 Pathways Migration
-- =============================================================================

-- Drop the old 7 pathway constraint
ALTER TABLE public.mind_coach_sessions DROP CONSTRAINT IF EXISTS mind_coach_sessions_pathway_check;

-- Add the new 20 pathway constraint
ALTER TABLE public.mind_coach_sessions ADD CONSTRAINT mind_coach_sessions_pathway_check CHECK (
    pathway IN (
        'crisis_intervention_and_suicide_prevention',
        'grief_and_loss_processing',
        'depression_and_behavioral_activation',
        'anxiety_and_stress_management',
        'emotion_regulation_and_distress_tolerance',
        'trauma_processing_and_ptsd',
        'relationship_conflict_and_interpersonal',
        'self_worth_and_self_esteem',
        'boundary_setting_and_assertiveness',
        'overthinking_rumination_and_cognitive_restructuring',
        'sleep_and_insomnia',
        'panic_and_physical_anxiety_symptoms',
        'family_conflict_and_dynamics',
        'abuse_and_safety',
        'life_transition_and_adjustment',
        'identity_and_self_concept',
        'social_anxiety_and_isolation',
        'anger_management',
        'health_anxiety_and_somatic_symptoms',
        'engagement_rapport_and_assessment'
    )
);
