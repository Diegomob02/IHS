INSERT INTO public.users (email, role, name, phone)
VALUES ('cliente.pruebas@ihs.com', 'owner', 'Cliente Pruebas', '+52 555 123 4567')
ON CONFLICT (email) DO NOTHING;
