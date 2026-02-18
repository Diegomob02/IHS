-- Add Stripe related columns to users
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS stripe_customer_id text,
ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'none', -- 'basic', 'premium', 'vip'
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'inactive'; -- 'active', 'past_due', 'canceled'

-- Add documents column to properties (if not exists)
-- Storing documents as JSONB array: [{id, name, url, date, type}]
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS documents jsonb DEFAULT '[]'::jsonb;
;
