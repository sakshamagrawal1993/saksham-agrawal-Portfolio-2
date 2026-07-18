-- Idempotency and short-lived consultation leases prevent duplicated or concurrent patient turns.

alter table public.libertymd_consultations
  add column if not exists version bigint not null default 1,
  add column if not exists active_request_id uuid,
  add column if not exists active_request_started_at timestamptz;

alter table public.libertymd_consultations
  drop constraint if exists libertymd_consultations_active_request_pair_check;

alter table public.libertymd_consultations
  add constraint libertymd_consultations_active_request_pair_check
  check ((active_request_id is null) = (active_request_started_at is null));

alter table public.libertymd_messages
  add column if not exists client_message_id uuid;

create unique index if not exists libertymd_messages_client_message_id_idx
  on public.libertymd_messages (consultation_id, client_message_id)
  where client_message_id is not null;

create or replace function public.libertymd_claim_consultation_request(
  p_consultation_id uuid,
  p_user_id uuid,
  p_request_id uuid,
  p_expected_version bigint default null
)
returns table(accepted boolean, replayed boolean, current_version bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  consultation_row public.libertymd_consultations%rowtype;
begin
  select * into consultation_row
  from public.libertymd_consultations
  where id = p_consultation_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Consultation not found';
  end if;

  if exists (
    select 1
    from public.libertymd_messages
    where consultation_id = p_consultation_id
      and client_message_id = p_request_id
  ) then
    return query select false, true, consultation_row.version;
    return;
  end if;

  if consultation_row.active_request_id is not null
    and consultation_row.active_request_started_at > now() - interval '2 minutes' then
    return query select false, false, consultation_row.version;
    return;
  end if;

  if p_expected_version is not null and consultation_row.version <> p_expected_version then
    return query select false, false, consultation_row.version;
    return;
  end if;

  update public.libertymd_consultations
  set
    active_request_id = p_request_id,
    active_request_started_at = now(),
    version = version + 1
  where id = p_consultation_id and user_id = p_user_id
  returning version into consultation_row.version;

  return query select true, false, consultation_row.version;
end;
$$;

create or replace function public.libertymd_finish_consultation_request(
  p_consultation_id uuid,
  p_user_id uuid,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows bigint;
begin
  update public.libertymd_consultations
  set active_request_id = null, active_request_started_at = null
  where id = p_consultation_id
    and user_id = p_user_id
    and active_request_id = p_request_id;

  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

revoke all on function public.libertymd_claim_consultation_request(uuid, uuid, uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.libertymd_finish_consultation_request(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.libertymd_claim_consultation_request(uuid, uuid, uuid, bigint)
  to service_role;
grant execute on function public.libertymd_finish_consultation_request(uuid, uuid, uuid)
  to service_role;
