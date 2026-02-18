-- Fix RLS policies for financial_records to allow owners to view expenses based on property ownership
-- (including email matching for pre-signup linking)

DROP POLICY IF EXISTS "Users can view their own financial records" ON public.financial_records;

CREATE POLICY "Users can view their own financial records" ON public.financial_records
    FOR SELECT USING (
        public.is_admin() OR
        auth.uid() = owner_id OR
        EXISTS (
            SELECT 1 FROM public.properties 
            WHERE id = financial_records.property_id 
            AND (owner_id = auth.uid() OR owner_email = (auth.jwt() ->> 'email'))
        )
    );
