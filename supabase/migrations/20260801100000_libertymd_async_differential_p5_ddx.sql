-- P5-DDX T1 — async mini-differential state on the consultation.
--
-- The differential is computed off the critical path by the
-- `libertymd-differential` n8n workflow and written back by the proxy. It is
-- read on the NEXT turn to steer question generation, and it is the input to
-- the stop rule (turn >= 6 AND top_confidence >= 75 AND no outstanding red
-- flags AND not stale).
--
-- Ordering guard lives in the proxy, not here: writes are accepted only when
-- the incoming `differential_computed_at_turn` exceeds the stored one, so a
-- slow turn-7 run landing after turn-9's cannot regress the value. The column
-- is what makes that guard expressible.
--
-- Additive and inert while LIBERTYMD_ASYNC_DIFFERENTIAL is off: nothing reads
-- these columns until the flag flips, so this migration is safe to apply ahead
-- of the feature.

alter table public.libertymd_consultations
  add column if not exists working_differential jsonb not null default '[]'::jsonb,
  add column if not exists differential_top_confidence smallint,
  add column if not exists differential_red_flags_outstanding text[] not null default '{}'::text[],
  add column if not exists differential_computed_at_turn smallint,
  add column if not exists differential_updated_at timestamptz;

-- Shape guard: an array of entries, never an object or a scalar. Mirrors the
-- existing filled_slots / intermediate_diagnoses checks on this table.
alter table public.libertymd_consultations
  drop constraint if exists libertymd_consultations_working_differential_check;
alter table public.libertymd_consultations
  add constraint libertymd_consultations_working_differential_check
  check (jsonb_typeof(working_differential) = 'array');

-- Confidence is a percentage. The proxy clamps before writing; this is the
-- backstop that makes a bad write fail loudly rather than poison the stop rule.
alter table public.libertymd_consultations
  drop constraint if exists libertymd_consultations_differential_confidence_check;
alter table public.libertymd_consultations
  add constraint libertymd_consultations_differential_confidence_check
  check (
    differential_top_confidence is null
    or (differential_top_confidence >= 0 and differential_top_confidence <= 100)
  );

-- A computed-at turn must be a real turn index within the cap.
alter table public.libertymd_consultations
  drop constraint if exists libertymd_consultations_differential_turn_check;
alter table public.libertymd_consultations
  add constraint libertymd_consultations_differential_turn_check
  check (
    differential_computed_at_turn is null
    or (differential_computed_at_turn >= 0 and differential_computed_at_turn <= 15)
  );

comment on column public.libertymd_consultations.working_differential is
  'P5-DDX. Top-3 differential from the async mini-differential workflow: [{condition, confidence, supporting, refuting, discriminator}]. Condition names are English by contract (machine-matched downstream, never rendered to a patient).';
comment on column public.libertymd_consultations.differential_top_confidence is
  'P5-DDX. P(top condition | evidence stated so far), 0-100. Never exceeds working_differential[0].confidence. Half of the stop rule.';
comment on column public.libertymd_consultations.differential_red_flags_outstanding is
  'P5-DDX. Red-flag negatives not yet established for the leading conditions. The stop rule requires this to be empty: confidence alone can end a consult before safety questions are asked.';
comment on column public.libertymd_consultations.differential_computed_at_turn is
  'P5-DDX. Turn index the differential was computed over. Drives the proxy ordering guard (accept only if greater than stored) and staleness (current_turn - this; hint withheld above 3).';
comment on column public.libertymd_consultations.differential_updated_at is
  'P5-DDX. Wall-clock of the last accepted differential write. Observability only; ordering uses differential_computed_at_turn.';

-- Partial index: the only query pattern is "consults whose differential has
-- crossed the stop threshold", so index just those rows.
create index if not exists libertymd_consultations_differential_ready_idx
  on public.libertymd_consultations (differential_top_confidence, differential_computed_at_turn)
  where differential_top_confidence is not null;
