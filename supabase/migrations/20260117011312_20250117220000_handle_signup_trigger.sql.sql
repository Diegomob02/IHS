-- Create a trigger function to handle user signup
-- This function will run AFTER a new user is created in auth.users
-- It will check if a profile already exists in public.users
-- If it exists, it updates the ID to match auth.uid() (linking them)
-- If it doesn't exist, it creates a new profile

CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  -- Check if a profile with this email already exists
  IF EXISTS (SELECT 1 FROM public.users WHERE email = new.email) THEN
    -- Update the existing profile with the new Auth ID
    -- This links the manually created profile to the new Auth User
    UPDATE public.users 
    SET id = new.id, 
        updated_at = now()
    WHERE email = new.email;
  ELSE
    -- Create a new profile if none exists
    INSERT INTO public.users (id, email, name, role)
    VALUES (new.id, new.email, new.raw_user_meta_data->>'name', 'owner');
  END IF;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
;
