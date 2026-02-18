-- Enforce non-negative monthly_fee

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_monthly_fee_non_negative;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_monthly_fee_non_negative CHECK (monthly_fee >= 0);
