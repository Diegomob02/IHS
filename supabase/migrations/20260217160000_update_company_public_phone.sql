UPDATE public.company_settings
SET
  phone = '+52 624 179 3231',
  updated_at = now()
WHERE is_singleton = TRUE
  AND (phone IS DISTINCT FROM '+52 624 179 3231');
