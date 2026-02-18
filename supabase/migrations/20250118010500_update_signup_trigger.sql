-- Create or replace the function to handle new user signups with ID merging
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  existing_user_id UUID;
BEGIN
  -- Check if a profile with this email already exists
  SELECT id INTO existing_user_id FROM public.users WHERE email = new.email;

  IF existing_user_id IS NOT NULL THEN
    -- Update the existing profile's ID to match the Auth ID
    -- Because we set ON UPDATE CASCADE on Foreign Keys, this will update properties, leads, etc.
    UPDATE public.users
    SET id = new.id,
        updated_at = now()
    WHERE id = existing_user_id;
  ELSE
    -- Insert new profile if none exists
    INSERT INTO public.users (id, email, name, role)
    VALUES (
      new.id,
      new.email,
      new.raw_user_meta_data->>'name',
      COALESCE(new.raw_user_meta_data->>'role', 'owner') -- Default to owner if not specified
    );
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
