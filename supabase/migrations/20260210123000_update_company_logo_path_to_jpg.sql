UPDATE public.company_settings
SET logo_path = 'public/IHS.jpg'
WHERE is_singleton = true
  AND (logo_path = 'public/IHS.jpeg' OR logo_path = '/IHS.jpeg' OR logo_path = 'IHS.jpeg');

