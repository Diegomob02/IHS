CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  stripe_connected_account_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS client_id UUID NULL,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Mazatlan';

CREATE INDEX IF NOT EXISTS idx_properties_client_id ON public.properties(client_id);

CREATE TABLE IF NOT EXISTS public.leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL,
  tenant_id UUID NULL,
  rent_amount_cents BIGINT NOT NULL DEFAULT 0 CHECK (rent_amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency IN ('usd','mxn')),
  billing_day INT NOT NULL DEFAULT 1 CHECK (billing_day BETWEEN 1 AND 28),
  weekend_rule TEXT NOT NULL DEFAULT 'shift_to_next_business_day' CHECK (weekend_rule IN ('shift_to_next_business_day','shift_to_previous_business_day','no_shift')),
  autopay_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  autopay_status TEXT NOT NULL DEFAULT 'pending_method' CHECK (autopay_status IN ('active','pending_method','failing','paused')),
  autopay_retry_policy JSONB NOT NULL DEFAULT '{"max_attempts":3,"window_days":5}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leases_property_id ON public.leases(property_id);
CREATE INDEX IF NOT EXISTS idx_leases_tenant_id ON public.leases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leases_autopay_enabled ON public.leases(autopay_enabled);

CREATE TABLE IF NOT EXISTS public.tenant_payment_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  client_id UUID NOT NULL,
  stripe_customer_id TEXT NULL,
  default_payment_method_id TEXT NULL,
  payment_method_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'missing_method' CHECK (status IN ('active','pending','missing_method','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_payment_profiles_tenant_id ON public.tenant_payment_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_payment_profiles_client_id ON public.tenant_payment_profiles(client_id);

CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL,
  property_id UUID NOT NULL,
  client_id UUID NOT NULL,
  period_yyyymm TEXT NOT NULL,
  attempt_no INT NOT NULL DEFAULT 1 CHECK (attempt_no >= 1),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL CHECK (currency IN ('usd','mxn')),
  stripe_connected_account_id TEXT NOT NULL,
  stripe_payment_intent_id TEXT NULL,
  stripe_charge_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','processing','succeeded','failed','requires_action','canceled')),
  failure_code TEXT NULL,
  failure_message_safe TEXT NULL,
  initiated_by TEXT NOT NULL DEFAULT 'system' CHECK (initiated_by IN ('system','admin')),
  stripe_webhook_event_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lease_id, period_yyyymm, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_lease_id ON public.payment_attempts(lease_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_property_id ON public.payment_attempts(property_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_client_id ON public.payment_attempts(client_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_status ON public.payment_attempts(status);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_period ON public.payment_attempts(period_yyyymm);

ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT NULL;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_payment_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients readable" ON public.clients;
CREATE POLICY "Clients readable" ON public.clients
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Clients admin write" ON public.clients;
CREATE POLICY "Clients admin write" ON public.clients
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Leases readable" ON public.leases;
CREATE POLICY "Leases readable" ON public.leases
  FOR SELECT USING (
    public.is_admin()
    OR (tenant_id IS NOT NULL AND tenant_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = leases.property_id
        AND p.assigned_admin_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Leases admin write" ON public.leases;
CREATE POLICY "Leases admin write" ON public.leases
  FOR ALL USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = leases.property_id
        AND p.assigned_admin_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = leases.property_id
        AND p.assigned_admin_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tenant payment profiles readable" ON public.tenant_payment_profiles;
CREATE POLICY "Tenant payment profiles readable" ON public.tenant_payment_profiles
  FOR SELECT USING (
    public.is_admin()
    OR tenant_id = auth.uid()
  );

DROP POLICY IF EXISTS "Tenant payment profiles admin write" ON public.tenant_payment_profiles;
CREATE POLICY "Tenant payment profiles admin write" ON public.tenant_payment_profiles
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Payment attempts readable" ON public.payment_attempts;
CREATE POLICY "Payment attempts readable" ON public.payment_attempts
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.leases l
      WHERE l.id = payment_attempts.lease_id
        AND l.tenant_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = payment_attempts.property_id
        AND p.assigned_admin_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Payment attempts admin write" ON public.payment_attempts;
CREATE POLICY "Payment attempts admin write" ON public.payment_attempts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS clients_touch_updated_at ON public.clients;
CREATE TRIGGER clients_touch_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS leases_touch_updated_at ON public.leases;
CREATE TRIGGER leases_touch_updated_at
BEFORE UPDATE ON public.leases
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS tenant_payment_profiles_touch_updated_at ON public.tenant_payment_profiles;
CREATE TRIGGER tenant_payment_profiles_touch_updated_at
BEFORE UPDATE ON public.tenant_payment_profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS payment_attempts_touch_updated_at ON public.payment_attempts;
CREATE TRIGGER payment_attempts_touch_updated_at
BEFORE UPDATE ON public.payment_attempts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_payment_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_attempts TO authenticated;

DROP TABLE IF EXISTS public.billing_plan_changes CASCADE;
DROP TABLE IF EXISTS public.billing_invoices CASCADE;
DROP TABLE IF EXISTS public.billing_contracts CASCADE;
DROP TABLE IF EXISTS public.billing_accounts CASCADE;
DROP TABLE IF EXISTS public.billing_plans CASCADE;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS subscription_tier,
  DROP COLUMN IF EXISTS subscription_status;

;
