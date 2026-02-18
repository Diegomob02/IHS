-- Add missing columns to contractor_applications
ALTER TABLE public.contractor_applications 
ADD COLUMN IF NOT EXISTS experience_years TEXT,
ADD COLUMN IF NOT EXISTS work_references JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS certification_documents JSONB DEFAULT '[]'::jsonb;

-- Allow public (anon) to insert into contractor_applications
DROP POLICY IF EXISTS "Contractor applications public insert" ON public.contractor_applications;
CREATE POLICY "Contractor applications public insert" ON public.contractor_applications
  FOR INSERT
  WITH CHECK (true);

-- Allow admins to delete (if needed)
DROP POLICY IF EXISTS "Contractor applications admin delete" ON public.contractor_applications;
CREATE POLICY "Contractor applications admin delete" ON public.contractor_applications
  FOR DELETE
  USING (public.is_admin());
