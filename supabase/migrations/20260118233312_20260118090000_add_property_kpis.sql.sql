-- Add operational KPI helpers for global reporting

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  IF (auth.jwt() ->> 'email') IN ('admin@ihs.com', 'diego@ihs.com', 'amoreno@moreno-arquitectos.com') THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.users
    WHERE email = (auth.jwt() ->> 'email')
      AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
    FROM public.maintenance_logs ml
    JOIN base_props bp ON bp.id = ml.property_id
    WHERE ml.log_date >= p_month_start
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

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_property_kpis(DATE, UUID) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_documents_property_created_at ON public.documents(property_id, created_at);
CREATE INDEX IF NOT EXISTS idx_logs_property_log_date ON public.maintenance_logs(property_id, log_date);
CREATE INDEX IF NOT EXISTS idx_requests_property_status ON public.maintenance_requests(property_id, status);
;
