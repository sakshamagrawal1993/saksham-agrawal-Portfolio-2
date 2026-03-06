-- Migration to create a backend table for Dynamic Content Library
-- This allows the definitions, questions, and links for assessments, games, and videos to be centrally managed.

CREATE TABLE IF NOT EXISTS public.mind_coach_dynamic_content (
    id TEXT PRIMARY KEY,
    content_type TEXT NOT NULL CHECK (content_type IN ('video', 'game', 'assessment')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.mind_coach_dynamic_content ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users (and anon for demo purposes)
CREATE POLICY "Allow public read access to dynamic content"
    ON public.mind_coach_dynamic_content
    FOR SELECT
    USING (true);

-- Function to handle updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_mind_coach_dynamic_content_updated_at
    BEFORE UPDATE ON public.mind_coach_dynamic_content
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Seed Data from the existing frontend library

-- 1. VIDEOS
INSERT INTO public.mind_coach_dynamic_content (id, content_type, title, description, payload) VALUES
('meditation_sleep', 'video', 'Deep Sleep & Relaxation Meditation', 'A guided journey to help your mind unwind for restful sleep.', 
    '{"url": "https://www.youtube.com/embed/aEqlQvczMNk", "durationMinutes": 10}'::jsonb),
('panic_grounding', 'video', 'Rapid Panic Attack Relief', 'Follow this guided breathing to lower your heart rate immediately.', 
    '{"url": "https://www.youtube.com/embed/tEmt1Znux58", "durationMinutes": 5}'::jsonb),
('somatic_tension', 'video', 'Somatic Body Release', 'Release physical tension stored in the body caused by stress.', 
    '{"url": "https://www.youtube.com/embed/1nZIGjm7m2g", "durationMinutes": 8}'::jsonb)
ON CONFLICT (id) DO UPDATE SET 
    title = EXCLUDED.title, description = EXCLUDED.description, payload = EXCLUDED.payload;

-- 2. GAMES
INSERT INTO public.mind_coach_dynamic_content (id, content_type, title, description, payload) VALUES
('box_breathing', 'game', 'Box Breathing Exercise', 'Breathe in, hold, exhale, hold. A powerful technique used by neuroscientists to calm the nervous system.', 
    '{"type": "box_breathing"}'::jsonb),
('senses_54321', 'game', '5-4-3-2-1 Grounding', 'An interactive mindfulness exercise to pull your focus out of panic and into your immediate environment.', 
    '{"type": "senses_54321"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET 
    title = EXCLUDED.title, description = EXCLUDED.description, payload = EXCLUDED.payload;

-- 3. ASSESSMENTS
INSERT INTO public.mind_coach_dynamic_content (id, content_type, title, description, payload) VALUES
('GAD-7', 'assessment', 'GAD-7 Anxiety Assessment', 'This clinical tool helps us understand the severity of your anxiety over the last 2 weeks.', 
    '{"questions": [{"id": "q1", "text": "Feeling nervous, anxious or on edge", "options": [{"label": "Not at all", "value": 0}, {"label": "Several days", "value": 1}, {"label": "More than half the days", "value": 2}, {"label": "Nearly every day", "value": 3}]}, {"id": "q2", "text": "Not being able to stop or control worrying", "options": [{"label": "Not at all", "value": 0}, {"label": "Several days", "value": 1}, {"label": "More than half the days", "value": 2}, {"label": "Nearly every day", "value": 3}]}, {"id": "q3", "text": "Worrying too much about different things", "options": [{"label": "Not at all", "value": 0}, {"label": "Several days", "value": 1}, {"label": "More than half the days", "value": 2}, {"label": "Nearly every day", "value": 3}]}, {"id": "q4", "text": "Trouble relaxing", "options": [{"label": "Not at all", "value": 0}, {"label": "Several days", "value": 1}, {"label": "More than half the days", "value": 2}, {"label": "Nearly every day", "value": 3}]}, {"id": "q5", "text": "Being so restless that it is hard to sit still", "options": [{"label": "Not at all", "value": 0}, {"label": "Several days", "value": 1}, {"label": "More than half the days", "value": 2}, {"label": "Nearly every day", "value": 3}]}, {"id": "q6", "text": "Becoming easily annoyed or irritable", "options": [{"label": "Not at all", "value": 0}, {"label": "Several days", "value": 1}, {"label": "More than half the days", "value": 2}, {"label": "Nearly every day", "value": 3}]}, {"id": "q7", "text": "Feeling afraid as if something awful might happen", "options": [{"label": "Not at all", "value": 0}, {"label": "Several days", "value": 1}, {"label": "More than half the days", "value": 2}, {"label": "Nearly every day", "value": 3}]}]}'::jsonb),
('PHQ-9', 'assessment', 'PHQ-9 Depression Screener', 'Over the last 2 weeks, how often have you been bothered by any of the following problems?', 
    '{"questions": [{"id": "q1", "text": "Little interest or pleasure in doing things", "options": [{"label": "Not at all", "value": 0}, {"label": "Several days", "value": 1}, {"label": "More than half the days", "value": 2}, {"label": "Nearly every day", "value": 3}]}, {"id": "q2", "text": "Feeling down, depressed, or hopeless", "options": [{"label": "Not at all", "value": 0}, {"label": "Several days", "value": 1}, {"label": "More than half the days", "value": 2}, {"label": "Nearly every day", "value": 3}]}, {"id": "q3", "text": "Trouble falling or staying asleep, or sleeping too much", "options": [{"label": "Not at all", "value": 0}, {"label": "Several days", "value": 1}, {"label": "More than half the days", "value": 2}, {"label": "Nearly every day", "value": 3}]}, {"id": "q4", "text": "Feeling tired or having little energy", "options": [{"label": "Not at all", "value": 0}, {"label": "Several days", "value": 1}, {"label": "More than half the days", "value": 2}, {"label": "Nearly every day", "value": 3}]}, {"id": "q5", "text": "Poor appetite or overeating", "options": [{"label": "Not at all", "value": 0}, {"label": "Several days", "value": 1}, {"label": "More than half the days", "value": 2}, {"label": "Nearly every day", "value": 3}]}, {"id": "q6", "text": "Feeling bad about yourself \u2014 or that you are a failure", "options": [{"label": "Not at all", "value": 0}, {"label": "Several days", "value": 1}, {"label": "More than half the days", "value": 2}, {"label": "Nearly every day", "value": 3}]}, {"id": "q7", "text": "Trouble concentrating on things, such as reading the newspaper or watching television", "options": [{"label": "Not at all", "value": 0}, {"label": "Several days", "value": 1}, {"label": "More than half the days", "value": 2}, {"label": "Nearly every day", "value": 3}]}, {"id": "q8", "text": "Moving or speaking so slowly that other people could have noticed? Or the opposite \u2014 being so fidgety or restless that you have been moving around a lot more than usual", "options": [{"label": "Not at all", "value": 0}, {"label": "Several days", "value": 1}, {"label": "More than half the days", "value": 2}, {"label": "Nearly every day", "value": 3}]}, {"id": "q9", "text": "Thoughts that you would be better off dead or of hurting yourself in some way", "options": [{"label": "Not at all", "value": 0}, {"label": "Several days", "value": 1}, {"label": "More than half the days", "value": 2}, {"label": "Nearly every day", "value": 3}]}]}'::jsonb),
('PSS-4', 'assessment', 'Perceived Stress Scale (PSS-4)', 'In the last month, how often have you felt the following?', 
    '{"questions": [{"id": "q1", "text": "How often have you felt that you were unable to control the important things in your life?", "options": [{"label": "Never", "value": 0}, {"label": "Almost Never", "value": 1}, {"label": "Sometimes", "value": 2}, {"label": "Fairly Often", "value": 3}, {"label": "Very Often", "value": 4}]}, {"id": "q2", "text": "How often have you felt confident about your ability to handle your personal problems?", "options": [{"label": "Never", "value": 4}, {"label": "Almost Never", "value": 3}, {"label": "Sometimes", "value": 2}, {"label": "Fairly Often", "value": 1}, {"label": "Very Often", "value": 0}]}, {"id": "q3", "text": "How often have you felt that things were going your way?", "options": [{"label": "Never", "value": 4}, {"label": "Almost Never", "value": 3}, {"label": "Sometimes", "value": 2}, {"label": "Fairly Often", "value": 1}, {"label": "Very Often", "value": 0}]}, {"id": "q4", "text": "How often have you felt difficulties were piling up so high that you could not overcome them?", "options": [{"label": "Never", "value": 0}, {"label": "Almost Never", "value": 1}, {"label": "Sometimes", "value": 2}, {"label": "Fairly Often", "value": 3}, {"label": "Very Often", "value": 4}]}]}'::jsonb)
ON CONFLICT (id) DO UPDATE SET 
    title = EXCLUDED.title, description = EXCLUDED.description, payload = EXCLUDED.payload;
