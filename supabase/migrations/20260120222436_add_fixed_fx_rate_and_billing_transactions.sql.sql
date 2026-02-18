-- Fixed FX rate config + billing transaction log

CREATE TABLE IF NOT EXISTS public.fx_rate_configs (
  pair TEXT PRIMARY KEY,
  rate_micro BIGINT NOT NULL CHECK (rate_micro > 0),
  decimals INTEGER NOT NULL DEFAULT 6 CHECK (decimals BETWEEN 0 AND 12),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.fx_rate_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair TEXT NOT NULL REFERENCES public.fx_rate_configs(pair) ON DELETE CASCADE,
  old_rate_micro BIGINT NULL,
  new_rate_micro BIGINT NOT NULL,
  decimals INTEGER NOT NULL DEFAULT 6 CHECK (decimals BETWEEN 0 AND 12),
  note TEXT NULL,
  changed_by UUID NULL REFERENCES public.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NULL,
  stripe_customer_id TEXT NULL,
  stripe_session_id TEXT UNIQUE,
  stripe_subscription_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'completed', 'failed', 'canceled')),
  base_currency TEXT NOT NULL DEFAULT 'USD',
  base_amount_cents BIGINT NULL,
  charge_currency TEXT NOT NULL,
  charge_amount_cents BIGINT NULL,
  fx_pair TEXT NULL,
  fx_rate_micro BIGINT NULL,
  fx_decimals INTEGER NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_transactions_created_at_idx ON public.billing_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS billing_transactions_email_idx ON public.billing_transactions(email);
CREATE INDEX IF NOT EXISTS billing_transactions_customer_idx ON public.billing_transactions(stripe_customer_id);

ALTER TABLE public.fx_rate_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_rate_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "FX rate configs readable" ON public.fx_rate_configs;
CREATE POLICY "FX rate configs readable" ON public.fx_rate_configs
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "FX rate configs admin write" ON public.fx_rate_configs;
CREATE POLICY "FX rate configs admin write" ON public.fx_rate_configs
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "FX rate changes admin read" ON public.fx_rate_changes;
CREATE POLICY "FX rate changes admin read" ON public.fx_rate_changes
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "FX rate changes admin write" ON public.fx_rate_changes;
CREATE POLICY "FX rate changes admin write" ON public.fx_rate_changes
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Billing transactions readable" ON public.billing_transactions;
CREATE POLICY "Billing transactions readable" ON public.billing_transactions
  FOR SELECT USING (
    public.is_admin()
    OR (auth.jwt() ->> 'email') IS NOT NULL AND email = (auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS "Billing transactions insert own" ON public.billing_transactions;
CREATE POLICY "Billing transactions insert own" ON public.billing_transactions
  FOR INSERT WITH CHECK ((auth.jwt() ->> 'email') IS NOT NULL AND email = (auth.jwt() ->> 'email'));

CREATE OR REPLACE FUNCTION public.set_fixed_fx_rate(
  p_pair TEXT,
  p_rate NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rate_micro BIGINT;
  v_decimals INTEGER := 6;
  v_prev BIGINT;
  v_changed_by UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_pair IS NULL OR length(trim(p_pair)) = 0 THEN
    RAISE EXCEPTION 'pair required';
  END IF;

  IF p_rate IS NULL OR p_rate <= 0 THEN
    RAISE EXCEPTION 'rate must be > 0';
  END IF;

  v_rate_micro := round(p_rate * (10 ^ v_decimals))::bigint;
  IF v_rate_micro <= 0 THEN
    RAISE EXCEPTION 'invalid converted rate';
  END IF;

  SELECT rate_micro INTO v_prev FROM public.fx_rate_configs WHERE pair = p_pair;

  SELECT id INTO v_changed_by
  FROM public.users
  WHERE email = (auth.jwt() ->> 'email')
  LIMIT 1;

  INSERT INTO public.fx_rate_configs(pair, rate_micro, decimals, updated_at, updated_by)
  VALUES (p_pair, v_rate_micro, v_decimals, now(), v_changed_by)
  ON CONFLICT (pair) DO UPDATE
    SET rate_micro = EXCLUDED.rate_micro,
        decimals = EXCLUDED.decimals,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by;

  INSERT INTO public.fx_rate_changes(pair, old_rate_micro, new_rate_micro, decimals, note, changed_by)
  VALUES (p_pair, v_prev, v_rate_micro, v_decimals, p_note, v_changed_by);

  RETURN jsonb_build_object(
    'pair', p_pair,
    'rate_micro', v_rate_micro,
    'decimals', v_decimals
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_transactions_touch_updated_at ON public.billing_transactions;
CREATE TRIGGER billing_transactions_touch_updated_at
BEFORE UPDATE ON public.billing_transactions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.fx_rate_configs(pair, rate_micro, decimals)
VALUES ('USD_MXN', 17000000, 6)
ON CONFLICT (pair) DO NOTHING;

;
