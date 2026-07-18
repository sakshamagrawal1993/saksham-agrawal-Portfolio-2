-- Resume a request that saved the patient turn but failed before producing a reply.

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
  existing_message_sequence bigint;
begin
  select * into consultation_row
  from public.libertymd_consultations
  where id = p_consultation_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Consultation not found';
  end if;

  -- A fresh lease means this request, or another request, is still running.
  if consultation_row.active_request_id is not null
    and consultation_row.active_request_started_at > now() - interval '2 minutes' then
    return query select false, false, consultation_row.version;
    return;
  end if;

  select sequence into existing_message_sequence
  from public.libertymd_messages
  where consultation_id = p_consultation_id
    and client_message_id = p_request_id
  limit 1;

  if existing_message_sequence is not null then
    if exists (
      select 1
      from public.libertymd_messages
      where consultation_id = p_consultation_id
        and sequence > existing_message_sequence
        and role in ('assistant', 'system')
    ) then
      return query select false, true, consultation_row.version;
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

revoke all on function public.libertymd_claim_consultation_request(uuid, uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.libertymd_claim_consultation_request(uuid, uuid, uuid, bigint)
  to service_role;
