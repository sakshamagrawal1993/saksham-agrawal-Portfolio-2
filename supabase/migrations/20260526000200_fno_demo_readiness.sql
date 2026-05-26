alter type fno_workflow_type add value if not exists 'ask_ai';
alter type fno_workflow_type add value if not exists 'create_trade';
alter type fno_workflow_type add value if not exists 'option_screener';
alter type fno_workflow_type add value if not exists 'market_insight';
alter type fno_workflow_type add value if not exists 'trade_analysis';

alter table fno_trade_candidates add column if not exists pop numeric;
alter table fno_trade_candidates add column if not exists market_view text;
alter table fno_trade_candidates add column if not exists risk_profile text;
alter table fno_trade_candidates add column if not exists source_context jsonb not null default '{}'::jsonb;
alter table fno_trade_candidates add column if not exists data_mode text not null default 'demo';

alter table fno_chat_sessions add column if not exists user_mode text;
alter table fno_chat_sessions add column if not exists context_payload jsonb not null default '{}'::jsonb;
alter table fno_chat_sessions add column if not exists ai_artifact jsonb not null default '{}'::jsonb;

alter table fno_user_trades add column if not exists source_type text not null default 'ai_or_platform';
alter table fno_user_trades add column if not exists analysis_payload jsonb not null default '{}'::jsonb;
alter table fno_user_trades add column if not exists pop numeric;
alter table fno_user_trades add column if not exists data_mode text not null default 'demo';

alter table fno_algo_strategies add column if not exists raw_ai_spec jsonb not null default '{}'::jsonb;
alter table fno_algo_strategies add column if not exists validated_spec jsonb not null default '{}'::jsonb;
alter table fno_algo_strategies add column if not exists validation_flags jsonb not null default '[]'::jsonb;
alter table fno_algo_strategies add column if not exists data_mode text not null default 'demo';

