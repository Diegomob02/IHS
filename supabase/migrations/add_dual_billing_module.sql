-- Dual billing module: fixed subscription + manual monthly payments

CREATE TABLE IF NOT EXISTS public.billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NULL,
  fixed_fee_usd_cents BIGINT NOT NULL DEFAULT 0 CHECK (fixed_fee_usd_cents >= 0),
  fixed_review_months INT NOT NULL DEFAULT 3 CHECK (fixed_review_months BETWEEN 1 AND 12),
  default_long_term_discount_pct NUMERIC NOT NULL DEFAULT 0 CHECK (default_long_term_discount_pct >= 0 AND default_long_term_discount_pct <= 0.5),
  variable_base_usd_cents BIGINT NOT NULL DEFAULT 0 CHECK (variable_base_usd_cents >= 0),
  variable_rule_type TEXT NOT NULL DEFAULT 'manual' CHECK (variable_rule_type IN ('manual', 'percentage', 'table')),
  variable_rule_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NULL,
  name TEXT NOT NULL,
  owner_email TEXT NULL,
  owner_user_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(property_id)
);

CREATE TABLE IF NOT EXISTS public.billing_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  owner_email TEXT NULL,
  plan_id UUID NOT NULL,
  modality TEXT NOT NULL CHECK (modality IN ('fixed', 'variable')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'canceled')),
  effective_at DATE NOT NULL DEFAULT CURRENT_DATE,
  review_next_at DATE NULL,
  long_term_commitment_months INT NOT NULL DEFAULT 0 CHECK (long_term_commitment_months BETWEEN 0 AND 60),
  discount_pct NUMERIC NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 0.5),
  deposit_pct NUMERIC NOT NULL DEFAULT 0.2 CHECK (deposit_pct >= 0 AND deposit_pct <= 1),
  deposit_required_usd_cents BIGINT NOT NULL DEFAULT 0 CHECK (deposit_required_usd_cents >= 0),
  deposit_status TEXT NOT NULL DEFAULT 'pending' CHECK (deposit_status IN ('pending', 'paid', 'waived')),
  stripe_customer_id TEXT NULL,
  stripe_subscription_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id)
);

CREATE TABLE IF NOT EXISTS public.billing_plan_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL,
  from_plan_id UUID NULL,
  to_plan_id UUID NOT NULL,
  requested_by UUID NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_at DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'applied', 'canceled')),
  note TEXT NULL
);

CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  owner_email TEXT NULL,
  period_yyyymm TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deposit', 'variable')),
  base_usd_cents BIGINT NOT NULL CHECK (base_usd_cents >= 0),
  charge_currency TEXT NOT NULL,
  charge_amount_cents BIGINT NOT NULL CHECK (charge_amount_cents >= 0),
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'void', 'overdue')),
  stripe_session_id TEXT NULL UNIQUE,
  stripe_payment_intent_id TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, period_yyyymm, kind)
);

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plan_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Billing plans readable" ON public.billing_plans;
CREATE POLICY "Billing plans readable" ON public.billing_plans
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Billing plans admin write" ON public.billing_plans;
CREATE POLICY "Billing plans admin write" ON public.billing_plans
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Billing accounts readable" ON public.billing_accounts;
CREATE POLICY "Billing accounts readable" ON public.billing_accounts
  FOR SELECT USING (
    public.is_admin()
    OR (owner_email IS NOT NULL AND owner_email = (auth.jwt() ->> 'email'))
  );

DROP POLICY IF EXISTS "Billing accounts admin write" ON public.billing_accounts;
CREATE POLICY "Billing accounts admin write" ON public.billing_accounts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Billing contracts readable" ON public.billing_contracts;
CREATE POLICY "Billing contracts readable" ON public.billing_contracts
  FOR SELECT USING (
    public.is_admin()
    OR (owner_email IS NOT NULL AND owner_email = (auth.jwt() ->> 'email'))
  );

DROP POLICY IF EXISTS "Billing contracts admin write" ON public.billing_contracts;
CREATE POLICY "Billing contracts admin write" ON public.billing_contracts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Billing plan changes readable" ON public.billing_plan_changes;
CREATE POLICY "Billing plan changes readable" ON public.billing_plan_changes
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Billing plan changes admin write" ON public.billing_plan_changes;
CREATE POLICY "Billing plan changes admin write" ON public.billing_plan_changes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Billing invoices readable" ON public.billing_invoices;
CREATE POLICY "Billing invoices readable" ON public.billing_invoices
  FOR SELECT USING (
    public.is_admin()
    OR (owner_email IS NOT NULL AND owner_email = (auth.jwt() ->> 'email'))
  );

DROP POLICY IF EXISTS "Billing invoices admin write" ON public.billing_invoices;
CREATE POLICY "Billing invoices admin write" ON public.billing_invoices
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.touch_updated_at_generic()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_plans_touch_updated_at ON public.billing_plans;
CREATE TRIGGER billing_plans_touch_updated_at
BEFORE UPDATE ON public.billing_plans
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS billing_accounts_touch_updated_at ON public.billing_accounts;
CREATE TRIGGER billing_accounts_touch_updated_at
BEFORE UPDATE ON public.billing_accounts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS billing_contracts_touch_updated_at ON public.billing_contracts;
CREATE TRIGGER billing_contracts_touch_updated_at
BEFORE UPDATE ON public.billing_contracts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS billing_invoices_touch_updated_at ON public.billing_invoices;
CREATE TRIGGER billing_invoices_touch_updated_at
BEFORE UPDATE ON public.billing_invoices
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();

GRANT SELECT ON public.billing_plans TO authenticated;
GRANT SELECT ON public.billing_accounts TO authenticated;
GRANT SELECT ON public.billing_contracts TO authenticated;
GRANT SELECT ON public.billing_plan_changes TO authenticated;
GRANT SELECT ON public.billing_invoices TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.billing_plans TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.billing_accounts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.billing_contracts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.billing_plan_changes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.billing_invoices TO authenticated;

INSERT INTO public.billing_plans (
  name,
  description,
  fixed_fee_usd_cents,
  fixed_review_months,
  default_long_term_discount_pct,
  variable_base_usd_cents,
  variable_rule_type,
  variable_rule_value,
  is_active
)
VALUES
  ('Tasa Fija Estimada', 'Suscripción con revisión trimestral.', 90000, 3, 0.10, 0, 'manual', '{}'::jsonb, TRUE),
  ('Tasa Variable Mensual', 'Pago mensual manual (sin suscripción).', 0, 3, 0, 90000, 'manual', '{}'::jsonb, TRUE)
ON CONFLICT DO NOTHING;

