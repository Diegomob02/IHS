CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  IF (auth.jwt() ->> 'email') IN ('admin@ihs.com', 'diego@ihs.com', 'amoreno@moreno-arquitectos.com') THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.users
    WHERE email = (auth.jwt() ->> 'email')
      AND role IN ('admin', 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
