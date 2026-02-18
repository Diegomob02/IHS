-- Add owner_email to properties to allow linking before user signup
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_properties_owner_email ON public.properties(owner_email);

-- Update RLS for properties to allow access by Email
DROP POLICY IF EXISTS "Users can view their own properties" ON public.properties;
CREATE POLICY "Users can view their own properties" ON public.properties
  FOR SELECT USING (
    auth.uid() = owner_id 
    OR 
    owner_email = (auth.jwt() ->> 'email')
  );

-- Create a function to check if a user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE email = (auth.jwt() ->> 'email') 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin Policies for Properties
CREATE POLICY "Admins can do everything on properties" ON public.properties
  FOR ALL USING (public.is_admin());

-- Admin Policies for Financial Records
CREATE POLICY "Admins can do everything on financial_records" ON public.financial_records
  FOR ALL USING (public.is_admin());

-- Ensure public.users exists and has RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.users
  FOR SELECT USING (auth.uid() = id OR email = (auth.jwt() ->> 'email'));

CREATE POLICY "Admins can manage all profiles" ON public.users
  FOR ALL USING (public.is_admin());

-- Insert a default admin user (optional, but helps for testing if we know the email)
-- I will rely on the frontend to 'promote' the current user or manual SQL run.
