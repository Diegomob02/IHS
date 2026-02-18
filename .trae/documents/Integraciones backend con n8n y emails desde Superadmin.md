## Situación Actual (ya en el repo)
- La app es React + Supabase (Postgres/RLS/Auth) + Supabase Edge Functions (Deno).
- Ya existe panel de **Super Admin** para configurar integraciones en `public.integration_configs` (WhatsApp y n8n) y una guía: [super-admin-integraciones.md](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/docs/super-admin-integraciones.md).
- n8n tiene un “punto de entrada” listo (webhook URL) y helper en frontend: [n8n.ts](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/lib/n8n.ts).
- Emails con Resend ya funcionan en backend para contratistas: [contractor-apply](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/supabase/functions/contractor-apply/index.ts).
- Formularios públicos (Contacto/Evaluación) hoy insertan directo a `public.leads` y no disparan email/automatización: [Contact.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/pages/Contact.tsx), [Evaluation.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/pages/Evaluation.tsx).
- Contratistas tienen `status` (`submitted | nda_sent | reviewing | approved | rejected`) pero el tab en admin solo lista; no permite cambiar status ni notificar: [contractor_applications.sql](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/supabase/migrations/20260210090000_contractor_applications.sql).

## Objetivo
- Que el **Super Admin** pueda “conectar” integraciones (n8n / WhatsApp) y que el backend dispare automatizaciones.
- Implementar opcionalidades tipo:
  - Email “Recibimos tu solicitud / tu propiedad está en revisión” (cuando llega una evaluación).
  - Email “Tu solicitud está siendo evaluada” (cuando un contratista pasa a `reviewing`).

## Enfoque Propuesto (simple, robusto, coherente con el repo)
- Usar **Supabase Edge Functions** como “capa de backend” para eventos importantes (no depender del navegador para disparar automatizaciones).
- Usar **n8n** como orquestador (ramifica por `type`) y/o como canal de salida.
- Mantener **Resend** para emails transaccionales (más confiable) pero controlando “si se envían” y “qué texto usan” desde Superadmin vía `app_settings`.

## Cambios Backend (Edge Functions + DB)
1) **Nueva Edge Function `lead-submit`**
- Endpoint único para Contacto y Evaluación.
- Hace:
  - Validación básica anti-spam (honey pot + rate-limit simple por IP/email).
  - Inserta en `public.leads`.
  - Dispara evento a n8n (si está habilitado en `integration_configs`).
  - Envía email de confirmación (si está habilitado por setting) usando Resend.

2) **Nueva Edge Function `contractor-update-status` (admin-only)**
- Actualiza `public.contractor_applications.status`.
- Al cambiar a `reviewing`/`approved`/`rejected`:
  - Dispara evento a n8n.
  - Envía email correspondiente al contratista (plantilla configurable).

3) **Opcional: Edge Function `lead-update-status` (admin-only)**
- Reemplaza el update directo del frontend para que el cambio de estado pueda disparar automatizaciones (ej. cuando pasa a `contract_sent`).

4) **Settings/Plantillas en DB (controlables desde Superadmin)**
- Usar `public.app_settings` (ya existe) para guardar:
  - `notification_rules` (qué eventos envían email / n8n / whatsapp).
  - `email_templates` (subject/body por evento, ES/EN).
- Se edita desde el panel actual de Settings (ya existe pantalla de system settings): [AdminSettings.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/pages/AdminSettings.tsx).

## Cambios Frontend (Superadmin + Formularios)
1) **Contact.tsx y Evaluation.tsx**
- En vez de `supabase.from('leads').insert(...)`, llamar a `supabase.functions.invoke('lead-submit', { body: ... })`.
- Esto habilita automáticamente:
  - Email “tu propiedad está en revisión” para evaluaciones.
  - Notificación interna y/o n8n.

2) **AdminDashboard – Tab Contratistas**
- Agregar acciones por fila:
  - Dropdown de status (submitted/nda_sent/reviewing/approved/rejected).
  - Botón “Notificar” (si quieren re-enviar).
- Estas acciones llaman `contractor-update-status`.

3) **IntegrationsSettings**
- No se cambia el concepto: se reutiliza lo existente (n8n/whatsapp).
- Solo se asegura que los nuevos eventos usen el mismo `integration_configs` (como ya hace [billing-notify](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/supabase/functions/billing-notify/index.ts)).

## Diseño de Eventos (para n8n)
- Formato estándar (ya compatible con el helper existente):
  - `{ type, timestamp, data }`
- Tipos a implementar inicialmente:
  - `lead_submitted` (subtipo `contact_form` / `evaluation`).
  - `contractor_status_changed`.
- n8n recomendado:
  - Webhook → Switch por `type` →
    - Enviar email al usuario
    - Enviar email interno / crear tarea
    - (Opcional) WhatsApp vía integración

## Seguridad y Secrets
- Webhook URL de n8n se trata como “no secreto” (ya se expone como config pública cuando está habilitado).
- Keys sensibles (Resend/Stripe/Supabase service role) solo en Secrets de Edge Functions.
- Las Edge Functions admin-only validan sesión y rol (`is_admin/is_super_admin`).

## Verificación
- Probar desde UI:
  - Enviar Contacto y Evaluación y confirmar: lead creado + evento enviado + email recibido.
  - Cambiar status de contratista a `reviewing` y confirmar email + evento.
- Agregar logging mínimo (sin secretos) y respuesta clara en UI.

Si confirmas este plan, ejecuto los cambios en el repo (funciones, settings y UI) y lo dejo probado end-to-end.