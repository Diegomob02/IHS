ALTER TABLE public.billing_contracts
  ADD COLUMN IF NOT EXISTS charge_currency TEXT NOT NULL DEFAULT 'usd' CHECK (charge_currency IN ('usd','mxn'));

ALTER TABLE public.billing_contracts
  ADD COLUMN IF NOT EXISTS fx_mode TEXT NOT NULL DEFAULT 'fixed' CHECK (fx_mode IN ('fixed','intelligent'));

ALTER TABLE public.billing_contracts
  ADD COLUMN IF NOT EXISTS fx_rate_micro_override BIGINT NULL CHECK (fx_rate_micro_override IS NULL OR fx_rate_micro_override > 0);

ALTER TABLE public.billing_contracts
  ADD COLUMN IF NOT EXISTS fx_decimals_override INT NULL CHECK (fx_decimals_override IS NULL OR (fx_decimals_override BETWEEN 0 AND 12));

CREATE INDEX IF NOT EXISTS idx_billing_contracts_account_id ON public.billing_contracts(account_id);
CREATE INDEX IF NOT EXISTS idx_billing_contracts_owner_email ON public.billing_contracts(owner_email);

;
