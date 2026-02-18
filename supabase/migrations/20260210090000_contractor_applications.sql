CREATE TABLE IF NOT EXISTS public.contractor_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NULL,
  service_category TEXT NULL,
  service_description TEXT NULL,
  nda_template_path TEXT NOT NULL DEFAULT 'nda/260115 CARTA DE CONFIDENCIALIDAD.doc',
  nda_sent_at TIMESTAMPTZ NULL,
  nda_email_provider_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'nda_sent', 'reviewing', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contractor_applications_created_at ON public.contractor_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contractor_applications_email_lower ON public.contractor_applications((lower(email)));

ALTER TABLE public.contractor_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Contractor applications admin read" ON public.contractor_applications;
CREATE POLICY "Contractor applications admin read" ON public.contractor_applications
  FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Contractor applications admin write" ON public.contractor_applications;
CREATE POLICY "Contractor applications admin write" ON public.contractor_applications
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS contractor_applications_touch_updated_at ON public.contractor_applications;
CREATE TRIGGER contractor_applications_touch_updated_at
BEFORE UPDATE ON public.contractor_applications
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();

GRANT SELECT, UPDATE ON public.contractor_applications TO authenticated;
