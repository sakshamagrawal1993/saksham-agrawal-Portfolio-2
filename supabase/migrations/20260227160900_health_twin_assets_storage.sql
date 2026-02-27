-- Create a public bucket for health twin assets (like the 3D human mesh)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'health-twin-assets', 
  'health-twin-assets', 
  true, -- Make it public so anyone visiting the landing page can download the mesh
  52428800, -- 50MB
  '{
    "model/gltf-binary",
    "model/gltf+json",
    "application/octet-stream"
  }'
)
on conflict (id) do update set 
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Allow public read access (since the landing page is visible to anyone, or at least the authenticated user looking at it)
drop policy if exists "Public Access for health twin assets" on storage.objects;
create policy "Public Access for health twin assets"
on storage.objects for select
using ( bucket_id = 'health-twin-assets' );

-- Note: We intentionally DO NOT create an insert/update policy.
-- The user will manually upload `human.glb` via the Supabase Dashboard,
-- or we can use the service role key. This prevents arbitrary users from replacing the logo.
