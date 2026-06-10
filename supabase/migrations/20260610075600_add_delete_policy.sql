-- Add DELETE policies for RLS cleanup
CREATE POLICY "Users can delete own profile" ON public.jivi_profiles FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON public.jivi_chat_sessions FOR DELETE USING (auth.uid() = user_id);
