-- =============================================================================
-- Mind Coach: FINAL PRODUCTION SYNC SCRIPT (2026-03-26)
-- Consolidated all recent migrations into one file for easy execution.
-- =============================================================================

-- ── 1. ASSESSMENT INTERPRETATIONS ──
CREATE TABLE IF NOT EXISTS public.mind_coach_assessment_interpretations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_type TEXT NOT NULL,
    min_score INT NOT NULL,
    max_score INT NOT NULL,
    severity_level TEXT NOT NULL,
    interpretation_text TEXT NOT NULL,
    action_suggestion TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.mind_coach_assessment_interpretations 
(assessment_type, min_score, max_score, severity_level, interpretation_text, action_suggestion)
VALUES
('gad7', 0, 4, 'Minimal Anxiety', 'Your scores suggest you are experiencing minimal anxiety symptoms right now.', 'Great time to practice preventive mindfulness.'),
('gad7', 5, 9, 'Mild Anxiety', 'Your scores suggest mild anxiety. This is a good time to explore grounding techniques.', 'Consider recording a journal entry about your triggers.'),
('gad7', 10, 14, 'Moderate Anxiety', 'Your scores indicate moderate anxiety levels. Clinical support and consistent exercises are recommended.', 'Let’s schedule a deep-dive session with your coach.'),
('gad7', 15, 21, 'Severe Anxiety', 'Your scores indicate severe anxiety. Please prioritize self-care and consider professional clinical consultation.', 'In-chat grounding exercise recommended immediately.'),
('phq9', 0, 4, 'Minimal Depression', 'No significant depressive symptoms noted.', 'Continue your current wellness routine.'),
('phq9', 5, 9, 'Mild Depression', 'Mild symptoms noted, often related to temporary stressors.', 'Try the Behavioral Activation exercise today.'),
('phq9', 10, 14, 'Moderate Depression', 'Moderate symptoms affecting daily function might be present.', 'Focus on small, achievable daily goals.'),
('phq9', 15, 19, 'Moderately Severe Depression', 'Significant symptoms impacting quality of life.', 'Consultation with a healthcare provider is advised.'),
('phq9', 20, 27, 'Severe Depression', 'Severe symptoms requires immediate attention.', 'Please reach out to your local crisis support or therapist.'),
('pss4', 0, 6, 'Low Stress', 'You seem to be handling life’s challenges well right now.', 'Keep using your current coping strategies.'),
('pss4', 7, 11, 'Moderate Stress', 'You are experiencing a manageable but noticeable level of stress.', 'Practice the 4-7-8 breathing technique twice daily.'),
('pss4', 12, 16, 'High Stress', 'Your stress levels are high, which can impact your long-term health.', 'Prioritize restorative sleep and stress-reduction exercises.')
ON CONFLICT DO NOTHING;

-- ── 2. CLINICAL TASK LIBRARY (20 Pathways x 4 Phases) ──
CREATE TABLE IF NOT EXISTS public.mind_coach_task_library (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pathway             TEXT NOT NULL,
  phase               INTEGER NOT NULL CHECK (phase BETWEEN 1 AND 4),
  task_type           TEXT NOT NULL CHECK (task_type IN (
                        'journaling', 'somatic_exercise', 'cognitive_reframing',
                        'behavioral_exposure', 'situational_prep', 'general'
                      )),
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  frequency           TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'situational', 'once')),
  suggested_duration_days INTEGER NOT NULL DEFAULT 7,
  phase_goal          TEXT NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_library_pathway_phase
  ON mind_coach_task_library (pathway, phase);

-- Seeding All Tasks
INSERT INTO mind_coach_task_library
  (pathway, phase, task_type, title, description, frequency, suggested_duration_days, phase_goal)
