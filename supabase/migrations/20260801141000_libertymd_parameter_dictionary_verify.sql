-- Fail migration replay if the portable LibertyMD dictionary or its ownership
-- boundary is incomplete. This is intentionally read-only verification.

do $$
declare
  definition_count integer;
begin
  select count(*)
  into definition_count
  from public.libertymd_health_parameter_definitions;

  if definition_count <> 192 then
    raise exception
      'Expected 192 LibertyMD parameter definitions, found %',
      definition_count;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class source_table on source_table.oid = c.conrelid
    join pg_namespace source_schema on source_schema.oid = source_table.relnamespace
    join pg_class target_table on target_table.oid = c.confrelid
    join pg_namespace target_schema on target_schema.oid = target_table.relnamespace
    where c.contype = 'f'
      and source_schema.nspname = 'public'
      and source_table.relname = 'libertymd_lab_results'
      and target_schema.nspname = 'public'
      and target_table.relname = 'libertymd_health_parameter_definitions'
  ) then
    raise exception
      'libertymd_lab_results is not linked to the LibertyMD parameter dictionary';
  end if;

  if exists (
    select 1
    from pg_constraint c
    join pg_class source_table on source_table.oid = c.conrelid
    join pg_namespace source_schema on source_schema.oid = source_table.relnamespace
    join pg_class target_table on target_table.oid = c.confrelid
    join pg_namespace target_schema on target_schema.oid = target_table.relnamespace
    where c.contype = 'f'
      and source_schema.nspname = 'public'
      and source_table.relname = 'libertymd_lab_results'
      and target_schema.nspname = 'public'
      and target_table.relname = 'health_parameter_definitions'
  ) then
    raise exception
      'libertymd_lab_results still depends on the shared parameter dictionary';
  end if;
end
$$;
