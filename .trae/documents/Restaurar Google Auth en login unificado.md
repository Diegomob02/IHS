## Objetivo
- Volver a habilitar inicio de sesión con Google (OAuth) en el panel unificado /auth sin romper la redirección inteligente por rol.

## Cambios en Frontend
- **Agregar botón “Continuar con Google” en AuthPanel**
  - Incluir un botón arriba del login por email/contraseña usando `t('continueGoogle')` y un separador con `t('orEmail')`.
  - Implementar `handleGoogleLogin()` con `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth` } })`.
  - Registrar intento de acceso (inicio de OAuth) vía `log-access-attempt` con `portal: 'auth'` y `reason: 'oauth_google_start'`.

- **Hacer que el post-login (OAuth o password) use el mismo pipeline**
  - Ajustar el helper `logAttempt` en AuthPanel para aceptar `emailOverride` (porque en OAuth el estado `email` puede estar vacío al regresar).
  - En el `useEffect` de AuthPanel (cuando ya hay sesión), agregar:
    - `markSessionStartedNow()` al detectar sesión válida.
    - logging de éxito/denegación antes de redirigir o cerrar sesión.

- **Actualizar redirect legacy en OwnerPortal**
  - Mantener el handler existente pero cambiar `redirectTo` de `/propietarios` a `/auth` para que, si se usa en el futuro, regrese al panel correcto.

## Consideraciones de Configuración (Supabase)
- Confirmar que en Supabase Auth → URL Configuration estén permitidos:
  - Site URL y Redirect URLs incluyendo `http://localhost:5173/auth` y el dominio de producción `/auth`.

## Validación
- Verificación manual:
  - Click en “Continuar con Google” → completar OAuth → regresar a `/auth` → redirigir a `/portal-contratistas` si contractor aprobado o `/propietarios/panel` si owner.
  - Caso contractor pending/rejected/revoked → mostrar error y cerrar sesión.
- Verificación técnica:
  - Correr `npm run check` y `npm test`.

## Archivos que se tocarán
- `src/pages/AuthPanel.tsx`
- `src/pages/OwnerPortal.tsx` (solo redirectTo del OAuth legacy)

¿Confirmas para aplicar estos cambios?