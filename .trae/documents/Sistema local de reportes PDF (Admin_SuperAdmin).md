## Supuestos y alcance
- “Procesamiento local” se implementa en el navegador del Admin/SuperAdmin: IA → formateo → render PDF. Supabase queda solo como almacenamiento/consulta (DB/Storage) sin usar servicios externos de PDF.
- El “API key” se usa para autenticar el acceso a un proveedor de IA local/self-hosted (por ejemplo, un endpoint interno), y se guarda protegido (no visible para usuarios no-admin).

## Diagnóstico del repo (impacto en el diseño)
- El proyecto es React+TS+Vite y usa Supabase (Postgres/RLS/Storage + Edge Functions). No hay backend Node local.
- La generación actual de PDF en backend depende de un webhook (variable REPORT_WEBHOOK_URL) en [reports-runner](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/supabase/functions/reports-runner/index.ts#L473-L508) y [report-generate-on-demand](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/supabase/functions/report-generate-on-demand/index.ts#L83-L105), lo cual contradice “sin dependencias externas”.
- Ya existe una base para “bitácora/archivado” de gastos: `maintenance_logs` → `maintenance_logs_archive` vía función SQL `archive_maintenance_logs_for_report(...)` (solo `service_role`) en [20260217161000_report_expenses_archival_postsend.sql](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/supabase/migrations/20260217161000_report_expenses_archival_postsend.sql#L48-L135).
- `app_settings` hoy es legible por cualquier usuario autenticado ([20250118040000_complete_integration_schema.sql](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/supabase/migrations/20250118040000_complete_integration_schema.sql#L129-L135)), por lo que NO es apto para guardar secrets sin ajustar RLS.

## 1) Configuración requerida (API key + selector de modelo)
- **DB/RLS (seguridad):**
  - Extender `app_settings` con `is_public boolean default false`.
  - Reemplazar la policy de SELECT “Authenticated users can view…” por: `SELECT` solo si `is_public = true` o `public.is_admin()`.
  - Insertar keys obligatorias (categoría `reports_pdf_local`):
    - `local_ai_api_key` (string)
    - `local_ai_model` (string)
    - (recomendado) `local_ai_endpoint` (string; default p.ej. `http://localhost:11434` o endpoint interno)
- **UI (AdminSettings):**
  - Añadir bloque “Reportes PDF (local)” visible solo para `admin` y `super_admin`.
  - Validación obligatoria: no permitir “Generar PDF” si falta API key o modelo.
  - Opcional: botón “Probar conexión” que haga un ping al endpoint/modelo y guarde log.

## 2) Motor de IA local + “formateador autorizado”
- **Proveedor de IA (frontend):**
  - Crear módulo `src/lib/localAiClient.ts` con interfaz unificada:
    - `listModels()` (si el endpoint lo soporta)
    - `generateReportText({property, period, events, costs, promptTemplate})`
  - El API key se envía solo en headers hacia el endpoint configurado.
- **Formateador autorizado:**
  - Crear `src/utils/authorizedReportFormatter.ts`:
    - Normaliza títulos/secciones, listas, formato de moneda/fechas.
    - Sanitiza contenido (sin HTML peligroso) y lo transforma a una estructura tipada (`sections[]`) lista para render en PDF.
    - Garantiza consistencia para cliente final (tipografía, encabezados, bullets, etc.).

## 3) Sistema de plantillas administrables (CRUD + auto-selección)
- **Modelo de datos:**
  - Tabla `report_pdf_templates`:
    - `id uuid`, `name`, `report_key`, `enabled`, `priority int`, `template_spec jsonb`, `match_rules jsonb`, timestamps, `created_by`.
  - RLS: `FOR ALL USING (public.is_admin())`.
- **Auto-selección:**
  - Función `selectTemplate(templates, reportContext)` que evalúa `match_rules` (criterios predefinidos) y elige por `priority`.
  - Criterios iniciales propuestos:
    - `report_key` (obligatorio)
    - `property_id` (opcional)
    - `min_total_cost`, `max_total_cost`
    - `min_events`, `has_images`
    - `location_contains`
- **UI CRUD (Admin-only):**
  - Nueva pantalla `AdminReportTemplates` con lista + crear/editar/duplicar/deshabilitar.
  - Editor del `template_spec` con validación JSON y preview (generación de PDF con dataset de ejemplo).

## 4) Generador PDF local con formato profesional
- **Librería:** incorporar una librería de PDF que funcione en navegador (p.ej. `pdf-lib`) para generar bytes localmente.
- **Renderer:** `src/lib/pdf/renderReportPdf.ts`:
  - Portada (propiedad/periodo/branding), resumen ejecutivo, tabla de sucesos, desglose de costos, totales.
  - Inserción de imágenes (comprobantes/fotos) con escalado y manejo de errores (si una imagen falla, se omite y se registra).
  - Soporte multi-propiedad: el renderer es puro y recibe `{propertyId, month, events, costs, images, template}`.

## 5) Bitácora mensual + archivado + base64
- **Nuevo ledger histórico:**
  - Tabla `monthly_cost_ledger`:
    - `id`, `property_id`, `month`, `events jsonb`, `totals jsonb`, `pdf_base64 text`, `pdf_bytes int`, `created_by`, `created_at`.
  - RLS: solo `public.is_admin()`.
- **Reset mensual (archivado):**
  - Crear nueva función SQL `archive_maintenance_logs_for_report_admin(...)` (SECURITY DEFINER) que:
    - Verifica `public.is_admin()`.
    - Mueve `maintenance_logs` del periodo a `maintenance_logs_archive` (reutiliza la lógica actual) para “reiniciar” el mes.
  - En UI de generación: checkbox “Archivar costos del mes al finalizar” (default ON) para iniciar nuevo cálculo.

## 6) Logs detallados y manejo robusto de errores
- **Tabla de eventos de generación:** `report_generation_events` con `run_id/ledger_id`, `level`, `step`, `message`, `data jsonb`, `created_at`.
- **Logger en frontend:** helper `reportLogger` que escribe a consola + inserta eventos (batch).
- **Errores:**
  - Captura por etapa (IA, formateo, fetch imágenes, render, persistencia, archivado).
  - Mensajes accionables para debugging (sin exponer secrets).

## 7) Acceso exclusivo Admin/SuperAdmin
- UI: rutas/botones visibles solo para Admin/SuperAdmin (usando el patrón existente de perfil/rol).
- DB: RLS en nuevas tablas + endurecimiento de `app_settings` para secretos.

## 8) Documentación técnica
- Crear `docs/local-pdf-reporting.md`:
  - Flujo end-to-end
  - Esquema de settings
  - Especificación del `template_spec` y `match_rules`
  - Estrategia de logs/errores
  - Consideraciones de performance (imágenes/base64)

## 9) Verificación
- Tests unitarios (Vitest) para:
  - Selección de plantillas por reglas
  - Formateador autorizado (entrada/salida estable)
- Prueba manual:
  - Generar PDF de una propiedad con imágenes y costos; verificar guardado base64 y archivado mensual.

Si confirmas este plan, implemento las migraciones (tablas/RLS/funciones), las nuevas pantallas Admin, el motor de plantillas, el formateador, el generador PDF local y la documentación, y dejo el flujo listo para uso exclusivo de Admin/SuperAdmin.