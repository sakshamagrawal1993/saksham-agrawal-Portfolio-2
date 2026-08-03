-- LibertyMD: `comprehension_confirmed` as a terminal resolution reason.
--
-- The comprehension check opens on the mini-differential's confidence (>= 75).
-- Release below the turn cap previously required the report composer's
-- confidence (>= 80). Those are two different models on two different scales,
-- so a consultation could show the patient everything it had understood, take
-- their explicit "looks good", generate a valid report, discard it, and carry
-- on asking questions until turn 15.
--
-- Confirming the summary now completes the consultation. Confidence still
-- governs the report's wording through the four bands (high >= 80,
-- medium 60-79, low 40-59, minimal < 40); it no longer decides whether a
-- patient who said they were finished receives a report at all.
--
-- Additive: this only widens the allowed set, so no existing row can fail it.

alter table public.libertymd_consultations
  drop constraint if exists libertymd_consultations_resolution_reason_check;

alter table public.libertymd_consultations
  add constraint libertymd_consultations_resolution_reason_check
  check (
    resolution_reason is null
    or resolution_reason in (
      'high_confidence',
      'workflow_ready',
      'turn_limit_confident',
      'turn_limit_report',
      'comprehension_confirmed',
      'low_diagnostic_confidence',
      'insufficient_clinical_information',
      'no_health_information'
    )
  );

comment on column public.libertymd_consultations.resolution_reason is
  'Why the consultation ended. comprehension_confirmed: the patient confirmed the comprehension summary and a valid report was released at whatever confidence band applied. turn_limit_report includes low-confidence physician-review reports; no_health_information is the only incomplete-report reason.';
