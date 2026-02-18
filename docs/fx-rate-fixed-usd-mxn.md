# Tasa fija USD/MXN (suscripciones)

## Qué resuelve

Permite cobrar una suscripción basada en un monto “base” en USD, pero **cargar al cliente en MXN usando una tasa fija configurable** (sin depender del tipo de cambio del día).

También soporta un **modo inteligente** para cobrar en USD cuando el mercado favorece al USD, y en MXN (tasa fija) cuando el mercado está por debajo de la tasa fija.

En la práctica:

- El sistema calcula `monto_mxn = monto_usd * tasa_fija`.
- Stripe cobra en **MXN** (centavos).
- Se guarda un registro de la transacción con:
  - monto base (USD)
  - monto cobrado (MXN)
  - tasa usada

## Dónde se configura la tasa

La configuración vive en DB:

- `public.fx_rate_configs` (tasa actual por par)
- `public.fx_rate_changes` (historial)

El par usado por el sistema es `USD_MXN`.

## Modo inteligente (USD vs MXN)

En `BILLING_MODE=intelligent`:

- Si `market(USD/MXN) >= fixed(USD/MXN)` → cobra en **USD**
- Si `market(USD/MXN) < fixed(USD/MXN)` → cobra en **MXN** usando **tasa fija**

El tipo de cambio de mercado se guarda en `public.market_fx_rates` (par `USD_MXN`).

Importante:

- Si un cliente ya tiene una suscripción activa en una moneda, Stripe normalmente no permite cambiar la moneda “en vivo”.
- En ese caso el sistema devuelve el Billing Portal y no intenta migrar la moneda automáticamente.

## Cómo actualizar la tasa (solo admin)

Ejecuta este RPC en Supabase SQL Editor (o desde un cliente autenticado como admin):

```sql
select public.set_fixed_fx_rate('USD_MXN', 17.50, 'Ajuste tasa fija');
```

Notas:

- `p_rate` se guarda como `rate_micro` con 6 decimales (precisión).
- El historial se guarda automáticamente en `fx_rate_changes`.

## Cómo ver la tasa actual

```sql
select pair, rate_micro, decimals, updated_at
from public.fx_rate_configs
where pair = 'USD_MXN';
```

Para convertir a tasa “humana”:

```sql
select pair, (rate_micro::numeric / power(10, decimals)) as rate
from public.fx_rate_configs
where pair = 'USD_MXN';
```

## Registro de transacciones

Tabla:

- `public.billing_transactions`

## Actualización automática del mercado + alertas

Función:

- `fx-refresh` (actualiza `public.market_fx_rates` con fuente Frankfurter y genera notificación si difiere ≥ 5% de la tasa fija)

Puedes programarla en Supabase (Scheduled Functions) para correr diario (ej. 9am UTC) llamando:

- `POST /functions/v1/fx-refresh`

Ejemplo de consulta:

```sql
select created_at, status, base_amount_cents, charge_currency, charge_amount_cents, fx_rate_micro, fx_decimals
from public.billing_transactions
order by created_at desc
limit 50;
```

## Cálculo (precisión)

Para evitar errores de punto flotante:

- `rate_micro` se almacena como entero (tasa * 1,000,000).
- El monto base en USD se maneja como centavos (integer).
- El monto en MXN se calcula con aritmética entera y redondeo.
