-- Phase 3: market-aware evaluation, benchmark metrics, and structured lessons.
-- This is additive so existing Trading Agents runs and the current scorecard keep working.

ALTER TABLE public.trading_sessions
ADD COLUMN IF NOT EXISTS market TEXT,
ADD COLUMN IF NOT EXISTS evaluation_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS evaluation_due_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS evaluation_horizon TEXT DEFAULT '24h',
ADD COLUMN IF NOT EXISTS entry_price NUMERIC,
ADD COLUMN IF NOT EXISTS entry_price_source TEXT,
ADD COLUMN IF NOT EXISTS entry_market_timestamp TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS exit_price NUMERIC,
ADD COLUMN IF NOT EXISTS exit_price_source TEXT,
ADD COLUMN IF NOT EXISTS exit_market_timestamp TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS raw_return_pct NUMERIC,
ADD COLUMN IF NOT EXISTS benchmark_symbol TEXT,
ADD COLUMN IF NOT EXISTS benchmark_entry_price NUMERIC,
ADD COLUMN IF NOT EXISTS benchmark_exit_price NUMERIC,
ADD COLUMN IF NOT EXISTS benchmark_return_pct NUMERIC,
ADD COLUMN IF NOT EXISTS alpha_return_pct NUMERIC,
ADD COLUMN IF NOT EXISTS directional_result TEXT,
ADD COLUMN IF NOT EXISTS confidence_bucket TEXT,
ADD COLUMN IF NOT EXISTS confidence_score NUMERIC,
ADD COLUMN IF NOT EXISTS evaluation_error TEXT,
ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ;

UPDATE public.trading_sessions
SET evaluation_status = CASE
  WHEN evaluated = TRUE THEN 'evaluated'
  ELSE COALESCE(evaluation_status, 'pending')
END
WHERE evaluation_status IS NULL;

UPDATE public.trading_sessions
SET entry_price = COALESCE(entry_price, execution_price)
WHERE entry_price IS NULL
  AND execution_price IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trading_sessions_evaluation_queue
ON public.trading_sessions (evaluation_status, evaluation_due_at, created_at)
WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_trading_sessions_market_ticker
ON public.trading_sessions (market, ticker, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trading_sessions_directional_result
ON public.trading_sessions (directional_result)
WHERE evaluated = TRUE;

ALTER TABLE public.agent_lessons
ADD COLUMN IF NOT EXISTS lesson_type TEXT DEFAULT 'portfolio',
ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS applies_to_market TEXT DEFAULT 'all',
ADD COLUMN IF NOT EXISTS applies_to_ticker TEXT,
ADD COLUMN IF NOT EXISTS signal_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS quality_score NUMERIC DEFAULT 0.5,
ADD COLUMN IF NOT EXISTS source_session_id UUID REFERENCES public.trading_sessions(id) ON DELETE SET NULL;

UPDATE public.agent_lessons
SET
  lesson_type = COALESCE(lesson_type, 'portfolio'),
  applies_to_ticker = COALESCE(applies_to_ticker, ticker),
  source_session_id = COALESCE(source_session_id, session_id)
WHERE applies_to_ticker IS NULL
   OR source_session_id IS NULL
   OR lesson_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_lessons_retrieval
ON public.agent_lessons (applies_to_market, applies_to_ticker, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_lessons_signal_tags
ON public.agent_lessons USING GIN (signal_tags);

CREATE TABLE IF NOT EXISTS public.trading_evaluation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.trading_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.trading_evaluation_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trading_evaluation_events'
      AND policyname = 'Enable read access for all users on trading_evaluation_events'
  ) THEN
    CREATE POLICY "Enable read access for all users on trading_evaluation_events"
    ON public.trading_evaluation_events FOR SELECT
    TO authenticated, anon
    USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trading_evaluation_events_session
ON public.trading_evaluation_events (session_id, created_at DESC);
