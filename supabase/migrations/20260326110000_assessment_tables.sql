-- =============================================================================
-- Migration: Assessment tables — questions library + user scores
-- =============================================================================

-- 1. Assessment Questions (library of standardised instruments)
CREATE TABLE IF NOT EXISTS public.mind_coach_assessment_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_type TEXT NOT NULL,          -- 'gad7', 'phq9', 'pss4'
    assessment_name TEXT NOT NULL,          -- 'GAD-7', 'PHQ-9', 'PSS-4'
    question_number INT NOT NULL,
    question_text TEXT NOT NULL,
    answer_options JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{value:0,label:"Not at all"}, …]
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(assessment_type, question_number)
);

ALTER TABLE public.mind_coach_assessment_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read assessment questions"
    ON public.mind_coach_assessment_questions FOR SELECT USING (true);

-- 2. Assessment Scores (per-user, per-attempt)
CREATE TABLE IF NOT EXISTS public.mind_coach_assessment_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.mind_coach_profiles(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.mind_coach_sessions(id) ON DELETE SET NULL,
    assessment_type TEXT NOT NULL,
    answers JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{question_number:1, value:2}, …]
    total_score INT NOT NULL,
    severity TEXT,                                   -- 'minimal','mild','moderate','severe'
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_assessment_scores_profile ON public.mind_coach_assessment_scores(profile_id);
CREATE INDEX idx_assessment_scores_type ON public.mind_coach_assessment_scores(assessment_type);

ALTER TABLE public.mind_coach_assessment_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own assessment scores"
    ON public.mind_coach_assessment_scores FOR SELECT USING (true);
CREATE POLICY "Users can insert own assessment scores"
    ON public.mind_coach_assessment_scores FOR INSERT WITH CHECK (true);

-- =============================================================================
-- Seed: GAD-7 (Generalized Anxiety Disorder — 7 items)
-- =============================================================================
INSERT INTO public.mind_coach_assessment_questions (assessment_type, assessment_name, question_number, question_text, answer_options) VALUES
('gad7', 'GAD-7', 1, 'Feeling nervous, anxious, or on edge',
  '[{"value":0,"label":"Not at all"},{"value":1,"label":"Several days"},{"value":2,"label":"More than half the days"},{"value":3,"label":"Nearly every day"}]'),
('gad7', 'GAD-7', 2, 'Not being able to stop or control worrying',
  '[{"value":0,"label":"Not at all"},{"value":1,"label":"Several days"},{"value":2,"label":"More than half the days"},{"value":3,"label":"Nearly every day"}]'),
('gad7', 'GAD-7', 3, 'Worrying too much about different things',
  '[{"value":0,"label":"Not at all"},{"value":1,"label":"Several days"},{"value":2,"label":"More than half the days"},{"value":3,"label":"Nearly every day"}]'),
('gad7', 'GAD-7', 4, 'Trouble relaxing',
  '[{"value":0,"label":"Not at all"},{"value":1,"label":"Several days"},{"value":2,"label":"More than half the days"},{"value":3,"label":"Nearly every day"}]'),
('gad7', 'GAD-7', 5, 'Being so restless that it''s hard to sit still',
  '[{"value":0,"label":"Not at all"},{"value":1,"label":"Several days"},{"value":2,"label":"More than half the days"},{"value":3,"label":"Nearly every day"}]'),
('gad7', 'GAD-7', 6, 'Becoming easily annoyed or irritable',
  '[{"value":0,"label":"Not at all"},{"value":1,"label":"Several days"},{"value":2,"label":"More than half the days"},{"value":3,"label":"Nearly every day"}]'),
('gad7', 'GAD-7', 7, 'Feeling afraid, as if something awful might happen',
  '[{"value":0,"label":"Not at all"},{"value":1,"label":"Several days"},{"value":2,"label":"More than half the days"},{"value":3,"label":"Nearly every day"}]'),

