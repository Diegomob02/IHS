-- Extend maintenance_requests to support owner contractor/service requests

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS preferred_date DATE,
  ADD COLUMN IF NOT EXISTS budget_estimated NUMERIC(12,2);

ALTER TABLE public.maintenance_requests
  DROP CONSTRAINT IF EXISTS maintenance_requests_status_check;

ALTER TABLE public.maintenance_requests
  ADD CONSTRAINT maintenance_requests_status_check
  CHECK (status IN ('pending', 'in_review', 'assigned', 'in_progress', 'completed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_maintenance_requests_preferred_date ON public.maintenance_requests(preferred_date);

ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own maintenance requests" ON public.maintenance_requests;

CREATE POLICY "Owners can manage their own maintenance requests" ON public.maintenance_requests
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = owner_id
  )
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = maintenance_requests.property_id
        AND (p.owner_id = auth.uid() OR p.owner_email = (auth.jwt() ->> 'email'))
    )
  );

CREATE POLICY "Admins can view maintenance requests for assigned properties" ON public.maintenance_requests
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = maintenance_requests.property_id
        AND p.assigned_admin_id = auth.uid()
    )
  );

CREATE POLICY "Admins can update maintenance requests for assigned properties" ON public.maintenance_requests
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = maintenance_requests.property_id
        AND p.assigned_admin_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = maintenance_requests.property_id
        AND p.assigned_admin_id = auth.uid()
    )
  );

CREATE POLICY "Super admins can manage all maintenance requests" ON public.maintenance_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'super_admin'
    )
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.maintenance_requests;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

