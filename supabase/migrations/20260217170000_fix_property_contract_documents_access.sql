ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS contract_path text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

UPDATE public.properties
SET contract_path = regexp_replace(
  contract_url,
  '^.*?/storage/v1/object/(public|sign)/documents/',
  ''
)
WHERE contract_path IS NULL
  AND contract_url IS NOT NULL
  AND contract_url LIKE '%/storage/v1/object/%/documents/%';

DROP POLICY IF EXISTS "Owners can read documents" ON storage.objects;

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
        WHERE (
          p.id::text = (storage.foldername(name))[1]
          OR p.contract_path = name
          OR (p.contract_url IS NOT NULL AND p.contract_url LIKE '%' || '/documents/' || name)
        )
        AND (p.owner_id = auth.uid() OR p.owner_email = (auth.jwt() ->> 'email'))
      )
    )
  );
