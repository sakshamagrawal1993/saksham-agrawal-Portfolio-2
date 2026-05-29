-- Transactional RLS smoke test for the portfolio products touched by the
-- security hardening pass. It uses the latest Codex-created auth user and rolls
-- all product data back at the end.

begin;

create temp table smoke_ids as
select
  id as owner_id,
  gen_random_uuid() as other_id
from auth.users
where raw_user_meta_data->>'source' = 'codex-rls-smoke'
order by created_at desc
limit 1;

grant select on smoke_ids to authenticated;

select set_config('request.jwt.claim.sub', (select owner_id::text from smoke_ids), true);
set local role authenticated;

insert into public.profiles (id, full_name)
select owner_id, 'Codex RLS Smoke'
from smoke_ids
on conflict (id) do nothing;

create temp table smoke_ticket as
with inserted as (
  insert into public.tickets (id, title, description, customer_name, status, created_at, updated_at)
  values ('codex-rls-' || replace(gen_random_uuid()::text, '-', ''), 'Codex RLS smoke ticket', 'RLS smoke', 'Codex', 'Open', extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000)
  returning id
)
select id from inserted;

insert into public.remarks (id, ticket_id, author, text, timestamp, type)
select 'codex-remark-' || replace(gen_random_uuid()::text, '-', ''), id, 'Codex', 'Remark smoke', extract(epoch from now())::bigint * 1000, 'comment'
from smoke_ticket;

insert into public.ticket_actions (ticket_id, action, actor)
select id, 'created', 'Codex'
from smoke_ticket;

create temp table smoke_notebook as
with inserted as (
  insert into public.notebooks (user_id, title, emoji_icon, gradient_bg)
  select owner_id, 'Codex RLS smoke notebook', 'I', 'from-slate-500 to-teal-500'
  from smoke_ids
  returning id
)
select id from inserted;

create temp table smoke_source as
with inserted as (
  insert into public.sources (notebook_id, type, title, extracted_text)
  select id, 'text'::source_type, 'Codex smoke source', 'This source validates RLS writes.'
  from smoke_notebook
  returning id
)
select id from inserted;

create temp table smoke_chat_session as
with inserted as (
  insert into public.chat_sessions (notebook_id, title)
  select id, 'Codex smoke chat'
  from smoke_notebook
  returning id
)
select id from inserted;

insert into public.chat_messages (session_id, role, content, type)
select id, 'user', 'Does RLS allow notebook chat?', 'user_message'
from smoke_chat_session;

create temp table smoke_twin as
with inserted as (
  insert into public.health_twins (user_id, name, description, featured)
  select owner_id, 'Codex RLS Smoke Twin', 'Transactional smoke test twin', false
  from smoke_ids
  returning id
)
select id from inserted;

insert into public.health_personal_details (twin_id, name, age, gender, height_cm, weight_kg)
select id, 'Codex Health Smoke', 35, 'Male', 175, 72
from smoke_twin;

insert into public.health_summary (twin_id, summary_text)
select id, 'RLS smoke summary'
from smoke_twin;

create temp table smoke_health_source as
with inserted as (
  insert into public.health_sources (twin_id, source_type, source_name, status)
  select id, 'manual'::health_source_type, 'Codex smoke source', 'completed'::health_source_status
  from smoke_twin
  returning id
)
select id from inserted;

insert into public.health_lab_parameters (twin_id, source_id, parameter_name, parameter_value, unit)
select t.id, s.id, d.name, 24, coalesce(d.unit, '')
from smoke_twin t
cross join smoke_health_source s
cross join lateral (
  select name, unit
  from public.health_parameter_definitions
  order by name
  limit 1
) d;

insert into public.health_wearable_parameters (twin_id, source_id, parameter_name, parameter_value, unit, category)
select t.id, s.id, d.name, 7000, coalesce(d.unit, ''), 'activity'
from smoke_twin t
cross join smoke_health_source s
cross join lateral (
  select name, unit
  from public.health_parameter_definitions
  order by name
  limit 1
) d;

update public.health_twins
set featured = true
where id in (select id from smoke_twin);

create temp table smoke_mc_profile as
with inserted as (
  insert into public.mind_coach_profiles (user_id, name, age, gender, concerns, therapist_persona)
  select owner_id, 'Codex Mind Smoke', 31, 'Prefer not to say', '["Stress & Burnout"]'::jsonb, 'maya'
  from smoke_ids
  returning id
)
select id from inserted;

