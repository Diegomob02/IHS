CREATE TABLE IF NOT EXISTS public.email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead')),
  priority INT NOT NULL DEFAULT 0,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 8,
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  to_email TEXT NOT NULL,
  to_name TEXT,
  from_email TEXT,
  reply_to TEXT,
  subject TEXT NOT NULL,
  html TEXT,
  text TEXT,
  headers JSONB,
  attachments JSONB,
  template_key TEXT,
  template_vars JSONB,
  metadata JSONB,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_outbox_status_next_attempt_idx ON public.email_outbox (status, next_attempt_at, priority DESC);
CREATE INDEX IF NOT EXISTS email_outbox_created_at_idx ON public.email_outbox (created_at);

CREATE TABLE IF NOT EXISTS public.email_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_outbox_id UUID NOT NULL REFERENCES public.email_outbox(id) ON DELETE CASCADE,
  attempt_no INT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_status TEXT,
  provider_response JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_delivery_logs_outbox_idx ON public.email_delivery_logs (email_outbox_id, attempt_no);
CREATE INDEX IF NOT EXISTS email_delivery_logs_created_at_idx ON public.email_delivery_logs (created_at);

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_email_outbox_updated_at ON public.email_outbox;
CREATE TRIGGER set_email_outbox_updated_at
BEFORE UPDATE ON public.email_outbox
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.email_backoff_seconds(p_attempts INT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  base_seconds INT := 30;
  max_seconds INT := 3600;
  jitter_seconds INT := (RANDOM() * 30)::INT;
  exp_seconds INT;
BEGIN
  exp_seconds := base_seconds * (2 ^ LEAST(GREATEST(p_attempts, 0), 10));
  RETURN LEAST(exp_seconds + jitter_seconds, max_seconds);
END;
$$;

CREATE OR REPLACE FUNCTION public.dequeue_email_outbox(p_batch_size INT DEFAULT 50)
RETURNS SETOF public.email_outbox
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
    FROM public.email_outbox
    WHERE status IN ('pending', 'failed')
      AND next_attempt_at <= NOW()
      AND attempts < max_attempts
    ORDER BY priority DESC, next_attempt_at ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_batch_size, 1)
  )
  UPDATE public.email_outbox eo
  SET status = 'processing',
      updated_at = NOW()
  WHERE eo.id IN (SELECT id FROM picked)
  RETURNING eo.*;
END;
$$;

REVOKE ALL ON FUNCTION public.dequeue_email_outbox(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_backoff_seconds(INT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.dequeue_email_outbox(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_backoff_seconds(INT) TO service_role;
