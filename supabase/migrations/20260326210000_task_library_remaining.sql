-- ─────────────────────────────────────────────────────────────────────────────
-- Seed remaining 7 pathways for mind_coach_task_library
-- (completes all 20 pathways × 4 phases)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO mind_coach_task_library
  (pathway, phase, task_type, title, description, frequency, suggested_duration_days, phase_goal)
VALUES

-- ── FAMILY CONFLICT & DYNAMICS ───────────────────────────────────────────────
('family_conflict_and_dynamics', 1, 'journaling',
 'Family System Sketch',
 'Draw or describe your family in a few sentences — who''s in it, what the dynamic feels like, and where you fit. This isn''t about blame; it''s about seeing the system you grew up in.',
 'once', 1, 'Build a safe, honest map of the family system without judgment'),

('family_conflict_and_dynamics', 2, 'journaling',
 'Conflict Pattern Log',
 'This week, each time tension arises with a family member, note: (1) Who triggered it, (2) What was said, (3) What you felt, (4) How it usually ends. Look for recurring loops.',
 'situational', 7, 'Identify recurring conflict patterns and each person''s role in them'),

('family_conflict_and_dynamics', 3, 'situational_prep',
 'Conversation Architecture',
 'Choose one difficult family conversation you''ve been avoiding. Write out: your core message, how to start without blame ("When X happens, I feel Y"), the response you fear, and how you''ll manage it.',
 'once', 3, 'Build skills for de-escalation and assertive communication within family'),

('family_conflict_and_dynamics', 4, 'journaling',
 'What Healthy Looks Like',
 'Write a paragraph describing what a healthier version of this family relationship could feel like — not perfect, just better. What''s your role in nudging it in that direction?',
 'once', 1, 'Consolidate gains and create a personal vision for the relationship''s future'),

-- ── CRISIS INTERVENTION & SUICIDE PREVENTION ─────────────────────────────────
('crisis_intervention_and_suicide_prevention', 1, 'somatic_exercise',
 'Safe Place Grounding',
 'Visualise a place — real or imagined — where you feel completely safe. Describe it in detail: what you see, hear, smell, and feel. Practise visiting it for 5 minutes whenever you feel overwhelmed.',
 'daily', 7, 'Establish immediate safety, stabilisation, and a trusted therapeutic relationship'),

('crisis_intervention_and_suicide_prevention', 2, 'journaling',
 'Warning Sign Map',
 'Together we''ll identify your personal early warning signs that distress is escalating. Write: physical signs (tightness, heaviness), thought signs ("everything is pointless"), behavioural signs (withdrawing). This is your map.',
 'once', 1, 'Identify personal warning signs and create a basic safety awareness'),

('crisis_intervention_and_suicide_prevention', 3, 'situational_prep',
 'Safety Plan Card',
 'Write a brief personal safety plan on a card or note: (1) My warning signs, (2) Things I can do alone to cope, (3) People I can call, (4) Crisis line (iCall: 9152987821), (5) Places to go if unsafe. Keep it accessible.',
 'once', 1, 'Build a concrete, personalised safety plan for high-risk moments'),

('crisis_intervention_and_suicide_prevention', 4, 'journaling',
 'Reasons for Living List',
 'Write a list of your reasons for living — people, pets, future hopes, small pleasures, unfinished things. Add to it whenever something new comes to mind. Read it on hard days.',
 'once', 1, 'Strengthen future orientation and the internal case for continuing'),

-- ── PANIC & PHYSICAL ANXIETY SYMPTOMS ───────────────────────────────────────
('panic_and_physical_anxiety_symptoms', 1, 'journaling',
 'Panic Episode Log',
 'After a panic episode, when you feel calm, write: when it started, the first physical sensation, what you thought it meant, and how long it lasted. We''re building a map of your panic cycle.',
 'situational', 7, 'Understand the individual panic cycle — triggers, physiology, and catastrophic thoughts'),

('panic_and_physical_anxiety_symptoms', 2, 'cognitive_reframing',
 'Catastrophe vs Reality Check',
 'Write down the scariest thought you have during a panic attack (e.g., "I''m dying"). Then answer: Has this thought come true before? What actually happened? What is the most likely explanation for these sensations?',
 'situational', 7, 'Test the accuracy of catastrophic interpretations during panic'),

('panic_and_physical_anxiety_symptoms', 3, 'somatic_exercise',
 'Interoceptive Exposure Practice',
 'Deliberately recreate a mild version of your panic symptoms (e.g., spin in a chair, breathe fast for 30 seconds) in a safe setting. Practice tolerating the sensation without escaping. This desensitises the alarm system.',
 'daily', 14, 'Build tolerance to feared physical sensations through graduated exposure'),

('panic_and_physical_anxiety_symptoms', 4, 'journaling',
 'Panic Freedom Reflection',
 'Write about a recent situation where you faced a panic trigger and it went better than expected. What did you do differently? What does this tell you about your capacity to handle panic?',
 'once', 1, 'Consolidate confidence and reduce panic-anticipatory anxiety'),

-- ── ABUSE & SAFETY ───────────────────────────────────────────────────────────
('abuse_and_safety', 1, 'somatic_exercise',
 'Body Safety Check',
 'Once a day, pause and notice your body. Ask: Do I feel safe right now? Where in my body do I sense that? This builds a conscious link between physical sensations and safety awareness.',
 'daily', 7, 'Establish immediate emotional safety and validate the survivor''s experience'),

