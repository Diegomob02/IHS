## Objetivo
Eliminar por completo la transcripción/dictado y reemplazarla por captura manual de incidentes + imágenes + costos, generando un PDF (base64) con logo IHS en encabezado y contenido redactado por IA.

## 1) Eliminar todo rastro de transcripción
- Borrar Edge Function: `supabase/functions/stt-transcribe`.
- Remover grabación por micrófono y estados relacionados de [AdminDashboard.tsx](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/pages/AdminDashboard.tsx) (MediaRecorder, botón micrófono, estados `isRecording/transcribing`).
- Limpiar documentación y textos:
  - Quitar sección STT de [backend-automation.md](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/docs/backend-automation.md).
  - Ajustar textos “usa el micrófono para dictar” en [translations.ts](file:///Users/diegomoreno/Downloads/INTEGRETED%20HOME%20SOLUTIONS/src/utils/translations.ts).
- Validación final: búsqueda global de `stt`, `whisper`, `MediaRecorder`, `getUserMedia`, `transcrib` y confirmar que no quedan referencias.

## 2) UI: Captura manual de incidentes + imágenes + costos
- Crear un componente nuevo (ej. `ManualIncidentReportBuilder`) dentro del panel “Generador de Reporte” en AdminDashboard:
  - **Texto**: textarea de incidentes/eventos (requerido).
  - **Imágenes**: upload múltiple, preview, reordenar (botones subir/bajar) y campo opcional de descripción por imagen.
  - **Costos**: tabla editable con filas (fecha, concepto, monto) + agregar/eliminar filas.
  - **Validaciones**:
    - Incidente texto requerido.
    - Para cada costo: fecha+concepto+monto requeridos; monto > 0.
    - Para imágenes: solo formatos permitidos y tamaño máximo.
  - **Compresión en cliente**: antes de subir, convertir a JPG con canvas (max dimensión + calidad) para controlar tamaño en el PDF.

## 3) Procesador de contexto estructurado
- Implementar helpers en frontend (testables) para:
  - Normalizar y ordenar imágenes según el orden definido por el usuario.
  - Normalizar costos (parse numérico, fechas ISO, totales).
  - Construir un `context` JSON final:
    - `incidentText`, `costs[]`, `images[] { url, caption, order }`, `totals`, `propertyInfo`, `period`.

## 4) Generador PDF (base64) con IA y logo IHS
- Crear una nueva Edge Function `manual-report-pdf` que:
  - Valide auth (admin/super_admin).
  - Verifique disponibilidad del logo IHS:
    - Nuevo env `IHS_LOGO_URL` (requerido) o fallback a la ruta pública `"/IHS.jpg"` si tu dominio es accesible; si no existe, falla con error claro.
  - Obtenga imágenes por URL, valide content-type, y limite peso.
  - Llame al modelo de IA (OpenAI) para redactar el cuerpo:
    - Resumen ejecutivo, narrativa de incidentes, análisis de costos, anomalías/alertas.
  - Genere un PDF usando una librería Deno-compatible (via import remoto) con:
    - Encabezado en cada página con logo.
    - Sección incidentes.
    - Tabla de costos.
    - Sección de imágenes con captions y paginación.
  - Devuelva `{ ok: true, pdfBase64 }` (sin data URL).

## 5) Integración en UI (generar / previsualizar / guardar)
- El botón “Generar Reporte” llamará a `manual-report-pdf` y mostrará preview con:
  - `src = data:application/pdf;base64,${pdfBase64}`.
- (Opcional pero recomendado) Guardar el PDF en Storage + `documents/document_versions` como hoy, reutilizando la lógica existente de reportes.

## 6) Controles de calidad y manejo de errores
- Validaciones estrictas (logo, imágenes, costos) antes de generar.
- Manejo robusto de errores:
  - Mensajes de UI claros.
  - Reintentos automáticos solo para fallos temporales (429/5xx) al llamar IA.
- Confirmación de PDF:
  - Verificar que el base64 decodificado empiece con `%PDF` antes de devolver.

## 7) Pruebas y verificación final
- Unit tests (Vitest) para:
  - Validación y normalización de costos.
  - Ordenamiento/normalización de imágenes.
  - Construcción del contexto.
  - Decodificación de PDF base64 (header `%PDF`).
- Smoke: `npm test`, `npm run check`, `npm run build`.

## Qué necesito que tú configures
- `OPENAI_API_KEY` (para generar texto por IA).
- `IHS_LOGO_URL` (URL pública del logo IHS, recomendado usar `/IHS.jpg` en tu dominio o un objeto público en storage).
- (Si guardamos PDF) permisos/storage ya están; no requiere nada extra.

Al confirmar, ejecuto los cambios: elimino STT completamente, agrego la UI manual, implemento el generador PDF base64 con logo, añado tests y dejo documentación actualizada.