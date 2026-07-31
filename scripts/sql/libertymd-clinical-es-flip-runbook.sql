-- P3-07 · Clinical Spanish unlock runbook (AC6 path 1) — EXPERT RESIDUAL
-- Do NOT execute as part of P3-07 engineering Done (path 2).
-- REQUIRES EXPERT REVIEW: native-speaker / clinically-fluent approval of ES
-- emergency and safety strings before flipping.
--
-- Unlock conditions (proxy journey-locale gate):
--   1) At least one libertymd_translation_reviews row: locale='es' status='approved'
--   2) All P0-17 emergency catalog keys exist as language='es' status='approved'
-- After both are true, the next start_consultation with language=es persists clinical es
-- without another architecture ticket.

-- Dry-run: current gate inputs
-- select locale, status, bundle_version from public.libertymd_translation_reviews where locale = 'es';
-- select message_key, language, status from public.libertymd_message_catalog
--   where language = 'es' and message_key like 'emergency.%' order by message_key;

-- Example flip (after expert sign-off) — replace reviewer identity; never machine-approve:
-- begin;
-- update public.libertymd_translation_reviews
--   set status = 'approved',
--       approved_by = 'expert-reviewer-id',
--       approved_at = now(),
--       reviewer_notes = 'Native-speaker clinical review complete'
-- where locale = 'es' and status = 'pending_review';
-- -- Ensure every emergency.* key for es is approved (insert or update from pending_review).
-- commit;

select 'P3-07 flip runbook — documentation only; no mutations' as note;
