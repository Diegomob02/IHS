-- Insert the initial admin user to ensure RLS policies work
INSERT INTO public.users (email, role, name)
VALUES ('amoreno@moreno-arquitectos.com', 'admin', 'Admin Moreno')
ON CONFLICT (email) DO UPDATE SET role = 'admin';

-- Also insert the demo/dev users just in case
INSERT INTO public.users (email, role, name)
VALUES ('admin@ihs.com', 'admin', 'System Admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.users (email, role, name)
VALUES ('diego@ihs.com', 'admin', 'Diego Admin')
ON CONFLICT (email) DO NOTHING;
;
