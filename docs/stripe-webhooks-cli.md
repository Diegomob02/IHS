# Stripe Webhooks con Stripe CLI (Test) + Supabase Edge Functions

Este proyecto recibe webhooks de Stripe en la Edge Function:

- `https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`

La verificación de firma usa `STRIPE_WEBHOOK_SECRET` (whsec_...) y la API de Stripe usa `STRIPE_SECRET_KEY` (sk_test_.../sk_live_...).

## 1) Instalación y autenticación de Stripe CLI

Instala la CLI oficial (elige tu OS):

- https://stripe.com/docs/stripe-cli

En macOS (Homebrew):

```bash
brew install stripe/stripe-cli/stripe
stripe --version
```

Luego autentícate:

```bash
stripe login
```

Nota:
- En algunas versiones de Stripe CLI no existe `stripe whoami`.
- Si `stripe listen` arranca sin pedir login, ya estás autenticado.

## 2) Forward de eventos a Supabase (modo test)

Inicia el listener y reenvía eventos al endpoint de Supabase:

```bash
stripe listen --forward-to https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook
```

Importante (Supabase):
- Para que Stripe (y `stripe listen`) pueda pegarle al endpoint, la Edge Function **debe ser pública**.
- Despliega el webhook con JWT deshabilitado:

```bash
supabase functions deploy stripe-webhook --no-verify-jwt --project-ref <PROJECT_REF>
```

En consola verás algo como:

`Your webhook signing secret is whsec_...`

Ese valor es el que debes guardar en Supabase como secret:

- `STRIPE_WEBHOOK_SECRET=whsec_...`

## 3) Configurar Secrets en Supabase (obligatorio)

En Supabase (Project Settings → Functions → Secrets) configura:

- `STRIPE_SECRET_KEY=sk_test_...` (tu secret key o restricted key con permisos)
- `STRIPE_WEBHOOK_SECRET=whsec_...` (el de `stripe listen` para test)
- `SERVICE_ROLE_KEY=...` (API key `service_role` de Supabase)

Luego re-despliega la función para que tome los nuevos secrets.

## 4) Disparar eventos de prueba

Ejemplos recomendados para este proyecto (suscripciones + estado de pago):

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_failed
```

Para el paso que pediste explícitamente:

```bash
stripe trigger payment_intent.succeeded
```

## 5) Validación: logs y persistencia

Este proyecto registra cada evento recibido en la tabla:

- `public.stripe_webhook_events`

Campos útiles:
- `stripe_event_id`, `type`, `status` (`received|processed|failed`), `attempts`, `last_error`, `processed_at`.

Puedes ver logs en:
- Supabase Dashboard → Edge Functions → Logs → `stripe-webhook`

## 6) Seguridad

- La verificación de firma se hace con `stripe.webhooks.constructEvent(...)`.
- No pongas `STRIPE_SECRET_KEY` ni `SERVICE_ROLE_KEY` en Vercel ni en frontend.

## 7) Reintentos

Stripe reintenta automáticamente cuando el webhook responde `5xx`.
En este proyecto, si el handler falla, Stripe reintentará y el evento quedará con `status=failed` y el contador `attempts` incrementará en cada entrega.

## 8) Troubleshooting rápido

- `Invalid signature`: `STRIPE_WEBHOOK_SECRET` no coincide con el que imprime `stripe listen` (o estás mezclando test/live).
- `SubtleCryptoProvider cannot be used in a synchronous context`: tu webhook estaba usando verificación sincrónica. Solución: usar `constructEventAsync` (ya está implementado en `supabase/functions/stripe-webhook`).
- `StripeAuthenticationError / Invalid API Key`: `STRIPE_SECRET_KEY` inválida, expirada, o restricted key sin permisos.
