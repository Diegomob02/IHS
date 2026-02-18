# Troubleshooting: `import.meta` en consola + `Invalid JWT`

## 1) Por qué sale `Cannot use 'import.meta' outside a module`

Esto ocurre cuando lo ejecutas en la consola del navegador. La consola no corre como un módulo ES, por eso `import.meta` falla ahí.

`import.meta.env.*` sí funciona dentro del código de la app (Vite) porque se compila y reemplaza en build.

## 2) Cómo ver la URL de Supabase sin usar `import.meta` en consola

En esta app se expone una variable pública:

```js
window.IHS_PUBLIC_CONFIG
```

Deberías ver algo como:

```js
{ supabaseUrl: "https://...supabase.co", supabaseProjectRef: "...", anonKeyRef: "..." }
```

`anonKeyRef` se obtiene decodificando el JWT de `VITE_SUPABASE_ANON_KEY` (sin exponer la key).
Si `anonKeyRef` != `supabaseProjectRef`, tu deploy (Vercel) tiene la anon key de OTRO proyecto.

## 3) Qué significa `Invalid JWT`

`Invalid JWT` casi siempre significa que:

- Estás autenticado con un token emitido por OTRO proyecto Supabase, o
- Tu deployment (Vercel) tiene `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` distintos a los de tu ambiente local.

## 4) Checklist para arreglarlo

1. En Vercel → Settings → Environment Variables
   - `VITE_SUPABASE_URL` debe coincidir con el proyecto correcto.
   - `VITE_SUPABASE_ANON_KEY` debe ser la anon key del mismo proyecto.
   - Evita pegar valores con comillas/backticks/espacios. (La app intenta sanitizar, pero lo correcto es pegar el valor exacto.)
2. Haz Redeploy.
3. Abre el portal en incógnito o borra `sb-*-auth-token` en Local Storage.
4. Inicia sesión nuevamente.
