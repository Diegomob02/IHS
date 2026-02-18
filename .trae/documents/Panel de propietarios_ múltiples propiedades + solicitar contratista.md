## Estado Actual (lo que ya existe)
- El portal de propietarios ya carga todas las propiedades desde Supabase y filtra por `owner_email` para mostrar “mis propiedades” en el tab Dashboard ([OwnerPortal.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/pages/OwnerPortal.tsx#L457-L703)). Hoy las muestra en una lista de cards, pero sin búsqueda, filtros ni paginación.
- Ya existe infraestructura de notificaciones en tiempo real basada en la tabla `public.notifications` + suscripción realtime por `user_id` ([NotificationContext.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/context/NotificationContext.tsx#L54-L89)).
- En DB ya existe la tabla `public.maintenance_requests` (tickets) con `priority`/`status` pero actualmente no hay UI para que el propietario cree solicitudes ni para que los admins las gestionen (solo se usan para conteos/KPIs en admin).

## Objetivo
1) Dar visibilidad real y gestionable de múltiples propiedades (cards/lista + búsqueda/filtros + paginación > 10).
2) Agregar tab “Solicitar Contratista” para que el propietario genere solicitudes por propiedad y por servicios.
3) Al crear/actualizar solicitudes, reflejar cambios inmediatamente en admins asignados a esa propiedad y en superadmins (panel + notificaciones realtime, y opcional email).

## Diseño de Datos (Supabase)
- Reutilizar `public.maintenance_requests` como “solicitud de trabajo/contratista” para integrarlo naturalmente con KPIs y carga operativa.
- Extender `maintenance_requests` para cubrir el nuevo formulario:
  - `services` (JSONB) para multiselección categorizada (plomería, electricidad, etc.).
  - `preferred_date` (date/timestamptz) para fecha preferente.
  - `budget_estimated` (numeric) para presupuesto.
  - Ajustar constraints de `status` para soportar: `pending`, `in_review`, `assigned`, `completed`, `cancelled` (manteniendo compatibilidad con los existentes).
  - (Opcional) mantener `issue_type` como `general` y usar `services` como clasificación real.
- RLS/Policies:
  - Owners: pueden crear/ver sus solicitudes (validando propiedad pertenece al owner).
  - Admin: pueden ver/actualizar solicitudes de propiedades donde `properties.assigned_admin_id = auth.uid()`.
  - Superadmin: puede ver/actualizar todas.

## Notificaciones y “Tiempo Real”
- Al crear una solicitud:
  - Insertar notificaciones en `public.notifications` para:
    - Admin asignado de esa propiedad (si existe).
    - Todos los usuarios con `role='super_admin'`.
  - Esto activa actualización realtime en UI mediante el NotificationCenter ya existente.
- Para “reflejo inmediato” en tablas/listas:
  - (Recomendado) habilitar realtime de `maintenance_requests` (publicación) y suscribir AdminDashboard a cambios para refrescar la lista/contadores automáticamente.

## Endpoints RESTful
- Implementar Edge Functions (HTTP) para encapsular lógica, validaciones, y notificaciones:
  - `POST /functions/v1/maintenance-request-create` (owner): valida propiedad, inserta solicitud, crea notificaciones, devuelve la solicitud creada.
  - `PATCH /functions/v1/maintenance-request-update-status` (admin/super_admin): cambia status y notifica owner (opcional) + registra auditoría mínima.
  - `GET /functions/v1/maintenance-requests` (owner/admin/super_admin): lista paginada con filtros (status, fecha, property_id).
- Alternativa (si prefieres menos Edge): usar PostgREST (`supabase.from('maintenance_requests')`) y un trigger SQL para notificaciones. Mi recomendación es Edge Functions por control y validación.

## Cambios en UI (Frontend)
### 1) Múltiples propiedades (OwnerPortal)
- Crear un módulo “Mis Propiedades” dentro del tab Dashboard:
  - Vista cards o lista con: nombre, dirección, estado, imagen principal.
  - Búsqueda (por título/dirección) + filtro (status/activa).
  - Paginación cuando `myProperties.length > 10`.
  - Indicador visible: “Tienes N propiedades”.
  - Selección de propiedad (card click / selector) para usarla como contexto del tab “Solicitar Contratista” y “Documentos”.

### 2) Tab nuevo: “Solicitar Contratista”
- Añadir tab en sidebar + estado `activeTab` y soporte de `?tab=`.
- Formulario:
  - Propiedad (selector si tiene >1).
  - Servicios (multiselección por categorías).
  - Descripción (con límite de caracteres).
  - Urgencia (baja/media/alta) mapeada a `priority`.
  - Fecha preferente.
  - Presupuesto estimado.
  - Validaciones obligatorias.
  - Botón anti-duplicados (deshabilitar mientras se envía + dedupe por último submit y payload).
- Historial:
  - Tabla/lista con filtros por fecha y status.
  - Estado de seguimiento visible (pendiente/en revisión/asignado/completado).

### 3) Admin/Superadmin (AdminDashboard)
- Agregar un tab nuevo (p.ej. “Solicitudes”) para listar solicitudes:
  - Admin ve solo propiedades asignadas; superadmin ve todo.
  - Filtros por propiedad, status, fechas.
  - Acción para cambiar status (en revisión/asignado/completado).
  - Al actualizar status: notificar al owner (in-app; email opcional).

## Verificación
- Agregar pruebas mínimas (o scripts) de:
  - Inserción de solicitud como owner y creación de notificaciones.
  - Lectura/actualización como admin asignado y como superadmin.
  - UI: paginación >10 y filtros funcionan; la notificación llega sin refrescar.

## Entregables
- Migración(es) SQL para columnas/constraints/policies y (si aplica) habilitar realtime.
- 2–3 Edge Functions para crear/listar/actualizar solicitudes.
- Actualización de OwnerPortal y AdminDashboard (nuevo tab + UI de solicitudes).
- Nuevas traducciones en [translations.ts](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/utils/translations.ts).

Si confirmas este plan, procedo a implementar empezando por: migraciones + Edge Functions (seguridad/notificaciones) y luego UI owner/admin con paginación/filtros.