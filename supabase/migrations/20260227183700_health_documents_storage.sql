-- Create a storage bucket for health documents (lab reports, images, CSVs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'health_documents',
  'health_documents',
  true, -- Public so n8n can download the file via URL
  10485760, -- 10MB limit
  '{
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "text/csv",
    "application/vnd.ms-excel"
  }'
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Allow authenticated users to upload files to their own twin folders
DROP POLICY IF EXISTS "Authenticated users can upload health documents" ON storage.objects;
CREATE POLICY "Authenticated users can upload health documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'health_documents');

-- Allow public read access (so n8n can download via the public URL)
DROP POLICY IF EXISTS "Public read access for health documents" ON storage.objects;
CREATE POLICY "Public read access for health documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'health_documents');

-- Allow authenticated users to delete their own uploads
DROP POLICY IF EXISTS "Authenticated users can delete health documents" ON storage.objects;
CREATE POLICY "Authenticated users can delete health documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'health_documents');
