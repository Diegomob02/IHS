-- Create leads table for CRM
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  source TEXT DEFAULT 'contact_form', -- 'evaluation', 'contact_form'
  status TEXT DEFAULT 'new', -- 'new', 'contacted', 'qualified', 'converted', 'lost'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Allow public inserts (for contact forms)
CREATE POLICY "Allow public inserts to leads"
ON public.leads FOR INSERT
WITH CHECK (true);

-- Allow admins (authenticated users for now in this MVP context) to view/edit leads
-- In a stricter setup, we would check for role='admin'
CREATE POLICY "Allow authenticated view leads"
ON public.leads FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated update leads"
ON public.leads FOR UPDATE
TO authenticated
USING (true);
;
