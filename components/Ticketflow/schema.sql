-- Create the table for Tickets
create table public.tickets (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  status text not null default 'Open' check (status in ('Open', 'In Progress', 'Resolved', 'Closed')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by text
);

-- Create the table for Remarks
create table public.remarks (
  id uuid default gen_random_uuid() primary key,
  ticket_id uuid references public.tickets(id) on delete cascade not null,
  author text not null,
  text text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create the table for Actions (Audit Log)
create table public.ticket_actions (
  id uuid default gen_random_uuid() primary key,
  ticket_id uuid references public.tickets(id) on delete cascade not null,
  action text not null,
  actor text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS) is recommended, but for this demo/portfolio, we can leave it public or basic.
-- For now, let's allow public access to make the demo work easily without complex auth policies initially.
alter table public.tickets enable row level security;
alter table public.remarks enable row level security;
alter table public.ticket_actions enable row level security;

-- Policy to allow all access (You'd restrict this in a real production app)
create policy "Allow all access to tickets" on public.tickets for all using (true) with check (true);
create policy "Allow all access to remarks" on public.remarks for all using (true) with check (true);
create policy "Allow all access to ticket_actions" on public.ticket_actions for all using (true) with check (true);
