-- Create maintenance_logs table
CREATE TABLE IF NOT EXISTS public.maintenance_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    content TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    cost NUMERIC DEFAULT 0,
    log_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;

-- Policies
-- Admins and Super Admins can manage all logs
CREATE POLICY "Admins can manage logs" ON public.maintenance_logs
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'super_admin')
        )
    );

-- Owners can view logs for their properties
CREATE POLICY "Owners can view logs" ON public.maintenance_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE properties.id = maintenance_logs.property_id
            AND properties.owner_id = auth.uid()
        )
    );

-- Grant permissions
GRANT ALL ON public.maintenance_logs TO authenticated;
GRANT SELECT ON public.maintenance_logs TO anon;
