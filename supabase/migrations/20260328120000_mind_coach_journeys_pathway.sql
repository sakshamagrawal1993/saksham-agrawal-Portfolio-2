-- mind_coach_journeys.pathway: clinical route for the journey (mirrors mind_coach_sessions.pathway).
-- Required by PlanProposalModal insert and mind-coach-session-start edge function.

ALTER TABLE public.mind_coach_journeys
  ADD COLUMN IF NOT EXISTS pathway TEXT DEFAULT 'engagement_rapport_and_assessment';

UPDATE public.mind_coach_journeys
SET pathway = 'engagement_rapport_and_assessment'
WHERE pathway IS NULL;

ALTER TABLE public.mind_coach_journeys
  ALTER COLUMN pathway SET DEFAULT 'engagement_rapport_and_assessment';

ALTER TABLE public.mind_coach_journeys DROP CONSTRAINT IF EXISTS mind_coach_journeys_pathway_check;

ALTER TABLE public.mind_coach_journeys ADD CONSTRAINT mind_coach_journeys_pathway_check CHECK (pathway IN (
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

COMMENT ON COLUMN public.mind_coach_journeys.pathway IS 'Active clinical pathway slug for this journey; aligns with mind_coach_sessions.pathway.';
