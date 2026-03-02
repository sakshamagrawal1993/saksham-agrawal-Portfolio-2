-- =============================================================================
-- Mind Coach Schema
-- =============================================================================

-- Table: mind_coach_profiles
CREATE TABLE IF NOT EXISTS public.mind_coach_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    age INT,
    gender TEXT,
    concerns JSONB NOT NULL DEFAULT '[]'::jsonb,
    therapist_persona TEXT NOT NULL DEFAULT 'maya',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Table: mind_coach_journeys
CREATE TABLE IF NOT EXISTS public.mind_coach_journeys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES public.mind_coach_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    concerns_snapshot JSONB,
    phases JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_phase INT NOT NULL DEFAULT 1,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Table: mind_coach_sessions
CREATE TABLE IF NOT EXISTS public.mind_coach_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES public.mind_coach_profiles(id) ON DELETE CASCADE,
    journey_id UUID REFERENCES public.mind_coach_journeys(id) ON DELETE SET NULL,
    phase_number INT NOT NULL DEFAULT 1,
    session_number INT NOT NULL DEFAULT 1,
    dynamic_theme TEXT,
    pathway TEXT CHECK (pathway IN (
        'cognitive_reframing', 'boundary_setting', 'emotional_regulation',
        'grief_and_acceptance', 'self_worth_building', 'behavioral_activation',
        'exploratory_validation'
    )),
    session_state TEXT NOT NULL DEFAULT 'intake' CHECK (session_state IN (
        'intake', 'active', 'wrapping_up', 'completed'
    )),
    message_count INT NOT NULL DEFAULT 0,
    summary TEXT,
    summary_data JSONB,
    case_notes JSONB,
    started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    ended_at TIMESTAMPTZ
);

-- Table: mind_coach_messages
CREATE TABLE IF NOT EXISTS public.mind_coach_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES public.mind_coach_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    guardrail_status TEXT CHECK (guardrail_status IN ('passed', 'corrected', 'blocked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Table: mind_coach_guardrail_log
CREATE TABLE IF NOT EXISTS public.mind_coach_guardrail_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.mind_coach_sessions(id) ON DELETE CASCADE,
    message_id UUID REFERENCES public.mind_coach_messages(id) ON DELETE SET NULL,
    check_type TEXT NOT NULL CHECK (check_type IN ('crisis_pre_chat', 'response_post_chat')),
    result TEXT NOT NULL CHECK (result IN ('passed', 'flagged', 'blocked', 'corrected')),
    risk_type TEXT,
    risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high')),
    violations JSONB,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Table: mind_coach_memories (Tier 3: long-term)
CREATE TABLE IF NOT EXISTS public.mind_coach_memories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES public.mind_coach_profiles(id) ON DELETE CASCADE,
    memory_text TEXT NOT NULL,
    memory_type TEXT CHECK (memory_type IN (
        'trigger', 'pattern', 'breakthrough', 'coping_strategy',
        'life_context', 'preference'
    )),
    source_session_id UUID REFERENCES public.mind_coach_sessions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Table: mind_coach_journal_entries
CREATE TABLE IF NOT EXISTS public.mind_coach_journal_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES public.mind_coach_profiles(id) ON DELETE CASCADE,
    title TEXT,
    content TEXT NOT NULL,
    mood TEXT,
    prompt TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Table: mind_coach_mood_entries
CREATE TABLE IF NOT EXISTS public.mind_coach_mood_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES public.mind_coach_profiles(id) ON DELETE CASCADE,
    score INT NOT NULL CHECK (score >= 1 AND score <= 5),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Table: mind_coach_exercises (pre-seeded)
CREATE TABLE IF NOT EXISTS public.mind_coach_exercises (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('breathing', 'grounding', 'meditation')),
    category TEXT NOT NULL,
    duration_seconds INT NOT NULL,
    description TEXT,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_mc_profiles_user ON public.mind_coach_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_mc_journeys_profile ON public.mind_coach_journeys(profile_id);
CREATE INDEX IF NOT EXISTS idx_mc_sessions_profile ON public.mind_coach_sessions(profile_id);
CREATE INDEX IF NOT EXISTS idx_mc_sessions_journey ON public.mind_coach_sessions(journey_id);
CREATE INDEX IF NOT EXISTS idx_mc_messages_session ON public.mind_coach_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_mc_messages_created ON public.mind_coach_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_mc_guardrail_session ON public.mind_coach_guardrail_log(session_id);
CREATE INDEX IF NOT EXISTS idx_mc_memories_profile ON public.mind_coach_memories(profile_id);
CREATE INDEX IF NOT EXISTS idx_mc_journal_profile ON public.mind_coach_journal_entries(profile_id);
CREATE INDEX IF NOT EXISTS idx_mc_mood_profile ON public.mind_coach_mood_entries(profile_id);
CREATE INDEX IF NOT EXISTS idx_mc_mood_created ON public.mind_coach_mood_entries(created_at);

-- =============================================================================
-- RLS — Public access for portfolio demo
-- =============================================================================
ALTER TABLE public.mind_coach_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_coach_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_coach_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_coach_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_coach_guardrail_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_coach_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_coach_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_coach_mood_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_coach_exercises ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
    short TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'mind_coach_profiles', 'mind_coach_journeys', 'mind_coach_sessions',
        'mind_coach_messages', 'mind_coach_guardrail_log', 'mind_coach_memories',
        'mind_coach_journal_entries', 'mind_coach_mood_entries', 'mind_coach_exercises'
    ] LOOP
        short := replace(t, 'mind_coach_', 'mc_');
        EXECUTE format('CREATE POLICY "public_select_%s" ON public.%I FOR SELECT USING (true)', short, t);
        EXECUTE format('CREATE POLICY "public_insert_%s" ON public.%I FOR INSERT WITH CHECK (true)', short, t);
        EXECUTE format('CREATE POLICY "public_update_%s" ON public.%I FOR UPDATE USING (true)', short, t);
        EXECUTE format('CREATE POLICY "public_delete_%s" ON public.%I FOR DELETE USING (true)', short, t);
    END LOOP;
END $$;
