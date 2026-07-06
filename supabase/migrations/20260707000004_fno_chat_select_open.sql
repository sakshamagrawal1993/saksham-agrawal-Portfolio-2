-- Allow SELECT for checking chat sessions
DROP POLICY IF EXISTS "fno_chat_select_open" ON public.fno_chat_sessions;
CREATE POLICY "fno_chat_select_open"
  ON public.fno_chat_sessions
  FOR SELECT
  USING (true);