create table if not exists fno_dashboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_ts timestamptz not null default now(),
  source text not null default 'demo',
  mode text not null default 'excel_static',
  market_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists fno_index_snapshots (
  id uuid primary key default gen_random_uuid(),
  dashboard_snapshot_id uuid references fno_dashboard_snapshots(id) on delete cascade,
  symbol text not null,
  spot numeric not null,
  change numeric,
  change_pct numeric,
  pcr_oi numeric,
  atm_iv numeric,
  build_up text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists fno_fii_dii_activity (
  id uuid primary key default gen_random_uuid(),
  activity_date date not null default current_date,
  fii_cash numeric,
  dii_cash numeric,
  fii_index_futures jsonb not null default '{}'::jsonb,
  fii_index_options jsonb not null default '{}'::jsonb,
  source text not null default 'demo',
  created_at timestamptz not null default now()
);

create table if not exists fno_activity_leaders (
  id uuid primary key default gen_random_uuid(),
  snapshot_ts timestamptz not null default now(),
  bucket text not null,
  option_type text not null check (option_type in ('CE', 'PE')),
  symbol text not null,
  strike numeric,
  expiry_date date,
  price numeric,
  open_interest bigint,
  open_interest_change_pct numeric,
  volume bigint,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists fno_news_items (
  id uuid primary key default gen_random_uuid(),
  published_at timestamptz not null default now(),
  title text not null,
  summary text,
  source text not null default 'demo',
  symbols text[] not null default '{}',
  impact text not null default 'medium',
  url text,
  created_at timestamptz not null default now()
);

create table if not exists fno_event_calendar (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  title text not null,
  symbols text[] not null default '{}',
  event_type text not null default 'market',
  impact text not null default 'medium',
  warning text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists fno_contract_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  symbol text not null,
  expiry_date date,
  selected_tab text not null default 'overview',
  view_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fno_trade_analysis_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  candidate_id uuid references fno_trade_candidates(id) on delete set null,
  user_trade_id uuid references fno_user_trades(id) on delete set null,
  symbol text not null,
  strategy_name text not null,
  legs jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  ai_suggestions jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fno_screener_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null,
  source_type text not null default 'manual',
  filters jsonb not null default '{}'::jsonb,
  sort_rules jsonb not null default '[]'::jsonb,
  is_saved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fno_screener_runs (
  id uuid primary key default gen_random_uuid(),
  screener_id uuid references fno_screener_definitions(id) on delete set null,
  user_id uuid,
  run_ts timestamptz not null default now(),
  result_count integer not null default 0,
  results jsonb not null default '[]'::jsonb,
  data_version text not null default 'demo-v0.1',
  created_at timestamptz not null default now()
);

create table if not exists fno_ai_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  workflow_type fno_workflow_type not null,
  screen_context text,
  symbol text,
  state fno_job_state not null default 'waiting_input',
  messages jsonb not null default '[]'::jsonb,
  extracted_spec jsonb not null default '{}'::jsonb,
  missing_inputs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fno_ai_artifacts (
  id uuid primary key default gen_random_uuid(),
  ai_session_id uuid references fno_ai_sessions(id) on delete cascade,
  user_id uuid,
  artifact_type text not null check (artifact_type in ('answer', 'trade', 'algo_strategy', 'screener')),
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  validation_flags jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists fno_algo_form_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  ai_session_id uuid references fno_ai_sessions(id) on delete set null,
  algo_strategy_id uuid references fno_algo_strategies(id) on delete set null,
  form_payload jsonb not null default '{}'::jsonb,
  validation_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fno_algo_strategy_versions (
  id uuid primary key default gen_random_uuid(),
  algo_strategy_id uuid not null references fno_algo_strategies(id) on delete cascade,
  version integer not null,
  spec jsonb not null default '{}'::jsonb,
  change_note text,
  created_at timestamptz not null default now(),
  unique (algo_strategy_id, version)
);

create table if not exists fno_trade_versions (
  id uuid primary key default gen_random_uuid(),
  user_trade_id uuid not null references fno_user_trades(id) on delete cascade,
  version integer not null,
  spec jsonb not null default '{}'::jsonb,
  change_note text,
  created_at timestamptz not null default now(),
  unique (user_trade_id, version)
);

create index if not exists idx_fno_activity_leaders_bucket on fno_activity_leaders (bucket, option_type, snapshot_ts desc);
create index if not exists idx_fno_events_date on fno_event_calendar (event_date, impact);
create index if not exists idx_fno_news_published on fno_news_items (published_at desc);
create index if not exists idx_fno_screener_runs_user on fno_screener_runs (user_id, run_ts desc);
create index if not exists idx_fno_ai_sessions_user on fno_ai_sessions (user_id, created_at desc);
create index if not exists idx_fno_trade_analysis_user on fno_trade_analysis_sessions (user_id, created_at desc);

alter table fno_dashboard_snapshots enable row level security;
alter table fno_index_snapshots enable row level security;
alter table fno_fii_dii_activity enable row level security;
alter table fno_activity_leaders enable row level security;
alter table fno_news_items enable row level security;
alter table fno_event_calendar enable row level security;
alter table fno_contract_workspaces enable row level security;
alter table fno_trade_analysis_sessions enable row level security;
alter table fno_screener_definitions enable row level security;
alter table fno_screener_runs enable row level security;
alter table fno_ai_sessions enable row level security;
alter table fno_ai_artifacts enable row level security;
alter table fno_algo_form_drafts enable row level security;
alter table fno_algo_strategy_versions enable row level security;
alter table fno_trade_versions enable row level security;

do $$
begin
  create policy "Public read dashboard snapshots" on fno_dashboard_snapshots for select using (true);
  create policy "Public read index snapshots" on fno_index_snapshots for select using (true);
  create policy "Public read fii dii activity" on fno_fii_dii_activity for select using (true);
  create policy "Public read activity leaders" on fno_activity_leaders for select using (true);
  create policy "Public read news items" on fno_news_items for select using (true);
  create policy "Public read event calendar" on fno_event_calendar for select using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users read own contract workspaces" on fno_contract_workspaces for select using (auth.uid() = user_id);
  create policy "Users insert own contract workspaces" on fno_contract_workspaces for insert with check (auth.uid() = user_id);
  create policy "Users update own contract workspaces" on fno_contract_workspaces for update using (auth.uid() = user_id);
  create policy "Users read own trade analysis" on fno_trade_analysis_sessions for select using (auth.uid() = user_id);
  create policy "Users read own screener definitions" on fno_screener_definitions for select using (auth.uid() = user_id);
  create policy "Users read own screener runs" on fno_screener_runs for select using (auth.uid() = user_id);
  create policy "Users read own AI sessions" on fno_ai_sessions for select using (auth.uid() = user_id);
  create policy "Users read own AI artifacts" on fno_ai_artifacts for select using (auth.uid() = user_id);
  create policy "Users read own algo form drafts" on fno_algo_form_drafts for select using (auth.uid() = user_id);
  create policy "Users read own trade versions" on fno_trade_versions for select using (
    exists (select 1 from fno_user_trades t where t.id = user_trade_id and t.user_id = auth.uid())
  );
  create policy "Users read own algo versions" on fno_algo_strategy_versions for select using (
    exists (select 1 from fno_algo_strategies s where s.id = algo_strategy_id and s.user_id = auth.uid())
  );
exception when duplicate_object then null;
end $$;
