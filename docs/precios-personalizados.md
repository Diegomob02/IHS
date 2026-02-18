# Precios personalizados por propiedad (Admin → Cobro → Owner)

## Resumen

- El precio mensual por propiedad se configura en `public.properties.monthly_fee`.
- Stripe cobra el **total** sumando `monthly_fee` de propiedades con `contract_status` en `signed` o `active`.
- La app **no depende** del catálogo estándar de productos para el monto: usa montos dinámicos.

## Seguridad y validación

- Validación UI: solo números válidos y no negativos.
- Restricción DB: `CHECK (monthly_fee >= 0)`.
- Permisos UI: solo `super_admin` o usuarios con `permissions.can_edit_fees`.

## Auditoría

- Cada cambio de precio genera un registro en `public.audit_logs` con:
  - `action`: `update_property_pricing` o `update_property_pricing_bulk`
  - `entity_type`: `properties`
  - `entity_id`: `property_id`
  - `details`: valor anterior y nuevo

## Actualización masiva

- En la pestaña **Propiedades** del Admin Dashboard:
  - Selecciona propiedades con el check en la tarjeta.
  - Define el monto mensual.
  - Aplica el precio a todas las seleccionadas.

## Efecto en cobro

- En el checkout/subscription:
  - Se calcula el total dinámicamente.
  - Si el cliente ya tiene una suscripción activa, el sistema intenta actualizarla al nuevo monto (creando un price nuevo en Stripe) y luego redirige al Billing Portal.

## Pruebas

- Unit tests: `npm test`
  - Validan parsing/errores de precios.

