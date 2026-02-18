# Super Admin — Integraciones (WhatsApp / n8n)

## Objetivo
Centralizar la configuración de integraciones en el panel de **Super Admin**, incluyendo validación, pruebas de conexión y persistencia en base de datos.

## Dónde está
- Panel: **Propietarios → Admin → Configuración del Sistema**
- Visible solo para rol: `super_admin`

## Datos persistidos
Tabla: `public.integration_configs`
- `type`: `whatsapp` | `n8n`
- `status`: `enabled` | `disabled`
- `config_json`: JSON de credenciales y opciones
- `last_test_at`, `last_test_result`: resultado de la última prueba

## WhatsApp
Campos:
- `WABA ID`
- `Phone Number ID`
- `Access Token`
- `Verify Token` (opcional)
- `Plantillas (JSON)`
- Automatización: `auto-respuesta inicial`

Prueba de conexión:
- Usa el endpoint `integrations-whatsapp-test` (Edge Function) y valida que el `phoneNumberId` + `accessToken` respondan correctamente.

## n8n
Campos:
- `Base URL`
- `API Key` (opcional)
- `Webhook URL` (opcional)
- `Sincronización` (bandera)

Prueba de conexión:
- Usa `integrations-n8n-test` y hace ping a rutas comunes (`/healthz`, `/api/v1/healthz`, `/health`).
- Si se configura `Webhook URL`, intenta un POST de `ping`.

## Seguridad
- Las configuraciones se guardan con RLS: solo `super_admin` puede leer/escribir.
- Evita compartir tokens en screenshots.

