CREATE TABLE IF NOT EXISTS public.maintenance_logs_archive (
  id UUID PRIMARY KEY,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  content TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  cost NUMERIC DEFAULT 0,
  log_date DATE,
  created_at TIMESTAMP WITH TIME ZONE,
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.maintenance_logs_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access (maintenance_logs_archive)" ON public.maintenance_logs_archive;
CREATE POLICY "Service role full access (maintenance_logs_archive)" ON public.maintenance_logs_archive
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins can manage logs (archive)" ON public.maintenance_logs_archive;
CREATE POLICY "Admins can manage logs (archive)" ON public.maintenance_logs_archive
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Owners can view logs (archive)" ON public.maintenance_logs_archive;
CREATE POLICY "Owners can view logs (archive)" ON public.maintenance_logs_archive
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.properties
      WHERE properties.id = maintenance_logs_archive.property_id
        AND properties.owner_id = auth.uid()
    )
  );

GRANT ALL ON public.maintenance_logs_archive TO authenticated;
GRANT SELECT ON public.maintenance_logs_archive TO anon;

CREATE INDEX IF NOT EXISTS idx_logs_archive_property_log_date ON public.maintenance_logs_archive(property_id, log_date);

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
    FALSE AS is_archived
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
    TRUE AS is_archived
  FROM public.maintenance_logs_archive mla;

CREATE OR REPLACE FUNCTION public.archive_maintenance_logs(
  p_cutoff DATE DEFAULT date_trunc('month', CURRENT_DATE)::date
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted INT := 0;
  v_deleted INT := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.maintenance_logs_archive (
    id,
    property_id,
    created_by,
    content,
    images,
    cost,
    log_date,
    created_at,
    archived_at
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
    NOW()
  FROM public.maintenance_logs ml
  WHERE ml.log_date < p_cutoff
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  DELETE FROM public.maintenance_logs ml
  WHERE ml.log_date < p_cutoff;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'cutoff', p_cutoff,
    'inserted', v_inserted,
    'deleted', v_deleted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_maintenance_logs(DATE) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.archive_maintenance_logs(DATE) TO service_role';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_property_kpis(
  p_month_start DATE DEFAULT date_trunc('month', CURRENT_DATE)::date,
  p_admin_id UUID DEFAULT NULL
)
RETURNS TABLE (
  property_id UUID,
  title TEXT,
  owner_email TEXT,
  assigned_admin_id UUID,
  monthly_fee NUMERIC,
  contract_status TEXT,
  open_requests INT,
  logs_count INT,
  logs_cost NUMERIC,
  last_log_date DATE,
  docs_count INT,
  last_doc_created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH base_props AS (
    SELECT p.*
    FROM public.properties p
    WHERE
      (public.is_super_admin() AND (p_admin_id IS NULL OR p.assigned_admin_id = p_admin_id))
      OR
      (NOT public.is_super_admin() AND p.assigned_admin_id = auth.uid())
  ),
  req AS (
    SELECT mr.property_id, COUNT(*)::int AS open_requests
    FROM public.maintenance_requests mr
    JOIN base_props bp ON bp.id = mr.property_id
    WHERE mr.status IN ('pending', 'in_progress')
    GROUP BY mr.property_id
  ),
  logs AS (
    SELECT
      ml.property_id,
      COUNT(*)::int AS logs_count,
      COALESCE(SUM(ml.cost), 0)::numeric AS logs_cost,
      MAX(ml.log_date) AS last_log_date
    FROM public.maintenance_logs_all ml
    JOIN base_props bp ON bp.id = ml.property_id
    WHERE ml.log_date >= p_month_start
      AND ml.log_date < (p_month_start + INTERVAL '1 month')::date
    GROUP BY ml.property_id
  ),
  docs AS (
    SELECT
      d.property_id,
      COUNT(*)::int AS docs_count,
      MAX(d.created_at) AS last_doc_created_at
    FROM public.documents d
    JOIN base_props bp ON bp.id = d.property_id
    WHERE d.created_at >= p_month_start
      AND d.created_at < (p_month_start + INTERVAL '1 month')::timestamptz
      AND COALESCE(d.is_archived, false) = false
    GROUP BY d.property_id
  )
  SELECT
    bp.id,
    bp.title,
    bp.owner_email,
    bp.assigned_admin_id,
    bp.monthly_fee,
    bp.contract_status,
    COALESCE(req.open_requests, 0) AS open_requests,
    COALESCE(logs.logs_count, 0) AS logs_count,
    COALESCE(logs.logs_cost, 0) AS logs_cost,
    logs.last_log_date,
    COALESCE(docs.docs_count, 0) AS docs_count,
    docs.last_doc_created_at
  FROM base_props bp
  LEFT JOIN req ON req.property_id = bp.id
  LEFT JOIN logs ON logs.property_id = bp.id
  LEFT JOIN docs ON docs.property_id = bp.id
  ORDER BY bp.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

