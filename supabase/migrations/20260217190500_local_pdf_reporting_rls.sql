DROP POLICY IF EXISTS "Authenticated users can view public settings" ON public.app_settings;

CREATE POLICY "Users can view public settings" ON public.app_settings
  FOR SELECT
  USING (public.is_admin() OR is_public = TRUE);

DROP POLICY IF EXISTS "Admins have full access to report_pdf_templates" ON public.report_pdf_templates;
CREATE POLICY "Admins have full access to report_pdf_templates" ON public.report_pdf_templates
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins have full access to monthly_cost_ledger" ON public.monthly_cost_ledger;
CREATE POLICY "Admins have full access to monthly_cost_ledger" ON public.monthly_cost_ledger
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins have full access to report_generation_events" ON public.report_generation_events;
CREATE POLICY "Admins have full access to report_generation_events" ON public.report_generation_events
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER PUBLICATION supabase_realtime ADD TABLE public.report_pdf_templates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.monthly_cost_ledger;
ALTER PUBLICATION supabase_realtime ADD TABLE public.report_generation_events;

