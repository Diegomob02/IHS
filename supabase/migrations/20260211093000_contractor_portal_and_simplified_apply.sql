ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'tenant', 'admin', 'super_admin', 'contractor'));

ALTER TABLE public.contractor_applications
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public.contractor_applications
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT,
  ADD COLUMN IF NOT EXISTS company_name TEXT;

CREATE INDEX IF NOT EXISTS idx_contractor_applications_phone ON public.contractor_applications(phone);
CREATE INDEX IF NOT EXISTS idx_contractor_applications_whatsapp_phone ON public.contractor_applications(whatsapp_phone);

CREATE TABLE IF NOT EXISTS public.contractor_invites (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.contractor_applications(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  used_at TIMESTAMPTZ NULL,
  used_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_contractor_invites_application_id ON public.contractor_invites(application_id);
CREATE INDEX IF NOT EXISTS idx_contractor_invites_used_at ON public.contractor_invites(used_at);

ALTER TABLE public.contractor_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Contractor invites admin read" ON public.contractor_invites;
CREATE POLICY "Contractor invites admin read" ON public.contractor_invites
  FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Contractor invites admin write" ON public.contractor_invites;
CREATE POLICY "Contractor invites admin write" ON public.contractor_invites
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractor_invites TO authenticated;

CREATE TABLE IF NOT EXISTS public.contractor_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  application_id UUID NULL UNIQUE REFERENCES public.contractor_applications(id) ON DELETE SET NULL,
  full_name TEXT NULL,
  phone TEXT NULL,
  whatsapp_phone TEXT NULL,
  company_name TEXT NULL,
  billing_legal_name TEXT NULL,
  billing_tax_id TEXT NULL,
  billing_email TEXT NULL,
  billing_address TEXT NULL,
  billing_bank_account TEXT NULL,
  billing_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contractor_profiles_company_name ON public.contractor_profiles(company_name);

ALTER TABLE public.contractor_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Contractors can view own profile" ON public.contractor_profiles;
CREATE POLICY "Contractors can view own profile" ON public.contractor_profiles
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Contractors can update own profile" ON public.contractor_profiles;
CREATE POLICY "Contractors can update own profile" ON public.contractor_profiles
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage contractor profiles" ON public.contractor_profiles;
CREATE POLICY "Admins can manage contractor profiles" ON public.contractor_profiles
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS contractor_profiles_touch_updated_at ON public.contractor_profiles;
CREATE TRIGGER contractor_profiles_touch_updated_at
BEFORE UPDATE ON public.contractor_profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();

GRANT SELECT, INSERT, UPDATE ON public.contractor_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.consume_contractor_invite(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite RECORD;
  v_app RECORD;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT *
  INTO v_invite
  FROM public.contractor_invites
  WHERE token = p_token
  LIMIT 1;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'invalid invite';
  END IF;

  IF v_invite.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite already used';
  END IF;

  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'invite expired';
  END IF;

  SELECT *
  INTO v_app
  FROM public.contractor_applications
  WHERE id = v_invite.application_id
  LIMIT 1;

  IF v_app IS NULL THEN
    RAISE EXCEPTION 'application not found';
  END IF;

  IF v_app.status <> 'approved' THEN
    RAISE EXCEPTION 'application not approved';
  END IF;

  UPDATE public.contractor_invites
  SET used_at = now(),
      used_by_user_id = v_user_id
  WHERE token = p_token;

  UPDATE public.users
  SET role = 'contractor',
      name = COALESCE(NULLIF(v_app.full_name, ''), name),
      updated_at = now()
  WHERE id = v_user_id;

  INSERT INTO public.contractor_profiles (
    user_id,
    application_id,
    full_name,
    phone,
    whatsapp_phone,
    company_name
  )
  VALUES (
    v_user_id,
    v_app.id,
    v_app.full_name,
    v_app.phone,
    v_app.whatsapp_phone,
    v_app.company_name
  )
  ON CONFLICT (user_id) DO UPDATE
    SET application_id = EXCLUDED.application_id,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        whatsapp_phone = EXCLUDED.whatsapp_phone,
        company_name = EXCLUDED.company_name,
        updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'application_id', v_app.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_contractor_invite(UUID) TO authenticated;

