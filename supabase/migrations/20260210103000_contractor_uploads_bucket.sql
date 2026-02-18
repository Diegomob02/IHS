INSERT INTO storage.buckets (id, name, public)
VALUES ('contractor-uploads', 'contractor-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Allow public to upload (since they are applicants, maybe authenticated anonymously or just public?)
-- Ideally, we use the anon key.
DROP POLICY IF EXISTS "Contractor uploads public insert" ON storage.objects;
CREATE POLICY "Contractor uploads public insert"
ON storage.objects FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'contractor-uploads'
);
-- Note: 'public' role includes anon. But usually we need 'anon' specifically or 'public' covers all. 
-- In Supabase 'public' is a schema, role is 'anon' or 'authenticated'.
-- Let's grant to 'anon'.

DROP POLICY IF EXISTS "Contractor uploads anon insert" ON storage.objects;
CREATE POLICY "Contractor uploads anon insert"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'contractor-uploads'
);

-- Only admin can read
DROP POLICY IF EXISTS "Contractor uploads admin read" ON storage.objects;
CREATE POLICY "Contractor uploads admin read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'contractor-uploads'
  AND public.is_admin()
);
