-- P4-05 · Merge collision rule (self-vs-self precedence).
-- Paths 1–2 inside libertymd_complete_account_merge (single transaction).
-- Path 0 (new Google user) remains linkIdentity + sync_identity — no clinical reassignment.
-- Adults-only floor hardcoded 18 — keep lockstep with LIBERTYMD_MIN_PATIENT_AGE in profiles.ts.

drop function if exists public.libertymd_complete_account_merge(text, uuid);

create or replace function public.libertymd_complete_account_merge(
  p_transfer_token_hash text,
  p_target_user_id uuid
)
returns table(consultation_id uuid, source_user_id uuid, collision_path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  merge_row public.libertymd_account_merges%rowtype;
  source_profile public.libertymd_profiles%rowtype;
  target_patient_id uuid;
  source_self_patient_id uuid;
  source_age smallint;
  source_sex text;
  target_age smallint;
  target_sex text;
  demos_match boolean := false;
  attribution_patient_id uuid;
  resolved_path text;
begin
  select * into merge_row
  from public.libertymd_account_merges
  where transfer_token_hash = p_transfer_token_hash
  for update;

  if not found or merge_row.status <> 'prepared' then
    raise exception 'Account transfer is not available';
  end if;
  if merge_row.expires_at <= now() then
    update public.libertymd_account_merges
    set status = 'expired'
    where id = merge_row.id;
    raise exception 'Account transfer expired';
  end if;

  -- Same-user finalize (not a cross-account collision). No collision_path.
  if merge_row.source_user_id = p_target_user_id then
    update public.libertymd_account_merges
    set status = 'completed', target_user_id = p_target_user_id, completed_at = now()
    where id = merge_row.id;
    return query select merge_row.consultation_id, merge_row.source_user_id, null::text;
    return;
  end if;

  select * into source_profile
  from public.libertymd_profiles
  where user_id = merge_row.source_user_id;

  target_patient_id := public.libertymd_ensure_self_patient(p_target_user_id);
  select id, age, sex_at_birth
    into source_self_patient_id, source_age, source_sex
  from public.libertymd_patients
  where owner_user_id = merge_row.source_user_id and relationship = 'self';

  select age, sex_at_birth
    into target_age, target_sex
  from public.libertymd_patients
  where id = target_patient_id;

  -- Path 1 match: both sides non-null age + sex_at_birth and exact equality.
  demos_match :=
    source_self_patient_id is not null
    and source_age is not null
    and target_age is not null
    and source_sex is not null
    and target_sex is not null
    and source_age = target_age
    and source_sex = target_sex;

  if demos_match then
    resolved_path := 'matched_self';
    attribution_patient_id := target_patient_id;
  else
    -- Path 2: distinct other only when createPatient parity holds
    -- (age ∈ [18, 120], sex ∈ {female, male}). Else fail closed.
    if source_self_patient_id is null
       or source_age is null
       or source_age < 18
       or source_age > 120
       or source_sex is null
       or source_sex not in ('female', 'male')
    then
      raise exception 'Account transfer could not save this visit safely';
    end if;

    insert into public.libertymd_patients (
      owner_user_id,
      relationship,
      display_label,
      age,
      sex_at_birth
    ) values (
      p_target_user_id,
      'other',
      'Saved from guest visit',
      source_age,
      source_sex
    )
    returning id into attribution_patient_id;

    resolved_path := 'distinct_profile';
  end if;

  -- Identity chrome coalesce only — never age / sex_at_birth from source (Q1A).
  update public.libertymd_profiles target
  set
    display_name = coalesce(target.display_name, source_profile.display_name),
    email = coalesce(target.email, source_profile.email),
    avatar_url = coalesce(target.avatar_url, source_profile.avatar_url),
    consent_version = coalesce(target.consent_version, source_profile.consent_version),
    consented_at = coalesce(target.consented_at, source_profile.consented_at),
    is_anonymous = false
  where target.user_id = p_target_user_id;

  -- Do NOT coalesce patient self age/sex from source (Q1A).

  update public.libertymd_consultations
  set
    user_id = p_target_user_id,
    patient_id = case
      when patient_id = source_self_patient_id then attribution_patient_id
      else patient_id
    end,
    patient_snapshot = case
      when patient_id = source_self_patient_id then
        patient_snapshot || jsonb_build_object('patient_id', attribution_patient_id)
      else patient_snapshot
    end
  where user_id = merge_row.source_user_id;

  update public.libertymd_reports
  set user_id = p_target_user_id
  where user_id = merge_row.source_user_id;

  update public.libertymd_safety_events
  set user_id = p_target_user_id
  where user_id = merge_row.source_user_id;

  update public.libertymd_diagnostic_runs
  set
    user_id = p_target_user_id,
    patient_id = case
      when patient_id = source_self_patient_id then attribution_patient_id
      else patient_id
    end
  where user_id = merge_row.source_user_id;

  update public.libertymd_identity_events
  set user_id = p_target_user_id
  where user_id = merge_row.source_user_id;

  update public.libertymd_consent_events
  set
    user_id = p_target_user_id,
    patient_id = case
      when patient_id = source_self_patient_id then attribution_patient_id
      else patient_id
    end
  where user_id = merge_row.source_user_id;

  update public.libertymd_product_events
  set user_id = p_target_user_id
  where user_id = merge_row.source_user_id;

  update public.libertymd_patients
  set owner_user_id = p_target_user_id
  where owner_user_id = merge_row.source_user_id and relationship <> 'self';

  delete from public.libertymd_patients
  where id = source_self_patient_id;
  delete from public.libertymd_profiles
  where user_id = merge_row.source_user_id;

  update public.libertymd_account_merges
  set
    status = 'completed',
    target_user_id = p_target_user_id,
    completed_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('collision_path', resolved_path)
  where id = merge_row.id;

  insert into public.libertymd_identity_events (
    user_id,
    consultation_id,
    event_type,
    provider,
    metadata
  ) values (
    p_target_user_id,
    merge_row.consultation_id,
    'account_merge_completed',
    'google',
    jsonb_build_object(
      'source_user_id', merge_row.source_user_id,
      'collision_path', resolved_path
    )
  );

  return query select merge_row.consultation_id, merge_row.source_user_id, resolved_path;
end;
$$;

revoke all on function public.libertymd_complete_account_merge(text, uuid) from public, anon, authenticated;
grant execute on function public.libertymd_complete_account_merge(text, uuid) to service_role;

comment on function public.libertymd_complete_account_merge(text, uuid) is
  'P4-05: Path 1 matched_self re-parents to retained target self; Path 2 distinct_profile creates other when createPatient-parity; else fail closed. Never coalesce age/sex. Adults-only floor 18 lockstep with TS LIBERTYMD_MIN_PATIENT_AGE.';
