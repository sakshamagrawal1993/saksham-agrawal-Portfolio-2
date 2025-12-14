-- Add description column to notebooks table
alter table public.notebooks
add column if not exists description text;
