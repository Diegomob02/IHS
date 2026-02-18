-- Fix RLS for maintenance_logs: INSERT requires WITH CHECK
-- Also allow owners to view logs via owner_email matching (pre-signup linking)

DROP POLICY IF EXISTS "Admins can manage logs" ON public.maintenance_logs;
DROP POLICY IF EXISTS "Owners can view logs" ON public.maintenance_logs;

CREATE POLICY "Admins can manage logs" ON public.maintenance_logs
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Owners can view logs" ON public.maintenance_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = maintenance_logs.property_id
        AND (p.owner_id = auth.uid() OR p.owner_email = (auth.jwt() ->> 'email'))
    )
  );
;
