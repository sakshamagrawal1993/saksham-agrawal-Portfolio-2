-- Performance hardening phase 2:
-- Optimize RLS predicates to reduce per-row auth function evaluation.
-- Main technique: wrap auth helpers in SELECT and simplify nested IN chains.

-- ---------------------------------------------------------------------------
-- Lightweight helper for admin checks in post policies
-- ---------------------------------------------------------------------------
create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(
    (
      select p.is_admin
      from public.profiles p
      where p.id = (select auth.uid())
      limit 1
    ),
    false
  );
$$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------
drop policy if exists "comments_authenticated_insert" on public.comments;
drop policy if exists "comments_owner_update" on public.comments;
drop policy if exists "comments_owner_delete" on public.comments;

create policy "comments_authenticated_insert"
on public.comments
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "comments_owner_update"
on public.comments
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "comments_owner_delete"
on public.comments
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- health_twins / notebooks
-- ---------------------------------------------------------------------------
drop policy if exists "health_twins_select_featured_or_owner" on public.health_twins;
drop policy if exists "health_twins_owner_insert" on public.health_twins;
drop policy if exists "health_twins_owner_update" on public.health_twins;
drop policy if exists "health_twins_owner_delete" on public.health_twins;

create policy "health_twins_select_featured_or_owner"
on public.health_twins
for select
to public
using (featured = true or (select auth.uid()) = user_id);

create policy "health_twins_owner_insert"
on public.health_twins
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "health_twins_owner_update"
on public.health_twins
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "health_twins_owner_delete"
on public.health_twins
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "notebooks_select_own_or_featured" on public.notebooks;
drop policy if exists "notebooks_owner_insert" on public.notebooks;
drop policy if exists "notebooks_owner_update" on public.notebooks;
drop policy if exists "notebooks_owner_delete" on public.notebooks;

create policy "notebooks_select_own_or_featured"
on public.notebooks
for select
to public
using ((select auth.uid()) = user_id or is_featured = true);

create policy "notebooks_owner_insert"
on public.notebooks
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "notebooks_owner_update"
on public.notebooks
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "notebooks_owner_delete"
on public.notebooks
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
drop policy if exists "posts_insert_author_or_admin" on public.posts;
drop policy if exists "posts_update_author_or_admin" on public.posts;
drop policy if exists "posts_delete_author_or_admin" on public.posts;

create policy "posts_insert_author_or_admin"
on public.posts
for insert
to authenticated
with check (
  (select auth.uid()) = author_id
  or public.current_user_is_admin()
);

create policy "posts_update_author_or_admin"
on public.posts
for update
to authenticated
using (
  (select auth.uid()) = author_id
  or public.current_user_is_admin()
)
with check (
  (select auth.uid()) = author_id
  or public.current_user_is_admin()
);

create policy "posts_delete_author_or_admin"
on public.posts
for delete
to authenticated
using (
  (select auth.uid()) = author_id
  or public.current_user_is_admin()
);

-- ---------------------------------------------------------------------------
-- mind_coach_profiles
-- ---------------------------------------------------------------------------
drop policy if exists "auth_select_mc_profiles" on public.mind_coach_profiles;
drop policy if exists "auth_insert_mc_profiles" on public.mind_coach_profiles;
drop policy if exists "auth_update_mc_profiles" on public.mind_coach_profiles;
drop policy if exists "auth_delete_mc_profiles" on public.mind_coach_profiles;

create policy "auth_select_mc_profiles"
on public.mind_coach_profiles
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "auth_insert_mc_profiles"
on public.mind_coach_profiles
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "auth_update_mc_profiles"
on public.mind_coach_profiles
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "auth_delete_mc_profiles"
on public.mind_coach_profiles
for delete
to authenticated
using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- mind_coach_journeys / sessions / memories / pathway proposals
-- ---------------------------------------------------------------------------
drop policy if exists "auth_select_mc_journeys" on public.mind_coach_journeys;
drop policy if exists "auth_insert_mc_journeys" on public.mind_coach_journeys;
drop policy if exists "auth_update_mc_journeys" on public.mind_coach_journeys;
drop policy if exists "auth_delete_mc_journeys" on public.mind_coach_journeys;

create policy "auth_select_mc_journeys"
on public.mind_coach_journeys
for select
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_journeys.profile_id
      and p.user_id = (select auth.uid())
  )
);

create policy "auth_insert_mc_journeys"
on public.mind_coach_journeys
for insert
to authenticated
with check (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_journeys.profile_id
      and p.user_id = (select auth.uid())
  )
);

create policy "auth_update_mc_journeys"
on public.mind_coach_journeys
for update
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_journeys.profile_id
      and p.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_journeys.profile_id
      and p.user_id = (select auth.uid())
  )
);

create policy "auth_delete_mc_journeys"
on public.mind_coach_journeys
for delete
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_journeys.profile_id
      and p.user_id = (select auth.uid())
  )
);

drop policy if exists "auth_select_mc_sessions" on public.mind_coach_sessions;
drop policy if exists "auth_insert_mc_sessions" on public.mind_coach_sessions;
drop policy if exists "auth_update_mc_sessions" on public.mind_coach_sessions;
drop policy if exists "auth_delete_mc_sessions" on public.mind_coach_sessions;

create policy "auth_select_mc_sessions"
on public.mind_coach_sessions
for select
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_sessions.profile_id
      and p.user_id = (select auth.uid())
  )
);

create policy "auth_insert_mc_sessions"
on public.mind_coach_sessions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_sessions.profile_id
      and p.user_id = (select auth.uid())
  )
);

create policy "auth_update_mc_sessions"
on public.mind_coach_sessions
for update
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_sessions.profile_id
      and p.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_sessions.profile_id
      and p.user_id = (select auth.uid())
  )
);

