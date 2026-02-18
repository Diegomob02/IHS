-- Create financial_records table
CREATE TABLE IF NOT EXISTS public.financial_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense')),
  category VARCHAR(50) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financials_property ON public.financial_records(property_id);
CREATE INDEX IF NOT EXISTS idx_financials_owner ON public.financial_records(owner_id);
CREATE INDEX IF NOT EXISTS idx_financials_date ON public.financial_records(date);

-- Enable RLS
ALTER TABLE public.financial_records ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own financial records" ON public.financial_records
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert their own financial records" ON public.financial_records
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
;
