-- Security hardening for public schema/table policies, storage bucket policies,
-- and SECURITY DEFINER function exposure.

-- ---------------------------------------------------------------------------
-- Table RLS policy hardening
-- ---------------------------------------------------------------------------

-- Ticketflow: require authenticated users.
drop policy if exists "Allow generic access to tickets" on public.tickets;
drop policy if exists "Public tickets access" on public.tickets;
create policy "auth_manage_tickets"
on public.tickets
for all
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "Allow generic access to remarks" on public.remarks;
drop policy if exists "Public remarks access" on public.remarks;
create policy "auth_manage_remarks"
on public.remarks
for all
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "Allow generic access to ticket_actions" on public.ticket_actions;
create policy "auth_manage_ticket_actions"
on public.ticket_actions
for all
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

-- Runner leaderboard: keep public read/insert, but constrain insert values.
drop policy if exists "Public insert access" on public.game_leaderboard;
create policy "Public constrained insert access"
on public.game_leaderboard
for insert
to public
with check (
  player_name is not null
  and char_length(btrim(player_name)) between 1 and 20
  and score between 0 and 10000000
);

-- Trading lessons: public read, service-role writes.
drop policy if exists "Enable insert for all users" on public.agent_lessons;
create policy "service_role_insert_agent_lessons"
on public.agent_lessons
for insert
to service_role
with check (true);

-- Health tables: owner-scoped access via health_twins.user_id.
drop policy if exists "Enable read access for all users - sessions" on public.health_chat_sessions;
drop policy if exists "Enable insert access for all users - sessions" on public.health_chat_sessions;
drop policy if exists "Enable update access for all users - sessions" on public.health_chat_sessions;
drop policy if exists "Enable delete access for all users - sessions" on public.health_chat_sessions;
create policy "auth_select_own_health_chat_sessions"
on public.health_chat_sessions
for select
to authenticated
using (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_chat_sessions.twin_id
      and ht.user_id = auth.uid()
  )
);
create policy "auth_insert_own_health_chat_sessions"
on public.health_chat_sessions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_chat_sessions.twin_id
      and ht.user_id = auth.uid()
  )
);
create policy "auth_update_own_health_chat_sessions"
on public.health_chat_sessions
for update
to authenticated
using (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_chat_sessions.twin_id
      and ht.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_chat_sessions.twin_id
      and ht.user_id = auth.uid()
  )
);
create policy "auth_delete_own_health_chat_sessions"
on public.health_chat_sessions
for delete
to authenticated
using (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_chat_sessions.twin_id
      and ht.user_id = auth.uid()
  )
);

drop policy if exists "Enable read access for all users - messages" on public.health_chat_messages;
drop policy if exists "Enable insert access for all users - messages" on public.health_chat_messages;
drop policy if exists "Enable update access for all users - messages" on public.health_chat_messages;
drop policy if exists "Enable delete access for all users - messages" on public.health_chat_messages;
create policy "auth_select_own_health_chat_messages"
on public.health_chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.health_chat_sessions s
    join public.health_twins ht on ht.id = s.twin_id
    where s.id = health_chat_messages.session_id
      and ht.user_id = auth.uid()
  )
);
create policy "auth_insert_own_health_chat_messages"
on public.health_chat_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.health_chat_sessions s
    join public.health_twins ht on ht.id = s.twin_id
    where s.id = health_chat_messages.session_id
      and ht.user_id = auth.uid()
  )
);
create policy "auth_update_own_health_chat_messages"
on public.health_chat_messages
for update
to authenticated
using (
  exists (
    select 1
    from public.health_chat_sessions s
    join public.health_twins ht on ht.id = s.twin_id
    where s.id = health_chat_messages.session_id
      and ht.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.health_chat_sessions s
    join public.health_twins ht on ht.id = s.twin_id
    where s.id = health_chat_messages.session_id
      and ht.user_id = auth.uid()
  )
);
create policy "auth_delete_own_health_chat_messages"
on public.health_chat_messages
for delete
to authenticated
using (
  exists (
    select 1
    from public.health_chat_sessions s
    join public.health_twins ht on ht.id = s.twin_id
    where s.id = health_chat_messages.session_id
      and ht.user_id = auth.uid()
  )
);

drop policy if exists "Enable read access for all users" on public.health_daily_aggregates;
drop policy if exists "Enable insert access for all users" on public.health_daily_aggregates;
drop policy if exists "Enable update access for all users" on public.health_daily_aggregates;
drop policy if exists "Enable delete access for all users" on public.health_daily_aggregates;
create policy "auth_select_own_health_daily_aggregates"
on public.health_daily_aggregates
for select
to authenticated
using (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_daily_aggregates.twin_id
      and ht.user_id = auth.uid()
  )
);
create policy "service_role_write_health_daily_aggregates"
on public.health_daily_aggregates
for all
to service_role
using (true)
with check (true);

