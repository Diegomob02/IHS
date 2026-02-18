# Diseño de páginas — Cobro dual (desktop-first)

## Estándares globales
### Layout
- Desktop-first con contenedor central `max-width: 1200px`, grid de 12 columnas y `gap: 16–24px`.
- Breakpoints: `>=1200` (desktop), `768–1199` (tablet), `<768` (mobile) reordenando a una sola columna.

### Meta (base)
- Title template: `Cobros | {Sección} | Integrated Home Solutions`
- Description: “Gestión de cobro dual: suscripción fija y pagos variables manuales.”
- Open Graph: `og:title`, `og:description`, `og:type=website`.

### Estilos y tokens
- Fondo: `#0B1220` (base) con superficies `#111A2E`.
- Texto: primario `#E8EEF9`, secundario `#A9B4C7`.
- Acento: `#4F8CFF`; éxito `#2ECC71`; alerta `#F39C12`; error `#E74C3C`.
- Tipografía: escala 14/16/20/24/32; títulos semibold.
- Botones: primario (acento), secundario (borde), danger (rojo). Hover: +8% brillo; focus ring 2px.
- Tablas: filas alternadas, encabezado fijo en scroll.

---

## 1) Página: Acceso (/login)
### Estructura
- Layout centrado (card) con fondo degradado suave; logo arriba.

### Secciones y componentes
- Card de Login
  - Inputs: email, password.
  - CTA primario: “Entrar”.
  - Link: “Olvidé mi contraseña”.
- Estado
  - Loading en CTA, errores inline.

---

## 2) Página: Dashboard de Cobros (/billing)
### Page structure
- Header superior con: selector de cuenta/propiedad, rango de periodo (mes), búsqueda.
- Cuerpo en 2 columnas (desktop):
  - Columna izquierda (8): KPIs + movimientos.
  - Columna derecha (4): acciones rápidas + notificaciones.

### Secciones y componentes
- KPIs (cards en grid)
  - Plan actual, tarifa fija, estado de suscripción, pago variable del mes, depósito (pendiente/recibido).
  - Cada card con tooltip de definición.
- Acciones rápidas
  - Botón: “Registrar pago variable” (abre modal).
  - Botón: “Registrar depósito” (abre modal).
  - Botón secundario: “Cambiar plan” (lleva a settings con cuenta preseleccionada).
- Modal: Registrar pago variable
  - Campos: periodo (YYYY-MM), monto, método, referencia, notas, adjunto opcional.
  - Validación: evitar duplicado por (cuenta+periodo+tipo).
- Tabla: Movimientos
  - Columnas: fecha, tipo, periodo, monto, estatus, referencia.
  - Filtros: tipo, estatus.
- Panel: Notificaciones
  - Lista priorizada (badge por severidad) y acción: “marcar como leída”.

---

## 3) Página: Configuración de Plan y Cobro (/billing/settings)
### Page structure
- Tabs horizontales: “Planes”, “Asignación”, “Depósito”, “Notificaciones”.

### Secciones y componentes
- Tab Planes
  - Tabla de planes + botón “Nuevo plan”.
  - Drawer/Form Plan: nombre, tarifa fija, regla variable (tipo + JSON asistido), activo.
- Tab Asignación
  - Selector cuenta/propiedad.
  - Card “Plan actual” + historial de cambios.
  - Form cambio: plan nuevo, fecha efectiva, prorrateo (toggle), motivo.
- Tab Depósito
  - Definir monto requerido y fecha límite.
  - Registrar recepción: monto, fecha, referencia, adjunto.
  - Estado visible en badge.
- Tab Notificaciones
  - Inputs: días antes de vencimiento, destinatarios (roles).
  - Preview: ejemplos de alertas.

---

## 4) Página: Reportes de Rentabilidad (/billing/reports)
### Page structure
- Filtros arriba; debajo un layout “resumen + tabla”.

### Secciones y componentes
- Filtros
  - Periodo (mes/rango), cuenta/propiedad, plan.
- Resumen (cards)
  - Ingreso fijo, ingreso variable, total, margen y % margen.
- Tabla de detalle
  - Por periodo y cuenta: fijo, variable, total, variación vs periodo anterior.
- Exportación
  - Botones: CSV y PDF básico (descarga).
