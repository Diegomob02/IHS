ALTER TABLE public.maintenance_logs_archive
  ADD COLUMN IF NOT EXISTS processed_report_run_id UUID,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processed_status TEXT;

CREATE OR REPLACE VIEW public.maintenance_logs_all AS
  SELECT
    ml.id,
    ml.property_id,
    ml.created_by,
    ml.content,
    ml.images,
    ml.cost,
    ml.log_date,
    ml.created_at,
    NULL::timestamptz AS archived_at,
    FALSE AS is_archived,
    NULL::uuid AS processed_report_run_id,
    NULL::timestamptz AS processed_at,
    NULL::text AS processed_status
  FROM public.maintenance_logs ml
  UNION ALL
  SELECT
    mla.id,
    mla.property_id,
    mla.created_by,
    mla.content,
    mla.images,
    mla.cost,
    mla.log_date,
    mla.created_at,
    mla.archived_at,
    TRUE AS is_archived,
    mla.processed_report_run_id,
    mla.processed_at,
    mla.processed_status
  FROM public.maintenance_logs_archive mla;

ALTER TABLE public.report_runs
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_result JSONB,
  ADD COLUMN IF NOT EXISTS executive_summary JSONB,
  ADD COLUMN IF NOT EXISTS archive_attempts INT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS report_schedules_property_report_key_freq_uniq
  ON public.report_schedules(property_id, report_key, frequency);

CREATE OR REPLACE FUNCTION public.archive_maintenance_logs_for_report(
  p_property_id UUID,
  p_from_date DATE,
  p_to_date DATE,
  p_report_run_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moved INT := 0;
  v_deleted INT := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_property_id IS NULL THEN
    RAISE EXCEPTION 'missing property_id';
  END IF;
  IF p_from_date IS NULL OR p_to_date IS NULL OR p_to_date <= p_from_date THEN
    RAISE EXCEPTION 'invalid date range';
  END IF;

  WITH moved AS (
    INSERT INTO public.maintenance_logs_archive (
      id,
      property_id,
      created_by,
      content,
      images,
      cost,
      log_date,
      created_at,
      archived_at,
      processed_report_run_id,
      processed_at,
      processed_status
    )
    SELECT
      ml.id,
      ml.property_id,
      ml.created_by,
      ml.content,
      ml.images,
      ml.cost,
      ml.log_date,
      ml.created_at,
      NOW(),
      p_report_run_id,
      NOW(),
      'archived'
    FROM public.maintenance_logs ml
    WHERE ml.property_id = p_property_id
      AND ml.log_date >= p_from_date
      AND ml.log_date < p_to_date
    ON CONFLICT (id) DO UPDATE SET
      processed_report_run_id = COALESCE(public.maintenance_logs_archive.processed_report_run_id, EXCLUDED.processed_report_run_id),
      processed_at = COALESCE(public.maintenance_logs_archive.processed_at, EXCLUDED.processed_at),
      processed_status = COALESCE(public.maintenance_logs_archive.processed_status, EXCLUDED.processed_status)
    RETURNING id
  )
  DELETE FROM public.maintenance_logs ml
  WHERE ml.id IN (SELECT id FROM moved);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT COUNT(*) INTO v_moved FROM public.maintenance_logs_archive mla
  WHERE mla.property_id = p_property_id
    AND mla.log_date >= p_from_date
    AND mla.log_date < p_to_date
    AND mla.processed_report_run_id = p_report_run_id;

  RETURN jsonb_build_object(
    'property_id', p_property_id,
    'from', p_from_date,
    'to', p_to_date,
    'report_run_id', p_report_run_id,
    'moved', v_moved,
    'deleted', v_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_maintenance_logs_for_report(UUID, DATE, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_maintenance_logs_for_report(UUID, DATE, DATE, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_default_monthly_report_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipients TEXT[];
BEGIN
  v_recipients := ARRAY[]::text[];
  IF NEW.owner_email IS NOT NULL AND length(trim(NEW.owner_email)) > 3 THEN
    v_recipients := ARRAY[lower(trim(NEW.owner_email))];
  END IF;

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
  VALUES (
    'Reporte mensual (auto)',
    'property_monthly_maintenance',
    NEW.id,
    'monthly',
    'UTC',
    '06:00:00',
    1,
    v_recipients,
    TRUE,
    jsonb_build_object('month_offset', -1),
    NULL
  )
  ON CONFLICT (property_id, report_key, frequency) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_default_monthly_report_schedule ON public.properties;
CREATE TRIGGER trg_ensure_default_monthly_report_schedule
AFTER INSERT ON public.properties
FOR EACH ROW
EXECUTE FUNCTION public.ensure_default_monthly_report_schedule();