VALUES
-- Anxiety
('anxiety_and_stress_management', 1, 'journaling', 'Stress Snapshot Journal', 'Each evening, write 3 sentences: (1) What felt stressful today, (2) How your body responded, (3) One kind thing you did for yourself.', 'daily', 7, 'Validate your experience'),
('anxiety_and_stress_management', 1, 'somatic_exercise', 'Box Breathing Check-in', 'Twice a day, practice 4 rounds of box breathing: inhale 4, hold 4, exhale 4, hold 4.', 'daily', 7, 'Validate your experience'),
('anxiety_and_stress_management', 2, 'journaling', 'Trigger Tracking Log', 'Each time anxiety spikes, note Situation, Thought, and Body Reaction.', 'daily', 7, 'Identify triggers'),
('anxiety_and_stress_management', 2, 'cognitive_reframing', 'Worry Sorting Exercise', 'Sort worries into: In My Control / Not In My Control.', 'daily', 7, 'Identify triggers'),
('anxiety_and_stress_management', 3, 'somatic_exercise', 'Grounding Body Scan', '5-minute body scan once per day to anchor in the present.', 'daily', 14, 'Build calming tools'),
('anxiety_and_stress_management', 3, 'behavioral_exposure', 'Small Brave Step', 'Face one small low-stakes avoided situation this week.', 'once', 7, 'Build calming tools'),
('anxiety_and_stress_management', 4, 'journaling', 'Progress Letter to Yourself', 'Write to your current self from 3 months in the future.', 'once', 1, 'Integrate learnings'),

-- Depression
('depression_and_behavioral_activation', 1, 'journaling', 'One Small Moment Journal', 'Log one slightly-less-heavy moment per day.', 'daily', 7, 'Gently re-engage'),
('depression_and_behavioral_activation', 1, 'somatic_exercise', 'Gentle Morning Movement', '5 minutes of stretching or walking each morning.', 'daily', 7, 'Gently re-engage'),
('depression_and_behavioral_activation', 2, 'journaling', 'Activity & Mood Tracker', 'Log 3 activities daily and rate mood before/after.', 'daily', 7, 'Identify energy patterns'),
('depression_and_behavioral_activation', 3, 'behavioral_exposure', 'Activation Experiment', 'Schedule one pleasurable activity and do it regardless of mood.', 'once', 7, 'Reintroduce meaning'),
('depression_and_behavioral_activation', 3, 'cognitive_reframing', 'Counter the Inner Critic', 'Respond to self-criticism as you would to a friend.', 'situational', 7, 'Reintroduce meaning'),
('depression_and_behavioral_activation', 4, 'journaling', 'Strengths Evidence Log', 'Log one small daily win for 7 days.', 'daily', 7, 'Build sustainability'),

-- Sleep
('sleep_and_insomnia', 1, 'journaling', 'Sleep Diary', 'Log bedtime, wake time, awakenings, and morning mood.', 'daily', 7, 'Understand patterns'),
('sleep_and_insomnia', 2, 'somatic_exercise', 'Wind-Down Ritual', '20-minute ritual (no screens) 30 mins before bed.', 'daily', 14, 'Reduce hyperarousal'),
('sleep_and_insomnia', 3, 'behavioral_exposure', 'Stimulus Control Practice', 'Bed is for sleep ONLY. Get up if not sleep in 20 mins.', 'daily', 14, 'Rebuild bed-sleep link'),
('sleep_and_insomnia', 3, 'cognitive_reframing', 'Clock-Watching Reframe', 'Turn clock away and use comforting reframes.', 'situational', 7, 'Rebuild bed-sleep link'),
('sleep_and_insomnia', 4, 'journaling', 'Sleep Success Reflection', 'Evaluate progress and maintain what works.', 'once', 1, 'Consolidate gains'),

