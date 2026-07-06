-- Fix: Drop existing UPDATE policy and recreate with proper WITH CHECK clause
-- The previous UPDATE policy only had USING(true) but no WITH CHECK(true)
-- This caused UPSERT operations to fail with RLS violations on subsequent turns

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'fno_chat_sessions' AND cmd = 'UPDATE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.fno_chat_sessions', pol.policyname);
    RAISE NOTICE 'Dropped UPDATE policy: %', pol.policyname;
  END LOOP;
END $$;

-- Recreate UPDATE policy with both USING and WITH CHECK = true
CREATE POLICY "fno_chat_sessions_update_open"
  ON public.fno_chat_sessions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Also ensure INSERT policy is open (drop all INSERT policies and recreate)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'fno_chat_sessions' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.fno_chat_sessions', pol.policyname);
    RAISE NOTICE 'Dropped INSERT policy: %', pol.policyname;
  END LOOP;
END $$;

CREATE POLICY "fno_chat_sessions_insert_open"
  ON public.fno_chat_sessions
  FOR INSERT
  WITH CHECK (true);
