# Flujo de documentos (admin → propietario)

## Objetivo

Garantizar que los propietarios vean y descarguen únicamente documentos/reportes registrados oficialmente por administradores y asociados a su propiedad.

## Modelo de datos

- `public.properties`
  - `id` (UUID)
  - `owner_id` (UUID → `public.users.id`) y/o `owner_email`
- `public.documents`
  - `property_id` (UUID → `public.properties.id`)
  - `current_version`
- `public.document_versions`
  - `document_id` (UUID → `public.documents.id`)
  - `file_path` (ruta dentro del bucket `documents`)

## Alta de documento (administrador)

1. Subir archivo a Storage en el bucket `documents`.
   - Ruta recomendada: `<property_id>/<archivo>`.
2. Insertar registro en `public.documents` con:
   - `property_id` = propiedad destino
   - `name`, `type`, `current_version`
3. Insertar versión en `public.document_versions` con:
   - `document_id`
   - `version_number` = `current_version`
   - `file_path`

## Visualización/descarga (propietario)

1. El propietario accede a `DocumentManager` filtrado por `property_id`.
2. La lista se obtiene desde `public.documents`.
3. Para descargar, se consulta `public.document_versions` (versión actual) y se genera un Signed URL contra Storage.

## Reglas de acceso (seguridad)

### Base de datos (RLS)

- `public.documents`: un propietario puede leer documentos si `documents.property_id` pertenece a una propiedad donde:
  - `properties.owner_id = auth.uid()` o `properties.owner_email = auth.jwt()->>'email'`.

### Storage (bucket `documents`)

- El bucket es privado (`public=false`).
- Lectura (SELECT) en `storage.objects`:
  - Admins: acceso completo.
  - Owners: acceso solo a objetos dentro de carpetas `<property_uuid>/...` donde esa propiedad pertenece al owner.

## Recomendación operativa

- Para máxima consistencia, siempre guardar archivos dentro de la carpeta `property_id/`.
- Mantener `documents.property_id` alineado con la carpeta del `file_path`.

