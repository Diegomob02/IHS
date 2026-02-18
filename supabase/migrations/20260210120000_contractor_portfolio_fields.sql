ALTER TABLE public.contractor_applications
ADD COLUMN IF NOT EXISTS portfolio_links JSONB DEFAULT '[]'::jsonb;