('abuse_and_safety', 2, 'journaling',
 'What I Know Now',
 'Write: three things you now know that you didn''t know when the abuse was happening — about yourself, about the situation, about what you deserved. This is not about blame — it''s about clarity.',
 'once', 1, 'Help the client separate their identity from the abuser''s narrative'),

('abuse_and_safety', 3, 'situational_prep',
 'Safety Planning for Ongoing Risk',
 'If there is any ongoing contact or risk: identify (1) Two people you can call if you feel unsafe, (2) A place you can go, (3) Items to take if you need to leave quickly, (4) Emergency numbers. Keep this private.',
 'once', 1, 'Build a concrete, rehearsed safety plan for ongoing or relapse risk'),

('abuse_and_safety', 4, 'journaling',
 'Survivor Identity Letter',
 'Write a letter from your future self to your current self — from someone who has moved beyond this chapter. What do they want you to know? What strength do they see in you that you can''t yet see?',
 'once', 1, 'Integrate a survivor identity and begin building a self-defined future narrative'),

-- ── HEALTH ANXIETY & SOMATIC SYMPTOMS ───────────────────────────────────────
('health_anxiety_and_somatic_symptoms', 1, 'journaling',
 'Health Worry Journal',
 'Each time a health worry arises, write: (1) The symptom or fear, (2) The catastrophic interpretation ("It must be serious"), (3) What you did (Googled, checked, called doctor). Just observe the cycle.',
 'situational', 7, 'Map the health anxiety cycle — triggers, interpretations, and safety behaviours'),

('health_anxiety_and_somatic_symptoms', 2, 'cognitive_reframing',
 'Alternative Explanation Search',
 'When a symptom triggers anxiety, write 5 alternative, benign explanations for it (stress, tiredness, poor sleep, dehydration, muscle tension). The catastrophic explanation goes last — and is usually the least likely.',
 'situational', 7, 'Challenge the automatic catastrophic medical interpretation of benign symptoms'),

('health_anxiety_and_somatic_symptoms', 3, 'behavioral_exposure',
 'Reassurance Resistance',
 'Identify one reassurance-seeking behaviour you use (Googling symptoms, checking pulse repeatedly, calling doctor). This week, delay it by 1 hour each time it arises. Notice: does the anxiety pass on its own?',
 'daily', 14, 'Reduce safety behaviours that maintain health anxiety'),

('health_anxiety_and_somatic_symptoms', 4, 'journaling',
 'Body Trust Rebuilding',
 'Write 5 ways your body has shown resilience or functioned well this month. This practice builds a more balanced, trusting relationship with your own physiology.',
 'once', 1, 'Consolidate a more trusting, less vigilant relationship with the body'),

-- ── IDENTITY & SELF-CONCEPT ──────────────────────────────────────────────────
('identity_and_self_concept', 1, 'journaling',
 'Identity Inventory',
 'List 10 words or phrases that describe who you are — across different roles (parent, friend, professional, individual). Which feel true? Which feel imposed? Which feel uncertain right now?',
 'once', 1, 'Explore the current identity landscape without judgment or pressure to resolve it'),

('identity_and_self_concept', 2, 'journaling',
 'Values Excavation',
 'Write about a moment in your life when you felt most authentically yourself. What were you doing? Who were you with? What values were being expressed? These clues point to your core.',
 'once', 1, 'Excavate core values as an anchor beneath the shifting identity questions'),

('identity_and_self_concept', 3, 'behavioral_exposure',
 'One Authentic Expression',
 'Identify one aspect of who you are that you''ve been hiding, suppressing, or haven''t yet expressed. This week, express it in one small, safe way — in conversation, in your appearance, or in a creative act.',
 'once', 7, 'Build confidence through small, deliberate acts of authentic self-expression'),

('identity_and_self_concept', 4, 'journaling',
 'My Story So Far',
 'Write a 1-page narrative of your life that centres your own agency, growth, and becoming — not the labels others have put on you or the confusion you''ve felt. This is your story, told by you.',
 'once', 1, 'Consolidate a self-authored, coherent identity narrative'),

-- ── ENGAGEMENT, RAPPORT & ASSESSMENT ────────────────────────────────────────
('engagement_rapport_and_assessment', 1, 'journaling',
 'What Brought Me Here',
 'Write freely about what made you decide to reach out for support now. What has been weighing on you? There''s no right or wrong answer — this is just a chance to put it into words.',
 'once', 1, 'Open a dialogue with your inner experience and begin articulating your needs'),

('engagement_rapport_and_assessment', 2, 'journaling',
 'Hopes & Hesitations',
 'Write two lists: (1) What I''m hoping therapy or this process helps with, (2) What I''m uncertain or nervous about. Both perspectives are valid and important to acknowledge.',
 'once', 1, 'Explore ambivalence about the process and clarify what the client is seeking'),

('engagement_rapport_and_assessment', 3, 'journaling',
 'Good Enough Day',
 'Describe a "good enough" day in your life — not perfect, just one where you felt okay. What was in it? What did it feel like? This simple picture often reveals what matters most.',
 'once', 1, 'Begin identifying values, needs, and what a meaningful life looks like for this person'),

('engagement_rapport_and_assessment', 4, 'journaling',
 'One Thing I Want to Change',
 'Of everything we''ve explored so far, write about the one area of your life you most want to be different 6 months from now. Be specific. This will guide which pathway we focus on together.',
 'once', 1, 'Crystallise the primary focus area in preparation for pathway assignment');
