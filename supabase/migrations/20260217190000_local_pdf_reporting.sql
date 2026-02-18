ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.report_pdf_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  report_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 100,
  template_spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS report_pdf_templates_key_enabled_prio_idx
  ON public.report_pdf_templates (report_key, enabled, priority);

DROP TRIGGER IF EXISTS set_report_pdf_templates_updated_at ON public.report_pdf_templates;
CREATE TRIGGER set_report_pdf_templates_updated_at
BEFORE UPDATE ON public.report_pdf_templates
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.report_pdf_templates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.monthly_cost_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_base64 TEXT NOT NULL,
  pdf_bytes INT,
  report_run_id UUID REFERENCES public.report_runs(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(property_id, month)
);

CREATE INDEX IF NOT EXISTS monthly_cost_ledger_property_month_idx
  ON public.monthly_cost_ledger (property_id, month);

DROP TRIGGER IF EXISTS set_monthly_cost_ledger_updated_at ON public.monthly_cost_ledger;
CREATE TRIGGER set_monthly_cost_ledger_updated_at
BEFORE UPDATE ON public.monthly_cost_ledger
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.monthly_cost_ledger ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.report_generation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID REFERENCES public.monthly_cost_ledger(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  month TEXT CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  step TEXT,
  message TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS report_generation_events_ledger_idx
  ON public.report_generation_events (ledger_id, created_at);

CREATE INDEX IF NOT EXISTS report_generation_events_property_month_idx
  ON public.report_generation_events (property_id, month, created_at);

ALTER TABLE public.report_generation_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.archive_maintenance_logs_for_report_admin(
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
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

REVOKE ALL ON FUNCTION public.archive_maintenance_logs_for_report_admin(UUID, DATE, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_maintenance_logs_for_report_admin(UUID, DATE, DATE, UUID) TO authenticated;

INSERT INTO public.app_settings (key, value, description, category, is_public)
VALUES
  ('local_ai_api_key', '""'::jsonb, 'API key para IA local/self-hosted (obligatorio para reportes PDF)', 'reports_pdf_local', FALSE),
  ('local_ai_model', '""'::jsonb, 'Modelo de IA seleccionado para generación de texto del reporte', 'reports_pdf_local', FALSE),
  ('local_ai_endpoint', '"http://localhost:11434"'::jsonb, 'Endpoint HTTP del proveedor de IA local/self-hosted', 'reports_pdf_local', FALSE)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.report_pdf_templates (name, report_key, enabled, priority, template_spec, match_rules, created_by)
VALUES (
  'Plantilla profesional (default)',
  'property_monthly_maintenance',
  TRUE,
  100,
  jsonb_build_object(
    'version', 1,
    'branding', jsonb_build_object('showLogo', true, 'primaryColor', '#0f172a'),
    'layout', jsonb_build_object('pageSize', 'LETTER', 'margin', 40),
    'sections', jsonb_build_array(
      jsonb_build_object('key', 'executive_summary', 'title', 'Resumen ejecutivo'),
      jsonb_build_object('key', 'events', 'title', 'Sucesos del período'),
      jsonb_build_object('key', 'costs', 'title', 'Costos detallados'),
      jsonb_build_object('key', 'images', 'title', 'Imágenes')
    )
  ),
  jsonb_build_object('report_key', 'property_monthly_maintenance'),
  NULL
)
ON CONFLICT DO NOTHING;

