INSERT INTO storage.buckets (id, name, public)
VALUES ('contract-templates', 'contract-templates', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Contract templates admin read" ON storage.objects;
CREATE POLICY "Contract templates admin read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'contract-templates'
  AND public.is_admin()
);

DROP POLICY IF EXISTS "Contract templates admin upload" ON storage.objects;
CREATE POLICY "Contract templates admin upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'contract-templates'
  AND public.is_admin()
);

DROP POLICY IF EXISTS "Contract templates admin delete" ON storage.objects;
CREATE POLICY "Contract templates admin delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'contract-templates'
  AND public.is_admin()
);