create temp table smoke_mc_journey as
with inserted as (
  insert into public.mind_coach_journeys (profile_id, title, description, phases, current_phase, active)
  select id, 'Codex discovery journey', 'RLS smoke journey', '[]'::jsonb, 1, true
  from smoke_mc_profile
  returning id
)
select id from inserted;

create temp table smoke_mc_session as
with inserted as (
  insert into public.mind_coach_sessions (profile_id, journey_id, phase_number, session_number, pathway, session_state, message_count)
  select p.id, j.id, 1, 1, 'engagement_rapport_and_assessment', 'active', 1
  from smoke_mc_profile p
  cross join smoke_mc_journey j
  returning id
)
select id from inserted;

insert into public.mind_coach_messages (session_id, role, content, guardrail_status)
select id, 'user', 'I am feeling stuck at work.', 'passed'
from smoke_mc_session;

insert into public.mind_coach_pathway_proposals (profile_id, session_id, proposed_pathway, confidence, source)
select p.id, s.id, 'cognitive_reframing', 0.82, 'codex-smoke'
from smoke_mc_profile p
cross join smoke_mc_session s;

insert into public.mind_coach_user_tasks (profile_id, session_id, task_name, task_description, task_frequency, status)
select p.id, s.id, 'Thought record', 'Write one thought record.', 'once', 'active'
from smoke_mc_profile p
cross join smoke_mc_session s;

select set_config('request.jwt.claim.sub', (select other_id::text from smoke_ids), true);

create temp table smoke_other_results as
select
  (select count(*)::int from smoke_ids) as auth_seed_users,
  (select count(*)::int from public.tickets where id in (select id from smoke_ticket)) as ticketflow_tickets_visible,
  (select count(*)::int from public.remarks where ticket_id in (select id from smoke_ticket)) as ticketflow_remarks_visible,
  (select count(*)::int from public.ticket_actions where ticket_id in (select id from smoke_ticket)) as ticketflow_actions_visible,
  (select count(*)::int from public.notebooks where id in (select id from smoke_notebook)) as insightslm_notebooks_visible_to_other_user,
  (select count(*)::int from public.health_personal_details where twin_id in (select id from smoke_twin)) as featured_health_details_visible_to_other_user,
  (select count(*)::int from public.health_lab_parameters where twin_id in (select id from smoke_twin)) as featured_health_labs_visible_to_other_user,
  (select count(*)::int from public.health_wearable_parameters where twin_id in (select id from smoke_twin)) as featured_health_wearables_visible_to_other_user;

select set_config('request.jwt.claim.sub', (select owner_id::text from smoke_ids), true);

select
  (select auth_seed_users from smoke_other_results) as auth_seed_users,
  (select ticketflow_tickets_visible from smoke_other_results) as ticketflow_tickets_visible,
  (select ticketflow_remarks_visible from smoke_other_results) as ticketflow_remarks_visible,
  (select ticketflow_actions_visible from smoke_other_results) as ticketflow_actions_visible,
  (select insightslm_notebooks_visible_to_other_user from smoke_other_results) as insightslm_notebooks_visible_to_other_user,
  (select featured_health_details_visible_to_other_user from smoke_other_results) as featured_health_details_visible_to_other_user,
  (select featured_health_labs_visible_to_other_user from smoke_other_results) as featured_health_labs_visible_to_other_user,
  (select featured_health_wearables_visible_to_other_user from smoke_other_results) as featured_health_wearables_visible_to_other_user,
  (select count(*)::int from public.sources where id in (select id from smoke_source)) as insightslm_sources_visible_to_owner,
  (select count(*)::int from public.chat_messages where session_id in (select id from smoke_chat_session)) as insightslm_chat_messages_visible_to_owner,
  (select count(*)::int from public.mind_coach_profiles where id in (select id from smoke_mc_profile)) as mindcoach_profile_visible_to_owner,
  (select count(*)::int from public.mind_coach_messages where session_id in (select id from smoke_mc_session)) as mindcoach_messages_visible_to_owner,
  (select count(*)::int from public.mind_coach_pathway_proposals where profile_id in (select id from smoke_mc_profile)) as mindcoach_pathway_proposals_visible_to_owner,
  (select count(*)::int from public.mind_coach_user_tasks where profile_id in (select id from smoke_mc_profile)) as mindcoach_tasks_visible_to_owner;

rollback;
