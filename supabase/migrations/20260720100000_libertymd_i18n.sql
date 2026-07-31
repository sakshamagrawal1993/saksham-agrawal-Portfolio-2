-- P3-08 · NEUTRALIZED
--
-- This file previously drafted libertymd_message_catalog / region_config /
-- translation_reviews with unsafe machine-"approved" non-EN clinical seeds,
-- an email-owner RLS write policy, a single emergency_number field (no 988),
-- and an expanded consultations.region vocabulary.
--
-- It must NOT create those tables or seed approvals. The sole apply path is:
--   supabase/migrations/20260731270000_libertymd_i18n_p3_08.sql
--
-- Intentionally a no-op so historical migration timestamps stay ordered.

select 1;
