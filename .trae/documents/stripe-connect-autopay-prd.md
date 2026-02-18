## 1. Product Overview
Refactor de cobros para un modelo **Stripe Connect Standard por cliente**. Cada cliente (empresa/propietario) cobra a sus inquilinos desde **su propia cuenta Stripe conectada** y recibe depósitos directamente en su banco.

El sistema implementa **autopay mensual por lease/unidad** sin Stripe Subscriptions en la app: la app define una **regla de cobro** por lease y ejecuta cargos **off_session** (PaymentIntents) en la **connected account**.

## 2. Objetivos
1) Conectar un `stripe_connected_account_id` por cliente (Standard). La administración del Stripe Dashboard es del cliente.
2) Cobro automático mensual a inquilinos: el dinero se deposita directo al banco del cliente (sin custodia de fondos por la plataforma).
3) Eliminar “planes/tier/suscripciones” del producto y del UI.
4) Registrar pagos y fallos en dashboards: Admin por propiedad y Super Admin agregado sin PII innecesaria.
5) Seguridad: verificación de webhooks, RBAC, auditoría, idempotencia, validación y sanitización de logs.

## 3. Roles y permisos (RBAC)
- `SUPER_ADMIN`: visión global, configuración y auditoría.
- `CLIENT_ADMIN`: visión del cliente; acceso a propiedades y leases del cliente.
- `PROPERTY_ADMIN`: visión de una o varias propiedades asignadas.
- `READ_ONLY`: lectura sin acciones de cobro.
- `TENANT`: portal de pago, registro de método, ver estado/recibos (mínimo necesario).

## 4. Módulos
### 4.1 Portal de cobros (por lease)
- Listado de leases/unidades según rol.
- Regla de cobro por lease:
  - monto mensual (cents), moneda, día 1–28, regla fin de semana, tolerancia.
  - habilitar/deshabilitar autopay.
  - estado autopay: `ACTIVE | PENDING_METHOD | FAILING | PAUSED`.
- Acciones:
  - “Registrar método de pago” (tenant): SetupIntent + Elements.
  - “Cobrar ahora” (admin autorizado): PaymentIntent manual.
  - “Reintentar” según política.
- Historial: intentos (PaymentIntents) y estados por periodo.

### 4.2 Scheduler/worker
- Proceso diario:
  - selecciona leases a cobrar “hoy” según timezone + regla.
  - crea PaymentIntent `off_session` en connected account con idempotencia.
  - actualiza `payment_attempts`.
- Política de reintentos configurable (ej. 3 intentos en 5 días).

### 4.3 Webhooks
- Endpoint único que verifica firma.
- Soporta eventos de connected accounts.
- Dedup por `event.id`.
- Actualiza `payment_attempts` de forma idempotente.

### 4.4 Dashboards
- Admin por propiedad:
  - KPIs del mes: cobrado, pendiente, fallido, tasa de éxito.
  - listado por lease con filtros.
- Super Admin:
  - agregado por cliente/propiedad sin PII innecesaria.

## 5. Fuera de alcance
- Custodia de fondos y transferencias manuales fuera de Connect.
- UI de Stripe Billing Subscriptions/Plans dentro de la app.

