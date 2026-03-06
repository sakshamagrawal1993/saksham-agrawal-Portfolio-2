-- =============================================================================
-- Mind Coach Auth Link & RLS Migration
-- =============================================================================

-- 1. Enforce user_id relationship with auth.users
-- This ensures every profile corresponds to a real authenticated user.
-- Wait, first we should delete any orphaned profiles that don't have a user_id
-- or whose user_id doesn't exist in auth.users, to prevent foreign key errors.
DELETE FROM public.mind_coach_profiles 
WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM auth.users);

ALTER TABLE public.mind_coach_profiles 
  ALTER COLUMN user_id SET NOT NULL,
  ADD CONSTRAINT fk_mind_coach_profiles_user 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Update Row Level Security (RLS) Policies
-- The previous policies were completely open: "USING (true)".
-- We need to drop the old public policies and recreate them with proper auth checks.

-- Drop old public policies for mind_coach_profiles
DROP POLICY IF EXISTS "public_select_mc_profiles" ON public.mind_coach_profiles;
DROP POLICY IF EXISTS "public_insert_mc_profiles" ON public.mind_coach_profiles;
DROP POLICY IF EXISTS "public_update_mc_profiles" ON public.mind_coach_profiles;
DROP POLICY IF EXISTS "public_delete_mc_profiles" ON public.mind_coach_profiles;

-- Create authenticated policies for mind_coach_profiles
CREATE POLICY "auth_select_mc_profiles" ON public.mind_coach_profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "auth_insert_mc_profiles" ON public.mind_coach_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "auth_update_mc_profiles" ON public.mind_coach_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "auth_delete_mc_profiles" ON public.mind_coach_profiles FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Drop old public policies for mind_coach_journeys
DROP POLICY IF EXISTS "public_select_mc_journeys" ON public.mind_coach_journeys;
DROP POLICY IF EXISTS "public_insert_mc_journeys" ON public.mind_coach_journeys;
DROP POLICY IF EXISTS "public_update_mc_journeys" ON public.mind_coach_journeys;
DROP POLICY IF EXISTS "public_delete_mc_journeys" ON public.mind_coach_journeys;

-- Create authenticated policies for mind_coach_journeys
CREATE POLICY "auth_select_mc_journeys" ON public.mind_coach_journeys FOR SELECT TO authenticated USING (
  profile_id IN (SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "auth_insert_mc_journeys" ON public.mind_coach_journeys FOR INSERT TO authenticated WITH CHECK (
  profile_id IN (SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "auth_update_mc_journeys" ON public.mind_coach_journeys FOR UPDATE TO authenticated USING (
  profile_id IN (SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "auth_delete_mc_journeys" ON public.mind_coach_journeys FOR DELETE TO authenticated USING (
  profile_id IN (SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid())
);

-- Drop old public policies for mind_coach_sessions
DROP POLICY IF EXISTS "public_select_mc_sessions" ON public.mind_coach_sessions;
DROP POLICY IF EXISTS "public_insert_mc_sessions" ON public.mind_coach_sessions;
DROP POLICY IF EXISTS "public_update_mc_sessions" ON public.mind_coach_sessions;
DROP POLICY IF EXISTS "public_delete_mc_sessions" ON public.mind_coach_sessions;

-- Create authenticated policies for mind_coach_sessions
CREATE POLICY "auth_select_mc_sessions" ON public.mind_coach_sessions FOR SELECT TO authenticated USING (
  profile_id IN (SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "auth_insert_mc_sessions" ON public.mind_coach_sessions FOR INSERT TO authenticated WITH CHECK (
  profile_id IN (SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "auth_update_mc_sessions" ON public.mind_coach_sessions FOR UPDATE TO authenticated USING (
  profile_id IN (SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "auth_delete_mc_sessions" ON public.mind_coach_sessions FOR DELETE TO authenticated USING (
  profile_id IN (SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid())
);

-- Drop old public policies for mind_coach_messages
DROP POLICY IF EXISTS "public_select_mc_messages" ON public.mind_coach_messages;
DROP POLICY IF EXISTS "public_insert_mc_messages" ON public.mind_coach_messages;
DROP POLICY IF EXISTS "public_update_mc_messages" ON public.mind_coach_messages;
DROP POLICY IF EXISTS "public_delete_mc_messages" ON public.mind_coach_messages;

-- Create authenticated policies for mind_coach_messages
CREATE POLICY "auth_select_mc_messages" ON public.mind_coach_messages FOR SELECT TO authenticated USING (
  session_id IN (SELECT id FROM public.mind_coach_sessions WHERE profile_id IN (SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid()))
);
CREATE POLICY "auth_insert_mc_messages" ON public.mind_coach_messages FOR INSERT TO authenticated WITH CHECK (
  session_id IN (SELECT id FROM public.mind_coach_sessions WHERE profile_id IN (SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid()))
);
CREATE POLICY "auth_update_mc_messages" ON public.mind_coach_messages FOR UPDATE TO authenticated USING (
  session_id IN (SELECT id FROM public.mind_coach_sessions WHERE profile_id IN (SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid()))
);
CREATE POLICY "auth_delete_mc_messages" ON public.mind_coach_messages FOR DELETE TO authenticated USING (
  session_id IN (SELECT id FROM public.mind_coach_sessions WHERE profile_id IN (SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid()))
);

-- Drop old public policies for mind_coach_memories
DROP POLICY IF EXISTS "public_select_mc_memories" ON public.mind_coach_memories;
DROP POLICY IF EXISTS "public_insert_mc_memories" ON public.mind_coach_memories;
DROP POLICY IF EXISTS "public_update_mc_memories" ON public.mind_coach_memories;
DROP POLICY IF EXISTS "public_delete_mc_memories" ON public.mind_coach_memories;

-- Create authenticated policies for mind_coach_memories
CREATE POLICY "auth_select_mc_memories" ON public.mind_coach_memories FOR SELECT TO authenticated USING (
  profile_id IN (SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "auth_insert_mc_memories" ON public.mind_coach_memories FOR INSERT TO authenticated WITH CHECK (
  profile_id IN (SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "auth_update_mc_memories" ON public.mind_coach_memories FOR UPDATE TO authenticated USING (
  profile_id IN (SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "auth_delete_mc_memories" ON public.mind_coach_memories FOR DELETE TO authenticated USING (
  profile_id IN (SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid())
);

-- Note: mind_coach_dynamic_content is essentially read-only for public/authenticated users
-- We leave its policies open or read-only as defined in its own migration.
