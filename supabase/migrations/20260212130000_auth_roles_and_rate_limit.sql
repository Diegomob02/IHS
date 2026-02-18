-- Roles mapping by email + login attempts for rate limiting and audit

CREATE TABLE IF NOT EXISTS public.user_roles (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('owner', 'contractor')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
  updated_by UUID NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_status ON public.user_roles(status);
CREATE INDEX IF NOT EXISTS idx_user_roles_email_lower ON public.user_roles((lower(email)));

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User roles self read" ON public.user_roles;
CREATE POLICY "User roles self read" ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (lower(email) = lower(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "User roles admin manage" ON public.user_roles;
CREATE POLICY "User roles admin manage" ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS user_roles_touch_updated_at ON public.user_roles;
CREATE TRIGGER user_roles_touch_updated_at
BEFORE UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();

CREATE TABLE IF NOT EXISTS public.auth_login_attempts (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NULL,
  ip TEXT NULL,
  portal TEXT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_created_at ON public.auth_login_attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_ip_created_at ON public.auth_login_attempts(ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_email_created_at ON public.auth_login_attempts((lower(email)), created_at DESC);

ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth login attempts admin read" ON public.auth_login_attempts;
CREATE POLICY "Auth login attempts admin read" ON public.auth_login_attempts
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

ALTER TABLE public.contractor_applications
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS approved_by UUID NULL REFERENCES public.users(id);

