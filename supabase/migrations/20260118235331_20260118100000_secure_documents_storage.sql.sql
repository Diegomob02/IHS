-- Secure documents storage: make bucket private and restrict reads to admins/owners

UPDATE storage.buckets
SET public = false
WHERE id = 'documents';

DROP POLICY IF EXISTS "Admins can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Public Access to documents" ON storage.objects;

CREATE POLICY "Admins can upload documents" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents' AND public.is_admin());

CREATE POLICY "Admins can update documents" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'documents' AND public.is_admin());

CREATE POLICY "Admins can delete documents" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'documents' AND public.is_admin());

CREATE POLICY "Owners can read documents" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        WHERE p.id::text = (storage.foldername(name))[1]
          AND (p.owner_id = auth.uid() OR p.owner_email = (auth.jwt() ->> 'email'))
      )
    )
  );
;
