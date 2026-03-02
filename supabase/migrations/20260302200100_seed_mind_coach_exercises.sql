-- =============================================================================
-- Seed: Mind Coach Exercises and Meditations
-- =============================================================================

INSERT INTO public.mind_coach_exercises (title, type, category, duration_seconds, description, steps) VALUES

-- Breathing Exercises
('Box Breathing', 'breathing', 'calm', 240,
 'A simple 4-4-4-4 breathing technique used by Navy SEALs to calm the nervous system.',
 '[{"instruction":"Breathe in slowly through your nose","duration":4},{"instruction":"Hold your breath gently","duration":4},{"instruction":"Exhale slowly through your mouth","duration":4},{"instruction":"Hold empty","duration":4}]'::jsonb),

('4-7-8 Breathing', 'breathing', 'sleep', 300,
 'Dr. Andrew Weil''s relaxation technique that acts as a natural tranquilizer for the nervous system.',
 '[{"instruction":"Breathe in quietly through your nose","duration":4},{"instruction":"Hold your breath","duration":7},{"instruction":"Exhale completely through your mouth with a whoosh","duration":8}]'::jsonb),

('Diaphragmatic Breathing', 'breathing', 'calm', 300,
 'Deep belly breathing that activates your parasympathetic nervous system to reduce stress.',
 '[{"instruction":"Place one hand on your chest and one on your belly","duration":5},{"instruction":"Breathe in deeply through your nose, feeling your belly rise","duration":5},{"instruction":"Exhale slowly through pursed lips, feeling your belly fall","duration":6}]'::jsonb),

-- Grounding Exercises
('5-4-3-2-1 Senses', 'grounding', 'anxiety', 300,
 'A sensory grounding technique that brings you back to the present moment during anxiety or panic.',
 '[{"instruction":"Name 5 things you can SEE around you","duration":60},{"instruction":"Name 4 things you can TOUCH or feel","duration":45},{"instruction":"Name 3 things you can HEAR right now","duration":40},{"instruction":"Name 2 things you can SMELL","duration":35},{"instruction":"Name 1 thing you can TASTE","duration":30}]'::jsonb),

('Body Scan', 'grounding', 'calm', 600,
 'A progressive relaxation exercise that releases tension by scanning through each part of your body.',
 '[{"instruction":"Close your eyes and take three deep breaths","duration":30},{"instruction":"Focus on your feet — notice any tension and release it","duration":60},{"instruction":"Move attention up to your legs — let them soften","duration":60},{"instruction":"Notice your abdomen and chest — breathe into any tightness","duration":60},{"instruction":"Relax your shoulders, arms, and hands","duration":60},{"instruction":"Soften your jaw, face, and forehead","duration":60},{"instruction":"Take a moment to feel your whole body at rest","duration":30}]'::jsonb),

('Progressive Muscle Relaxation', 'grounding', 'stress', 480,
 'Systematically tense and release muscle groups to reduce physical stress and anxiety.',
 '[{"instruction":"Clench your fists tightly for 5 seconds, then release","duration":30},{"instruction":"Tense your biceps, hold, then release","duration":30},{"instruction":"Scrunch your shoulders up to your ears, hold, then drop","duration":30},{"instruction":"Furrow your brow tightly, hold, then smooth it out","duration":30},{"instruction":"Tighten your abdomen, hold, then relax","duration":30},{"instruction":"Tense your thighs, hold, then release","duration":30},{"instruction":"Point your toes hard, hold, then relax","duration":30},{"instruction":"Take three deep breaths and notice the difference","duration":30}]'::jsonb),

-- Meditations
('Calm Mind', 'meditation', 'calm', 300,
 'A 5-minute guided meditation to quiet racing thoughts and find stillness.',
 '[{"instruction":"Sit comfortably and close your eyes","duration":15},{"instruction":"Take three slow, deep breaths","duration":20},{"instruction":"Notice your thoughts without judgment — like clouds passing through the sky","duration":60},{"instruction":"Each time a thought arises, gently return your attention to your breath","duration":90},{"instruction":"Feel the stillness beneath the thoughts","duration":60},{"instruction":"Slowly open your eyes when you are ready","duration":15}]'::jsonb),

('Focus Anchor', 'meditation', 'focus', 300,
 'A 5-minute meditation to sharpen concentration and clear mental fog.',
 '[{"instruction":"Sit upright and close your eyes","duration":10},{"instruction":"Choose an anchor — your breath, a word, or a sensation","duration":15},{"instruction":"Direct all attention to your anchor","duration":90},{"instruction":"When your mind wanders, notice it and gently return","duration":90},{"instruction":"With each return, your focus muscle grows stronger","duration":60},{"instruction":"Open your eyes, carrying this focus with you","duration":15}]'::jsonb),

('Sleep Wind-Down', 'meditation', 'sleep', 600,
 'A 10-minute meditation designed to prepare your mind and body for restful sleep.',
 '[{"instruction":"Lie down comfortably and close your eyes","duration":15},{"instruction":"Take five slow, deep breaths — each exhale twice as long as the inhale","duration":45},{"instruction":"Imagine a warm, gentle wave of relaxation starting at the top of your head","duration":60},{"instruction":"Let the wave slowly wash down through your face, neck, and shoulders","duration":60},{"instruction":"Feel it flow through your arms, chest, and abdomen","duration":60},{"instruction":"The wave continues down through your hips, legs, and feet","duration":60},{"instruction":"Your body is heavy and warm — let the bed hold your full weight","duration":60},{"instruction":"With each breath, sink deeper into rest","duration":120}]'::jsonb),

('Gratitude Reflection', 'meditation', 'gratitude', 300,
 'A 5-minute practice to cultivate gratitude and shift perspective.',
 '[{"instruction":"Close your eyes and take three centering breaths","duration":20},{"instruction":"Bring to mind one person you are grateful for — picture their face","duration":60},{"instruction":"Think of one experience today that brought you a moment of peace","duration":60},{"instruction":"Notice one thing about yourself you can appreciate right now","duration":60},{"instruction":"Hold all three in your awareness — person, experience, self","duration":60},{"instruction":"Carry this warmth with you as you open your eyes","duration":20}]'::jsonb);
