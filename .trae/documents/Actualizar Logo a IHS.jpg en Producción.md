## Diagnóstico
- El logo mostrado en la UI viene de `company_settings.logo_path` (Supabase) y, si no hay datos, cae a defaults hardcodeados.
- En el código actual hay referencias a `/IHS.jpeg` y también en la fila singleton de `company_settings` se inserta `logo_path = 'public/IHS.jpeg'`, pero en `public/` ahora existe `IHS.jpg`.

## Cambios en Frontend
- Actualizar todas las referencias de logo por defecto de `/IHS.jpeg` a `/IHS.jpg`:
  - [brand.ts](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/config/brand.ts)
  - [BrandContext.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/context/BrandContext.tsx) (DEFAULT_BRAND y fallbacks)
  - [CompanyBrandingSettings.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/components/superadmin/CompanyBrandingSettings.tsx) (fallback de preview)
- Actualizar favicon/manifest para que apunten a `/IHS.jpg`:
  - [index.html](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/index.html)
  - [manifest.json](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/public/manifest.json)

## Compatibilidad con Producción (Supabase)
- Asegurar que producción no siga apuntando a `public/IHS.jpeg`:
  - Opción 1 (recomendada): crear una migración que actualice la fila singleton:
    - `UPDATE public.company_settings SET logo_path = 'public/IHS.jpg' WHERE is_singleton = true AND logo_path = 'public/IHS.jpeg';`
  - Opción 2 (extra robusta): agregar una normalización en `resolveLogoUrl(...)` para mapear `IHS.jpeg` → `IHS.jpg` si llega desde DB (evita rotura si la DB no se migró aún).

## Despliegue a Vercel
- Verificar que el deploy de producción realmente esté conectado al repo/branch correcto (si se usa GitHub Actions, corre en `main` y requiere secrets de Vercel).
- Desplegar a producción (Vercel) y validar que el build genera assets nuevos.

## Verificación
- Validar en local:
  - `npm run build` y `npm run preview`.
  - Abrir la app y confirmar logo nuevo en Navbar/Footer.
- Validar en producción:
  - Abrir en incógnito y confirmar que el logo y favicon cambian.
  - Revisar Network: que `/IHS.jpg` responde 200.
  - Confirmar que no hay 404 a `/IHS.jpeg`.

## Mitigación de Caché
- Si el logo sigue sin cambiar en algunos navegadores, forzar busting (nombre ya cambió a .jpg) y validar cache headers para `index.html`/`manifest.json`.

Si confirmas este plan, implemento los cambios en código + migración de Supabase y te dejo la ruta exacta para desplegar y validar en producción.