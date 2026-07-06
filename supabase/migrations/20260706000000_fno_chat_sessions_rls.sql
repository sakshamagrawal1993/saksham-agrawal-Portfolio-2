-- Add missing RLS policies for fno_chat_sessions to allow n8n webhook inserts

CREATE POLICY "Enable insert access for all users - fno_chat_sessions" ON public.fno_chat_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users - fno_chat_sessions" ON public.fno_chat_sessions FOR UPDATE USING (true);