create policy "auth_delete_mc_sessions"
on public.mind_coach_sessions
for delete
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_sessions.profile_id
      and p.user_id = (select auth.uid())
  )
);

drop policy if exists "auth_select_mc_memories" on public.mind_coach_memories;
drop policy if exists "auth_insert_mc_memories" on public.mind_coach_memories;
drop policy if exists "auth_update_mc_memories" on public.mind_coach_memories;
drop policy if exists "auth_delete_mc_memories" on public.mind_coach_memories;

create policy "auth_select_mc_memories"
on public.mind_coach_memories
for select
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_memories.profile_id
      and p.user_id = (select auth.uid())
  )
);

create policy "auth_insert_mc_memories"
on public.mind_coach_memories
for insert
to authenticated
with check (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_memories.profile_id
      and p.user_id = (select auth.uid())
  )
);

create policy "auth_update_mc_memories"
on public.mind_coach_memories
for update
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_memories.profile_id
      and p.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_memories.profile_id
      and p.user_id = (select auth.uid())
  )
);

create policy "auth_delete_mc_memories"
on public.mind_coach_memories
for delete
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_memories.profile_id
      and p.user_id = (select auth.uid())
  )
);

drop policy if exists "auth_select_mc_pathway_proposals" on public.mind_coach_pathway_proposals;
drop policy if exists "auth_insert_mc_pathway_proposals" on public.mind_coach_pathway_proposals;
drop policy if exists "auth_update_mc_pathway_proposals" on public.mind_coach_pathway_proposals;
drop policy if exists "auth_delete_mc_pathway_proposals" on public.mind_coach_pathway_proposals;

create policy "auth_select_mc_pathway_proposals"
on public.mind_coach_pathway_proposals
for select
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_pathway_proposals.profile_id
      and p.user_id = (select auth.uid())
  )
);

create policy "auth_insert_mc_pathway_proposals"
on public.mind_coach_pathway_proposals
for insert
to authenticated
with check (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_pathway_proposals.profile_id
      and p.user_id = (select auth.uid())
  )
);

create policy "auth_update_mc_pathway_proposals"
on public.mind_coach_pathway_proposals
for update
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_pathway_proposals.profile_id
      and p.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_pathway_proposals.profile_id
      and p.user_id = (select auth.uid())
  )
);

create policy "auth_delete_mc_pathway_proposals"
on public.mind_coach_pathway_proposals
for delete
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_profiles p
    where p.id = mind_coach_pathway_proposals.profile_id
      and p.user_id = (select auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- mind_coach_messages (most expensive policy chain)
-- ---------------------------------------------------------------------------
drop policy if exists "auth_select_mc_messages" on public.mind_coach_messages;
drop policy if exists "auth_insert_mc_messages" on public.mind_coach_messages;
drop policy if exists "auth_update_mc_messages" on public.mind_coach_messages;
drop policy if exists "auth_delete_mc_messages" on public.mind_coach_messages;

create policy "auth_select_mc_messages"
on public.mind_coach_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_sessions s
    join public.mind_coach_profiles p on p.id = s.profile_id
    where s.id = mind_coach_messages.session_id
      and p.user_id = (select auth.uid())
  )
);

create policy "auth_insert_mc_messages"
on public.mind_coach_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.mind_coach_sessions s
    join public.mind_coach_profiles p on p.id = s.profile_id
    where s.id = mind_coach_messages.session_id
      and p.user_id = (select auth.uid())
  )
);

create policy "auth_update_mc_messages"
on public.mind_coach_messages
for update
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_sessions s
    join public.mind_coach_profiles p on p.id = s.profile_id
    where s.id = mind_coach_messages.session_id
      and p.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.mind_coach_sessions s
    join public.mind_coach_profiles p on p.id = s.profile_id
    where s.id = mind_coach_messages.session_id
      and p.user_id = (select auth.uid())
  )
);

create policy "auth_delete_mc_messages"
on public.mind_coach_messages
for delete
to authenticated
using (
  exists (
    select 1
    from public.mind_coach_sessions s
    join public.mind_coach_profiles p on p.id = s.profile_id
    where s.id = mind_coach_messages.session_id
      and p.user_id = (select auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- health_chat_sessions / health_chat_messages
-- ---------------------------------------------------------------------------
drop policy if exists "auth_select_own_health_chat_sessions" on public.health_chat_sessions;
drop policy if exists "auth_insert_own_health_chat_sessions" on public.health_chat_sessions;
drop policy if exists "auth_update_own_health_chat_sessions" on public.health_chat_sessions;
drop policy if exists "auth_delete_own_health_chat_sessions" on public.health_chat_sessions;

create policy "auth_select_own_health_chat_sessions"
on public.health_chat_sessions
for select
to authenticated
using (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_chat_sessions.twin_id
      and ht.user_id = (select auth.uid())
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
      and ht.user_id = (select auth.uid())
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
      and ht.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_chat_sessions.twin_id
      and ht.user_id = (select auth.uid())
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
      and ht.user_id = (select auth.uid())
  )
);

drop policy if exists "auth_select_own_health_chat_messages" on public.health_chat_messages;
drop policy if exists "auth_insert_own_health_chat_messages" on public.health_chat_messages;
drop policy if exists "auth_update_own_health_chat_messages" on public.health_chat_messages;
drop policy if exists "auth_delete_own_health_chat_messages" on public.health_chat_messages;

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
      and ht.user_id = (select auth.uid())
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
      and ht.user_id = (select auth.uid())
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
      and ht.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.health_chat_sessions s
    join public.health_twins ht on ht.id = s.twin_id
    where s.id = health_chat_messages.session_id
      and ht.user_id = (select auth.uid())
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
      and ht.user_id = (select auth.uid())
  )
);