drop policy if exists "Enable read access for all users - memories" on public.health_twin_memories;
drop policy if exists "Enable insert access for all users - memories" on public.health_twin_memories;
drop policy if exists "Enable update access for all users - memories" on public.health_twin_memories;
drop policy if exists "Enable delete access for all users - memories" on public.health_twin_memories;
create policy "auth_select_own_health_twin_memories"
on public.health_twin_memories
for select
to authenticated
using (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_twin_memories.twin_id
      and ht.user_id = auth.uid()
  )
);
create policy "service_role_write_health_twin_memories"
on public.health_twin_memories
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role full access" on public.health_wellness_programs;
create policy "service_role_manage_health_wellness_programs"
on public.health_wellness_programs
for all
to service_role
using (true)
with check (true);

-- Mind Coach tables: owner-scoped or service-role where appropriate.
drop policy if exists "Users can read own assessment scores" on public.mind_coach_assessment_scores;
drop policy if exists "Users can insert own assessment scores" on public.mind_coach_assessment_scores;
create policy "auth_select_own_mc_assessment_scores"
on public.mind_coach_assessment_scores
for select
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_assessment_scores.profile_id
      and p.user_id = auth.uid()
  )
);
create policy "auth_insert_own_mc_assessment_scores"
on public.mind_coach_assessment_scores
for insert
to authenticated
with check (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_assessment_scores.profile_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "public_select_mc_exercises" on public.mind_coach_exercises;
drop policy if exists "public_insert_mc_exercises" on public.mind_coach_exercises;
drop policy if exists "public_update_mc_exercises" on public.mind_coach_exercises;
drop policy if exists "public_delete_mc_exercises" on public.mind_coach_exercises;
create policy "auth_read_mc_exercises"
on public.mind_coach_exercises
for select
to authenticated
using (auth.uid() is not null);
create policy "service_role_manage_mc_exercises"
on public.mind_coach_exercises
for all
to service_role
using (true)
with check (true);

drop policy if exists "public_select_mc_guardrail_log" on public.mind_coach_guardrail_log;
drop policy if exists "public_insert_mc_guardrail_log" on public.mind_coach_guardrail_log;
drop policy if exists "public_update_mc_guardrail_log" on public.mind_coach_guardrail_log;
drop policy if exists "public_delete_mc_guardrail_log" on public.mind_coach_guardrail_log;
create policy "auth_select_own_mc_guardrail_log"
on public.mind_coach_guardrail_log
for select
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_sessions s
    join public.mind_coach_profiles p on p.id = s.profile_id
    where s.id = mind_coach_guardrail_log.session_id
      and p.user_id = auth.uid()
  )
);
create policy "service_role_write_mc_guardrail_log"
on public.mind_coach_guardrail_log
for all
to service_role
using (true)
with check (true);

drop policy if exists "public_select_mc_journal" on public.mind_coach_journal_entries;
drop policy if exists "public_insert_mc_journal" on public.mind_coach_journal_entries;
drop policy if exists "public_update_mc_journal" on public.mind_coach_journal_entries;
drop policy if exists "public_delete_mc_journal" on public.mind_coach_journal_entries;
drop policy if exists "public_select_mc_journal_entries" on public.mind_coach_journal_entries;
drop policy if exists "public_insert_mc_journal_entries" on public.mind_coach_journal_entries;
drop policy if exists "public_update_mc_journal_entries" on public.mind_coach_journal_entries;
drop policy if exists "public_delete_mc_journal_entries" on public.mind_coach_journal_entries;
create policy "auth_manage_own_mc_journal_entries"
on public.mind_coach_journal_entries
for all
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_journal_entries.profile_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_journal_entries.profile_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "public_select_mc_journey_sessions" on public.mind_coach_journey_sessions;
drop policy if exists "public_insert_mc_journey_sessions" on public.mind_coach_journey_sessions;
drop policy if exists "public_update_mc_journey_sessions" on public.mind_coach_journey_sessions;
drop policy if exists "public_delete_mc_journey_sessions" on public.mind_coach_journey_sessions;
create policy "auth_manage_own_mc_journey_sessions"
on public.mind_coach_journey_sessions
for all
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_journey_sessions.profile_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_journey_sessions.profile_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "public_select_mc_mood_entries" on public.mind_coach_mood_entries;
drop policy if exists "public_insert_mc_mood_entries" on public.mind_coach_mood_entries;
drop policy if exists "public_update_mc_mood_entries" on public.mind_coach_mood_entries;
drop policy if exists "public_delete_mc_mood_entries" on public.mind_coach_mood_entries;
create policy "auth_manage_own_mc_mood_entries"
on public.mind_coach_mood_entries
for all
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_mood_entries.profile_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_mood_entries.profile_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "public_select_mc_session_evaluations" on public.mind_coach_session_evaluations;
drop policy if exists "public_insert_mc_session_evaluations" on public.mind_coach_session_evaluations;
drop policy if exists "public_update_mc_session_evaluations" on public.mind_coach_session_evaluations;
drop policy if exists "public_delete_mc_session_evaluations" on public.mind_coach_session_evaluations;
create policy "auth_select_own_mc_session_evaluations"
on public.mind_coach_session_evaluations
for select
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_session_evaluations.profile_id
      and p.user_id = auth.uid()
  )
);
create policy "service_role_write_mc_session_evaluations"
on public.mind_coach_session_evaluations
for all
to service_role
using (true)
with check (true);

