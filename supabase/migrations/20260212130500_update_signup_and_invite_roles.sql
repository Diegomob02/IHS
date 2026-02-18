CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.users WHERE email = new.email) THEN
    UPDATE public.users 
    SET id = new.id, 
        updated_at = now()
    WHERE email = new.email;
  ELSE
    INSERT INTO public.users (id, email, name, role)
    VALUES (new.id, new.email, new.raw_user_meta_data->>'name', 'owner');
  END IF;

  INSERT INTO public.user_roles (email, role, status)
  VALUES (lower(new.email), 'owner', 'approved')
  ON CONFLICT (email) DO UPDATE
    SET role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = now();
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.consume_contractor_invite(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite RECORD;
  v_app RECORD;
  v_user_id UUID;
  v_email TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT *
  INTO v_invite
  FROM public.contractor_invites
  WHERE token = p_token
  LIMIT 1;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'invalid invite';
  END IF;

  IF v_invite.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite already used';
  END IF;

  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'invite expired';
  END IF;

  SELECT *
  INTO v_app
  FROM public.contractor_applications
  WHERE id = v_invite.application_id
  LIMIT 1;

  IF v_app IS NULL THEN
    RAISE EXCEPTION 'application not found';
  END IF;

  IF v_app.status <> 'approved' THEN
    RAISE EXCEPTION 'application not approved';
  END IF;

  UPDATE public.contractor_invites
  SET used_at = now(),
      used_by_user_id = v_user_id
  WHERE token = p_token;

  UPDATE public.users
  SET role = 'contractor',
      name = COALESCE(NULLIF(v_app.full_name, ''), name),
      updated_at = now()
  WHERE id = v_user_id;

  v_email := lower((auth.jwt() ->> 'email')::text);
  IF v_email IS NOT NULL AND v_email <> '' THEN
    INSERT INTO public.user_roles (email, role, status, updated_by)
    VALUES (v_email, 'contractor', 'approved', v_user_id)
    ON CONFLICT (email) DO UPDATE
      SET role = EXCLUDED.role,
          status = EXCLUDED.status,
          updated_by = EXCLUDED.updated_by,
          updated_at = now();
  END IF;

  INSERT INTO public.contractor_profiles (
    user_id,
    application_id,
    full_name,
    phone,
    whatsapp_phone,
    company_name
  )
  VALUES (
    v_user_id,
    v_app.id,
    v_app.full_name,
    v_app.phone,
    v_app.whatsapp_phone,
    v_app.company_name
  )
  ON CONFLICT (user_id) DO UPDATE
    SET application_id = EXCLUDED.application_id,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        whatsapp_phone = EXCLUDED.whatsapp_phone,
        company_name = EXCLUDED.company_name,
        updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'application_id', v_app.id
  );
END;
$$;

