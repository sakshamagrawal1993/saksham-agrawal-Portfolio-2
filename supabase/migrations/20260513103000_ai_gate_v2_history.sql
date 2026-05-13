ALTER TABLE public.ai_gate_ideas
ADD COLUMN IF NOT EXISTS display_title TEXT,
ADD COLUMN IF NOT EXISTS public_idea_text TEXT,
ADD COLUMN IF NOT EXISTS legitimacy_status TEXT,
ADD COLUMN IF NOT EXISTS legitimacy_confidence NUMERIC,
ADD COLUMN IF NOT EXISTS public_visibility TEXT NOT NULL DEFAULT 'show',
ADD COLUMN IF NOT EXISTS user_session_id TEXT,
ADD COLUMN IF NOT EXISTS client_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.ai_gate_assessments
ADD COLUMN IF NOT EXISTS legitimacy_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS agent_outputs JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS red_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS workflow_execution_id TEXT,
ADD COLUMN IF NOT EXISTS result_source TEXT NOT NULL DEFAULT 'n8n',
ADD COLUMN IF NOT EXISTS schema_version TEXT NOT NULL DEFAULT 'ai-gate-result-v2',
ADD COLUMN IF NOT EXISTS prompt_version TEXT,
ADD COLUMN IF NOT EXISTS model_versions JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_ai_gate_ideas_created_at
ON public.ai_gate_ideas(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_gate_ideas_public_visibility
ON public.ai_gate_ideas(public_visibility);

CREATE INDEX IF NOT EXISTS idx_ai_gate_ideas_legitimacy_status
ON public.ai_gate_ideas(legitimacy_status);

CREATE INDEX IF NOT EXISTS idx_ai_gate_assessments_status
ON public.ai_gate_assessments(status);

CREATE TABLE IF NOT EXISTS public.ai_gate_agent_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES public.ai_gate_assessments(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    agent_key TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    summary TEXT,
    output_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_gate_agent_steps_assessment_id
ON public.ai_gate_agent_steps(assessment_id, sequence);

ALTER TABLE public.ai_gate_agent_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users on ai_gate_agent_steps"
ON public.ai_gate_agent_steps;

CREATE POLICY "Enable read access for all users on ai_gate_agent_steps"
ON public.ai_gate_agent_steps FOR SELECT
TO authenticated, anon
USING (true);
