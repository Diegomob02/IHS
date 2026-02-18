-- Add assignment to leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id);

-- Create Chat Messages table for WhatsApp integration
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL, -- 'lead' (client) or 'agent' (employee)
  sender_id UUID, -- NULL if it's the lead (identified by lead_id), User UUID if agent
  content TEXT NOT NULL,
  platform TEXT DEFAULT 'whatsapp', -- 'whatsapp', 'email', 'system'
  external_id TEXT, -- WhatsApp Message ID (from n8n)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users (agents/admins) to view and send messages
CREATE POLICY "Allow agents to view messages"
ON public.chat_messages FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow agents to send messages"
ON public.chat_messages FOR INSERT
TO authenticated
WITH CHECK (true);
;
