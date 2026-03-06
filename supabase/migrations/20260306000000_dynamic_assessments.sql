-- Migration: Create mind_coach_assessments table for dynamic in-chat clinical assessments

CREATE TABLE IF NOT EXISTS public.mind_coach_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.mind_coach_profiles(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.mind_coach_sessions(id) ON DELETE CASCADE,
    assessment_type TEXT NOT NULL, -- e.g., 'GAD-7', 'PHQ-9', 'PSS-4'
    score INTEGER NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb, -- Raw questions/answers
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_mind_coach_assessments_profile_id ON public.mind_coach_assessments(profile_id);
CREATE INDEX IF NOT EXISTS idx_mind_coach_assessments_session_id ON public.mind_coach_assessments(session_id);

-- Enable RLS
ALTER TABLE public.mind_coach_assessments ENABLE ROW LEVEL SECURITY;

-- Allow read access for the service role and authenticated users to their own assessments
CREATE POLICY "Users can view their own assessments" 
ON public.mind_coach_assessments 
FOR SELECT 
USING (
    profile_id IN (
        SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid()
    )
);

-- Allow insert access for edge functions (service role) or the authenticated user
CREATE POLICY "Users can insert their own assessments" 
ON public.mind_coach_assessments 
FOR INSERT 
WITH CHECK (
    profile_id IN (
        SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid()
    ) OR auth.role() = 'service_role'
);
