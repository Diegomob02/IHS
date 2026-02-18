-- Company settings (singleton) + Integrations (Super Admin)

CREATE TABLE IF NOT EXISTS public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_singleton BOOLEAN NOT NULL DEFAULT TRUE,
  company_name TEXT NOT NULL DEFAULT 'Integrated Home Solutions',
  company_legal_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  website TEXT,
  logo_path TEXT,
  theme_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  theme_version INT NOT NULL DEFAULT 1,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'company_settings_singleton_unique'
  ) THEN
    ALTER TABLE public.company_settings
      ADD CONSTRAINT company_settings_singleton_unique UNIQUE (is_singleton);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  type TEXT NOT NULL CHECK (type IN ('whatsapp', 'n8n')),
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled', 'enabled')),
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_test_at TIMESTAMPTZ,
  last_test_result JSONB,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type)
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  IF (auth.jwt() ->> 'email') IN ('admin@ihs.com', 'diego@ihs.com', 'amoreno@moreno-arquitectos.com') THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE email = (auth.jwt() ->> 'email')
    AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP POLICY IF EXISTS "Public can read company settings" ON public.company_settings;
CREATE POLICY "Public can read company settings"
ON public.company_settings
FOR SELECT
TO public
USING (is_singleton = TRUE);

DROP POLICY IF EXISTS "Super admin can manage company settings" ON public.company_settings;
CREATE POLICY "Super admin can manage company settings"
ON public.company_settings
FOR ALL
TO public
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Super admin can manage integrations" ON public.integration_configs;
CREATE POLICY "Super admin can manage integrations"
ON public.integration_configs
FOR ALL
TO public
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- Ensure a single row exists
INSERT INTO public.company_settings (
  id,
  is_singleton,
  company_name,
  company_legal_name,
  email,
  phone,
  address,
  website,
  logo_path,
  theme_json,
  theme_version
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  TRUE,
  'Integrated Home Solutions',
  'Integrated Home Solutions',
  'info@ihscabo.com',
  '+52 624 179 3231',
  'Cabo San Lucas, BCS, México',
  'https://ihscabo.com',
  'public/IHS.jpeg',
  '{
    "colors": {
      "primary": "#712F34",
      "primaryForeground": "#FFFFFF",
      "background": "#F5F1EC",
      "accent": "#E5A663",
      "accentForeground": "#2C2C2C",
      "textMain": "#2C2C2C",
      "textSecondary": "#6B6B6B",
      "muted": "#F5F5F5",
      "mutedForeground": "#6B6B6B",
      "border": "#E6DDD4"
    }
  }'::jsonb,
  1
)
ON CONFLICT (is_singleton) DO NOTHING;

-- Grants
REVOKE ALL ON public.company_settings FROM anon;
REVOKE ALL ON public.company_settings FROM authenticated;

GRANT SELECT (company_name, logo_path, theme_json, theme_version) ON public.company_settings TO anon;
GRANT ALL PRIVILEGES ON public.company_settings TO authenticated;

REVOKE ALL ON public.integration_configs FROM anon;
REVOKE ALL ON public.integration_configs FROM authenticated;
GRANT ALL PRIVILEGES ON public.integration_configs TO authenticated;

-- Branding storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access to branding" ON storage.objects;
CREATE POLICY "Public Access to branding"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Super admin can upload branding" ON storage.objects;
CREATE POLICY "Super admin can upload branding"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'branding' AND public.is_super_admin());

DROP POLICY IF EXISTS "Super admin can update branding" ON storage.objects;
CREATE POLICY "Super admin can update branding"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'branding' AND public.is_super_admin());

DROP POLICY IF EXISTS "Super admin can delete branding" ON storage.objects;
CREATE POLICY "Super admin can delete branding"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'branding' AND public.is_super_admin());
