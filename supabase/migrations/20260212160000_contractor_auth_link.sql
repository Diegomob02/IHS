ALTER TABLE public.contractor_applications
  ADD COLUMN IF NOT EXISTS auth_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contractor_applications_auth_user_id ON public.contractor_applications(auth_user_id);
