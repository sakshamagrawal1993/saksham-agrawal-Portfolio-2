ALTER TABLE public.jivi_chat_sessions ADD COLUMN IF NOT EXISTS intermediate_diagnoses JSONB DEFAULT '[]'::jsonb;
