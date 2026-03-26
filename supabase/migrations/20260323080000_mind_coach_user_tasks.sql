-- =============================================================================
-- Migration: Create mind_coach_user_tasks table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.mind_coach_user_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES public.mind_coach_profiles(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.mind_coach_sessions(id) ON DELETE CASCADE,
    task_name TEXT NOT NULL,
    task_description TEXT NOT NULL,
    task_frequency TEXT NOT NULL,
    task_start_date TIMESTAMPTZ,
    task_end_date TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dismissed', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for efficient querying of active tasks per user
CREATE INDEX IF NOT EXISTS idx_mc_tasks_profile_status ON public.mind_coach_user_tasks(profile_id, status);

-- Enable RLS
ALTER TABLE public.mind_coach_user_tasks ENABLE ROW LEVEL SECURITY;

-- Anonymous public broad access (dev portfolio context)
CREATE POLICY "public_select_mc_tasks" ON public.mind_coach_user_tasks FOR SELECT USING (true);
CREATE POLICY "public_insert_mc_tasks" ON public.mind_coach_user_tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "public_update_mc_tasks" ON public.mind_coach_user_tasks FOR UPDATE USING (true);
CREATE POLICY "public_delete_mc_tasks" ON public.mind_coach_user_tasks FOR DELETE USING (true);
