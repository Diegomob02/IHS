# Super Admin — Empresa, Logo y Tema Global

## Objetivo
Permitir que el Super Admin cargue el logo y datos de empresa, extraiga una paleta automáticamente, la ajuste manualmente y aplique el tema global a todos los portales.

## Persistencia
Tabla: `public.company_settings` (singleton)
- `company_name`, `company_legal_name`, `email`, `phone`, `address`, `website`
- `logo_path`: ruta del objeto en el bucket `branding` o `public/...`
- `theme_json`: `{ "colors": { ... } }`
- `theme_version`: entero incremental

Bucket de Storage:
- `branding` (público para lectura)

## Extracción de paleta
Al subir un logo:
- PNG/JPG: se reduce a 72x72 y se extrae paleta (k-means) en cliente.
- SVG: se buscan colores hex en el archivo.

Luego se mapea a roles:
- `primary`, `accent`, `background`, `textMain`, etc.

## Aplicación del tema
El frontend aplica el tema configurando variables CSS en `:root`:
- `--color-primary`, `--color-background`, `--color-accent`, ...

Tailwind consume esas variables:
- `bg-primary`, `text-primary`, `bg-background`, `text-text-main`, etc.

## Notas
- Si el logo no tiene suficientes colores detectables, se usan defaults.
- Se recomienda revisar contraste (texto sobre fondos) antes de publicar.

