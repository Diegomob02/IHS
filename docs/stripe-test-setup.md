# Stripe (modo prueba) + Supabase Edge Functions

## 1) Claves de Stripe (modo prueba)

En Stripe Dashboard (modo prueba):
- Obtén:
  - `STRIPE_SECRET_KEY` (sk_test_...)
  - `STRIPE_PUBLISHABLE_KEY` (pk_test_...)

## 2) Desplegar Edge Functions en Supabase

Este proyecto usa Edge Functions en:
- `supabase/functions/create-stripe-session`
- `supabase/functions/stripe-webhook`

### Requisitos

- Supabase CLI instalado
- Proyecto linkeado al `project_ref`

### Comandos

1. Login y link:

```bash
supabase login
supabase link --project-ref uzlekinkpqkswkrwugnx
```

2. Configurar secretos (modo prueba):

```bash
npx supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_xxx \
  STRIPE_WEBHOOK_SECRET=whsec_xxx \
  SERVICE_ROLE_KEY=eyJ... \
  --project-ref uzlekinkpqkswkrwugnx
```

Notas:
- El CLI puede rechazar variables que empiecen con `SUPABASE_`. En Edge Functions, `SUPABASE_URL`/`SUPABASE_ANON_KEY` ya vienen inyectadas por Supabase.
- Usa `SERVICE_ROLE_KEY` (sin el prefijo `SUPABASE_`) para el webhook.

3. Desplegar funciones:

```bash
supabase functions deploy create-stripe-session --no-verify-jwt --project-ref uzlekinkpqkswkrwugnx
supabase functions deploy stripe-webhook --no-verify-jwt --project-ref uzlekinkpqkswkrwugnx
```

Si vas a cobrar con tasa fija USD/MXN (cobro en MXN usando tasa fija), revisa:
- `docs/fx-rate-fixed-usd-mxn.md`

Para modo inteligente (USD vs MXN) configura en Secrets de la Edge Function `create-stripe-session`:
- `BILLING_MODE=intelligent`

Nota (webhook público):
- El endpoint `stripe-webhook` debe aceptar requests sin JWT (Stripe no manda `Authorization`).
- Despliega `stripe-webhook` con JWT deshabilitado:

```bash
supabase functions deploy stripe-webhook --no-verify-jwt --project-ref uzlekinkpqkswkrwugnx
```

4. Verificar que estén disponibles:

```bash
curl -i https://uzlekinkpqkswkrwugnx.supabase.co/functions/v1/create-stripe-session
```

Si regresa `404 NOT_FOUND`, la función no está desplegada.

## Troubleshooting (error de Edge Function)

### A) `Requested function was not found` / `Failed to send a request to the Edge Function`

- Causa más común: la función **no está desplegada**.
- Verifica con:

```bash
curl -i https://uzlekinkpqkswkrwugnx.supabase.co/functions/v1/create-stripe-session
```

Si la respuesta es `404`:
- Ejecuta los comandos de deploy (sección 2).

### B) La función existe pero falla (400/500)

- Revisa logs:
  - Supabase Dashboard → Edge Functions → Logs
  - o CLI: `supabase functions logs create-stripe-session --project-ref uzlekinkpqkswkrwugnx` (requiere login)

### C) Variables de entorno

- Frontend (Vercel/dev):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Edge Functions (Supabase Secrets):
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `SERVICE_ROLE_KEY`

Variables inyectadas por Supabase en Edge Functions:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

### D) Error de autenticación con Stripe (401 / Invalid API Key)

Síntomas típicos:
- En logs aparece `StripeAuthenticationError` o mensajes tipo `Invalid API Key provided` / `No such API key`.
- La Edge Function responde `400` con error relacionado a `STRIPE_SECRET_KEY`.

Causas comunes:
- `STRIPE_SECRET_KEY` no está configurada en **Supabase Secrets** (no en Vercel).
- Se pegó una `pk_test_...` (publishable) en lugar de una `sk_test_...` (secret).
- Se mezcló modo **test** vs **live**:
  - `sk_test_...` debe usarse con webhooks/recursos de modo test.
  - `sk_live_...` debe usarse con webhooks/recursos de modo live.
  - El `STRIPE_WEBHOOK_SECRET (whsec_...)` también cambia según el modo.

Qué hacer:
1) Reconfigura secretos con el CLI:

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_xxx \
  STRIPE_WEBHOOK_SECRET=whsec_xxx \
  SERVICE_ROLE_KEY=eyJ... \
  --project-ref uzlekinkpqkswkrwugnx
```

2) Re-despliega las funciones:

```bash
supabase functions deploy create-stripe-session --project-ref uzlekinkpqkswkrwugnx
supabase functions deploy stripe-webhook --project-ref uzlekinkpqkswkrwugnx
```

3) Revisa logs:

```bash
supabase functions logs create-stripe-session --project-ref uzlekinkpqkswkrwugnx
```

Nota:
- Este proyecto no usa `STRIPE_PUBLISHABLE_KEY` en frontend para tokenizar tarjetas; solo redirige a Checkout/Billing Portal, por lo que el punto crítico es `STRIPE_SECRET_KEY` en Edge Functions.

## 3) Configurar Webhook en Stripe (modo prueba)

En Stripe Dashboard → Developers → Webhooks:
- Endpoint URL:
  - `https://uzlekinkpqkswkrwugnx.supabase.co/functions/v1/stripe-webhook`
- Selecciona eventos mínimos:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

Guarda el `Signing secret` como `STRIPE_WEBHOOK_SECRET`.

## Alternativa recomendada para pruebas: Stripe CLI

Para probar webhooks sin crear endpoints manualmente en el Dashboard, usa Stripe CLI:

- Ver guía: `docs/stripe-webhooks-cli.md`

## 4) Probar pagos (tarjetas de prueba)

Usa las tarjetas de prueba oficiales de Stripe.
- Ejemplo (pago exitoso): `4242 4242 4242 4242`
- Fecha: cualquier fecha futura
- CVC: cualquier

## 5) Notas de seguridad

- No guardes `sk_test_...` en código ni en `.env` versionado.
- Solo usar modo prueba.
- La app genera sesiones (Checkout/Billing Portal) del lado del servidor (Edge Function).
