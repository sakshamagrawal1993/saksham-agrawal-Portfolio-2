-- Persist proposed pathways per profile so latest suggestion can be surfaced on Home

CREATE TABLE IF NOT EXISTS public.mind_coach_pathway_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.mind_coach_profiles(id) ON DELETE CASCADE,
  session_id uuid NULL REFERENCES public.mind_coach_sessions(id) ON DELETE SET NULL,
  proposed_pathway text NOT NULL,
  confidence numeric(5,2) NULL,
  source text NOT NULL DEFAULT 'chat',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_mc_pathway_proposals_profile_created_at
  ON public.mind_coach_pathway_proposals (profile_id, created_at DESC);

ALTER TABLE public.mind_coach_pathway_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_mc_pathway_proposals"
  ON public.mind_coach_pathway_proposals
  FOR SELECT
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "auth_insert_mc_pathway_proposals"
  ON public.mind_coach_pathway_proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id IN (
      SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "auth_update_mc_pathway_proposals"
  ON public.mind_coach_pathway_proposals
  FOR UPDATE
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "auth_delete_mc_pathway_proposals"
  ON public.mind_coach_pathway_proposals
  FOR DELETE
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM public.mind_coach_profiles WHERE user_id = auth.uid()
    )
  );
