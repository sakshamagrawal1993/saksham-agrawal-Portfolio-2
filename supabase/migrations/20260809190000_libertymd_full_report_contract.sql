-- A physician-review report is complete only when every displayed component
-- has substantive content. This supersedes the narrower 16:00 contract.

create or replace function public.libertymd_report_sections_complete(payload jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    jsonb_typeof(payload) = 'object'
    and nullif(btrim(payload ->> 'headline'), '') is not null
    and nullif(btrim(payload ->> 'patient_summary'), '') is not null
    and jsonb_typeof(payload -> 'differential_diagnosis') = 'array'
    and jsonb_array_length(payload -> 'differential_diagnosis') = 3
    and not exists (
      select 1
      from jsonb_array_elements(payload -> 'differential_diagnosis') item
      where nullif(btrim(coalesce(item ->> 'full_name', item ->> 'common_name', item ->> 'name')), '') is null
         or nullif(btrim(item ->> 'description'), '') is null
         or nullif(btrim(item ->> 'reason'), '') is null
         or case
              when coalesce(item ->> 'confidence', item ->> 'confidence_score', '') ~ '^([0-9]{1,3})(\.[0-9]+)?%?$'
              then replace(coalesce(item ->> 'confidence', item ->> 'confidence_score'), '%', '')::numeric not between 0 and 100
              else true
            end
    )
    and nullif(btrim(payload #>> '{assessment_and_plan,assessment}'), '') is not null
    and jsonb_typeof(payload #> '{assessment_and_plan,plan}') = 'array'
    and jsonb_array_length(payload #> '{assessment_and_plan,plan}') > 0
    and jsonb_typeof(payload #> '{assessment_and_plan,self_care}') = 'array'
    and jsonb_array_length(payload #> '{assessment_and_plan,self_care}') > 0
    and jsonb_typeof(payload #> '{assessment_and_plan,diagnostic_investigations}') = 'array'
    and jsonb_array_length(payload #> '{assessment_and_plan,diagnostic_investigations}') > 0
    and jsonb_typeof(payload #> '{assessment_and_plan,red_flags_to_watch}') = 'array'
    and jsonb_array_length(payload #> '{assessment_and_plan,red_flags_to_watch}') > 0
    and nullif(btrim(payload #>> '{assessment_and_plan,when_to_seek_care}'), '') is not null
    and nullif(btrim(payload #>> '{soap_note,subjective}'), '') is not null
    and nullif(btrim(payload #>> '{soap_note,objective}'), '') is not null
    and nullif(btrim(payload #>> '{soap_note,assessment}'), '') is not null
    and nullif(btrim(payload #>> '{soap_note,plan}'), '') is not null,
    false
  );
$$;

-- Zero confidence is a valid low-certainty report; shape, not certainty, gates release.
create or replace function public.libertymd_repair_incomplete_report(
  p_consultation_id uuid,
  p_user_id uuid,
  p_report_data jsonb,
  p_confidence_score numeric,
  p_final_diagnostic_run_id uuid,
  p_model_metadata jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_report public.libertymd_reports%rowtype;
begin
  select * into current_report
  from public.libertymd_reports
  where consultation_id = p_consultation_id
    and user_id = p_user_id
  for update;

  if not found then raise exception 'Report not found'; end if;
  if public.libertymd_report_sections_complete(current_report.report_data) then return false; end if;
  if not public.libertymd_report_sections_complete(p_report_data) then
    raise exception 'Replacement report is incomplete' using errcode = 'check_violation';
  end if;
  if p_confidence_score < 0 or p_confidence_score > 100 then
    raise exception 'Replacement confidence is invalid' using errcode = 'check_violation';
  end if;

  perform set_config('libertymd.allow_incomplete_report_repair', 'on', true);
  update public.libertymd_reports
  set report_data = p_report_data,
      confidence_score = p_confidence_score,
      final_diagnostic_run_id = p_final_diagnostic_run_id,
      model_metadata = coalesce(p_model_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'incomplete_report_repaired_at', now(),
          'replaced_diagnostic_run_id', current_report.final_diagnostic_run_id
        )
  where id = current_report.id;
  return true;
end;
$$;

revoke all on function public.libertymd_report_sections_complete(jsonb) from public, anon, authenticated;
grant execute on function public.libertymd_report_sections_complete(jsonb) to service_role;
revoke all on function public.libertymd_repair_incomplete_report(uuid, uuid, jsonb, numeric, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.libertymd_repair_incomplete_report(uuid, uuid, jsonb, numeric, uuid, jsonb)
  to service_role;