-- =============================================================================
-- Seed: PHQ-9 (Patient Health Questionnaire — 9 items)
-- =============================================================================
('phq9', 'PHQ-9', 1, 'Little interest or pleasure in doing things',
  '[{"value":0,"label":"Not at all"},{"value":1,"label":"Several days"},{"value":2,"label":"More than half the days"},{"value":3,"label":"Nearly every day"}]'),
('phq9', 'PHQ-9', 2, 'Feeling down, depressed, or hopeless',
  '[{"value":0,"label":"Not at all"},{"value":1,"label":"Several days"},{"value":2,"label":"More than half the days"},{"value":3,"label":"Nearly every day"}]'),
('phq9', 'PHQ-9', 3, 'Trouble falling or staying asleep, or sleeping too much',
  '[{"value":0,"label":"Not at all"},{"value":1,"label":"Several days"},{"value":2,"label":"More than half the days"},{"value":3,"label":"Nearly every day"}]'),
('phq9', 'PHQ-9', 4, 'Feeling tired or having little energy',
  '[{"value":0,"label":"Not at all"},{"value":1,"label":"Several days"},{"value":2,"label":"More than half the days"},{"value":3,"label":"Nearly every day"}]'),
('phq9', 'PHQ-9', 5, 'Poor appetite or overeating',
  '[{"value":0,"label":"Not at all"},{"value":1,"label":"Several days"},{"value":2,"label":"More than half the days"},{"value":3,"label":"Nearly every day"}]'),
('phq9', 'PHQ-9', 6, 'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
  '[{"value":0,"label":"Not at all"},{"value":1,"label":"Several days"},{"value":2,"label":"More than half the days"},{"value":3,"label":"Nearly every day"}]'),
('phq9', 'PHQ-9', 7, 'Trouble concentrating on things, such as reading the newspaper or watching television',
  '[{"value":0,"label":"Not at all"},{"value":1,"label":"Several days"},{"value":2,"label":"More than half the days"},{"value":3,"label":"Nearly every day"}]'),
('phq9', 'PHQ-9', 8, 'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual',
  '[{"value":0,"label":"Not at all"},{"value":1,"label":"Several days"},{"value":2,"label":"More than half the days"},{"value":3,"label":"Nearly every day"}]'),
('phq9', 'PHQ-9', 9, 'Thoughts that you would be better off dead, or thoughts of hurting yourself in some way',
  '[{"value":0,"label":"Not at all"},{"value":1,"label":"Several days"},{"value":2,"label":"More than half the days"},{"value":3,"label":"Nearly every day"}]'),

-- =============================================================================
-- Seed: PSS-4 (Perceived Stress Scale — 4 items)
-- =============================================================================
('pss4', 'PSS-4', 1, 'In the last month, how often have you felt that you were unable to control the important things in your life?',
  '[{"value":0,"label":"Never"},{"value":1,"label":"Almost never"},{"value":2,"label":"Sometimes"},{"value":3,"label":"Fairly often"},{"value":4,"label":"Very often"}]'),
('pss4', 'PSS-4', 2, 'In the last month, how often have you felt confident about your ability to handle your personal problems?',
  '[{"value":0,"label":"Never"},{"value":1,"label":"Almost never"},{"value":2,"label":"Sometimes"},{"value":3,"label":"Fairly often"},{"value":4,"label":"Very often"}]'),
('pss4', 'PSS-4', 3, 'In the last month, how often have you felt that things were going your way?',
  '[{"value":0,"label":"Never"},{"value":1,"label":"Almost never"},{"value":2,"label":"Sometimes"},{"value":3,"label":"Fairly often"},{"value":4,"label":"Very often"}]'),
('pss4', 'PSS-4', 4, 'In the last month, how often have you felt difficulties were piling up so high that you could not overcome them?',
  '[{"value":0,"label":"Never"},{"value":1,"label":"Almost never"},{"value":2,"label":"Sometimes"},{"value":3,"label":"Fairly often"},{"value":4,"label":"Very often"}]')

ON CONFLICT (assessment_type, question_number) DO NOTHING;
