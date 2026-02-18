## Qué necesito de ti (para que quede 100% funcional)
- **Webhook de PDF (IA)**: una URL en `REPORT_WEBHOOK_URL` que:
  - Acepte `POST` con `{ datasetUrl, propertyId, month, analysis, totalCost, additionalNotes }`.
  - Descargue el JSON desde `datasetUrl` (signed URL) y genere un **PDF** embebiendo imágenes de gastos y anexos (facturas).
  - Responda **bytes PDF** (`Content-Type: application/pdf`) o JSON `{ pdfUrl }`.
- **Clave de IA para transcripción y (opcional) análisis**:
  - `OPENAI_API_KEY` (ya se usa para TTS). Para STT usaremos `whisper-1` o equivalente.
- **Scheduling (cron externo)**:
  - Mantener `reports-runner`, `email-dispatcher` y agregar `reports-postprocessor` (cada 1–5 min) con header `x-cron-secret`.

## Lo que voy a cambiar en el código
### 1) Transcripción real (STT) en el AdminDashboard
- Reemplazar el “simulador” actual en `handleToggleRecord` (hoy solo pega texto fijo) por:
  - Captura real de audio con `MediaRecorder` (web) → blob.
  - Llamada a una nueva Edge Function `stt-transcribe` que devuelve texto.
  - Insertar el texto transcrito en `reportText` y guardar metadatos (duración/idioma).

### 2) Nueva Edge Function `stt-transcribe`
- Endpoint protegido (solo `admin/super_admin`) que:
  - Recibe audio (`webm`/`wav`/`mp3`) vía `multipart/form-data`.
  - Llama al proveedor (OpenAI Whisper) `/v1/audio/transcriptions`.
  - Devuelve `{ ok: true, text }`.
- Manejo robusto:
  - Validación tamaño/duración.
  - Reintento simple en fallos temporales.
  - Logs/audit (`audit_logs`) del evento `report_transcribed`.

### 3) “Generación de reportes completa” (manual y automática alineadas)
- Mantener el flujo automático ya implementado (dataset JSON + `datasetUrl`).
- Actualizar la generación manual (botón “Generar Reporte Mensual” en AdminDashboard) para que use el mismo patrón:
  - En lugar de `sendReportToWebhook` desde el frontend, crear/usar una Edge Function `report-generate-on-demand` (admin) que:
    - Recolecta gastos+imágenes y facturas (invoices) del periodo.
    - Sube dataset y llama al webhook de PDF.
    - Sube el PDF a Storage, crea/actualiza `documents`/`document_versions`.
    - Devuelve una signed URL para previsualizar/descargar.

### 4) Post-proceso tras envío (ya está) + notificaciones
- Mantener `reports-postprocessor` para archivar gastos **solo cuando el email esté sent**.
- Mejorar notificaciones:
  - Éxito/fallo de transcripción.
  - Éxito/fallo de generación manual.

## Variables de entorno a configurar
- `REPORT_WEBHOOK_URL`
- `OPENAI_API_KEY`
- `CRON_SECRET`
- (opcional) `OPENAI_STT_MODEL` (default `whisper-1`), `OPENAI_STT_LANGUAGE` (default `es`)

## Verificación
- Tests unitarios para helpers de transcripción/validación.
- Smoke test local:
  - Grabar audio → transcribir → generar PDF → encolar email → marcar sent → postprocesar → verificar archivado.

Si confirmas, implemento: `stt-transcribe` + reemplazo de grabación simulada en AdminDashboard + generación manual por Edge Function (misma ruta que automatizada) y dejo documentado qué endpoints/variables debes configurar.