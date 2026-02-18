-- Fix RLS policies to ensure users can be added
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated user to insert into users table (needed for signup/admin creation)
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.users;
CREATE POLICY "Enable insert for authenticated users" ON public.users
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow admins to do everything (existing policy might be restrictive if is_admin fails)
-- We'll keep the is_admin policy but ensure this one exists too.

-- Ensure the public.is_admin function is robust
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Allow if the user is in the admin list (hardcoded fallback for safety in early dev)
  IF (auth.jwt() ->> 'email') IN ('admin@ihs.com', 'diego@ihs.com', 'amoreno@moreno-arquitectos.com') THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE email = (auth.jwt() ->> 'email') 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply Admin policy to be sure
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.users;
CREATE POLICY "Admins can manage all profiles" ON public.users
  FOR ALL USING (public.is_admin());
;
