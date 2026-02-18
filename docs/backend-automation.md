# Automatización de Backend (Emails, Reportes, TTS)

Este documento describe la automatización del backend basada en Supabase (Postgres + Storage + Edge Functions).

## 1) Emails transaccionales (cola + reintentos + logs)

### Tablas
- `public.email_outbox`: cola de emails (pending/processing/sent/failed/dead).
- `public.email_delivery_logs`: log por intento (sent/failed) con respuesta del proveedor.

### Flujo
1. Las funciones del backend encolan un email en `email_outbox` (subject/html/attachments + metadata).
2. Un “worker” (Edge Function `email-dispatcher`) toma un lote de jobs con lock (`dequeue_email_outbox`) y envía por Resend.
3. En caso de fallo, se registra en `email_delivery_logs` y se reintenta con backoff exponencial + jitter hasta `max_attempts`.

### Edge Function
- `email-dispatcher` (POST, protegida por `x-cron-secret`)
  - Lee jobs mediante RPC `dequeue_email_outbox(p_batch_size)`.
  - Envía por Resend y actualiza `email_outbox` + `email_delivery_logs`.

### Configuración (env)
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `CRON_SECRET` (para invocaciones programadas)

### Plantillas personalizables
El repositorio ya usa `app_settings.email_templates` (JSON) para overrides de `subject/html` por evento (ej: `lead_contact_received`, `contractor_approved`, etc.).  
El encolado guarda `template_key` y `template_vars` como trazabilidad.

## 2) Reportes automáticos (diario / semanal / mensual) + distribución por email

### Tablas
- `public.report_schedules`: definición de reportes programados (frecuencia, tz, destinatarios, config, next_run_at).
- `public.report_runs`: historial de ejecuciones (running/success/failed) y outputs (bucket/path + email_outbox_ids).

### Programación
Se calcula `next_run_at` con `compute_next_report_run(...)` y se hace lock de ejecuciones con `dequeue_due_report_schedules(p_batch_size)`.

### Edge Function
- `reports-runner` (POST, protegida por `x-cron-secret`)
  - Toma schedules vencidos y ejecuta el `report_key`.
  - Genera el output (PDF si hay webhook) y encola emails a `recipients`.
- `reports-postprocessor` (POST, protegida por `x-cron-secret`)
  - Espera a que los emails asociados a un `report_run` estén en `sent`.
  - Archiva los gastos del periodo en `maintenance_logs_archive` con metadata del reporte.
  - Actualiza `report_runs.archived_at` + `archive_result` + `executive_summary`.

### Report keys incluidos
- `property_monthly_maintenance`
  - Recolecta `maintenance_logs` del mes y documentos de la propiedad.
  - Genera PDF vía webhook (`REPORT_WEBHOOK_URL`) o fallback (PDF mock).
  - Exporta un dataset JSON con gastos/imágenes/facturas y lo expone vía signed URL (`datasetUrl`) para que el motor de PDF lo consuma.
  - Sube el PDF a Storage (`documents/<propertyId>/reports/<YYYY-MM>.pdf`) y versiona en `documents`/`document_versions`.
  - Encola emails con el PDF como attachment (signed URL 7 días).
- `system_kpis`
  - Genera un resumen en HTML con contadores de `leads`, `contractor_applications`, `maintenance_requests` en una ventana de tiempo configurable.

### Generación manual (desde AdminDashboard)
- `report-generate-on-demand` (POST, requiere usuario admin/super_admin)
  - `action=generate`: genera el PDF y devuelve signed URL para previsualización.
  - `action=send`: encola el email del reporte para el owner (y el postprocesador archiva al confirmarse el envío).

### Configuración (env)
- `REPORT_WEBHOOK_URL` (recomendado para backend; como fallback se acepta `VITE_REPORT_WEBHOOK_URL`)
- `CRON_SECRET`
- `RESEND_FROM_EMAIL` (para el “from” por defecto en distribución)

## 3) Lector de voz (TTS) para reportes + caché de audio

### Tablas / Storage
- Bucket Storage: `report-audio` (privado).
- `public.report_audio_cache`: caché por `cache_key` (hash del texto + idioma + voz + velocidad + provider/model).

### Edge Function
- `tts-generate` (POST, requiere usuario autenticado con rol admin/super_admin)
  - Si existe audio en caché: devuelve signed URL (1 hora).
  - Si no existe: genera audio por TTS, sube a Storage y cachea.

### Configuración (env)
- `OPENAI_API_KEY`
- `OPENAI_TTS_MODEL` (default: `tts-1`)
- `OPENAI_TTS_VOICE` (default: `alloy`)

### UI
En `AdminDashboard` existe un generador manual de reportes que permite capturar incidentes, adjuntar evidencias (imágenes) y agregar costos. La generación del PDF se realiza en backend y regresa en base64 para previsualización/guardado.

## 4) Health check y monitoreo básico

### Edge Function
- `health` (GET, `verify_jwt=false`, protegida por `x-health-secret`)
  - Verifica conectividad DB
  - Reporta conteos básicos de colas (emails pendientes y reportes vencidos)

### Configuración (env)
- `HEALTH_SECRET` (si no existe, usa `CRON_SECRET`)

## 5) Cron / Scheduling externo (ejemplo)

El repo ya usa el patrón “scheduler externo” + header `x-cron-secret`.

Ejemplo (pseudo-curl):
- `POST https://<PROJECT>.functions.supabase.co/email-dispatcher`
  - headers: `apikey: <SUPABASE_ANON_KEY>`, `Authorization: Bearer <SUPABASE_ANON_KEY>`, `x-cron-secret: <CRON_SECRET>`
- `POST https://<PROJECT>.functions.supabase.co/reports-runner`
  - mismos headers
- `POST https://<PROJECT>.functions.supabase.co/reports-postprocessor`
  - mismos headers

## 6) Seguridad y manejo de errores

- Funciones “cron” requieren `x-cron-secret`.
- `tts-generate` valida sesión y rol (`admin`/`super_admin`) antes de acceder a Storage/DB.
- Reintentos automáticos:
  - Emails: backoff exponencial con jitter y corte por `max_attempts`.
  - Reportes: reintento simple (30 min) cuando falla una ejecución.

## 7) Reporte manual en PDF (base64) sin transcripción

### Edge Function
- `manual-report-pdf` (POST, requiere usuario autenticado con rol admin/super_admin)\n  - Recibe `incidentText`, `costs[]` e `images[]` (URLs) y genera un PDF con logo IHS en el encabezado.\n  - Devuelve `{ pdfBase64 }` (sin data URL).

### Configuración (env)
- `OPENAI_API_KEY` (opcional; si falta, genera un cuerpo básico sin IA)\n- `OPENAI_TEXT_MODEL` (default: `gpt-4o-mini`)\n- `IHS_LOGO_URL` (URL pública del logo IHS a usar en el encabezado)
