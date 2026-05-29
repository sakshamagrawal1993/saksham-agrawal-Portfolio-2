-- Final function hardening after broad policy migration.

-- Fix remaining mutable search_path warnings.
do $$
begin
  execute 'alter function public.update_updated_at_column() set search_path = public, extensions';
exception when undefined_function then null;
end $$;

do $$
begin
  execute 'alter function public.update_daily_aggregate() set search_path = public, extensions';
exception when undefined_function then null;
end $$;

-- Revoke execute from PUBLIC as well (anon/authenticated inherit PUBLIC).
revoke execute on function public.get_or_create_chat_session(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_user_profile() from public, anon, authenticated;
revoke execute on function public.handle_user_update_email() from public, anon, authenticated;
