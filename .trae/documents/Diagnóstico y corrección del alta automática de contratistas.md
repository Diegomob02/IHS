## Diagnóstico (lo que pasa hoy)
- La Edge Function de aprobación [contractor-update-status](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/supabase/functions/contractor-update-status/index.ts) no crea ningún usuario en Supabase Auth: solo actualiza `contractor_applications`, hace upsert de allowlist en `user_roles` y genera un `contractor_invites.token`.
- El “alta” en Auth depende de que el contratista haga `signUp`/`signIn` desde [ContractorInvite.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/pages/ContractorInvite.tsx) y luego ejecute el RPC `consume_contractor_invite`.
- La plataforma bloquea o permite acceso principalmente por `public.user_roles.status` (ver [authRouting.ts](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/utils/authRouting.ts) y el guard [RequireRouteAccess.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/components/auth/RequireRouteAccess.tsx)). Si el upsert a `user_roles` falla, el login queda “pendiente” aunque el contratista esté aprobado.
- La aprobación puede “parecer que falla” porque `AdminDashboard` siempre manda `notify:true` ([AdminDashboard.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/pages/AdminDashboard.tsx#L475-L491)) y la Edge Function devuelve 500 si faltan `RESEND_API_KEY/RESEND_FROM_EMAIL` ([contractor-update-status](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/supabase/functions/contractor-update-status/index.ts#L177-L216)).
- Hoy se ignoran errores en varios pasos críticos (p.ej. el upsert de `user_roles` no valida `error`). Esto dificulta el diagnóstico.
- No existe webhook/trigger DB que ejecute la Edge Function al aprobar: el único disparador es la llamada del frontend. Si alguien aprueba modificando la fila directamente, la función no corre.
- Riesgo adicional: el trigger de signup `handle_new_user()` puede fallar/ser inconsistente con contractors (nombre NOT NULL y lógica de `user_roles`), lo que puede romper el alta en `public.users` y luego el RPC `consume_contractor_invite` por FK.

## Objetivo (flujo esperado)
- Al aprobar un contratista: crear/asegurar usuario en Auth, asignar permisos/allowlist, crear perfil de contratista y garantizar login exitoso (sin pasos manuales frágiles).

## Plan de implementación
### 1) Instrumentación y diagnóstico robusto
- Agregar “correlation id” por request en `contractor-update-status` y registrar cada paso en `audit_logs` (patrón existente en [log-access-attempt](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/supabase/functions/log-access-attempt/index.ts)).
- Incluir en la respuesta del endpoint un resumen de pasos: `applicationUpdated`, `userRoleUpdated`, `authUserCreatedOrFound`, `contractorProfileCreated`, `emailSent`, `warnings[]`.
- Validar y reportar explícitamente errores de: update de `contractor_applications`, upsert `user_roles`, insert `contractor_invites`, y cualquier operación de Auth.

### 2) Hacer la aprobación idempotente y no-bloqueante por email
- Cambiar el comportamiento para que un fallo de email (Resend no configurado / provider error) no reviente toda la aprobación: devolver `ok:true` con `emailSent:false` y un warning, y dejar un registro en `audit_logs` + (opcional) `notifications` para admins.

### 3) Crear usuario en Supabase Auth al aprobar (alta automática)
- En `contractor-update-status`, cuando `status === 'approved'`:
  - Buscar usuario Auth por email.
  - Si no existe, crear/invitar usuario vía Admin API (service role):
    - Preferido: `inviteUserByEmail`/`generateLink` (evita enviar contraseñas en texto plano).
    - Alternativa: `createUser` con `email_confirm: true` y generar link de “reset password” para que el contratista establezca su contraseña.
  - Persistir el vínculo `application_id ↔ auth_user_id` (nuevo campo en `contractor_applications` o nueva tabla) para evitar duplicados y permitir auditoría.

### 4) Asegurar permisos correctos para el portal de contratistas
- Garantizar `public.user_roles` queda en `role='contractor'` y `status='approved'` al aprobar (y no se revierte por triggers de signup).
- Garantizar la creación/actualización de `public.contractor_profiles` al aprobar (usando `auth_user_id` ya conocido), o mantenerlo al consumir invite pero con validaciones claras.

### 5) Corregir el trigger `handle_new_user()` para no romper contractors
- Actualizar la función SQL `public.handle_new_user()` para:
  - No fallar si no viene `name` (fallback seguro, p.ej. parte local del email).
  - No pisar `user_roles` existente (si ya hay un registro por email, no cambiar role/status).
- Esto evita (a) errores en signup por `name NOT NULL` y (b) que un contractor termine como `owner/approved` por defecto.

### 6) Ajustes en UI/UX (si aplica)
- En el panel de Super Admin, mostrar el resultado de la aprobación con:
  - Estado de creación/invitación de usuario Auth.
  - Link de acceso generado (si aplica) y/o botón “Reenviar invitación”.
  - Mensajes de warning cuando falle email pero la aprobación sí quedó aplicada.

### 7) Verificación end-to-end
- Agregar un checklist de verificación:
  - Aprobar contractor → se crea/encuentra usuario Auth.
  - `user_roles` queda `contractor/approved`.
  - `contractor_profiles` existe y es visible por ese usuario.
  - Login con el flujo de invitación/restablecimiento funciona y redirige a `/portal-contratistas`.
  - `audit_logs` registra pasos y errores con correlation id.

## Entregables
- Cambios en Edge Function `contractor-update-status`.
- Migración SQL para actualizar `handle_new_user()` y, si corresponde, nuevo campo/tabla de vínculo con Auth.
- Ajustes menores en UI para mostrar/reenviar invitación y warnings.
- Pruebas/verificación del flujo completo.
