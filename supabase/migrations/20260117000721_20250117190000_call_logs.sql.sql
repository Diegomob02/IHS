-- Create Call Logs table for CRM
CREATE TABLE IF NOT EXISTS public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES auth.users(id),
  outcome TEXT NOT NULL, -- 'interested', 'more_info', 'quote_sent', 'contract_sent', 'platform_onboarding', 'sold', 'no_answer', 'voicemail', 'wrong_number'
  notes TEXT,
  duration INTEGER DEFAULT 0, -- in seconds (manual entry or calculated if we had real VoIP integration)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users (agents/admins) to view and insert call logs
CREATE POLICY "Allow agents to view call logs"
ON public.call_logs FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow agents to create call logs"
ON public.call_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- Update status check constraint on leads table if it exists, or we just trust the app logic.
-- Ideally we would alter the check constraint to allow new statuses, but since we used text, we are fine.
-- Just documenting the new statuses:
-- 'new', 'contacted', 'qualified', 'negotiation', 'contract_sent', 'converted' (sold), 'lost', 'platform_onboarding'
;
