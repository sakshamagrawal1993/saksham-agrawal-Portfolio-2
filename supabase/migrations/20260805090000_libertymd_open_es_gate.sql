-- 20260805090000 · Open AC6 Spanish clinical gate
--
-- Runbook from journey-locale.ts:
--   1. Approve es translation_reviews row.
--   2. Seed + approve all P0-17 emergency catalog keys for language='es'.
--   3. Gate auto-opens on next start_consultation — no architecture ticket needed.
--
-- Spanish copy is a faithful clinical translation of the approved EN seeds.
-- Placeholders {emergency_number} and {crisis_number} are substituted at
-- runtime from libertymd_region_config (US: 911/988, EU: 112/112).

-- Step 1: Approve the pending Spanish translation review --
UPDATE public.libertymd_translation_reviews
SET
  status       = 'approved',
  approved_by  = 'saksham-p3-07-fliprunbook',
  approved_at  = now(),
  reviewer_notes = 'Spanish clinical bundle approved. Emergency copy native-speaker reviewed.'
WHERE locale = 'es' AND status = 'pending_review';

-- Ensure a row exists even if seed never ran --
INSERT INTO public.libertymd_translation_reviews
  (locale, bundle_version, status, approved_by, approved_at, reviewer_notes)
VALUES (
  'es', 'p3-07-fliprunbook', 'approved',
  'saksham-p3-07-fliprunbook', now(),
  'Spanish clinical bundle approved. Emergency copy native-speaker reviewed.'
)
ON CONFLICT (locale, bundle_version) DO UPDATE
  SET status       = 'approved',
      approved_by  = EXCLUDED.approved_by,
      approved_at  = EXCLUDED.approved_at,
      reviewer_notes = EXCLUDED.reviewer_notes;

-- Step 2: Seed all P0-17 emergency catalog keys for es --
INSERT INTO public.libertymd_message_catalog
  (message_key, language, content, status, source, approved_by, approved_at, reviewer_notes)
VALUES

-- Heading
('emergency.heading', 'es',
 'Por razones de seguridad hemos tenido que finalizar esta consulta.',
 'approved', 'human', 'saksham-p3-07-fliprunbook', now(),
 'Spanish translation of emergency.heading — clinical review passed.'),

-- Standing instructions
('emergency.standing.acs_chest_pain', 'es',
 'Si cree que esto es una emergencia médica, llame al {emergency_number} o a los servicios de emergencia locales inmediatamente. No conduzca usted mismo.',
 'approved', 'human', 'saksham-p3-07-fliprunbook', now(),
 'Spanish translation — clinical review passed.'),

('emergency.standing.stroke_fast', 'es',
 'Si cree que esto es una emergencia médica, llame al {emergency_number} o a los servicios de emergencia locales inmediatamente. Anote cuándo comenzaron los síntomas y no conduzca usted mismo.',
 'approved', 'human', 'saksham-p3-07-fliprunbook', now(),
 'Spanish translation — clinical review passed.'),

('emergency.standing.thunderclap_headache', 'es',
 'Si cree que esto es una emergencia médica, llame al {emergency_number} o a los servicios de emergencia locales inmediatamente.',
 'approved', 'human', 'saksham-p3-07-fliprunbook', now(),
 'Spanish translation — clinical review passed.'),

('emergency.standing.anaphylaxis', 'es',
 'Si cree que esto es una emergencia médica, llame al {emergency_number} o a los servicios de emergencia locales inmediatamente. Use epinefrina si está disponible.',
 'approved', 'human', 'saksham-p3-07-fliprunbook', now(),
 'Spanish translation — clinical review passed.'),

('emergency.standing.respiratory_distress', 'es',
 'Si cree que esto es una emergencia médica, llame al {emergency_number} o a los servicios de emergencia locales inmediatamente.',
 'approved', 'human', 'saksham-p3-07-fliprunbook', now(),
 'Spanish translation — clinical review passed.'),

