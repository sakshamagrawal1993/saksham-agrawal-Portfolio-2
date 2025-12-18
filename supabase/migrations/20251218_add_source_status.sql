-- Add status tracking for sources
do $$ begin
    create type processing_status as enum ('pending', 'processing', 'completed', 'failed');
exception
    when duplicate_object then null;
end $$;

alter table public.sources 
add column if not exists status processing_status default 'pending',
add column if not exists processing_error text;

-- Add index for faster queries on status
create index if not exists idx_sources_status on public.sources(status);
