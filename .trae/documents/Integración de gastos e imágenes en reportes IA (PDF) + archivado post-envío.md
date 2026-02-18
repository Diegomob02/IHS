## Estado actual (lo que ya tienes)
- Los “gastos” operativos viven en `maintenance_logs.cost` y sus evidencias en `maintenance_logs.images` (URLs del bucket público `property-images`).
- El KPI “Gastos Operativos (Bitácora)” del superadmin ya se calcula sobre `maintenance_logs_all` (unión de activos + archivados), así que no se pierde visibilidad al archivar.
- El runner automático actual genera reportes por propiedad y ya incluye `logs` con `cost` e `images` en el payload, pero:
  - No garantiza inclusión de comprobantes tipo “invoice” (documents) dentro del PDF.
  - No ejecuta archivado condicionado a “email enviado exitosamente”.
  - No genera análisis IA/heurísticos (tendencias/anomalías) ni validaciones estrictas.

## Objetivo funcional
1) Incluir 100% de gastos con sus imágenes/comprobantes en el PDF generado por IA.
2) Activación “siempre on” (auto-creación/auto-recuperación de schedules + idempotencia).
3) Tras envío exitoso: archivar los gastos procesados, evitar duplicados, y actualizar/resumir KPIs del superadmin.

## Cambios en Base de Datos (migraciones)
1) **Metadatos de procesamiento en histórico**
- Extender `maintenance_logs_archive` con:
  - `processed_report_run_id uuid`
  - `processed_at timestamptz`
  - `processed_status text` (ej. `archived`)
- Ajustar `maintenance_logs_all` para exponer esos campos (y mantener compatibilidad).

2) **Archivar por rango y por propiedad (idempotente)**
- Crear RPC `archive_maintenance_logs_for_report(p_property_id, p_from_date, p_to_date, p_report_run_id)` (service_role) que:
  - Inserta en `maintenance_logs_archive` solo los logs del periodo de ese reporte y propiedad.
  - Usa `ON CONFLICT DO NOTHING` por `id`.
  - Borra de `maintenance_logs` solo los ids insertados (evita borrados “de más” si se reintenta).
  - Devuelve JSON con conteos y control de consistencia.

3) **Tracking de archivado en `report_runs`**
- Agregar columnas a `report_runs`:
  - `archived_at timestamptz`
  - `archive_result jsonb`
  - `executive_summary jsonb`
  - (opcional) `attempts int` para reintentos del post-proceso.

4) **Auto-activación de schedules**
- Trigger en `properties` (o job de “reconciliación”) que garantice que exista un `report_schedule` mensual por propiedad (siempre que la propiedad cumpla criterios).

## Cambios en Edge Functions
1) **reports-runner: integrar gastos + imágenes + comprobantes (facturas) y análisis**
- Para `property_monthly_maintenance`:
  - Obtener `maintenance_logs` del periodo y validar:
    - `cost > 0` ⇒ `images` debe ser array no vacío y URLs válidas.
    - Si falta evidencia, marcar como “incompleto” y notificar (sin archivar) para cumplir 0 pérdida y evitar inconsistencias.
  - Incluir comprobantes de `documents` tipo `invoice` del periodo:
    - Firmar URLs (bucket `documents`) y pasarlas al webhook para que el PDF los inserte o los liste como anexos.
  - Optimización tamaño imágenes:
    - En el payload agregar `image_hints` (max width/quality) y, cuando sea posible, generar URLs de “render/image” de Supabase para thumbnails.
  - Performance 1000 gastos:
    - Guardar el dataset completo (JSON) en Storage (bucket `documents` o bucket nuevo `report-data`) y enviar al webhook un `signedUrl` al JSON en vez de meter todo el payload inline.
  - Análisis automático (sin depender 100% del webhook):
    - Tendencias: total por día/semana, variación vs periodo anterior.
    - Categorización: mapa por keywords configurable en `report_schedules.config`.
    - Anomalías: regla estadística simple (picos diarios / outliers por z-score o percentil) + lista en el payload.

2) **Nuevo post-procesador: “después de envío exitoso”**
- Crear Edge Function `reports-postprocessor` (cron + `x-cron-secret`) que:
  - Busca `report_runs` en `success` sin `archived_at`.
  - Verifica que todos los `email_outbox_ids` estén `sent`.
  - Ejecuta `archive_maintenance_logs_for_report(...)`.
  - Escribe `archived_at`, `archive_result` y `executive_summary`.
  - Inserta notificación en `notifications` y audit logs en `audit_logs` (éxito/fallo).
  - Reintenta con backoff si hay fallo temporal, sin duplicar (idempotente por `report_run_id`).

## Ajustes en UI (Superadmin / Admin)
- En `AdminDashboard` (overview superadmin):
  - Mostrar estado “último reporte generado / enviado / archivado” por propiedad.
  - Mostrar “resumen ejecutivo” (desde `report_runs.executive_summary`): total, top categorías, anomalías.
- Mantener el KPI de gastos actual (ya funciona sobre `maintenance_logs_all`).

## Notificaciones, logs y auditoría
- En cada etapa clave:
  - `audit_logs`: `report_generated`, `report_email_enqueued`, `report_email_sent`, `report_archived`, `report_failed`.
  - `notifications` a superadmins cuando:
    - faltan evidencias,
    - falla generación,
    - finaliza archivado.

## Idempotencia y auto-recuperación (criterios de calidad)
- Idempotency keys:
  - `report_runs` por `property_id + month + report_key`.
  - `email_outbox` ya usa `idempotency_key` en varios flujos; se extenderá para reportes.
- Locks:
  - `report_schedules.locked_until` ya evita ejecuciones simultáneas.
  - El post-procesador solo procesa runs no archivados.

## Verificación (antes de activar en prod)
- Tests unitarios nuevos para:
  - Validación de evidencias,
  - Cálculo de tendencias/anomalías,
  - Idempotencia de archivado.
- Smoke tests:
  - Generar un reporte mensual, encolar emails, simular `email_outbox.sent`, correr post-procesador y verificar:
    - que los logs pasan a `maintenance_logs_archive` con `processed_report_run_id`,
    - que `maintenance_logs_all` y KPIs reflejan el consolidado,
    - que no se duplican en re-ejecuciones.

Si confirmas este plan, implemento los cambios (migraciones + nuevas functions + ajustes en reports-runner + UI superadmin) y dejo todo funcionando “always on” con archivado post-envío.