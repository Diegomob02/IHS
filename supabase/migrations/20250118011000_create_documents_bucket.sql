-- Create a new storage bucket for documents if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Give Admins full access to documents
CREATE POLICY "Admins can upload documents"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'documents' AND public.is_admin());

CREATE POLICY "Admins can update documents"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'documents' AND public.is_admin());

CREATE POLICY "Admins can delete documents"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'documents' AND public.is_admin());

-- Policy: Anyone can view documents (Public Bucket access via getPublicUrl)
-- For higher security, we would make the bucket private and use Signed URLs,
-- but for now this matches the existing implementation pattern.
CREATE POLICY "Public Access to documents"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'documents');
