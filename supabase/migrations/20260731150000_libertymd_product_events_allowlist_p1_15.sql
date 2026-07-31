-- P1-15: Widen libertymd_product_events.event_name CHECK to the locked 18-name
-- closed set. Never unconstrained text. Postgres remains SoT; Mixpanel fan-out
-- is P1-16 (see docs/libertymd/CARE-ARCHITECTURE.md name-map stub).

alter table public.libertymd_product_events
  drop constraint if exists libertymd_product_events_event_name_check;

alter table public.libertymd_product_events
  add constraint libertymd_product_events_event_name_check
  check (event_name in (
    'homepage_bootstrapped',
    'consultation_started',
    'demographics_saved',
    'emergency_stopped',
    'clinical_review_needed',
    'report_gate_reached',
    'report_released_guest',
    'report_saved_google',
    'inference_failed',
    'question_served',
    'turn_completed',
    'guardrail_evaluated',
    'diagnosis_attempted',
    'report_ready',
    'consult_abandoned',
    'consent_recorded',
    'profile_selected',
    'identity_linked'
  ));

comment on column public.libertymd_product_events.event_name is
  'Closed allow-list (P1-15). Postgres SoT suffix only — no LibertyMd prefix. Mixpanel display map: P1-16.';

comment on column public.libertymd_product_events.properties is
  'Operational metadata only. Never store symptom, transcript, diagnosis, report, email, or name content here. Numerics must be §1 buckets (confidence_bucket / evidence_bucket / latency_bucket), never raw scores.';
