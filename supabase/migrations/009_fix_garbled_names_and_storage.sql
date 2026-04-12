-- ============================================================================
-- 009_fix_garbled_names_and_storage.sql
-- Fix garbled/mojibake user names for legacy/pilot accounts
-- Add file_url column to submittals for external link attachments
-- Create storage bucket for submittal attachments (200 MB support)
-- ============================================================================

-- ── Fix garbled user names (pilot/legacy accounts) ───────────────────────
-- These accounts were seeded with UTF-8 Arabic names that got corrupted.
-- We update them to correct Arabic and English names.

UPDATE users SET
  full_name     = 'System Admin',
  full_name_ar  = 'مدير النظام'
WHERE email = 'admin@edgs.gov.sa'
  AND (full_name IS NULL OR full_name NOT LIKE 'System%');

UPDATE users SET
  full_name     = 'Ahmed Al-Rashidi',
  full_name_ar  = 'أحمد الراشدي'
WHERE email = 'pm@sdm.gov.sa'
  AND (full_name_ar IS NULL OR full_name_ar = '' OR full_name_ar LIKE '%Ù%' OR full_name_ar LIKE '%Ø%');

UPDATE users SET
  full_name     = 'Fahad Al-Otaibi',
  full_name_ar  = 'فهد العتيبي'
WHERE email = 'coordinator@sdm.gov.sa'
  AND (full_name_ar IS NULL OR full_name_ar = '' OR full_name_ar LIKE '%Ù%' OR full_name_ar LIKE '%Ø%');

UPDATE users SET
  full_name     = 'Dr. Khalid Al-Saud',
  full_name_ar  = 'د. خالد آل سعود'
WHERE email = 'owner@sdm.gov.sa'
  AND (full_name_ar IS NULL OR full_name_ar = '' OR full_name_ar LIKE '%Ù%' OR full_name_ar LIKE '%Ø%');

UPDATE users SET
  full_name     = 'Sara Al-Zahrani',
  full_name_ar  = 'سارة الزهراني'
WHERE email = 'consultant@design.sa'
  AND (full_name_ar IS NULL OR full_name_ar = '' OR full_name_ar LIKE '%Ù%' OR full_name_ar LIKE '%Ø%');

-- ── Add file_url column for external link/shared-drive attachments ───────
ALTER TABLE submittals
  ADD COLUMN IF NOT EXISTS file_url TEXT DEFAULT NULL;

COMMENT ON COLUMN submittals.file_url IS
  'Optional URL to an external file (shared drive link, cloud storage URL, etc.)';

-- ── Add file_attachment_path for Supabase Storage uploads ───────────────
ALTER TABLE submittals
  ADD COLUMN IF NOT EXISTS file_attachment_path TEXT DEFAULT NULL;

COMMENT ON COLUMN submittals.file_attachment_path IS
  'Supabase Storage path for the uploaded file (bucket: submittal-attachments)';

-- ── Ensure Supabase Storage bucket exists for submittal attachments ──────
-- Note: Supabase Storage buckets are managed via the dashboard or API,
-- not via SQL migrations. The following INSERT is a convenience that works
-- on Supabase's internal storage.objects metadata, but the recommended
-- approach is to create the bucket via the Supabase Dashboard:
--   Storage → New Bucket → "submittal-attachments" → Public: OFF → File size limit: 200MB
--
-- If the bucket already exists this is a no-op thanks to ON CONFLICT.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'submittal-attachments',
  'submittal-attachments',
  false,
  209715200,  -- 200 MB in bytes
  ARRAY[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/dwg', 'application/acad', 'application/x-dwg',
    'application/x-autocad',
    'application/octet-stream',
    'model/vnd.rvt',
    'application/ifc',
    'application/zip',
    'text/plain', 'text/csv'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── RLS policies for the storage bucket ──────────────────────────────────
-- PostgreSQL does NOT support CREATE POLICY IF NOT EXISTS.
-- Use DROP IF EXISTS + CREATE for safe idempotent execution.

-- Allow authenticated users to upload to their own folder
DROP POLICY IF EXISTS "Authenticated users can upload submittal attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload submittal attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'submittal-attachments');

-- Allow authenticated users to read any submittal attachment
DROP POLICY IF EXISTS "Authenticated users can read submittal attachments" ON storage.objects;
CREATE POLICY "Authenticated users can read submittal attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'submittal-attachments');

-- Allow users to delete their own uploads
DROP POLICY IF EXISTS "Users can delete own submittal attachments" ON storage.objects;
CREATE POLICY "Users can delete own submittal attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'submittal-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
