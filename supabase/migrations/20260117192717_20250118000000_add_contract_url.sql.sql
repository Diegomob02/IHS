-- Add contract_url column to properties table
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS contract_url TEXT;
;
