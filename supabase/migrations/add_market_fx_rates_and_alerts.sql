-- Market FX rates (for intelligent billing decisions)

CREATE TABLE IF NOT EXISTS public.market_fx_rates (
  pair TEXT PRIMARY KEY,
  rate_micro BIGINT NOT NULL CHECK (rate_micro > 0),
  decimals INTEGER NOT NULL DEFAULT 6 CHECK (decimals BETWEEN 0 AND 12),
  as_of DATE NULL,
  source TEXT NOT NULL DEFAULT 'frankfurter',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.market_fx_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Market FX readable" ON public.market_fx_rates;
CREATE POLICY "Market FX readable" ON public.market_fx_rates
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Market FX admin write" ON public.market_fx_rates;
CREATE POLICY "Market FX admin write" ON public.market_fx_rates
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed a default row so the app has a predictable key.
INSERT INTO public.market_fx_rates(pair, rate_micro, decimals, source)
VALUES ('USD_MXN', 17000000, 6, 'seed')
ON CONFLICT (pair) DO NOTHING;

