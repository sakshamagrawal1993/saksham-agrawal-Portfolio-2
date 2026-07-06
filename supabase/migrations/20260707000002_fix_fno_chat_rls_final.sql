-- Final fix: Drop ALL INSERT and UPDATE policies for fno_chat_sessions
-- then create clean open policies for N8N webhook access

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'fno_chat_sessions'
      AND cmd IN ('INSERT', 'UPDATE', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.fno_chat_sessions', pol.policyname);
    RAISE NOTICE 'Dropped policy: %', pol.policyname;
  END LOOP;
END $$;

-- Create clean open INSERT policy
CREATE POLICY "fno_chat_insert_anon_ok"
  ON public.fno_chat_sessions
  FOR INSERT
  WITH CHECK (true);

-- Create clean open UPDATE policy with BOTH USING and WITH CHECK
CREATE POLICY "fno_chat_update_anon_ok"
  ON public.fno_chat_sessions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