drop policy if exists "public_select_mc_session_templates" on public.mind_coach_session_templates;
drop policy if exists "public_insert_mc_session_templates" on public.mind_coach_session_templates;
drop policy if exists "public_update_mc_session_templates" on public.mind_coach_session_templates;
drop policy if exists "public_delete_mc_session_templates" on public.mind_coach_session_templates;
create policy "auth_read_mc_session_templates"
on public.mind_coach_session_templates
for select
to authenticated
using (auth.uid() is not null);
create policy "service_role_manage_mc_session_templates"
on public.mind_coach_session_templates
for all
to service_role
using (true)
with check (true);

drop policy if exists "public_select_mc_tasks" on public.mind_coach_user_tasks;
drop policy if exists "public_insert_mc_tasks" on public.mind_coach_user_tasks;
drop policy if exists "public_update_mc_tasks" on public.mind_coach_user_tasks;
drop policy if exists "public_delete_mc_tasks" on public.mind_coach_user_tasks;
create policy "auth_manage_own_mc_tasks"
on public.mind_coach_user_tasks
for all
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_user_tasks.profile_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_user_tasks.profile_id
      and p.user_id = auth.uid()
  )
);

-- RLS enabled/no-policy tables: add explicit service_role policies.
create policy "service_role_manage_fno_audit_logs"
on public.fno_audit_logs
for all
to service_role
using (true)
with check (true);

create policy "service_role_manage_fno_paper_trade_marks"
on public.fno_paper_trade_marks
for all
to service_role
using (true)
with check (true);

create policy "service_role_manage_mc_task_library"
on public.mind_coach_task_library
for all
to service_role
using (true)
with check (true);

create policy "service_role_manage_n8n_chat_histories"
on public.n8n_chat_histories
for all
to service_role
using (true)
with check (true);

-- ---------------------------------------------------------------------------
-- Storage policy hardening for public buckets
-- ---------------------------------------------------------------------------

drop policy if exists "Guide avatars are publicly accessible" on storage.objects;
drop policy if exists "Anyone can upload guide avatars" on storage.objects;
drop policy if exists "Anyone can update guide avatars" on storage.objects;

drop policy if exists "Public read access for health documents" on storage.objects;
create policy "Authenticated read own health documents"
on storage.objects
for select
to authenticated
using (bucket_id = 'health_documents' and owner = auth.uid());

drop policy if exists "Authenticated users can upload health documents" on storage.objects;
create policy "Authenticated users can upload health documents"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'health_documents' and owner = auth.uid());

drop policy if exists "Authenticated users can delete health documents" on storage.objects;
create policy "Authenticated users can delete health documents"
on storage.objects
for delete
to authenticated
using (bucket_id = 'health_documents' and owner = auth.uid());

create policy "Authenticated users can update own health documents"
on storage.objects
for update
to authenticated
using (bucket_id = 'health_documents' and owner = auth.uid())
with check (bucket_id = 'health_documents' and owner = auth.uid());

drop policy if exists "Public Access for health twin assets" on storage.objects;
drop policy if exists "Public Access" on storage.objects;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER function hardening
-- ---------------------------------------------------------------------------

do $$
begin
  execute 'alter function public.handle_new_user() set search_path = public, extensions';
exception when undefined_function then null;
end $$;

do $$
begin
  execute 'alter function public.handle_new_user_profile() set search_path = public, extensions';
exception when undefined_function then null;
end $$;

do $$
begin
  execute 'alter function public.handle_user_update_email() set search_path = public, extensions';
exception when undefined_function then null;
end $$;

do $$
begin
  execute 'alter function public.get_or_create_chat_session(uuid, uuid) set search_path = public, extensions';
exception when undefined_function then null;
end $$;

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.handle_new_user_profile() from anon, authenticated;
revoke execute on function public.handle_user_update_email() from anon, authenticated;
revoke execute on function public.get_or_create_chat_session(uuid, uuid) from anon, authenticated;
