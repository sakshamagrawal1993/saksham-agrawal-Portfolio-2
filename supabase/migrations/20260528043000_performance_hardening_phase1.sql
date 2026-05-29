-- Performance hardening phase 1:
-- 1) reduce overlapping permissive policies on key tables
-- 2) add missing indexes on high-value foreign keys

-- ---------------------------------------------------------------------------
-- Policy consolidation: public.posts
-- ---------------------------------------------------------------------------
drop policy if exists "Admins can manage posts" on public.posts;
drop policy if exists "Authors can do everything on their posts" on public.posts;
drop policy if exists "Public can view published posts" on public.posts;
drop policy if exists "Posts are public" on public.posts;

create policy "posts_public_select"
on public.posts
for select
to public
using (true);

create policy "posts_insert_author_or_admin"
on public.posts
for insert
to authenticated
with check (
  auth.uid() = author_id
  or (
    (select p.is_admin from public.profiles p where p.id = auth.uid()) = true
  )
);

create policy "posts_update_author_or_admin"
on public.posts
for update
to authenticated
using (
  auth.uid() = author_id
  or (
    (select p.is_admin from public.profiles p where p.id = auth.uid()) = true
  )
)
with check (
  auth.uid() = author_id
  or (
    (select p.is_admin from public.profiles p where p.id = auth.uid()) = true
  )
);

create policy "posts_delete_author_or_admin"
on public.posts
for delete
to authenticated
using (
  auth.uid() = author_id
  or (
    (select p.is_admin from public.profiles p where p.id = auth.uid()) = true
  )
);

-- ---------------------------------------------------------------------------
-- Policy consolidation: public.comments
-- ---------------------------------------------------------------------------
drop policy if exists "Public can view comments" on public.comments;
drop policy if exists "Authenticated users can comment" on public.comments;
drop policy if exists "Users can edit/delete their own comments" on public.comments;

create policy "comments_public_select"
on public.comments
for select
to public
using (true);

create policy "comments_authenticated_insert"
on public.comments
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "comments_owner_update"
on public.comments
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "comments_owner_delete"
on public.comments
for delete
to authenticated
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Policy consolidation: public.health_twins
-- ---------------------------------------------------------------------------
drop policy if exists "Anyone can view featured twins" on public.health_twins;
drop policy if exists "Users can manage their own health twins" on public.health_twins;

create policy "health_twins_select_featured_or_owner"
on public.health_twins
for select
to public
using (featured = true or auth.uid() = user_id);

create policy "health_twins_owner_insert"
on public.health_twins
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "health_twins_owner_update"
on public.health_twins
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "health_twins_owner_delete"
on public.health_twins
for delete
to authenticated
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Policy consolidation: public.notebooks
-- ---------------------------------------------------------------------------
drop policy if exists "Users can create their own notebooks" on public.notebooks;
drop policy if exists "Users can delete their own notebooks" on public.notebooks;
drop policy if exists "Users can update their own notebooks" on public.notebooks;
drop policy if exists "Users can view own or featured notebooks" on public.notebooks;
drop policy if exists "Users can view their own notebooks" on public.notebooks;

create policy "notebooks_select_own_or_featured"
on public.notebooks
for select
to public
using (auth.uid() = user_id or is_featured = true);

create policy "notebooks_owner_insert"
on public.notebooks
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "notebooks_owner_update"
on public.notebooks
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "notebooks_owner_delete"
on public.notebooks
for delete
to authenticated
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Foreign key indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_agent_lessons_session_id
  on public.agent_lessons(session_id);
create index if not exists idx_agent_lessons_source_session_id
  on public.agent_lessons(source_session_id);

create index if not exists idx_chat_sessions_notebook_id
  on public.chat_sessions(notebook_id);

create index if not exists idx_comments_post_id
  on public.comments(post_id);
create index if not exists idx_comments_user_id
  on public.comments(user_id);

create index if not exists idx_fno_option_quotes_chain_snapshot_id
  on public.fno_option_quotes(chain_snapshot_id);
create index if not exists idx_fno_option_quotes_contract_id
  on public.fno_option_quotes(contract_id);

create index if not exists idx_fno_trade_analysis_sessions_candidate_id
  on public.fno_trade_analysis_sessions(candidate_id);
create index if not exists idx_fno_trade_analysis_sessions_user_trade_id
  on public.fno_trade_analysis_sessions(user_trade_id);

create index if not exists idx_fno_user_trades_candidate_id
  on public.fno_user_trades(candidate_id);
create index if not exists idx_fno_user_trades_chat_session_id
  on public.fno_user_trades(chat_session_id);

create index if not exists idx_health_lab_parameters_parameter_name
  on public.health_lab_parameters(parameter_name);
create index if not exists idx_health_lab_parameters_source_id
  on public.health_lab_parameters(source_id);
create index if not exists idx_health_lab_parameters_twin_id
  on public.health_lab_parameters(twin_id);

create index if not exists idx_health_wearable_parameters_parameter_name
  on public.health_wearable_parameters(parameter_name);
create index if not exists idx_health_wearable_parameters_source_id
  on public.health_wearable_parameters(source_id);
create index if not exists idx_health_wearable_parameters_twin_id
  on public.health_wearable_parameters(twin_id);

create index if not exists idx_notebooks_user_id
  on public.notebooks(user_id);
