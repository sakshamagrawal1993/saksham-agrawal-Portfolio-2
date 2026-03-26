-- ─────────────────────────────────────────────────────────────────────────────
-- mind_coach_task_library
-- A curated catalog of therapeutic tasks, organized by pathway and phase.
-- These are reference templates the LLM can use as anchor points.
-- Tasks are still dynamically personalised at session-end via the N8N workflow.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mind_coach_task_library (
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

-- Index for fast lookup by pathway + phase
CREATE INDEX IF NOT EXISTS idx_task_library_pathway_phase
  ON mind_coach_task_library (pathway, phase);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED DATA
-- Phase goals per pathway follow the 4-phase structure:
--   Phase 1: Safety & Rapport         — validate, explore, establish trust
--   Phase 2: Pattern Recognition      — identify triggers, thought patterns
--   Phase 3: Skill Building           — active coping tools, experiments
--   Phase 4: Consolidation            — integrate, relapse prevention, future-plan
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO mind_coach_task_library
  (pathway, phase, task_type, title, description, frequency, suggested_duration_days, phase_goal)
VALUES

-- ── ANXIETY & STRESS MANAGEMENT ──────────────────────────────────────────────
('anxiety_and_stress_management', 1, 'journaling',
 'Stress Snapshot Journal',
 'Each evening, write 3 sentences: (1) What felt stressful today, (2) How your body responded, (3) One kind thing you did for yourself. This is observation only — no fixing required.',
 'daily', 7, 'Validate your experience and begin mapping stress patterns'),

('anxiety_and_stress_management', 1, 'somatic_exercise',
 'Box Breathing Check-in',
 'Twice a day (morning and after work), practice 4 rounds of box breathing: inhale 4 counts, hold 4, exhale 4, hold 4. Notice how your body feels before vs after.',
 'daily', 7, 'Validate your experience and begin mapping stress patterns'),

('anxiety_and_stress_management', 2, 'journaling',
 'Trigger Tracking Log',
 'Keep a small log this week. Each time anxiety spikes, note: (1) The situation, (2) The thought that appeared, (3) Your body''s reaction. No analysis needed — just noticing.',
 'daily', 7, 'Identify the specific triggers and thought patterns fuelling anxiety'),

('anxiety_and_stress_management', 2, 'cognitive_reframing',
 'Worry Sorting Exercise',
 'At the end of each day, list your top 3 worries. For each, ask: "Is this within my control right now?" Sort them into: In My Control / Not In My Control. Practice letting go of the second column.',
 'daily', 7, 'Identify the specific triggers and thought patterns fuelling anxiety'),

('anxiety_and_stress_management', 3, 'somatic_exercise',
 'Grounding Body Scan',
 'Once per day, do a 5-minute body scan. Start at your feet. Name 5 things you physically feel. This anchors you in the present when anxious thoughts pull you to the future.',
 'daily', 14, 'Build reliable calming tools to interrupt the anxiety cycle'),

('anxiety_and_stress_management', 3, 'behavioral_exposure',
 'Small Brave Step',
 'Identify one low-stakes situation you''ve been avoiding due to anxiety. This week, do it once — even partly. Notice what actually happened vs what you feared.',
 'once', 7, 'Build reliable calming tools to interrupt the anxiety cycle'),

('anxiety_and_stress_management', 4, 'journaling',
 'Progress Letter to Yourself',
 'Write a letter from your future self (3 months from now) to your current self. What would you want to remind yourself of? What tools have been most helpful?',
 'once', 1, 'Integrate learnings and build a personal relapse-prevention plan'),

-- ── DEPRESSION & BEHAVIORAL ACTIVATION ───────────────────────────────────────
('depression_and_behavioral_activation', 1, 'journaling',
 'One Small Moment Journal',
 'Each night, write one sentence: "Today, one moment that was slightly better than the rest was ___." It doesn''t have to be good — just slightly less heavy.',
 'daily', 7, 'Validate your experience and gently re-engage with daily life'),

('depression_and_behavioral_activation', 1, 'somatic_exercise',
 'Gentle Morning Movement',
 'Each morning, spend 5 minutes moving your body in any way that''s comfortable — stretching, a short walk, or simply standing by a window. Movement is medicine.',
 'daily', 7, 'Validate your experience and gently re-engage with daily life'),

('depression_and_behavioral_activation', 2, 'journaling',
 'Activity & Mood Tracker',
 'For 7 days, note 3 activities per day and rate your mood before and after each (1–10). Look for which activities shift your mood, even slightly.',
 'daily', 7, 'Identify which activities drain vs restore energy'),

('depression_and_behavioral_activation', 3, 'behavioral_exposure',
 'Activation Experiment',
 'Choose one activity from your list that previously gave you joy (even if it feels hollow now). Schedule it for this week and do it anyway. After, rate your mood. You are testing, not expecting.',
 'once', 7, 'Reintroduce pleasurable and meaningful activities'),

('depression_and_behavioral_activation', 3, 'cognitive_reframing',
 'Counter the Inner Critic',
 'When you notice a harsh self-critical thought this week, write it down. Then write a response as if you were talking to a close friend who said the same thing to themselves.',
 'situational', 7, 'Reintroduce pleasurable and meaningful activities'),

('depression_and_behavioral_activation', 4, 'journaling',
 'Strengths Evidence Log',
 'Each day this week, write one piece of evidence that you handled something — however small. By the end of the week, read back what you''ve collected.',
 'daily', 7, 'Build sustainable habits and a roadmap for continuing recovery'),

-- ── SLEEP & INSOMNIA ─────────────────────────────────────────────────────────
('sleep_and_insomnia', 1, 'journaling',
 'Sleep Diary',
 'Each morning, log: bedtime, wake time, number of awakenings, and mood on waking (1–5). This data will help us identify your sleep pattern.',
 'daily', 7, 'Understand your current sleep patterns and what''s disrupting them'),

('sleep_and_insomnia', 2, 'somatic_exercise',
 'Wind-Down Ritual',
 'Create a consistent 20-minute wind-down routine starting 30 minutes before bed: dim lights, stop screens, choose one calming activity (reading, gentle stretching, or breathing). Repeat nightly.',
 'daily', 14, 'Identify hyperarousal triggers and begin sleep hygiene changes'),

('sleep_and_insomnia', 3, 'behavioral_exposure',
 'Stimulus Control Practice',
 'This week: only use your bed for sleep (no phone, TV, or work). If you can''t sleep after 20 minutes, get up and do something calm in another room until drowsy. Return only when sleepy.',
 'daily', 14, 'Rebuild the mental association between bed and sleep'),

('sleep_and_insomnia', 3, 'cognitive_reframing',
 'Clock-Watching Reframe',
 'When you catch yourself checking the time during the night, say: "One bad night does not define my sleep. My body knows how to sleep." Then turn the clock away.',
 'situational', 7, 'Rebuild the mental association between bed and sleep'),

('sleep_and_insomnia', 4, 'journaling',
 'Sleep Success Reflection',
 'At the end of this week, compare your first sleep diary to this week''s. What changed? Write a short paragraph about what worked and what you''ll keep doing.',
 'once', 1, 'Consolidate gains and build a sustainable long-term sleep plan'),

-- ── OVERTHINKING & COGNITIVE RESTRUCTURING ───────────────────────────────────
('overthinking_rumination_and_cognitive_restructuring', 1, 'journaling',
 'Thought Dump Journal',
 'Set a 10-minute timer. Write every thought circling your mind without editing or filtering. When the timer ends, close the journal. You have contained the thoughts — they don''t need to stay in your head.',
 'daily', 7, 'Externalise thoughts and reduce mental noise'),

('overthinking_rumination_and_cognitive_restructuring', 2, 'cognitive_reframing',
 'Thought Record',
 'When you notice a spiral, write: (1) The triggering situation, (2) The automatic thought, (3) Emotions and intensity (%), (4) Evidence FOR the thought, (5) Evidence AGAINST. What''s a more balanced view?',
 'situational', 7, 'Identify cognitive distortions and test their accuracy'),

('overthinking_rumination_and_cognitive_restructuring', 3, 'somatic_exercise',
 'Scheduled Worry Time',
 'Choose a 15-minute "worry slot" each day (not near bedtime). When you notice yourself ruminating outside this window, say: "I''ll think about this at 5pm." When your slot arrives, worry deliberately, then stop.',
 'daily', 14, 'Interrupt rumination loops with active intervention'),

('overthinking_rumination_and_cognitive_restructuring', 4, 'journaling',
 'What-If Reversal',
 'Take your most common "what if" worry this week. Write it out. Then write: "What if the opposite were true?" — and find 3 pieces of real evidence that support the better outcome.',
 'once', 1, 'Build cognitive flexibility and confidence in your own thinking'),

-- ── TRAUMA & PTSD ─────────────────────────────────────────────────────────────
('trauma_processing_and_ptsd', 1, 'somatic_exercise',
 'Safe Place Grounding',
 'Visualise a place (real or imagined) where you feel completely safe. Describe it in detail using all 5 senses. Practice visiting this place mentally for 5 minutes daily — especially after difficult moments.',
 'daily', 7, 'Build safety, stabilisation, and a foundation for processing'),

('trauma_processing_and_ptsd', 1, 'journaling',
 'Window of Tolerance Log',
 'Notice when you feel activated (too much — heart racing, flooded) vs shut down (too little — numb, disconnected). Log when this happens and what helped bring you back to the middle.',
 'situational', 7, 'Build safety, stabilisation, and a foundation for processing'),

('trauma_processing_and_ptsd', 2, 'somatic_exercise',
 'Grounding After Triggers',
 'When a trigger activates you: plant both feet on the floor, press your back into your chair, and name 5 things you can see around you. Stay with this until your heart rate settles.',
 'situational', 14, 'Develop tools to manage trauma responses as they occur'),

('trauma_processing_and_ptsd', 3, 'somatic_exercise',
 'Pendulation Practice',
 'Spend 2 minutes focusing on a difficult feeling from the past. Then 2 minutes on a resource — something that feels stable or safe. Alternate 3–4 times. This builds resilience for processing.',
 'daily', 14, 'Begin titrated processing with safety and regulation throughout'),

('trauma_processing_and_ptsd', 4, 'journaling',
 'Narrative Reclaiming',
 'Write a paragraph about who you are today that includes your survival and strength. Not about the trauma — about the person who made it through. Read it aloud to yourself.',
 'once', 1, 'Integrate the trauma narrative into a story of survival and growth'),

-- ── GRIEF & LOSS ─────────────────────────────────────────────────────────────
('grief_and_loss_processing', 1, 'journaling',
 'Memory Preservation Journal',
 'Choose one memory of what or who you lost. Write it in as much detail as you can — the sights, smells, and feelings. This is not about sadness; it''s about honouring what was real.',
 'once', 3, 'Validate grief and begin gentle memorialisation'),

('grief_and_loss_processing', 2, 'journaling',
 'Letter to Your Loss',
 'Write a letter to who or what you lost. Say the things you didn''t get to say. There are no rules — it can be loving, angry, confused, or all of the above.',
 'once', 1, 'Process the unspoken emotions surrounding the loss'),

('grief_and_loss_processing', 3, 'behavioral_exposure',
 'One Continuing Bond Ritual',
 'Choose one small ritual that connects you to the one you lost — lighting a candle on a specific day, visiting a place you shared, or cooking something they loved. Do it once this week.',
 'once', 7, 'Begin rebuilding meaning and continuing bonds'),

('grief_and_loss_processing', 4, 'journaling',
 'Life After Loss Reflection',
 'Write about who you are now that includes this loss as part of your story. What do you carry forward? What have you learned about yourself in the grief?',
 'once', 1, 'Integrate the loss into a continuing life narrative'),

-- ── SELF-WORTH & SELF-ESTEEM ──────────────────────────────────────────────────
('self_worth_and_self_esteem', 1, 'journaling',
 'Evidence Collector',
 'Each day, write 1–2 pieces of evidence that you have value — things you did, said, or thought that a person of worth would do. No filters. Even small things count.',
 'daily', 7, 'Begin building an evidence base for your worth'),

('self_worth_and_self_esteem', 2, 'cognitive_reframing',
 'Core Belief Questioning',
 'When you hear yourself say "I am ___" (a negative belief), write it down. Then list 5 pieces of real-world evidence that complicate or contradict that belief.',
 'situational', 7, 'Identify and test the core beliefs driving low self-worth'),

('self_worth_and_self_esteem', 3, 'behavioral_exposure',
 'Act As If Experiment',
 'Choose one thing a person with healthy self-worth would do that you tend to avoid. Do it once this week — speak up in a meeting, set a boundary, compliment yourself out loud.',
 'once', 7, 'Build new self-concept experiences through action'),

('self_worth_and_self_esteem', 4, 'journaling',
 'Self-Worth Affirmation Letter',
 'Write a letter to your past self (from 1 year ago) telling them what you now know about your value. Be specific. Date it and save it.',
 'once', 1, 'Consolidate a stable, internalized sense of self-worth'),

-- ── RELATIONSHIP CONFLICT ─────────────────────────────────────────────────────
('relationship_conflict_and_interpersonal', 1, 'journaling',
 'Relationship Mapping Journal',
 'Draw or list the 3–5 most important relationships in your life. For each, write: what''s working, what''s painful, and what you wish were different.',
 'once', 1, 'Map the relational landscape and validate your experience'),

('relationship_conflict_and_interpersonal', 2, 'journaling',
 'Communication Pattern Log',
 'This week, after a difficult interaction, write: (1) What was said, (2) What you felt, (3) What you actually said/did, (4) What you wished you''d said. Notice the gap.',
 'situational', 7, 'Identify dysfunctional communication patterns'),

('relationship_conflict_and_interpersonal', 3, 'situational_prep',
 'Difficult Conversation Prep',
 'Identify one conversation you''ve been avoiding. Write out: (1) Your core need, (2) What you want to say, (3) How you''ll say it using "I feel..." language, (4) The response you fear, and how you''ll handle it.',
 'once', 3, 'Build assertive communication skills'),

('relationship_conflict_and_interpersonal', 4, 'journaling',
 'Relationship Vision',
 'Write a paragraph describing what a healthy version of your most important relationship looks like. What would be different? What''s your role in creating that?',
 'once', 1, 'Consolidate communication gains and vision for future relationships'),

-- ── SOCIAL ANXIETY ─────────────────────────────────────────────────────────────
('social_anxiety_and_isolation', 1, 'journaling',
 'Social Situations Inventory',
 'List 10 social situations from least anxiety-provoking (1) to most (10). We''ll use this as your roadmap. For now, just notice which situations trigger the strongest response.',
 'once', 1, 'Build awareness of the social anxiety hierarchy'),

('social_anxiety_and_isolation', 2, 'cognitive_reframing',
 'Social Prediction Test',
 'Before an upcoming social situation, write your fear prediction ("They will think I''m ___"). Afterward, write what actually happened. Over time, see how accurate your predictions are.',
 'situational', 7, 'Test the accuracy of social threat predictions'),

('social_anxiety_and_isolation', 3, 'behavioral_exposure',
 'Exposure Ladder Step',
 'Choose a situation from the lower half of your anxiety ladder. This week, do it once on purpose. Prepare by remembering: discomfort is not danger. You will survive this.',
 'once', 7, 'Build tolerance through graduated social exposure'),

('social_anxiety_and_isolation', 4, 'journaling',
 'Connection Reflection',
 'After any social interaction this week (however small), write: one thing that went fine, and one way you were kind to someone. Build evidence that connection is possible.',
 'situational', 7, 'Consolidate confidence and reduce post-event processing'),

-- ── EMOTION REGULATION ───────────────────────────────────────────────────────
('emotion_regulation_and_distress_tolerance', 1, 'journaling',
 'Emotion Check-In Log',
 'Three times a day (morning, afternoon, evening), pause and name your current emotion. Rate its intensity (0–10) and note what triggered it. No judgment — just data.',
 'daily', 7, 'Build emotional awareness and vocabulary'),

('emotion_regulation_and_distress_tolerance', 2, 'somatic_exercise',
 'TIPP Skill Practice',
 'When emotions spike, try: Temperature (cold water on face), Intense exercise (60 seconds jumping jacks), Paced breathing (exhale longer than inhale), Paired muscle relaxation. Practice one per day this week.',
 'daily', 7, 'Learn crisis-level distress tolerance tools'),

('emotion_regulation_and_distress_tolerance', 3, 'cognitive_reframing',
 'Opposite Action Experiment',
 'Identify an emotion you acted on last week that made things worse. This week, when it arises, deliberately do the OPPOSITE action. Note what changes.',
 'situational', 7, 'Practice changing emotional responses through opposite action'),

('emotion_regulation_and_distress_tolerance', 4, 'journaling',
 'Emotional Regulation Map',
 'Draw or write your personalised regulation toolkit: (1) What situations tend to dysregulate me, (2) My top 3 calming tools, (3) Who I can reach out to. Keep this accessible.',
 'once', 1, 'Build a personal, sustainable emotion regulation plan'),

-- ── ANGER MANAGEMENT ─────────────────────────────────────────────────────────
('anger_management', 1, 'journaling',
 'Anger History Reflection',
 'Write about your earliest memory of anger in your family. Not to blame anyone — just to understand where your patterns with anger come from.',
 'once', 1, 'Understand the roots of your anger patterns'),

('anger_management', 2, 'journaling',
 'Anger Trigger Log',
 'This week, each time anger rises, log: The trigger, your body''s first signal (jaw tight? heat rising?), and what happened next. We''re looking for your early warning signs.',
 'situational', 7, 'Identify anger triggers and early physical signals'),

('anger_management', 3, 'somatic_exercise',
 'Cool-Down Protocol',
 'Develop your personal cool-down: (1) Leave the space if possible, (2) 5 box breaths, (3) 5-minute walk, (4) Return when heart rate is down. Practise the steps when calm so they''re automatic when hot.',
 'situational', 14, 'Build an interrupt sequence for the anger escalation cycle'),

('anger_management', 4, 'situational_prep',
 'Repair Attempt Preparation',
 'Think of a relationship where anger has caused distance. Write out a repair statement: acknowledge the impact, take responsibility for your behaviour (not your feeling), and express what you want going forward.',
 'once', 3, 'Repair relational damage and model healthy anger expression'),

-- ── BOUNDARY SETTING ─────────────────────────────────────────────────────────
('boundary_setting_and_assertiveness', 1, 'journaling',
 'Boundary Inventory',
 'Write the 3 situations where you most often say yes when you mean no. For each, what do you fear would happen if you said no?',
 'once', 1, 'Map where boundaries are needed and what blocks them'),

('boundary_setting_and_assertiveness', 2, 'cognitive_reframing',
 'No Permission Slip',
 'Write yourself a permission slip to say no. Complete this: "I give myself permission to say no to ___ without feeling guilty because ___." Read it before the situation you identified.',
 'once', 1, 'Challenge the beliefs that make boundaries feel wrong'),

('boundary_setting_and_assertiveness', 3, 'behavioral_exposure',
 'One Small No',
 'This week, say no to one low-stakes request. Notice what happens inside you. Notice what actually happens around you. Collect this data.',
 'once', 7, 'Practice boundary-setting in a graduated, manageable way'),

('boundary_setting_and_assertiveness', 4, 'situational_prep',
 'Boundary Script Writing',
 'For the hardest boundary you need to set: write 3 ways to say it — firmly, warmly, and briefly. Practise saying them out loud. Choose the version that feels most authentic to you.',
 'once', 3, 'Consolidate assertiveness and prepare for difficult boundary conversations'),

-- ── LIFE TRANSITIONS ─────────────────────────────────────────────────────────
('life_transition_and_adjustment', 1, 'journaling',
 'Transition Story',
 'Write the story of this transition from a bird''s eye view — before, during, and where you are now. What has this asked of you?',
 'once', 1, 'Process the meaning and challenge of the transition'),

('life_transition_and_adjustment', 2, 'journaling',
 'Loss & Gain List',
 'Every major change involves losses and gains. List what you have lost through this transition, and separately, what you have gained or might gain. Both truths can coexist.',
 'once', 1, 'Process ambivalence and multiple emotions about the change'),

('life_transition_and_adjustment', 3, 'behavioral_exposure',
 'One New Experiment',
 'Identify one small action that belongs to the person you''re becoming (not who you were before). Do it once this week, just as an experiment.',
 'once', 7, 'Begin actively building the new chapter'),

('life_transition_and_adjustment', 4, 'journaling',
 'Future Self Letter',
 'Write a letter from 1 year in the future. You have settled into this new chapter. What does that life look like? What advice does that future-you have for now?',
 'once', 1, 'Anchor into a hopeful, constructive future identity');
