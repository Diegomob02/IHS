INSERT INTO storage.buckets (id, name, public)
VALUES ('report-audio', 'report-audio', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Report audio admin read" ON storage.objects;
CREATE POLICY "Report audio admin read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'report-audio'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "Report audio admin upload" ON storage.objects;
CREATE POLICY "Report audio admin upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'report-audio'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "Report audio admin delete" ON storage.objects;
CREATE POLICY "Report audio admin delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'report-audio'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'super_admin')
  )
);

CREATE TABLE IF NOT EXISTS public.report_audio_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  voice TEXT,
  language TEXT,
  speed NUMERIC,
  bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  bytes BIGINT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_access_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS report_audio_cache_created_at_idx ON public.report_audio_cache (created_at DESC);

ALTER TABLE public.report_audio_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read report audio cache" ON public.report_audio_cache
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins write report audio cache" ON public.report_audio_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'super_admin')
    )
  );
