CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_name TEXT;
  v_email TEXT;
BEGIN
  v_email := lower(new.email);
  v_name := COALESCE(NULLIF(new.raw_user_meta_data->>'name', ''), split_part(v_email, '@', 1), 'Usuario');

  IF EXISTS (SELECT 1 FROM public.users WHERE lower(email) = v_email) THEN
    UPDATE public.users
    SET id = new.id,
        updated_at = now()
    WHERE lower(email) = v_email;
  ELSE
    INSERT INTO public.users (id, email, name, role)
    VALUES (new.id, v_email, v_name, 'owner');
  END IF;

  INSERT INTO public.user_roles (email, role, status)
  VALUES (v_email, 'owner', 'approved')
  ON CONFLICT (email) DO UPDATE
    SET role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = now()
    WHERE public.user_roles.role = 'owner';

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
