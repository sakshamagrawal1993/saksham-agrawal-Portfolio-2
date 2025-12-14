-- Add 'word' and 'excel' to source_type enum
-- We have to assume this might run in a transaction, but ALTER TYPE cannot run inside a transaction in some PG versions.
-- However, Supabase/Postgres often allows it if it's the only statement or via specific handling.
-- If this fails, we might need to handle it differently (e.g., non-transactional migration).

-- Ideally:
ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'word';
ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'excel';
