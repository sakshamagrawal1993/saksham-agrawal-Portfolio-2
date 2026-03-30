-- =============================================================================
-- Mind Coach Session Template + Runtime Evaluation Layer
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_pathway_phases_pathway_phase
    ON public.mind_coach_pathway_phases(pathway_name, phase_number);

-- Authoring templates: session-level objectives/content per pathway+phase.
CREATE TABLE IF NOT EXISTS public.mind_coach_session_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pathway_name TEXT NOT NULL,
    phase_number INT NOT NULL CHECK (phase_number > 0),
    session_order INT NOT NULL CHECK (session_order > 0),
    template_key TEXT,
    title TEXT NOT NULL,
    goal TEXT NOT NULL,
    description TEXT NOT NULL,
    success_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
    fallback_strategy TEXT NOT NULL DEFAULT 'revisit' CHECK (fallback_strategy IN (
        'revisit',
        'stabilize',
        'advance_with_guardrails'
    )),
    min_completion_score NUMERIC(5,2) NOT NULL DEFAULT 0.70 CHECK (
        min_completion_score >= 0.00 AND min_completion_score <= 1.00
    ),
    estimated_duration_minutes INT CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (pathway_name, phase_number, session_order),
    UNIQUE (pathway_name, phase_number, template_key),
    CONSTRAINT fk_mc_session_templates_pathway_phase
      FOREIGN KEY (pathway_name, phase_number)
      REFERENCES public.mind_coach_pathway_phases(pathway_name, phase_number)
      ON DELETE CASCADE
);

-- Runtime instance rows: user journey mapped to concrete session objectives.
CREATE TABLE IF NOT EXISTS public.mind_coach_journey_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    journey_id UUID NOT NULL REFERENCES public.mind_coach_journeys(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.mind_coach_profiles(id) ON DELETE CASCADE,
    pathway_name TEXT NOT NULL,
    session_template_id UUID REFERENCES public.mind_coach_session_templates(id) ON DELETE SET NULL,
    linked_session_id UUID REFERENCES public.mind_coach_sessions(id) ON DELETE SET NULL,
    phase_number INT NOT NULL CHECK (phase_number > 0),
    session_order INT NOT NULL CHECK (session_order > 0),
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN (
        'planned',
        'in_progress',
        'completed',
        'revisit',
        'blocked',
        'cancelled'
    )),
    attempt_count INT NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
    completion_score NUMERIC(5,2) CHECK (completion_score IS NULL OR (completion_score >= 0.00 AND completion_score <= 1.00)),
    completion_reason TEXT,
    adaptation_reason TEXT,
    source TEXT NOT NULL DEFAULT 'template' CHECK (source IN ('template', 'adapted', 'manual')),
    generated_title TEXT,
    generated_goal TEXT,
    generated_description TEXT,
    activated_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (journey_id, phase_number, session_order, attempt_count)
);

