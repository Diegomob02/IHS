## Hallazgos (por qué “no funciona”)
- La UI de “Generador de Reporte IA” en [AdminDashboard.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/pages/AdminDashboard.tsx#L909-L1041) genera el reporte en el navegador usando [localAiClient.ts](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/lib/localAiClient.ts) y además lee/escribe tablas protegidas por RLS.
- El bloqueo más probable es **RLS/roles**: las políticas para `app_settings`, `report_pdf_templates` y `monthly_cost_ledger` exigen `public.is_admin()` ([20260217190500_local_pdf_reporting_rls.sql](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/supabase/migrations/20260217190500_local_pdf_reporting_rls.sql#L1-L27)). Pero `public.is_admin()` sólo devuelve true si `role = 'admin'` (o 3 emails hardcodeados) ([20250117210000_fix_users_rls.sql](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/supabase/migrations/20250117210000_fix_users_rls.sql#L13-L26)). Si tu usuario es `super_admin`, queda “bloqueado” como si no fuera admin.
- Aun con permisos OK, hay un segundo problema frecuente: el proveedor de IA se llama **desde el navegador** (`fetch` a `{endpoint}/api/generate` u `{endpoint}/v1/chat/completions` en [localAiClient.ts](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/lib/localAiClient.ts#L45-L82)). En producción esto suele fallar por `localhost`, mixed-content (https→http) o CORS.

## Plan de diagnóstico (sin cambiar comportamiento)
- Confirmar en Supabase (logs o consola) si hay errores tipo `permission denied` al consultar/actualizar `app_settings`, `report_pdf_templates` o `monthly_cost_ledger` durante:
  - cargar Settings de IA local ([LocalPdfReportSettings.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/components/admin/LocalPdfReportSettings.tsx#L43-L64))
  - generar reporte ([AdminDashboard.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/pages/AdminDashboard.tsx#L956-L1026))
- Verificar el rol real del usuario que intenta generar (si es `super_admin`, encaja perfecto con el fallo).
- Validar conectividad del endpoint con “Probar conexión” en Settings (pega a `/api/tags`) ([LocalPdfReportSettings.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/components/admin/LocalPdfReportSettings.tsx#L127-L149)) y confirmar que el endpoint exponga `/api/generate` o `/v1/chat/completions`.

## Plan de corrección (cambios de código/DB)
- Ajustar permisos para que **admin y super_admin** pasen las políticas:
  - Opción A (simple): ampliar `public.is_admin()` para incluir `role in ('admin','super_admin')`.
  - Opción B (más limpio): crear `public.is_staff()` y reemplazar en políticas de reportes.
- Mejorar los mensajes de error en UI para diferenciar:
  - RLS/permiso (error de PostgREST) vs
  - red/CORS/endpoint (failed to fetch) vs
  - configuración incompleta.

## Plan de verificación
- Probar con un usuario `super_admin` y con uno `admin`:
  - cargar y guardar settings de IA local
  - generar PDF y confirmar que se guarda en `monthly_cost_ledger`
  - cargar plantillas desde `report_pdf_templates`
- Verificar que en producción el endpoint configurado sea accesible desde el navegador (o documentar que esta ruta sólo funciona en entorno local con el frontend corriendo localmente).

Si confirmas este plan, lo siguiente es implementar el ajuste de RLS/función y la mejora de errores, y dejarlo validado en la app.