-- E2E regression fixes after RLS hardening.
-- Keep user-owned Health Twin writes private, while allowing signed-in users to
-- view dependent data for twins that have explicitly been marked featured.

drop policy if exists "featured_health_personal_details_select" on public.health_personal_details;
create policy "featured_health_personal_details_select"
on public.health_personal_details
for select
to authenticated
using (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_personal_details.twin_id
      and ht.featured = true
  )
);

drop policy if exists "featured_health_summary_select" on public.health_summary;
create policy "featured_health_summary_select"
on public.health_summary
for select
to authenticated
using (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_summary.twin_id
      and ht.featured = true
  )
);

drop policy if exists "featured_health_lab_parameters_select" on public.health_lab_parameters;
create policy "featured_health_lab_parameters_select"
on public.health_lab_parameters
for select
to authenticated
using (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_lab_parameters.twin_id
      and ht.featured = true
  )
);

drop policy if exists "featured_health_wearable_parameters_select" on public.health_wearable_parameters;
create policy "featured_health_wearable_parameters_select"
on public.health_wearable_parameters
for select
to authenticated
using (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_wearable_parameters.twin_id
      and ht.featured = true
  )
);

drop policy if exists "featured_health_scores_select" on public.health_scores;
create policy "featured_health_scores_select"
on public.health_scores
for select
to authenticated
using (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_scores.twin_id
      and ht.featured = true
  )
);

drop policy if exists "featured_health_recommendations_select" on public.health_recommendations;
create policy "featured_health_recommendations_select"
on public.health_recommendations
for select
to authenticated
using (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_recommendations.twin_id
      and ht.featured = true
  )
);

drop policy if exists "featured_health_sources_select" on public.health_sources;
create policy "featured_health_sources_select"
on public.health_sources
for select
to authenticated
using (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_sources.twin_id
      and ht.featured = true
  )
);

drop policy if exists "featured_health_daily_aggregates_select" on public.health_daily_aggregates;
create policy "featured_health_daily_aggregates_select"
on public.health_daily_aggregates
for select
to authenticated
using (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_daily_aggregates.twin_id
      and ht.featured = true
  )
);

drop policy if exists "auth_insert_own_health_daily_aggregates" on public.health_daily_aggregates;
create policy "auth_insert_own_health_daily_aggregates"
on public.health_daily_aggregates
for insert
to authenticated
with check (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_daily_aggregates.twin_id
      and ht.user_id = (select auth.uid())
  )
);

drop policy if exists "auth_update_own_health_daily_aggregates" on public.health_daily_aggregates;
create policy "auth_update_own_health_daily_aggregates"
on public.health_daily_aggregates
for update
to authenticated
using (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_daily_aggregates.twin_id
      and ht.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_daily_aggregates.twin_id
      and ht.user_id = (select auth.uid())
  )
);

drop policy if exists "featured_health_wellness_programs_select" on public.health_wellness_programs;
create policy "featured_health_wellness_programs_select"
on public.health_wellness_programs
for select
to authenticated
using (
  exists (
    select 1
    from public.health_twins ht
    where ht.id = health_wellness_programs.twin_id
      and ht.featured = true
  )
);
