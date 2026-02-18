-- Fix leads foreign key to point to public.users instead of auth.users
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_assigned_to_fkey;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_assigned_to_fkey
  FOREIGN KEY (assigned_to)
  REFERENCES public.users(id)
  ON DELETE SET NULL;

-- Update role check constraint to include 'super_admin'
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'tenant', 'admin', 'super_admin'));

-- Add permissions column
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

-- Update is_admin function to include super_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Hardcoded super admins for safety and bootstrap
  IF (auth.jwt() ->> 'email') IN ('admin@ihs.com', 'diego@ihs.com', 'amoreno@moreno-arquitectos.com') THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE email = (auth.jwt() ->> 'email')
    AND role IN ('admin', 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update known admins to super_admin for immediate access
UPDATE public.users 
SET role = 'super_admin' 
WHERE email IN ('admin@ihs.com', 'diego@ihs.com', 'amoreno@moreno-arquitectos.com');
