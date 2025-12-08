-- Create the leaderboard table
create table if not exists public.game_leaderboard (
  id uuid default gen_random_uuid() primary key,
  player_name text not null,
  score int not null,
  created_at timestamptz default now()
);

-- Index for fast ranking
create index if not exists idx_leaderboard_score on public.game_leaderboard (score desc);

-- RLS: Public read/write (simplest for this game demo)
alter table public.game_leaderboard enable row level security;

-- Allow anyone to read the leaderboard
create policy "Public read access" on public.game_leaderboard for select using (true);

-- Allow anyone to insert a score
create policy "Public insert access" on public.game_leaderboard for insert with check (true);
