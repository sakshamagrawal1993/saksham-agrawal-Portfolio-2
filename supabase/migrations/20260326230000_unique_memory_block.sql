-- Migration: Add unique constraint to mind_coach_memories for consolidated capture
-- Created: 2026-03-26

-- 1. Clean up potential duplicates (keep the latest one per profile)
DELETE FROM public.mind_coach_memories a
USING public.mind_coach_memories b
WHERE a.id < b.id
  AND a.profile_id = b.profile_id;

-- 2. Add Unique Constraint
ALTER TABLE IF EXISTS public.mind_coach_memories 
ADD CONSTRAINT unique_profile_memory UNIQUE (profile_id);
