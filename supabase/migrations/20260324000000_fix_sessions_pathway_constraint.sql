-- =============================================================================
-- Fix: Update pathway CHECK constraint to include all 20 pathway IDs
-- Fix: Add missing pathway_confidence column
-- =============================================================================

-- 1. Drop the outdated CHECK constraint on pathway
ALTER TABLE public.mind_coach_sessions DROP CONSTRAINT IF EXISTS mind_coach_sessions_pathway_check;

-- 2. Add the updated constraint with all 20 pathway IDs
ALTER TABLE public.mind_coach_sessions ADD CONSTRAINT mind_coach_sessions_pathway_check CHECK (pathway IN (
    'engagement_rapport_and_assessment',
    'family_conflict_and_dynamics',
    'crisis_intervention_and_suicide_prevention',
    'sleep_and_insomnia',
    'overthinking_rumination_and_cognitive_restructuring',
    'depression_and_behavioral_activation',
    'social_anxiety_and_isolation',
    'panic_and_physical_anxiety_symptoms',
    'abuse_and_safety',
    'relationship_conflict_and_interpersonal',
    'emotion_regulation_and_distress_tolerance',
    'self_worth_and_self_esteem',
    'anger_management',
    'trauma_processing_and_ptsd',
    'grief_and_loss_processing',
    'health_anxiety_and_somatic_symptoms',
    'identity_and_self_concept',
    'anxiety_and_stress_management',
    'boundary_setting_and_assertiveness',
    'life_transition_and_adjustment'
));

-- 3. Add missing pathway_confidence column (used by Edge Function but not in schema)
ALTER TABLE public.mind_coach_sessions ADD COLUMN IF NOT EXISTS pathway_confidence INTEGER DEFAULT 0;
