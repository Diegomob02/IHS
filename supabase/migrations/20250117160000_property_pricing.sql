-- Add custom pricing and contract status to properties
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS monthly_fee numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS contract_status text DEFAULT 'pending'; -- 'pending', 'signed', 'active'

-- Optional: Remove subscription columns from users if we are fully moving to property-based
-- We will keep them for now to avoid breaking existing code immediately, but they will be deprecated visually.
