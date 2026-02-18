## Estado actual (local)
- El archivo existe en `public/IHS.jpg`.
- El frontend ya está configurado para usar `/IHS.jpg` como logo y favicon/manifest.

## Objetivo
- Publicar estos cambios en **Vercel (producción)** para que el sitio en vivo muestre el nuevo logo.

## Pasos para desplegar a Vercel
1. **Asegurar que el proyecto que se despliega sea el correcto**
   - Confirmar que el deployment de Vercel corresponde al mismo proyecto/Org que tu sitio en producción.
   - Si Vercel está conectado a Git, asegurar que el cambio esté en la rama que Vercel despliega (normalmente `main`).

2. **Despliegue (elige una ruta)**
   - **Ruta A — Vercel Git Integration (recomendada):**
     - Subir (push) los cambios al repo conectado a Vercel.
     - Verificar en Vercel el deployment “Production” más reciente y abrirlo.
   - **Ruta B — Vercel CLI (manual):**
     - En el mismo proyecto:
       - `npm ci`
       - `npm run build`
       - `npx vercel --prod` (o `npx vercel --prod --token <TOKEN>`)

3. **Validación en producción**
   - Abrir `https://TU-DOMINIO/` en incógnito.
   - Verificar en DevTools → Network que `/IHS.jpg` responde **200**.
   - Verificar que no haya 404 para `/IHS.jpeg`.
   - Hard refresh (Cmd+Shift+R) por si el navegador cacheó favicon.

## Nota importante (bloqueador común)
- Si tu carpeta local **no está ligada al repo Git** que Vercel despliega, el sitio en vivo no va a cambiar aunque aquí se vea bien. En ese caso hay que mover/aplicar los cambios en el repo correcto o desplegar con CLI autenticada.

Si confirmas, ejecuto el despliegue por la ruta más directa (CLI) y te dejo la verificación final en producción.