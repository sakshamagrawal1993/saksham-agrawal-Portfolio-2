-- Deliver agent log INSERTs to browsers via Supabase Realtime (postgres_changes).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'trading_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trading_logs;
  END IF;
END $$;
