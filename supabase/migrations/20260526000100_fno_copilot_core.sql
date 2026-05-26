create extension if not exists "pgcrypto";

do $$
begin
  create type fno_job_state as enum ('queued', 'running', 'waiting_input', 'completed', 'failed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type fno_trade_state as enum ('draft', 'paper_open', 'paper_closed', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type fno_workflow_type as enum ('find_trade', 'create_algo_strategy', 'top5_refresh', 'backtest', 'paper_mark', 'journal');
exception
  when duplicate_object then null;
end $$;

create table if not exists fno_instruments (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  name text not null,
  exchange text not null default 'NSE',
  segment text not null default 'NFO',
  lot_size integer not null,
  tick_size numeric not null default 0.05,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists fno_option_contracts (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references fno_instruments(id) on delete cascade,
  trading_symbol text not null,
  expiry_date date not null,
  strike numeric not null,
  option_type text not null check (option_type in ('CE', 'PE')),
  upstox_instrument_key text,
  lot_size integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (instrument_id, expiry_date, strike, option_type)
);

create table if not exists fno_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references fno_instruments(id) on delete cascade,
  snapshot_ts timestamptz not null,
  spot numeric not null,
  previous_close numeric,
  regime text,
  source text not null default 'demo',
  quality_flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists fno_option_chain_snapshots (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references fno_instruments(id) on delete cascade,
  expiry_date date not null,
  snapshot_ts timestamptz not null,
  source text not null default 'demo',
  quality_flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists fno_option_quotes (
  id uuid primary key default gen_random_uuid(),
  chain_snapshot_id uuid not null references fno_option_chain_snapshots(id) on delete cascade,
  contract_id uuid references fno_option_contracts(id) on delete set null,
  strike numeric not null,
  option_type text not null check (option_type in ('CE', 'PE')),
  bid numeric,
  ask numeric,
  ltp numeric,
  volume bigint,
  open_interest bigint,
  open_interest_change bigint,
  implied_volatility numeric,
  delta numeric,
  gamma numeric,
  theta numeric,
  vega numeric,
  rho numeric,
  quote_ts timestamptz not null
);

create table if not exists fno_derived_parameters (
  id uuid primary key default gen_random_uuid(),
  chain_snapshot_id uuid not null references fno_option_chain_snapshots(id) on delete cascade,
  pcr_oi numeric,
  pcr_volume numeric,
  max_pain numeric,
  call_wall numeric,
  put_wall numeric,
  expected_move_straddle numeric,
  expected_move_iv numeric,
  atm_iv numeric,
  skew numeric,
  term_slope numeric,
  liquidity_score numeric,
  quote_age_sec integer,
  quality_flags jsonb not null default '[]'::jsonb,
  model_version text not null default 'chain-v0.1',
  created_at timestamptz not null default now()
);

create table if not exists fno_trade_candidates (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references fno_instruments(id) on delete cascade,
  chain_snapshot_id uuid references fno_option_chain_snapshots(id) on delete set null,
  expiry_date date not null,
  rank integer not null,
  title text not null,
  strategy_name text not null,
  direction text not null,
  legs jsonb not null,
  score numeric not null,
  score_breakdown jsonb not null,
  max_profit numeric,
  max_loss numeric,
  breakevens jsonb not null default '[]'::jsonb,
  payoff jsonb not null default '[]'::jsonb,
  thesis text not null,
  quality_flags jsonb not null default '[]'::jsonb,
  rejection_reasons jsonb not null default '[]'::jsonb,
  model_version text not null default 'top5-v0.1',
  created_at timestamptz not null default now()
);

create table if not exists fno_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  workflow_type fno_workflow_type not null,
  state fno_job_state not null default 'queued',
  instrument_id uuid references fno_instruments(id) on delete set null,
  expiry_date date,
  messages jsonb not null default '[]'::jsonb,
  missing_inputs jsonb not null default '[]'::jsonb,
  final_artifact_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fno_user_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  chat_session_id uuid references fno_chat_sessions(id) on delete set null,
  candidate_id uuid references fno_trade_candidates(id) on delete set null,
  state fno_trade_state not null default 'draft',
  title text not null,
  strategy_name text not null,
  legs jsonb not null,
  filters jsonb not null default '[]'::jsonb,
  entry_rules jsonb not null default '[]'::jsonb,
  exit_rules jsonb not null default '[]'::jsonb,
  risk_rules jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '{}'::jsonb,
  max_profit numeric,
  max_loss numeric,
  educational_disclaimer boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fno_algo_strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  chat_session_id uuid references fno_chat_sessions(id) on delete set null,
  name text not null,
  universe jsonb not null default '{}'::jsonb,
  filters jsonb not null default '[]'::jsonb,
  entry_rules jsonb not null default '[]'::jsonb,
  exit_rules jsonb not null default '[]'::jsonb,
  risk_rules jsonb not null default '[]'::jsonb,
  backtest_plan jsonb not null default '{}'::jsonb,
  paper_trade_plan jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fno_backtest_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  algo_strategy_id uuid references fno_algo_strategies(id) on delete set null,
  state fno_job_state not null default 'queued',
  assumptions jsonb not null,
  data_version text not null default 'demo-v0.1',
  model_version text not null default 'backtest-v0.1',
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists fno_paper_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_trade_id uuid references fno_user_trades(id) on delete set null,
  state fno_trade_state not null default 'paper_open',
  entry_snapshot jsonb not null,
  latest_mark jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists fno_paper_trade_marks (
  id uuid primary key default gen_random_uuid(),
  paper_trade_id uuid not null references fno_paper_trades(id) on delete cascade,
  mark_ts timestamptz not null default now(),
  mark_payload jsonb not null,
  pnl numeric,
  created_at timestamptz not null default now()
);

create table if not exists fno_workflow_logs (
  id uuid primary key default gen_random_uuid(),
  workflow_type fno_workflow_type not null,
  entity_id uuid,
  user_id uuid,
  state fno_job_state not null,
  message text not null,
  detail jsonb not null default '{}'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now()
);

create table if not exists fno_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  request_id text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_fno_contracts_lookup on fno_option_contracts (instrument_id, expiry_date, strike, option_type);
create index if not exists idx_fno_chain_snapshots_latest on fno_option_chain_snapshots (instrument_id, expiry_date, snapshot_ts desc);
create index if not exists idx_fno_trade_candidates_latest on fno_trade_candidates (instrument_id, expiry_date, created_at desc, rank);
create index if not exists idx_fno_chat_sessions_user on fno_chat_sessions (user_id, created_at desc);
create index if not exists idx_fno_workflow_logs_entity on fno_workflow_logs (entity_id, created_at desc);

alter table fno_instruments enable row level security;
alter table fno_option_contracts enable row level security;
alter table fno_market_snapshots enable row level security;
alter table fno_option_chain_snapshots enable row level security;
alter table fno_option_quotes enable row level security;
alter table fno_derived_parameters enable row level security;
alter table fno_trade_candidates enable row level security;
alter table fno_chat_sessions enable row level security;
alter table fno_user_trades enable row level security;
alter table fno_algo_strategies enable row level security;
alter table fno_backtest_runs enable row level security;
alter table fno_paper_trades enable row level security;
alter table fno_paper_trade_marks enable row level security;
alter table fno_workflow_logs enable row level security;
alter table fno_audit_logs enable row level security;

do $$
begin
  create policy "Public read active instruments" on fno_instruments for select using (is_active = true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Public read market data" on fno_option_contracts for select using (true);
  create policy "Public read market snapshots" on fno_market_snapshots for select using (true);
  create policy "Public read chain snapshots" on fno_option_chain_snapshots for select using (true);
  create policy "Public read option quotes" on fno_option_quotes for select using (true);
  create policy "Public read derived parameters" on fno_derived_parameters for select using (true);
  create policy "Public read trade candidates" on fno_trade_candidates for select using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users read own chat sessions" on fno_chat_sessions for select using (auth.uid() = user_id);
  create policy "Users read own trades" on fno_user_trades for select using (auth.uid() = user_id);
  create policy "Users read own strategies" on fno_algo_strategies for select using (auth.uid() = user_id);
  create policy "Users read own backtests" on fno_backtest_runs for select using (auth.uid() = user_id);
  create policy "Users read own paper trades" on fno_paper_trades for select using (auth.uid() = user_id);
  create policy "Users read own workflow logs" on fno_workflow_logs for select using (auth.uid() = user_id or user_id is null);
exception when duplicate_object then null;
end $$;

insert into fno_instruments (symbol, name, exchange, segment, lot_size, tick_size)
values
  ('NIFTY', 'Nifty 50 Index Options', 'NSE', 'NFO', 50, 0.05),
  ('BANKNIFTY', 'Nifty Bank Index Options', 'NSE', 'NFO', 15, 0.05)
on conflict (symbol) do update
set name = excluded.name,
    lot_size = excluded.lot_size,
    is_active = true;
