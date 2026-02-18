# Diseño de páginas — Super Admin (Integraciones + Marca Global)

## Global Styles (tokens desktop-first)
- Layout base: contenedor max 1200–1320px, grid de 12 columnas, spacing 8px.
- Tipografía: Inter / system-ui; escala 14/16/20/24/32.
- Colores (derivados de paleta): `--primary`, `--secondary`, `--accent`, `--bg`, `--surface`, `--text`, `--muted`, `--border`.
- Botones: Primary sólido; Secondary outline; Hover (darken 6–8%); Focus ring `--accent`.
- Links: subrayado al hover; estado disabled con opacidad 60%.

---

## Página 1: Inicio de sesión
### Layout
- Centrado vertical/horizontal; card 420–480px; fondo `--bg` con patrón sutil.
- Responsive: en <768px card full-width con padding 16.

### Meta Information
- Title: "Super Admin | Iniciar sesión"
- Description: "Acceso seguro a la consola Super Admin."
- OG: título + logo.

### Page Structure
1. **Header minimal**: logo pequeño + nombre del producto.
2. **Login Card**
   - Campos: email, contraseña.
   - CTA: “Iniciar sesión”.
   - Link: “¿Olvidaste tu contraseña?”
3. **Estados**
   - Loading en CTA.
   - Error inline (credenciales inválidas / red).

### Interacciones
- Enter para enviar.
- Validación inmediata: email formato; contraseña requerida.

---

## Página 2: Consola Super Admin
### Layout
- Estructura 2 columnas (desktop): **Sidebar 260px** + **Content**.
- Content: header sticky (breadcrumbs + acciones) + body scroll.
- Responsive: sidebar colapsable a drawer.

### Meta Information
- Title: "Super Admin | Configuración"
- Description: "Integraciones, empresa y marca global para todos los portales."
- OG: incluye logo y color primario actual.

### Page Structure (patrón dashboard)
1. **Top Header (sticky)**
   - Breadcrumb: Super Admin / Sección.
   - Chips de estado: “Tema vX”, “WhatsApp: enabled/disabled”, “n8n: enabled/disabled”.
   - Acciones globales: Guardar, Descartar, Publicar tema.
2. **Sidebar**
   - Items: Resumen, Propiedades, Empresa y Marca, Integraciones, Vista previa, Pruebas y Docs.
3. **Main Content (por sección)**

### Sección: Resumen
- Cards 2x2: Tema actual, Último cambio, Estado integraciones, Última prueba.
- Card extra (ancho completo): “Cobros” (propiedades con depósito pendiente / pago variable pendiente / suscripción en riesgo).
- Tabla compacta: últimos 10 eventos de auditoría (quién/cuándo/qué).

### Sección: Propiedades
**Layout**
- Listado tipo tabla + panel de detalle (desktop): izquierda listado (40%), derecha detalle (60%).
- Responsive: listado arriba y detalle abajo (stack).

**Listado de propiedades**
- Tabla con columnas: Propiedad, Owner, Estado contrato, Admin asignado, Estado cobros.
- Acciones por fila: “Abrir”, menú (···) con “Cobros” como acceso rápido.
- Filtros: contrato (pending/signed/active), cobros (con pendientes), búsqueda por nombre/owner.

**Detalle de propiedad (tabs)**
- Tabs: “Resumen”, “Operación”, **“Cobros”**, “Documentos”.

**Tab Cobros (config dentro de gestión de propiedades)**
- Card “Plan / Suscripción fija”
  - Selector de plan, monto fijo mostrado, estado (active/past_due/canceled/scheduled).
  - CTA: “Generar enlace de Checkout” (si requiere alta/cambio) y “Abrir Customer Portal”.
- Card “Depósito inicial”
  - Monto requerido, fecha límite, estado (pendiente/recibido/retornado).
  - Acción: “Registrar recepción” (modal: monto, fecha, referencia, adjunto).
- Card “Pago variable mensual (manual)”
  - Acción: “Registrar pago del mes” (modal: periodo YYYY-MM, monto, método, referencia, notas, adjunto opcional).
  - Validación: bloquear duplicado por (propiedad+periodo+tipo).
- Tabla “Movimientos”
  - Columnas: fecha, tipo, periodo, monto, estatus, referencia.

---

### Sección: Empresa y Marca
**Bloque A — Datos de empresa (form 2 columnas)**
- Campos: nombre comercial/legal, email, teléfono, dirección, web.
- Validación: requeridos marcados; URLs/email/teléfono con formato; mensajes inline.

**Bloque B — Logo**
- Uploader con drag&drop; preview; reemplazar/eliminar.
- Reglas visibles: tipos permitidos y tamaño máx.

**Bloque C — Paleta automática + manual**
- CTA: “Extraer paleta del logo”.
- Resultado: 8–12 swatches + asignación a roles (primary/secondary/accent/bg/surface/text).
- Editor manual: picker + HEX; botón “Restaurar automático”; toggle “Bloquear rol”.
- Contraste: warnings (WCAG-like) para combinaciones (texto sobre primary/bg).

### Sección: Integraciones
**WhatsApp**
- Campos: WABA ID, Phone Number ID, Access Token, Verify Token, Webhook URL (readonly si se genera).
- Estados: enabled/disabled; “Probar conexión”; “Guardar”.
- Seguridad UI: ocultar token por defecto (toggle mostrar/copiar).

**n8n**
- Campos: Base URL, API Key (opcional), Webhook URL.
- Validación de URL; botón “Probar conexión” (ping o llamada simple).

### Sección: Vista previa
- Split view: izquierda “Componentes” (header, botones, cards, tablas, formularios); derecha preview.
- Toggle: “Antes / Después”.
- CTA: “Publicar tema global”.

### Sección: Pruebas y Docs
- Panel “Checklist”: validaciones, último test, estado storage/logo.
- Documentación embebida: pasos para credenciales WhatsApp/n8n + troubleshooting.
- Export: botón “Copiar configuración (sin secretos)” para soporte.

### Estados y transiciones
- Guardado: toast + indicador “Cambios sin guardar”.
- Errores: banner superior + errores por campo.
- Animación: transiciones 120–160ms (opacity/translateY).