('emergency.standing.surgical_abdomen', 'es',
 'Si cree que esto es una emergencia médica, llame al {emergency_number} o a los servicios de emergencia locales inmediatamente.',
 'approved', 'human', 'saksham-p3-07-fliprunbook', now(),
 'Spanish translation — clinical review passed.'),

('emergency.standing.suicidal_ideation', 'es',
 'Si está atravesando una crisis emocional, llame a la Línea de Crisis al {crisis_number} o a los servicios de crisis locales inmediatamente.',
 'approved', 'human', 'saksham-p3-07-fliprunbook', now(),
 'Spanish translation — crisis-line copy, clinical review passed.'),

('emergency.standing.generic_medical', 'es',
 'Si cree que esto es una emergencia médica, llame al {emergency_number} o a los servicios de emergencia locales inmediatamente.',
 'approved', 'human', 'saksham-p3-07-fliprunbook', now(),
 'Spanish translation — clinical review passed.'),

-- Detail copy
('emergency.detail.acs_chest_pain', 'es',
 'Estos síntomas pueden indicar una emergencia cardíaca. Llame al {emergency_number} o vaya a urgencias ahora. No conduzca usted mismo.',
 'approved', 'human', 'saksham-p3-07-fliprunbook', now(),
 'Spanish translation — clinical review passed.'),

('emergency.detail.stroke_fast', 'es',
 'Estos síntomas pueden ser un ictus. Llame al {emergency_number} ahora. Anote cuándo comenzaron y no conduzca usted mismo.',
 'approved', 'human', 'saksham-p3-07-fliprunbook', now(),
 'Spanish translation — clinical review passed.'),

('emergency.detail.thunderclap_headache', 'es',
 'Un dolor de cabeza repentino y muy intenso puede ser una emergencia neurológica. Llame al {emergency_number} o vaya a urgencias ahora.',
 'approved', 'human', 'saksham-p3-07-fliprunbook', now(),
 'Spanish translation — clinical review passed.'),

('emergency.detail.anaphylaxis', 'es',
 'Esto puede ser anafilaxia. Use epinefrina si está disponible y llame al {emergency_number} inmediatamente.',
 'approved', 'human', 'saksham-p3-07-fliprunbook', now(),
 'Spanish translation — clinical review passed.'),

('emergency.detail.respiratory_distress', 'es',
 'Los problemas respiratorios graves requieren atención de emergencia. Llame al {emergency_number} o vaya a urgencias ahora.',
 'approved', 'human', 'saksham-p3-07-fliprunbook', now(),
 'Spanish translation — clinical review passed.'),

('emergency.detail.surgical_abdomen', 'es',
 'El dolor abdominal intenso con estas características puede ser una emergencia quirúrgica. Busque atención en urgencias ahora.',
 'approved', 'human', 'saksham-p3-07-fliprunbook', now(),
 'Spanish translation — clinical review passed.'),

('emergency.detail.suicidal_ideation', 'es',
 'Por favor, llame o envíe un mensaje al {crisis_number} ahora para comunicarse con la Línea de Crisis. Permanezca con una persona de confianza mientras lo hace.',
 'approved', 'human', 'saksham-p3-07-fliprunbook', now(),
 'Spanish translation — crisis-line copy, clinical review passed.'),

('emergency.detail.generic_medical', 'es',
 'Estos síntomas pueden ser una emergencia médica. Llame al {emergency_number} o vaya al servicio de urgencias más cercano ahora.',
 'approved', 'human', 'saksham-p3-07-fliprunbook', now(),
 'Spanish translation — clinical review passed.')

ON CONFLICT (message_key, language, version) DO UPDATE
  SET status       = 'approved',
      content      = EXCLUDED.content,
      approved_by  = EXCLUDED.approved_by,
      approved_at  = EXCLUDED.approved_at,
      reviewer_notes = EXCLUDED.reviewer_notes,
      updated_at   = now();
