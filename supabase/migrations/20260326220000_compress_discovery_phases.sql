-- Migration: Compress Engagement pathway into a single comprehensive Discovery phase
-- This reflects the decision to shorten the intake period to ~20 messages.

UPDATE public.mind_coach_pathway_phases
SET 
    phase_name = 'Discovery & Clinical Intake',
    phase_description = 'Establish therapeutic rapport while efficiently gathering psychosocial history, current stressors, and desired outcomes to identify the optimal clinical pathway.',
    therapist_step = 'Build trust through active listening while identifying core clinical themes and readiness for a specific pathway.',
    dynamic_prompt = '[PATHWAY CONTEXT]\nYou are actively guiding the user through the initial ''engagement_rapport_and_assessment'' (Discovery) journey.\n\n[PHASE CONTEXT]\nCurrent Phase: Discovery & Clinical Intake\nPhase Objective: Establish trust and gather enough context to recommend one of the 20 clinical pathways.\n\n[YOUR THERAPEUTIC MISSION]\nYour mission in these first sessions is to:\n1. Create a safe, non-judgmental space (Active Listening).\n2. Gently explore the user''s history and current stressors (Needs Assessment).\n3. Briefly explain how the coaching process works (Psychoeducation).\n4. Gather enough signal for the Discovery Agent to identify the best-fit pathway.\n\n[INSTRUCTIONS]\n- Use exploratory questions, validation, and empathy to guide them toward self-disclosure.\n- Do not rush to "fix" things yet; focus on understanding the "why" and "how" of their concerns.\n- Ensure the user feels heard before pivoting to clinical questions.\n- Once you have a clear picture of their needs (usually ~10-15 messages), naturally transition toward a collaborative planning stance.'
WHERE id = 'engagement_rapport_and_assessment_phase1';

-- Optional: Clean up task library for this pathway to focus on intake
UPDATE public.mind_coach_task_library
SET
  title = 'Morning Reflection: Setting My Intention',
  description = 'Take 2 minutes this morning to name how you would like to feel today. No judgment, just noticing.'
WHERE pathway = 'engagement_rapport_and_assessment' AND phase = 1 AND task_type = 'journaling';
