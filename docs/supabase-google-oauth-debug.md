# Depuración: Supabase Auth + Google OAuth (Dev/Prod)

## 1) Variables de entorno (Vite)

En local (`.env`) y en producción (Vercel) deben existir y coincidir en proyecto:

- `VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<anon public key del MISMO proyecto>`

Evita pegar valores con comillas/backticks/espacios.

Chequeo rápido en el navegador:

```js
window.IHS_PUBLIC_CONFIG
```

Debe mostrar `supabaseProjectRef` y `anonKeyRef` iguales.

## 2) Configurar Google en Supabase

Supabase Dashboard → Authentication → Providers → Google:

- Pega `Client ID` y `Client Secret` del proyecto de Google Cloud.
- Guarda cambios.

## 3) URLs de redireccionamiento

### A) En Google Cloud Console

Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID:

- **Authorized redirect URIs** (obligatorio):
  - `https://<PROJECT_REF>.supabase.co/auth/v1/callback`

Si usas múltiples proyectos (test/prod), agrega el callback de cada `PROJECT_REF`.

### B) En Supabase (URL Configuration)

Supabase Dashboard → Authentication → URL Configuration:

- `Site URL`:
  - Producción (ej. tu dominio en Vercel)
- `Additional Redirect URLs`:
  - `http://localhost:5173`
  - Tu dominio de producción

Esto permite que Supabase redirija de regreso a tu app luego del login.

## 4) Limpieza de caché / sesión

Si cambiaste de proyecto o de keys, es común que quede un token viejo guardado.

- Abre en incógnito o borra datos del sitio:
  - Chrome DevTools → Application → Storage → **Clear site data**

Luego vuelve a iniciar sesión.

## 5) Errores frecuentes

- `HTTP 401 Invalid JWT` al llamar Edge Functions:
  - `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` no coinciden o hay token viejo en storage.
  - Si `/auth/v1/user` responde 200 pero la Function regresa 401, re-despliega la Function con `--no-verify-jwt` y valida sesión dentro de la Function.
- `No API key found in request` al pegarle a `/auth/v1/...`:
  - Falta header `apikey` (normal si pruebas manualmente con `curl` sin headers).
- `Unexpected token 'export' (webpage_content_reporter.js)`:
  - Suele ser una extensión del navegador inyectando scripts. Prueba en incógnito o deshabilita extensiones.

## 6) Verificación en producción

Si local funciona y producción no:

- Confirma que Vercel tenga exactamente los mismos valores de `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
- Re-deploy tras cambiar variables.
- Asegura que el dominio de producción esté en `Site URL`/`Additional Redirect URLs` en Supabase.

## 7) Último recurso

Si todo está correcto y sigue fallando:

- Regenera credenciales OAuth en Google Cloud.
- Actualiza `Client ID/Secret` en Supabase.
- Limpia caché/Storage y prueba de nuevo.
