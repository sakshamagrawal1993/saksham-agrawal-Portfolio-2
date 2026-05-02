CREATE TABLE public.ai_gate_ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    idea_text TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'custom',
    preset_id TEXT,
    taxonomy_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE public.ai_gate_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idea_id UUID NOT NULL REFERENCES public.ai_gate_ideas(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    decision_label TEXT,
    recommended_solver TEXT,
    automation_level TEXT,
    framework_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
    result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_gate_assessments_idea_id ON public.ai_gate_assessments(idea_id);
CREATE INDEX idx_ai_gate_assessments_created_at ON public.ai_gate_assessments(created_at DESC);

ALTER TABLE public.ai_gate_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_gate_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users on ai_gate_ideas"
ON public.ai_gate_ideas FOR SELECT
TO authenticated, anon
USING (true);

CREATE POLICY "Enable read access for all users on ai_gate_assessments"
ON public.ai_gate_assessments FOR SELECT
TO authenticated, anon
USING (true);
