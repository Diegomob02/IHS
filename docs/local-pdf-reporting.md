# Sistema local de reportes PDF (Admin/SuperAdmin)

## Objetivo
Generar reportes PDF de manera local (en el navegador) para propiedades, usando:
- Configuración obligatoria (API key + modelo + endpoint de IA local/self-hosted)
- Formateo autorizado del texto
- Plantillas administrables con selección automática
- Bitácora mensual (histórico por propiedad/mes) con PDF en base64
- Archivado mensual de costos (reinicio del cálculo) y logs detallados para debugging

Todo el flujo queda restringido a Admin y SuperAdmin por UI + RLS.

## Configuración (settings)
Se guardan en `public.app_settings` (no públicos):
- `local_ai_endpoint`: endpoint HTTP del proveedor local/self-hosted
- `local_ai_api_key`: token requerido para el proveedor
- `local_ai_model`: modelo seleccionado

UI: Panel Admin → Settings → “Reportes PDF (local)”.

## Flujo de generación (alto nivel)
1. Admin captura incidentes, costos e imágenes en “Generador de Reporte IA”.
2. Se valida configuración obligatoria (endpoint/modelo/api key).
3. Se genera texto con IA local (`src/lib/localAiClient.ts`).
4. Se aplica formateo autorizado a bloques (`src/utils/authorizedReportFormatter.ts`).
5. Se selecciona automáticamente una plantilla (`public.report_pdf_templates` + `selectPdfTemplate`).
6. Se renderiza el PDF localmente (`src/lib/pdf/renderReportPdf.ts`).
7. Se guarda la bitácora mensual en DB (`public.monthly_cost_ledger`) con el PDF en base64.
8. En “Enviar a Cliente y Archivar” se sube el PDF a Storage (bucket `documents`), se versiona en `documents`/`document_versions` y se archivan logs mensuales con RPC.

## Plantillas (CRUD + selección)
Tabla: `public.report_pdf_templates`
- `template_spec` define layout/branding y secciones.
- `match_rules` define criterios predefinidos de selección.

Selección automática: `src/lib/pdfTemplates/selectPdfTemplate.ts`
Reglas soportadas:
- `property_id`
- `min_total_cost`, `max_total_cost`
- `min_events`, `max_events`
- `has_images`
- `location_contains`

La prioridad menor se evalúa primero.

## Bitácora mensual (histórico)
Tabla: `public.monthly_cost_ledger`
- `property_id`, `month` (YYYY-MM)
- `events` (estructura libre: texto/costos/imágenes)
- `totals` (incluye `totalCost`)
- `pdf_base64` (PDF final)

UI: Panel Admin → “Bitácora PDF”.

## Archivado mensual de costos (reinicio)
RPC: `public.archive_maintenance_logs_for_report_admin(...)`
- Seguridad: `SECURITY DEFINER` y valida `public.is_admin()`.
- Mueve `maintenance_logs` del periodo a `maintenance_logs_archive`.

El flujo de “Enviar y Archivar” ejecuta el archivado para reiniciar el cálculo mensual.

## Logs / debugging
Tabla: `public.report_generation_events`
Se registran eventos por etapa (IA, plantillas, PDF, Storage, documentos, archivado).

Helper: `src/lib/reporting/reportLogger.ts`

## Acceso exclusivo Admin/SuperAdmin
- RLS en `report_pdf_templates`, `monthly_cost_ledger`, `report_generation_events`: solo `public.is_admin()`.
- `app_settings`: lectura solo si `is_public = true` o `public.is_admin()`; las keys del módulo de IA local se guardan como no públicas.