-- Structured evaluation records per journey session (and optionally linked chat session).
CREATE TABLE IF NOT EXISTS public.mind_coach_session_evaluations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    journey_session_id UUID NOT NULL REFERENCES public.mind_coach_journey_sessions(id) ON DELETE CASCADE,
    journey_id UUID NOT NULL REFERENCES public.mind_coach_journeys(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.mind_coach_profiles(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.mind_coach_sessions(id) ON DELETE SET NULL,
    objective_met BOOLEAN NOT NULL DEFAULT false,
    objective_confidence NUMERIC(5,2) CHECK (
        objective_confidence IS NULL OR (objective_confidence >= 0.00 AND objective_confidence <= 1.00)
    ),
    completion_score NUMERIC(5,2) CHECK (
        completion_score IS NULL OR (completion_score >= 0.00 AND completion_score <= 1.00)
    ),
    risk_level TEXT NOT NULL DEFAULT 'unknown' CHECK (risk_level IN (
        'low',
        'medium',
        'high',
        'critical',
        'unknown'
    )),
    requires_escalation BOOLEAN NOT NULL DEFAULT false,
    unresolved_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    strengths_observed JSONB NOT NULL DEFAULT '[]'::jsonb,
    recommended_next_action TEXT NOT NULL DEFAULT 'revisit' CHECK (recommended_next_action IN (
        'advance',
        'revisit',
        'stabilize',
        'escalate',
        'custom'
    )),
    recommended_adjustments JSONB NOT NULL DEFAULT '{}'::jsonb,
    evaluator_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_mc_session_templates_phase
    ON public.mind_coach_session_templates(pathway_name, phase_number, session_order);

CREATE INDEX IF NOT EXISTS idx_mc_journey_sessions_journey_status
    ON public.mind_coach_journey_sessions(journey_id, status, phase_number, session_order);

CREATE INDEX IF NOT EXISTS idx_mc_journey_sessions_pathway_phase
    ON public.mind_coach_journey_sessions(pathway_name, phase_number, session_order);

CREATE INDEX IF NOT EXISTS idx_mc_journey_sessions_profile
    ON public.mind_coach_journey_sessions(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mc_journey_sessions_template
    ON public.mind_coach_journey_sessions(session_template_id);

CREATE INDEX IF NOT EXISTS idx_mc_session_evals_journey_session
    ON public.mind_coach_session_evaluations(journey_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mc_session_evals_profile
    ON public.mind_coach_session_evaluations(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mc_session_evals_session
    ON public.mind_coach_session_evaluations(session_id);

-- =============================================================================
-- Seed default session templates from phase metadata (3 sessions per phase)
-- =============================================================================
WITH phase_rows AS (
    SELECT pathway_name, phase_number, phase_name, phase_description
    FROM public.mind_coach_pathway_phases
),
session_orders AS (
    SELECT generate_series(1, 3) AS session_order
)
INSERT INTO public.mind_coach_session_templates (
    pathway_name,
    phase_number,
    session_order,
    template_key,
    title,
    goal,
    description,
    success_criteria,
    fallback_strategy,
    min_completion_score,
    estimated_duration_minutes,
    is_active
)
SELECT
    p.pathway_name,
    p.phase_number,
    s.session_order,
    format('phase_%s_session_%s', p.phase_number, s.session_order),
    CASE s.session_order
        WHEN 1 THEN format('%s - Orientation', p.phase_name)
        WHEN 2 THEN format('%s - Skill Practice', p.phase_name)
        ELSE format('%s - Integration', p.phase_name)
    END,
    CASE s.session_order
        WHEN 1 THEN format('Establish clarity and safety around %s.', p.phase_name)
        WHEN 2 THEN format('Practice one concrete therapeutic skill tied to %s.', p.phase_name)
        ELSE format('Consolidate progress from %s and prepare next steps.', p.phase_name)
    END,
    CASE s.session_order
        WHEN 1 THEN format('Begin this phase by grounding in the core objective: %s', p.phase_description)
        WHEN 2 THEN format('Deepen work in this phase with applied reflection and guided practice: %s', p.phase_description)
        ELSE format('Close this phase session by integrating learning and documenting progress toward the phase objective: %s', p.phase_description)
    END,
    jsonb_build_array(
        jsonb_build_object('type', 'engagement', 'target', 'user participates and reflects'),
        jsonb_build_object('type', 'progress_signal', 'target', 'clear next-step commitment')
    ),
    'revisit',
    CASE s.session_order
        WHEN 1 THEN 0.60
        WHEN 2 THEN 0.70
        ELSE 0.75
    END,
    50,
    true
FROM phase_rows p
CROSS JOIN session_orders s
ON CONFLICT (pathway_name, phase_number, session_order) DO UPDATE
SET
    title = EXCLUDED.title,
    goal = EXCLUDED.goal,
    description = EXCLUDED.description,
    success_criteria = EXCLUDED.success_criteria,
    min_completion_score = EXCLUDED.min_completion_score,
    updated_at = timezone('utc'::text, now());

-- =============================================================================
-- Backfill runtime journey sessions for active journeys
-- =============================================================================
WITH active_journeys AS (
    SELECT
        j.id AS journey_id,
        j.profile_id,
        COALESCE(NULLIF(j.pathway, ''), 'engagement_rapport_and_assessment') AS pathway_name,
        COALESCE(j.current_phase, COALESCE(j.current_phase_index, 0) + 1, 1) AS current_phase_number
    FROM public.mind_coach_journeys j
    WHERE j.active = true
),
phase_completion AS (
    SELECT
        s.journey_id,
        s.phase_number,
        COUNT(*)::INT AS completed_count
    FROM public.mind_coach_sessions s
    WHERE s.session_state = 'completed'
      AND s.journey_id IS NOT NULL
    GROUP BY s.journey_id, s.phase_number
),
template_rows AS (
    SELECT
        t.id AS template_id,
        t.pathway_name,
        t.phase_number,
        t.session_order,
        t.title,
        t.goal,
        t.description
    FROM public.mind_coach_session_templates t
    WHERE t.is_active = true
),
expanded AS (
    SELECT
        aj.journey_id,
        aj.profile_id,
        tr.pathway_name,
        tr.template_id,
        tr.phase_number,
        tr.session_order,
        tr.title,
        tr.goal,
        tr.description,
        COALESCE(pc.completed_count, 0) AS completed_count,
        aj.current_phase_number
    FROM active_journeys aj
    JOIN template_rows tr
      ON tr.pathway_name = aj.pathway_name
    LEFT JOIN phase_completion pc
      ON pc.journey_id = aj.journey_id
     AND pc.phase_number = tr.phase_number
)
INSERT INTO public.mind_coach_journey_sessions (
    journey_id,
    profile_id,
    pathway_name,
    session_template_id,
    phase_number,
    session_order,
    status,
    attempt_count,
    source,
    generated_title,
    generated_goal,
    generated_description,
    activated_at
)
SELECT
    e.journey_id,
    e.profile_id,
    e.pathway_name,
    e.template_id,
    e.phase_number,
    e.session_order,
    CASE
        WHEN e.phase_number < e.current_phase_number THEN 'completed'
        WHEN e.phase_number = e.current_phase_number AND e.session_order <= e.completed_count THEN 'completed'
        WHEN e.phase_number = e.current_phase_number AND e.session_order = LEAST(e.completed_count + 1, 3) THEN 'in_progress'
        ELSE 'planned'
    END AS status,
    1,
    'template',
    e.title,
    e.goal,
    e.description,
    CASE
        WHEN e.phase_number = e.current_phase_number AND e.session_order = LEAST(e.completed_count + 1, 3)
            THEN timezone('utc'::text, now())
        ELSE NULL
    END
FROM expanded e
ON CONFLICT (journey_id, phase_number, session_order, attempt_count) DO NOTHING;

-- =============================================================================
-- RLS (public demo mode parity with existing Mind Coach tables)
-- =============================================================================
ALTER TABLE public.mind_coach_session_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_coach_journey_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mind_coach_session_evaluations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
    short TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'mind_coach_session_templates',
        'mind_coach_journey_sessions',
        'mind_coach_session_evaluations'
    ] LOOP
        short := replace(t, 'mind_coach_', 'mc_');
        EXECUTE format('CREATE POLICY "public_select_%s" ON public.%I FOR SELECT USING (true)', short, t);
        EXECUTE format('CREATE POLICY "public_insert_%s" ON public.%I FOR INSERT WITH CHECK (true)', short, t);
        EXECUTE format('CREATE POLICY "public_update_%s" ON public.%I FOR UPDATE USING (true)', short, t);
        EXECUTE format('CREATE POLICY "public_delete_%s" ON public.%I FOR DELETE USING (true)', short, t);
    END LOOP;
END $$;

