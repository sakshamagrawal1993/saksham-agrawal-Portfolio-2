-- ==============================================================================
-- Migration: Add N8N-required columns to fno_chat_sessions
-- Description:
--   1. Add user_mode column (tracks which FnO mode: Ask AI, Create Algo, etc.)
--   2. Add context_payload column (full chat history + assistant_reply per turn)
--   3. Add ai_artifact column (the final algo artifact JSON built during session)
--   4. Fix RLS: drop old UPDATE policy that blocked anonymous webhook upserts
--      and replace with open policy that allows N8N anon key to upsert
-- ==============================================================================

-- 1. Add missing columns
ALTER TABLE public.fno_chat_sessions
  ADD COLUMN IF NOT EXISTS user_mode text;

ALTER TABLE public.fno_chat_sessions
  ADD COLUMN IF NOT EXISTS context_payload jsonb;

ALTER TABLE public.fno_chat_sessions
  ADD COLUMN IF NOT EXISTS ai_artifact jsonb;

-- 2. Drop old blocking UPDATE policy
DO $$
BEGIN
  DROP POLICY IF EXISTS "Enable update access for all users - fno_chat_sessions" ON public.fno_chat_sessions;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- 3. Re-create UPDATE policy with proper USING + WITH CHECK
DO $$
BEGIN
  CREATE POLICY "Enable update for all users - fno_chat_sessions"
    ON public.fno_chat_sessions
    FOR UPDATE
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Re-create INSERT policy idempotently (ensure it exists)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Enable insert access for all users - fno_chat_sessions" ON public.fno_chat_sessions;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Enable insert for all users - fno_chat_sessions"
    ON public.fno_chat_sessions
    FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
