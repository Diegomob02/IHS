-- Add assigned_admin_id to properties
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS assigned_admin_id UUID REFERENCES public.users(id);

-- Create app_settings table for global configurations
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_by UUID REFERENCES public.users(id)
);

-- Enable RLS on app_settings
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Policies for app_settings
CREATE POLICY "Super Admins can manage settings" ON public.app_settings
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Everyone can read settings" ON public.app_settings
    FOR SELECT
    TO authenticated
    USING (true);

-- Function to auto-assign leads and properties
CREATE OR REPLACE FUNCTION public.auto_assign_resources()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    setting_record RECORD;
    timeout_hours INT;
    strategy TEXT;
    admin_record RECORD;
    target_admin_id UUID;
    unassigned_prop RECORD;
    unassigned_lead RECORD;
BEGIN
    -- Get settings
    SELECT value INTO setting_record FROM public.app_settings WHERE key = 'auto_assignment_config';
    
    IF setting_record IS NULL THEN
        RETURN; -- No config, do nothing
    END IF;

    timeout_hours := (setting_record.value->>'timeout_hours')::INT;
    strategy := setting_record.value->>'strategy'; -- 'load_balance' or 'round_robin'
    
    -- Default to 24 hours if not set
    IF timeout_hours IS NULL THEN timeout_hours := 24; END IF;

    -- 1. Process Properties
    FOR unassigned_prop IN 
        SELECT * FROM public.properties 
        WHERE assigned_admin_id IS NULL 
        AND created_at < NOW() - (timeout_hours || ' hours')::INTERVAL
    LOOP
        target_admin_id := NULL;

        IF strategy = 'load_balance' THEN
            -- Find admin with fewest assigned properties
            SELECT u.id INTO target_admin_id
            FROM public.users u
            LEFT JOIN public.properties p ON p.assigned_admin_id = u.id
            WHERE u.role IN ('admin', 'super_admin')
            GROUP BY u.id
            ORDER BY COUNT(p.id) ASC
            LIMIT 1;
        ELSE 
             -- Random as proxy for simple distribution
             SELECT id INTO target_admin_id
             FROM public.users
             WHERE role IN ('admin', 'super_admin')
             ORDER BY RANDOM()
             LIMIT 1;
        END IF;

        IF target_admin_id IS NOT NULL THEN
            UPDATE public.properties 
            SET assigned_admin_id = target_admin_id, updated_at = NOW()
            WHERE id = unassigned_prop.id;
        END IF;
    END LOOP;

    -- 2. Process Leads (Similar logic)
    FOR unassigned_lead IN 
        SELECT * FROM public.leads 
        WHERE assigned_to IS NULL 
        AND created_at < NOW() - (timeout_hours || ' hours')::INTERVAL
    LOOP
        target_admin_id := NULL;
        
        IF strategy = 'load_balance' THEN
            SELECT u.id INTO target_admin_id
            FROM public.users u
            LEFT JOIN public.leads l ON l.assigned_to = u.id
            WHERE u.role IN ('admin', 'super_admin')
            GROUP BY u.id
            ORDER BY COUNT(l.id) ASC
            LIMIT 1;
        ELSE
             SELECT id INTO target_admin_id
             FROM public.users
             WHERE role IN ('admin', 'super_admin')
             ORDER BY RANDOM()
             LIMIT 1;
        END IF;

        IF target_admin_id IS NOT NULL THEN
            UPDATE public.leads 
            SET assigned_to = target_admin_id 
            WHERE id = unassigned_lead.id;
        END IF;
    END LOOP;

END;
$$;
