-- NUCLEAR FIX: Drop all policies on fno_chat_sessions by name
-- including original ones with "access" in the name

DROP POLICY IF EXISTS "Enable insert access for all users - fno_chat_sessions" ON public.fno_chat_sessions;
DROP POLICY IF EXISTS "Enable update access for all users - fno_chat_sessions" ON public.fno_chat_sessions;
DROP POLICY IF EXISTS "Enable insert for all users - fno_chat_sessions" ON public.fno_chat_sessions;
DROP POLICY IF EXISTS "Enable update for all users - fno_chat_sessions" ON public.fno_chat_sessions;
DROP POLICY IF EXISTS "fno_chat_sessions_insert_open" ON public.fno_chat_sessions;
DROP POLICY IF EXISTS "fno_chat_sessions_update_open" ON public.fno_chat_sessions;
DROP POLICY IF EXISTS "fno_chat_insert_anon_ok" ON public.fno_chat_sessions;
DROP POLICY IF EXISTS "fno_chat_update_anon_ok" ON public.fno_chat_sessions;

-- Create single clean INSERT policy
CREATE POLICY "fno_chat_insert_ok"
  ON public.fno_chat_sessions
  FOR INSERT
  WITH CHECK (true);

-- Create single clean UPDATE policy (WITH CHECK is required for UPSERT path)
CREATE POLICY "fno_chat_update_ok"
  ON public.fno_chat_sessions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
