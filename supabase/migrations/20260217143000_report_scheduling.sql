CREATE TABLE IF NOT EXISTS public.report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  report_key TEXT NOT NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  time_zone TEXT NOT NULL DEFAULT 'UTC',
  run_at TIME NOT NULL DEFAULT '06:00:00',
  weekday INT CHECK (weekday BETWEEN 0 AND 6),
  day_of_month INT CHECK (day_of_month BETWEEN 1 AND 28),
  recipients TEXT[] NOT NULL DEFAULT '{}'::text[],
  enabled BOOLEAN NOT NULL DEFAULT true,
  next_run_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  last_run_started_at TIMESTAMPTZ,
  last_run_finished_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IN ('success', 'failed')),
  last_error TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS report_schedules_next_run_idx ON public.report_schedules (enabled, next_run_at);
CREATE INDEX IF NOT EXISTS report_schedules_property_idx ON public.report_schedules (property_id);

CREATE TABLE IF NOT EXISTS public.report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES public.report_schedules(id) ON DELETE SET NULL,
  report_key TEXT NOT NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  month TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error TEXT,
  output_bucket TEXT,
  output_path TEXT,
  output_mime TEXT,
  output_bytes BIGINT,
  email_outbox_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS report_runs_schedule_idx ON public.report_runs (schedule_id, started_at DESC);
CREATE INDEX IF NOT EXISTS report_runs_status_idx ON public.report_runs (status, started_at DESC);

ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage report schedules" ON public.report_schedules
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins read report runs" ON public.report_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'super_admin')
    )
  );

CREATE OR REPLACE FUNCTION public.compute_next_report_run(
  p_frequency TEXT,
  p_time_zone TEXT,
  p_run_at TIME,
  p_weekday INT,
  p_day_of_month INT,
  p_from TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
DECLARE
  local_ts TIMESTAMP;
  candidate TIMESTAMP;
  target_day INT;
BEGIN
  local_ts := (p_from AT TIME ZONE p_time_zone);
  IF p_frequency = 'daily' THEN
    candidate := date_trunc('day', local_ts) + p_run_at;
    IF candidate <= local_ts THEN
      candidate := candidate + INTERVAL '1 day';
    END IF;
  ELSIF p_frequency = 'weekly' THEN
    IF p_weekday IS NULL THEN RAISE EXCEPTION 'weekday required'; END IF;
    candidate := date_trunc('day', local_ts) + p_run_at;
    candidate := candidate + (((p_weekday - EXTRACT(DOW FROM candidate)::INT + 7) % 7) * INTERVAL '1 day');
    IF candidate <= local_ts THEN
      candidate := candidate + INTERVAL '7 days';
    END IF;
  ELSIF p_frequency = 'monthly' THEN
    target_day := LEAST(GREATEST(COALESCE(p_day_of_month, 1), 1), 28);
    candidate := (date_trunc('month', local_ts) + ((target_day - 1) * INTERVAL '1 day')) + p_run_at;
    IF candidate <= local_ts THEN
      candidate := (date_trunc('month', local_ts) + INTERVAL '1 month') + ((target_day - 1) * INTERVAL '1 day') + p_run_at;
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid frequency';
  END IF;
  RETURN candidate AT TIME ZONE p_time_zone;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_report_schedule_set_next_run()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.enabled IS NOT TRUE THEN
    NEW.next_run_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.next_run_at IS NULL THEN
    NEW.next_run_at := public.compute_next_report_run(
      NEW.frequency,
      NEW.time_zone,
      NEW.run_at,
      NEW.weekday,
      NEW.day_of_month,
      NOW()
    );
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS report_schedules_set_next_run ON public.report_schedules;
CREATE TRIGGER report_schedules_set_next_run
BEFORE INSERT OR UPDATE ON public.report_schedules
FOR EACH ROW
EXECUTE FUNCTION public.tg_report_schedule_set_next_run();

CREATE OR REPLACE FUNCTION public.dequeue_due_report_schedules(p_batch_size INT DEFAULT 10)
RETURNS SETOF public.report_schedules
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
    FROM public.report_schedules
    WHERE enabled IS TRUE
      AND next_run_at IS NOT NULL
      AND next_run_at <= NOW()
      AND (locked_until IS NULL OR locked_until < NOW())
    ORDER BY next_run_at ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_batch_size, 1)
  )
  UPDATE public.report_schedules s
  SET locked_until = NOW() + INTERVAL '15 minutes',
      last_run_started_at = NOW(),
      updated_at = NOW()
  WHERE s.id IN (SELECT id FROM picked)
  RETURNING s.*;
END;
$$;

REVOKE ALL ON FUNCTION public.dequeue_due_report_schedules(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_next_report_run(TEXT, TEXT, TIME, INT, INT, TIMESTAMPTZ) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.dequeue_due_report_schedules(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.compute_next_report_run(TEXT, TEXT, TIME, INT, INT, TIMESTAMPTZ) TO service_role;