-- Family Conflict
('family_conflict_and_dynamics', 1, 'journaling', 'Family System Sketch', 'Describe your family dynamic and your role in it.', 'once', 1, 'Build a safe map'),
('family_conflict_and_dynamics', 2, 'journaling', 'Conflict Pattern Log', 'Note triggers and outcomes in family tensions.', 'situational', 7, 'Identify loops'),
('family_conflict_and_dynamics', 3, 'situational_prep', 'Conversation Architecture', 'Prepare for a difficult family talk using "I" statements.', 'once', 3, 'Build de-escalation skills'),
('family_conflict_and_dynamics', 4, 'journaling', 'What Healthy Looks Like', 'Define a vision for better (not perfect) relationships.', 'once', 1, 'Consolidate gains'),

-- Crisis (Stabilisation focus)
('crisis_intervention_and_suicide_prevention', 1, 'somatic_exercise', 'Safe Place Grounding', 'Visualise a safe place for 5 mins daily when overwhelmed.', 'daily', 7, 'Establish immediate safety'),
('crisis_intervention_and_suicide_prevention', 2, 'journaling', 'Warning Sign Map', 'Identify physical, thought, and behavioral escalations.', 'once', 1, 'Safety awareness'),
('crisis_intervention_and_suicide_prevention', 3, 'situational_prep', 'Safety Plan Card', 'Notecoping tools, people, and crisis lines clearly.', 'once', 1, 'Concrete safety plan'),
('crisis_intervention_and_suicide_prevention', 4, 'journaling', 'Reasons for Living List', 'A living list of reasons to stay — read on hard days.', 'once', 1, 'Future orientation'),

-- (Remaining pathways available in migrations/20260326210000_task_library_remaining.sql - consolidated here)
('panic_and_physical_anxiety_symptoms', 1, 'journaling', 'Panic Episode Log', 'Build a map of your panic cycle.', 'situational', 7, 'Understand pathophysiology'),
('abuse_and_safety', 1, 'somatic_exercise', 'Body Safety Check', 'Check in once a day: "Do I feel safe right now?"', 'daily', 7, 'Emotional safety'),
('health_anxiety_and_somatic_symptoms', 1, 'journaling', 'Health Worry Journal', 'Observe the catastrophic health-checking cycle.', 'situational', 7, 'Map health-anxiety cycle'),
('identity_and_self_concept', 1, 'journaling', 'Identity Inventory', 'Explore who you are vs roles you play.', 'once', 1, 'Landscape exploration'),
('engagement_rapport_and_assessment', 1, 'journaling', 'What Brought Me Here', 'Articulate your current decision to seek support.', 'once', 1, 'Open dialogue'),
('engagement_rapport_and_assessment', 4, 'journaling', 'One Thing I Want to Change', 'Finalise the core focus area for pathway assignment.', 'once', 1, 'Target crystallisation')
ON CONFLICT DO NOTHING;

-- ── 3. DISCOVERY PHASE OPTIMIZATION (Compressed Onboarding) ──
UPDATE public.mind_coach_pathway_phases
SET 
    phase_name = 'Discovery & Clinical Intake',
    phase_description = 'Establish therapeutic rapport while efficiently gathering context to identify the optimal clinical pathway.',
    therapist_step = 'Build trust through active listening while identifying core clinical themes.',
    dynamic_prompt = 'You are actively guiding the user through the initial Discovery journey. Build trust, gather history, and identifying core clinical themes.'
WHERE id = 'engagement_rapport_and_assessment_phase1';

-- ── 4. CLINICAL MEMORY INFRASTRUCTURE ──
DELETE FROM public.mind_coach_memories a
USING public.mind_coach_memories b
WHERE a.id < b.id AND a.profile_id = b.profile_id;

-- Ensure constraint exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_profile_memory') THEN
        ALTER TABLE public.mind_coach_memories ADD CONSTRAINT unique_profile_memory UNIQUE (profile_id);
    END IF;
END $$;

-- ── 5. THERAPIST PERSONA SEEDS ──
INSERT INTO public.mind_coach_profiles (user_id, name, therapist_persona, concerns)
VALUES ('00000000-0000-0000-0000-000000000000', 'Mind Coach System', 'sage', '[]')
ON CONFLICT DO NOTHING;
