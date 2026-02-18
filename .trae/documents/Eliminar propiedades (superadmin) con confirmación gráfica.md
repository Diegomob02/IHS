## Objetivo
- Darle al superadmin una forma visual y simple de eliminar una propiedad, con confirmación previa (sin usar el confirm del navegador).

## Estado actual (para contexto)
- En el tab **Propiedades** del [AdminDashboard.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/pages/AdminDashboard.tsx) ya existe un botón con ícono de basurero (solo para `role === 'super_admin'`), pero la confirmación hoy es `window.confirm()`.

## Cambios propuestos (UI)
- Reemplazar `window.confirm()` por un **modal de confirmación** (overlay) consistente con el estilo actual del proyecto (ej. el modal de pagos en [TenantPaymentMethodModal.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/components/billing/TenantPaymentMethodModal.tsx)).
- Al hacer clic en el ícono de eliminar:
  - Abrir modal con: título, texto de advertencia (irreversible) y el nombre de la propiedad.
  - Botones: **Cancelar** y **Eliminar** (rojo), con estado de “Eliminando…” y botones deshabilitados mientras corre la acción.
  - Mostrar error dentro del modal si Supabase rechaza el delete.

## Cambios propuestos (lógica)
- En [AdminDashboard.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/pages/AdminDashboard.tsx):
  - Agregar estado local: `propertyPendingDelete`, `deleteModalOpen`, `deleting`, `deleteError`.
  - Cambiar el `onClick` del botón de basurero para que **solo abra el modal**.
  - Extraer la lógica actual de borrado a una función `confirmDeleteProperty()` invocada desde el botón **Eliminar** del modal.
  - Mantener comportamiento existente:
    - Restricción `super_admin` en frontend.
    - Borrado en Supabase (si el id es UUID real), `logAction('delete_property', ...)`, cierre de modales si estaban abiertos, actualización de `properties` en estado y `alert()` de éxito.

## Textos / traducciones
- Reutilizar los keys ya existentes (`confirmDeletePropertyPrefix/suffix`, `cancel`, `delete`, `propertyDeletedSuccess`, `errorDeletingPropertyPrefix`).
- Si hace falta un título del modal (“Confirmar eliminación”), agregar una key nueva en [translations.ts](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/utils/translations.ts) para ES/EN.

## Verificación
- Probar manualmente:
  - Superadmin ve el botón, abre modal, cancela, y elimina correctamente.
  - Admin normal no ve el botón.
  - Error de borrado se muestra en el modal.
- Correr TypeScript y tests del repo (`npm run check` y `npm test`).