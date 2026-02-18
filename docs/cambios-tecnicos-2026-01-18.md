# Cambios técnicos (2026-01-18)

## 1) Bitácora de mantenimiento: corrección de seguridad (RLS)

**Problema**
- Al guardar un registro en `maintenance_logs` aparecía: `new row violates row-level security policy`.

**Causa raíz**
- La política `FOR ALL` de `maintenance_logs` solo tenía `USING (...)` y no tenía `WITH CHECK (...)`.
- En PostgreSQL, los `INSERT` bajo RLS se validan con `WITH CHECK`. Si no existe, el `INSERT` se rechaza.

**Solución**
- Se reemplazaron las políticas en `maintenance_logs`:
  - Admins: `FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())`.
  - Owners: `FOR SELECT` por propiedad, validando `owner_id` o `owner_email`.

**Migración**
- `supabase/migrations/20260118070000_fix_maintenance_logs_rls.sql`

## 2) Propietarios: visualización de documentos

**Problema típico**
- Propiedades asignadas por `owner_email` antes de que exista `owner_id` (registro posterior del usuario).

**Solución**
- Se amplió la lectura de documentos para que el owner pueda verlos si coincide `owner_id` o `owner_email`.

**Migración**
- `supabase/migrations/20260118050000_fix_documents_rls_email.sql`

## 3) Eliminación del módulo de gastos

**Alcance**
- Se removió el módulo de gastos en frontend (portales) y se eliminó la tabla asociada en base de datos.

**Base de datos**
- Se eliminó `public.financial_records`.

**Migración**
- `supabase/migrations/20260118080000_remove_financial_records_module.sql`

**Frontend**
- `OwnerPortal` ya no consulta ni muestra gastos.
- `AdminDashboard` ya no incluye pestaña/módulo de gastos ni vistas previas de gastos.

## 4) Reporte global: KPIs operativos por propiedad con filtro por admin

**Objetivo**
- Exponer un reporte global basado en KPIs operativos (bitácora, documentos y pendientes) con filtro por administrador.

**Backend (API SQL)**
- Se añadió:
  - `public.is_super_admin()`
  - `public.get_property_kpis(p_month_start date, p_admin_id uuid)`

**Qué regresa `get_property_kpis`**
- Por propiedad:
  - `open_requests`: solicitudes de mantenimiento en `pending`/`in_progress`.
  - `logs_count`, `logs_cost`, `last_log_date`: bitácora del mes.
  - `docs_count`, `last_doc_created_at`: documentos del mes (no archivados).
  - `monthly_fee`, `contract_status` como base de KPIs comerciales.

**Seguridad**
- Requiere `public.is_admin()`.
- Si el usuario no es `super_admin`, solo devuelve propiedades donde `assigned_admin_id = auth.uid()`.

**Migración**
- `supabase/migrations/20260118090000_add_property_kpis.sql`

## 5) Endurecimiento de seguridad para descarga de documentos

**Cambio**
- El bucket `documents` pasa a privado y se restringe la lectura en `storage.objects`.

**Resultado**
- Admins: lectura total.
- Owners: lectura solo de rutas con prefijo `<property_id>/...` donde la propiedad les pertenece (por `owner_id` o `owner_email`).

**Migración**
- `supabase/migrations/20260118100000_secure_documents_storage.sql`

**Frontend**
- En `AdminDashboard` (sección `Resumen Global` para `super_admin`) se agregó una tabla de KPIs:
  - Filtro por `mes`.
  - Filtro por `admin`.
  - Exportación CSV.

## 6) Ajustes de UX y manejo de errores

**Bitácora en frontend**
- Se mejoró el manejo de error en el guardado de bitácora:
  - Log estructurado en consola (code/message/details/hint).
  - Mensaje claro al usuario si se trata de un rechazo por RLS.
- Validación previa de `property_id` (UUID) para evitar inserts en propiedades de demo.

**Documentos en frontend**
- `created_by` / `uploaded_by` ahora apuntan a `public.users.id` (no `auth.users.id`) cuando existe perfil; si no existe, se guarda `NULL` para evitar fallos de FK.
