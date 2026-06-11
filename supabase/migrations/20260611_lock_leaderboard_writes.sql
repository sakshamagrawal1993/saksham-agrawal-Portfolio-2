-- Apply this ONLY after the new frontend (which submits scores via the
-- submit-score Edge Function) is deployed. It removes anonymous INSERT on
-- game_leaderboard so scores can no longer be forged with a raw REST/curl call
-- using the public anon key. Reads stay public; writes go through the function
-- (service role), which validates each score against a server-issued round.

drop policy if exists "Public constrained insert access" on public.game_leaderboard;
drop policy if exists "Public insert access" on public.game_leaderboard;

-- (Optional) explicit service-role write policy. The Edge Function uses the
-- service role which already bypasses RLS; this is here for clarity.
drop policy if exists "service_role_insert_leaderboard" on public.game_leaderboard;
create policy "service_role_insert_leaderboard"
on public.game_leaderboard
for insert
to service_role
with check (true);
