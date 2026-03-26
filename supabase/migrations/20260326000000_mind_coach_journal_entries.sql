-- =============================================================================
-- Migration: Create mind_coach_journal_entries table for Journaling & Diary tabs
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.mind_coach_journal_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES public.mind_coach_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled Entry',
    content TEXT NOT NULL DEFAULT '',
    mood_tag TEXT CHECK (mood_tag IN (
        'happy', 'calm', 'reflective', 'anxious', 'sad', 'angry', 'grateful', 'hopeful', 'overwhelmed', 'neutral'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for efficient fetching in the Diary tab (chronological per user)
CREATE INDEX IF NOT EXISTS idx_mc_journal_profile_date 
    ON public.mind_coach_journal_entries(profile_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.mind_coach_journal_entries ENABLE ROW LEVEL SECURITY;

-- Dev/portfolio open-access policies (replace with auth.uid() for production)
CREATE POLICY "public_select_mc_journal" ON public.mind_coach_journal_entries FOR SELECT USING (true);
CREATE POLICY "public_insert_mc_journal" ON public.mind_coach_journal_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "public_update_mc_journal" ON public.mind_coach_journal_entries FOR UPDATE USING (true);
CREATE POLICY "public_delete_mc_journal" ON public.mind_coach_journal_entries FOR DELETE USING (true);
