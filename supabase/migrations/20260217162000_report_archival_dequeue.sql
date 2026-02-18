ALTER TABLE public.report_runs
  ADD COLUMN IF NOT EXISTS archive_locked_until TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.dequeue_report_runs_for_archival(p_batch_size INT DEFAULT 10)
RETURNS SETOF public.report_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.report_runs
    WHERE status = 'success'
      AND archived_at IS NULL
      AND (archive_locked_until IS NULL OR archive_locked_until < NOW())
    ORDER BY started_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_batch_size, 1)
  )
  UPDATE public.report_runs rr
  SET archive_locked_until = NOW() + INTERVAL '10 minutes',
      archive_attempts = rr.archive_attempts + 1
  WHERE rr.id IN (SELECT id FROM picked)
  RETURNING rr.*;
END;
$$;

REVOKE ALL ON FUNCTION public.dequeue_report_runs_for_archival(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dequeue_report_runs_for_archival(INT) TO service_role;
