INSERT INTO public.report_schedules (
  name,
  report_key,
  property_id,
  frequency,
  time_zone,
  run_at,
  day_of_month,
  recipients,
  enabled,
  config,
  created_by
)
SELECT
  'Reporte mensual (auto)',
  'property_monthly_maintenance',
  p.id,
  'monthly',
  'UTC',
  '06:00:00',
  1,
  CASE
    WHEN p.owner_email IS NOT NULL AND length(trim(p.owner_email)) > 3 THEN ARRAY[lower(trim(p.owner_email))]
    ELSE ARRAY[]::text[]
  END,
  TRUE,
  jsonb_build_object('month_offset', -1),
  NULL
FROM public.properties p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.report_schedules rs
  WHERE rs.property_id = p.id
    AND rs.report_key = 'property_monthly_maintenance'
    AND rs.frequency = 'monthly'
);
